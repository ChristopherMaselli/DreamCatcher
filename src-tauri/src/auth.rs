use std::{
    io::{Read, Write},
    net::{IpAddr, TcpListener, TcpStream},
    sync::Arc,
    thread,
    time::{Duration, Instant},
};

use anyhow::{anyhow, bail, Context, Result};
use chrono::{Duration as ChronoDuration, Utc};
use rand::{distributions::Alphanumeric, Rng};
use rcgen::{CertificateParams, KeyPair, SanType};
use reqwest::Client;
use rustls::{
    pki_types::{CertificateDer, PrivateKeyDer, PrivatePkcs8KeyDer},
    ServerConfig, ServerConnection, StreamOwned,
};
use tracing::warn;
use url::Url;

use crate::{
    config::LiveEnv,
    types::{OAuthTokenResponse, TokenBundle},
};

const AUTH_URL: &str = "https://cloud.ouraring.com/oauth/authorize";
const TOKEN_URL: &str = "https://api.ouraring.com/oauth/token";
const REVOKE_URL: &str = "https://api.ouraring.com/oauth/revoke";
const CALLBACK_TIMEOUT_SECONDS: u64 = 180;

pub async fn complete_oauth(env: &LiveEnv) -> Result<TokenBundle> {
    let redirect = Url::parse(&env.redirect_uri).context("Invalid Oura redirect URI")?;
    let state = build_state_token();
    let authorize_url = build_authorize_url(env, &state)?;
    let listener = bind_callback_listener(&redirect)?;
    let callback_path = redirect.path().to_string();
    let waiter = tauri::async_runtime::spawn_blocking(move || {
        wait_for_callback(listener, callback_path, state)
    });

    webbrowser::open(authorize_url.as_str())
        .context("Could not open the system browser for Oura sign-in")?;

    let code = waiter
        .await
        .map_err(|error| anyhow!("OAuth listener task failed: {error}"))??;

    let response = Client::new()
        .post(TOKEN_URL)
        .basic_auth(&env.client_id, Some(&env.client_secret))
        .form(&[
            ("grant_type", "authorization_code"),
            ("code", code.as_str()),
            ("redirect_uri", env.redirect_uri.as_str()),
        ])
        .send()
        .await
        .context("Failed to exchange the Oura authorization code")?;

    parse_token_response(response, &env.scopes).await
}

pub async fn refresh_access_token(env: &LiveEnv, refresh_token: &str) -> Result<TokenBundle> {
    let response = Client::new()
        .post(TOKEN_URL)
        .basic_auth(&env.client_id, Some(&env.client_secret))
        .form(&[
            ("grant_type", "refresh_token"),
            ("refresh_token", refresh_token),
        ])
        .send()
        .await
        .context("Failed to refresh the Oura access token")?;

    parse_token_response(response, &env.scopes).await
}

pub async fn revoke_access_token(access_token: &str) -> Result<()> {
    let response = Client::new()
        .post(REVOKE_URL)
        .query(&[("access_token", access_token)])
        .send()
        .await;

    match response {
        Ok(result) if result.status().is_success() => Ok(()),
        Ok(result) => {
            warn!(status = %result.status(), "Oura revoke request did not succeed");
            Ok(())
        }
        Err(error) => {
            warn!(%error, "Oura revoke request failed");
            Ok(())
        }
    }
}

async fn parse_token_response(response: reqwest::Response, fallback_scopes: &[String]) -> Result<TokenBundle> {
    let status = response.status();
    if !status.is_success() {
        let body = response.text().await.unwrap_or_default();
        bail!("Oura token request failed ({status}): {body}");
    }

    let payload: OAuthTokenResponse = response
        .json()
        .await
        .context("Oura token response was not valid JSON")?;

    Ok(TokenBundle {
        access_token: payload.access_token,
        refresh_token: payload.refresh_token,
        token_type: payload.token_type.unwrap_or_else(|| "Bearer".to_string()),
        expires_at: payload
            .expires_in
            .map(|seconds| Utc::now() + ChronoDuration::seconds(seconds.max(0))),
        scopes: parse_scope_list(payload.scope.as_deref(), fallback_scopes),
    })
}

