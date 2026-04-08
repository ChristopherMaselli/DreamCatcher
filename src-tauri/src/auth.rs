use anyhow::{bail, Context, Result};
use chrono::{Duration as ChronoDuration, Utc};
use rand::{distributions::Alphanumeric, Rng};
use reqwest::Client;
use tauri::AppHandle;
use tracing::warn;
use url::Url;

use crate::{
    config::LiveEnv,
    storage,
    types::{AuthLaunchPayload, OAuthTokenResponse, PendingOAuth, TokenBundle},
};

const AUTH_URL: &str = "https://cloud.ouraring.com/oauth/authorize";
const TOKEN_URL: &str = "https://api.ouraring.com/oauth/token";
const REVOKE_URL: &str = "https://api.ouraring.com/oauth/revoke";

pub fn begin_oauth(app: &AppHandle, env: &LiveEnv) -> Result<AuthLaunchPayload> {
    let redirect = Url::parse(&env.redirect_uri).context("Invalid Oura redirect URI")?;
    if redirect.scheme() != "https" {
        bail!("DreamCatcher's hosted callback flow expects an HTTPS redirect URI.");
    }

    let state = build_state_token();
    let authorize_url = build_authorize_url(env, &state)?;
    let pending = PendingOAuth {
        state,
        redirect_uri: env.redirect_uri.clone(),
    };

    storage::save_pending_oauth(app, &pending)?;

    webbrowser::open(authorize_url.as_str())
        .context("Could not open the system browser for Oura sign-in")?;

    Ok(AuthLaunchPayload {
        authorization_url: authorize_url.to_string(),
        redirect_uri: env.redirect_uri.clone(),
    })
}

pub async fn complete_oauth_from_callback(app: &AppHandle, env: &LiveEnv, callback_url: &str) -> Result<TokenBundle> {
    let pending = storage::load_pending_oauth(app)?
        .context("Start the Oura sign-in flow first, then paste the final callback URL here.")?;

    if pending.redirect_uri != env.redirect_uri {
        bail!("The stored Oura redirect URI no longer matches your current .env file. Start the sign-in flow again.");
    }

    let code = extract_authorization_code(callback_url, &env.redirect_uri, &pending.state)?;
    let tokens = exchange_authorization_code(env, &code).await?;

    storage::clear_pending_oauth(app)?;
    Ok(tokens)
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

async fn exchange_authorization_code(env: &LiveEnv, code: &str) -> Result<TokenBundle> {
    let response = Client::new()
        .post(TOKEN_URL)
        .basic_auth(&env.client_id, Some(&env.client_secret))
        .form(&[
            ("grant_type", "authorization_code"),
            ("code", code),
            ("redirect_uri", env.redirect_uri.as_str()),
        ])
        .send()
        .await
        .context("Failed to exchange the Oura authorization code")?;

    parse_token_response(response, &env.scopes).await
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

fn extract_authorization_code(callback_url: &str, expected_redirect_uri: &str, expected_state: &str) -> Result<String> {
    let callback_url = callback_url.trim();
    if callback_url.is_empty() {
        bail!("Paste the full callback URL from your hosted Oura callback page.");
    }

    let callback = Url::parse(callback_url)
        .context("The pasted callback URL was not a valid URL. Paste the full browser URL from the hosted callback page.")?;
    let expected = Url::parse(expected_redirect_uri).context("Invalid configured Oura redirect URI")?;

    let matches_redirect = callback.scheme() == expected.scheme()
        && callback.host_str() == expected.host_str()
        && callback.port_or_known_default() == expected.port_or_known_default()
        && callback.path() == expected.path();

    if !matches_redirect {
        bail!("The pasted callback URL does not match the Oura redirect URI in your .env file.");
    }

    let query = callback.query_pairs().into_owned().collect::<Vec<_>>();
    if let Some((_, error)) = query.iter().find(|(key, _)| key == "error") {
        bail!("Oura returned an authorization error: {error}");
    }

    let state = query
        .iter()
        .find(|(key, _)| key == "state")
        .map(|(_, value)| value.to_string())
        .unwrap_or_default();
    if state != expected_state {
        bail!("The pasted callback URL does not match the current DreamCatcher sign-in request. Start the Oura sign-in again.");
    }

    query
        .iter()
        .find(|(key, _)| key == "code")
        .map(|(_, value)| value.to_string())
        .context("The pasted callback URL did not include an Oura authorization code.")
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
