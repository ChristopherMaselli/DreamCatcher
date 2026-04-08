use anyhow::{bail, Context, Result};
use chrono::{Duration as ChronoDuration, Local, Utc};
use reqwest::{Client, StatusCode};
use serde_json::Value;
use tauri::AppHandle;
use tracing::info;

use crate::{
    auth,
    config::{AppEnv, LiveEnv},
    storage,
    types::{CachedSleepPayload, OuraSleepSession, TokenBundle},
};

const SLEEP_ENDPOINT: &str = "https://api.ouraring.com/v2/usercollection/sleep";

pub async fn refresh_sleep_cache(app: &AppHandle) -> Result<CachedSleepPayload> {
    let live_env = AppEnv::load().require_live()?;
    let mut tokens = ensure_valid_tokens(app, &live_env).await?;
    let mut response = fetch_sleep_response(&tokens.access_token).await?;

    if response.status() == StatusCode::UNAUTHORIZED {
        if let Some(refresh_token) = tokens.refresh_token.clone() {
            tokens = auth::refresh_access_token(&live_env, &refresh_token).await?;
            storage::save_tokens(app, &tokens)?;
            response = fetch_sleep_response(&tokens.access_token).await?;
        }
    }

    let status = response.status();
    if !status.is_success() {
        let body = response.text().await.unwrap_or_default();
        bail!("Oura sleep request failed ({status}): {body}");
    }

    let raw_value: Value = response
        .json()
        .await
        .context("Oura sleep response was not valid JSON")?;

    let sessions = parse_sessions(raw_value)?;
    let payload = CachedSleepPayload {
        fetched_at: Utc::now().to_rfc3339(),
        sessions,
    };

    storage::save_cache(app, &payload)?;
    info!(sessions = payload.sessions.len(), "Updated DreamCatcher sleep cache");

    Ok(payload)
}

async fn ensure_valid_tokens(app: &AppHandle, env: &LiveEnv) -> Result<TokenBundle> {
    let tokens = storage::load_tokens(app)?
        .context("Connect Oura first before requesting live sleep data.")?;

    if tokens.is_expired() {
        if let Some(refresh_token) = tokens.refresh_token.clone() {
            let refreshed = auth::refresh_access_token(env, &refresh_token).await?;
            storage::save_tokens(app, &refreshed)?;
            Ok(refreshed)
        } else {
            bail!("Stored Oura credentials expired and no refresh token is available.");
        }
    } else {
        Ok(tokens)
    }
}

async fn fetch_sleep_response(access_token: &str) -> Result<reqwest::Response> {
    let today = Local::now().date_naive();
    let start_date = today - ChronoDuration::days(8);

    Client::new()
        .get(SLEEP_ENDPOINT)
        .bearer_auth(access_token)
        .query(&[
            ("start_date", start_date.to_string()),
            ("end_date", today.to_string()),
        ])
        .send()
        .await
        .context("Failed to reach Oura's sleep endpoint")
}

fn parse_sessions(value: Value) -> Result<Vec<OuraSleepSession>> {
    if value.is_array() {
        return Ok(serde_json::from_value(value)?);
    }

    if let Some(data) = value.get("data") {
        return Ok(serde_json::from_value(data.clone())?);
    }

    if let Some(items) = value.get("items") {
        return Ok(serde_json::from_value(items.clone())?);
    }

    bail!("Oura sleep response did not contain a recognizable list of sleep documents.");
}