fn build_authorize_url(env: &LiveEnv, state: &str) -> Result<Url> {
    let mut url = Url::parse(AUTH_URL).context("Invalid Oura auth URL")?;
    url.query_pairs_mut()
        .append_pair("response_type", "code")
        .append_pair("client_id", &env.client_id)
        .append_pair("redirect_uri", &env.redirect_uri)
        .append_pair("scope", &env.scopes.join(" "))
        .append_pair("state", state);
    Ok(url)
}

enum CallbackListener {
    Http(TcpListener),
    Https {
        listener: TcpListener,
        tls_config: Arc<ServerConfig>,
    },
}

fn bind_callback_listener(redirect: &Url) -> Result<CallbackListener> {
    let scheme = redirect.scheme();
    if scheme != "http" && scheme != "https" {
        bail!("DreamCatcher currently supports http://localhost and https://localhost redirect URIs only.");
    }

    let host = redirect.host_str().unwrap_or_default();
    if host != "127.0.0.1" && host != "localhost" {
        bail!("DreamCatcher currently supports localhost redirect URIs only.");
    }

    let port = redirect
        .port_or_known_default()
        .context("The Oura redirect URI must include a localhost port")?;
    let bind_host = if host == "localhost" { "127.0.0.1" } else { host };
    let listener = TcpListener::bind((bind_host, port))
        .with_context(|| format!("Could not bind the local OAuth callback listener on {bind_host}:{port}"))?;

    if scheme == "https" {
        Ok(CallbackListener::Https {
            listener,
            tls_config: build_tls_server_config()?,
        })
    } else {
        Ok(CallbackListener::Http(listener))
    }
}

fn wait_for_callback(
    listener: CallbackListener,
    expected_path: String,
    expected_state: String,
) -> Result<String> {
    listener.socket().set_nonblocking(true)?;
    let deadline = Instant::now() + Duration::from_secs(CALLBACK_TIMEOUT_SECONDS);

    loop {
        match listener.accept() {
            Ok(mut stream) => {
                let outcome = match &mut stream {
                    AcceptedStream::Http(inner) => {
                        process_callback_stream(inner, &expected_path, &expected_state)?
                    }
                    AcceptedStream::Https(inner) => {
                        process_callback_stream(inner, &expected_path, &expected_state)?
                    }
                };

                match outcome {
                    CallbackOutcome::Continue => continue,
                    CallbackOutcome::Authorized(code) => return Ok(code),
                }
            }
            Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {
                if Instant::now() >= deadline {
                    bail!("Timed out waiting for the Oura OAuth callback.");
                }

                thread::sleep(Duration::from_millis(150));
            }
            Err(error) => return Err(error.into()),
        }
    }
}

enum AcceptedStream {
    Http(TcpStream),
    Https(StreamOwned<ServerConnection, TcpStream>),
}

enum CallbackOutcome {
    Continue,
    Authorized(String),
}

impl CallbackListener {
    fn socket(&self) -> &TcpListener {
        match self {
            Self::Http(listener) => listener,
            Self::Https { listener, .. } => listener,
        }
    }

    fn accept(&self) -> Result<AcceptedStream, std::io::Error> {
        match self {
            Self::Http(listener) => listener.accept().map(|(stream, _)| AcceptedStream::Http(stream)),
            Self::Https { listener, tls_config } => {
                let (stream, _) = listener.accept()?;
                let connection = ServerConnection::new(tls_config.clone()).map_err(std::io::Error::other)?;
                Ok(AcceptedStream::Https(StreamOwned::new(connection, stream)))
            }
        }
    }
}

