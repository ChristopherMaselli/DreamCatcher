use std::{
    io::{Read, Write},
    net::{TcpListener, TcpStream},
    thread,
    time::{Duration, Instant},
};

use anyhow::{anyhow, bail, Context, Result};
use chrono::{Duration as ChronoDuration, Utc};
use rand::{distributions::Alphanumeric, Rng};
use reqwest::Client;
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

fn bind_callback_listener(redirect: &Url) -> Result<TcpListener> {
    let host = redirect.host_str().unwrap_or_default();
    if host != "127.0.0.1" && host != "localhost" {
        bail!("DreamCatcher currently supports localhost redirect URIs only.");
    }

    let port = redirect
        .port_or_known_default()
        .context("The Oura redirect URI must include a localhost port")?;
    let bind_host = if host == "localhost" { "127.0.0.1" } else { host };

    TcpListener::bind((bind_host, port))
        .with_context(|| format!("Could not bind the local OAuth callback listener on {bind_host}:{port}"))
}

fn wait_for_callback(
    listener: TcpListener,
    expected_path: String,
    expected_state: String,
) -> Result<String> {
    listener.set_nonblocking(true)?;
    let deadline = Instant::now() + Duration::from_secs(CALLBACK_TIMEOUT_SECONDS);

    loop {
        match listener.accept() {
            Ok((mut stream, _address)) => {
                let path_and_query = read_request_path(&mut stream)?;
                let callback_url = Url::parse(&format!("http://localhost{path_and_query}"))
                    .context("The Oura callback URL was malformed")?;

                if callback_url.path() != expected_path {
                    write_html_response(
                        &mut stream,
                        "404 Not Found",
                        "<h1>DreamCatcher</h1><p>Unexpected callback path.</p>",
                    )?;
                    continue;
                }

                let query = callback_url.query_pairs().into_owned().collect::<Vec<_>>();
                if let Some((_, error)) = query.iter().find(|(key, _)| key == "error") {
                    write_html_response(
                        &mut stream,
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
                        &mut stream,
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
                    &mut stream,
                    "200 OK",
                    "<h1>DreamCatcher</h1><p>Oura is connected. You can close this window and return to the app.</p>",
                )?;

                return Ok(code);
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

fn read_request_path(stream: &mut TcpStream) -> Result<String> {
    stream.set_read_timeout(Some(Duration::from_secs(3))).ok();

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

fn write_html_response(stream: &mut TcpStream, status: &str, body: &str) -> Result<()> {
    let response = format!(
        "HTTP/1.1 {status}\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
        body.as_bytes().len(),
        body
    );
    stream.write_all(response.as_bytes())?;
    stream.flush()?;
    Ok(())
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