fn process_callback_stream<S: Read + Write>(
    stream: &mut S,
    expected_path: &str,
    expected_state: &str,
) -> Result<CallbackOutcome> {
    let path_and_query = read_request_path(stream)?;
    let callback_url = Url::parse(&format!("http://localhost{path_and_query}"))
        .context("The Oura callback URL was malformed")?;

    if callback_url.path() != expected_path {
        write_html_response(
            stream,
            "404 Not Found",
            "<h1>DreamCatcher</h1><p>Unexpected callback path.</p>",
        )?;
        return Ok(CallbackOutcome::Continue);
    }

    let query = callback_url.query_pairs().into_owned().collect::<Vec<_>>();
    if let Some((_, error)) = query.iter().find(|(key, _)| key == "error") {
        write_html_response(
            stream,
            "400 Bad Request",
            "<h1>DreamCatcher</h1><p>Oura returned an authorization error. You can close this tab and try again.</p>",
        )?;
        bail!("Oura authorization error: {error}");
    }

    let state = query
        .iter()
        .find(|(key, _)| key == "state")
        .map(|(_, value)| value.to_string())
        .unwrap_or_default();
    if state != expected_state {
        write_html_response(
            stream,
            "400 Bad Request",
            "<h1>DreamCatcher</h1><p>The callback state did not match. Please retry the sign-in.</p>",
        )?;
        bail!("The Oura OAuth state did not match the original request.");
    }

    let code = query
        .iter()
        .find(|(key, _)| key == "code")
        .map(|(_, value)| value.to_string())
        .context("The Oura callback did not include an authorization code")?;

    write_html_response(
        stream,
        "200 OK",
        "<h1>DreamCatcher</h1><p>Oura is connected. You can close this window and return to the app.</p>",
    )?;

    Ok(CallbackOutcome::Authorized(code))
}

fn read_request_path<R: Read>(stream: &mut R) -> Result<String> {
    let mut buffer = [0_u8; 8192];
    let bytes = stream.read(&mut buffer)?;
    let request = String::from_utf8_lossy(&buffer[..bytes]);
    let request_line = request
        .lines()
        .next()
        .context("The local OAuth callback did not include a request line")?;

    request_line
        .split_whitespace()
        .nth(1)
        .map(|value| value.to_string())
        .context("The local OAuth callback did not include a path")
}

fn write_html_response<W: Write>(stream: &mut W, status: &str, body: &str) -> Result<()> {
    let response = format!(
        "HTTP/1.1 {status}\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
        body.as_bytes().len(),
        body
    );
    stream.write_all(response.as_bytes())?;
    stream.flush()?;
    Ok(())
}

fn build_tls_server_config() -> Result<Arc<ServerConfig>> {
    let mut params = CertificateParams::new(vec!["localhost".to_string()])?;
    params
        .subject_alt_names
        .push(SanType::IpAddress("127.0.0.1".parse::<IpAddr>()?));

    let signing_key = KeyPair::generate().context("Could not generate a local TLS key for the HTTPS OAuth callback")?;
    let certificate = params
        .self_signed(&signing_key)
        .context("Could not generate a local TLS certificate for the HTTPS OAuth callback")?;

    let cert_chain = vec![CertificateDer::from(certificate.der().clone())];
    let private_key = PrivateKeyDer::from(PrivatePkcs8KeyDer::from(signing_key.serialize_der()));
    let server_config = ServerConfig::builder()
        .with_no_client_auth()
        .with_single_cert(cert_chain, private_key)
        .context("Could not build the local HTTPS OAuth server")?;

    Ok(Arc::new(server_config))
}

fn build_state_token() -> String {
    rand::thread_rng()
        .sample_iter(&Alphanumeric)
        .take(40)
        .map(char::from)
        .collect()
}

fn parse_scope_list(scope: Option<&str>, fallback_scopes: &[String]) -> Vec<String> {
    let scopes = scope
        .unwrap_or_default()
        .split_whitespace()
        .filter(|part| !part.is_empty())
        .map(|part| part.to_string())
        .collect::<Vec<_>>();

    if scopes.is_empty() {
        fallback_scopes.to_vec()
    } else {
        scopes
    }
}

