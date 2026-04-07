use anyhow::Result;
use tauri::AppHandle;

use crate::{
    auth,
    config::AppEnv,
    oura,
    storage,
    types::{AppSnapshot, AuthStatus, AuthLaunchPayload},
};

#[tauri::command]
pub async fn get_app_snapshot(app: AppHandle) -> Result<AppSnapshot, String> {
    snapshot(&app).map_err(format_error)
}

#[tauri::command]
pub async fn connect_oura() -> Result<AuthLaunchPayload, String> {
    let live_env = AppEnv::load().require_live().map_err(format_error)?;
    auth::begin_oauth(&live_env).map_err(format_error)
}

#[tauri::command]
pub async fn finish_oura_connect(app: AppHandle, callback_url: String) -> Result<AppSnapshot, String> {
    let live_env = AppEnv::load().require_live().map_err(format_error)?;
    let tokens = auth::complete_oauth_from_callback(&live_env, &callback_url)
        .await
        .map_err(format_error)?;
    storage::save_tokens(&tokens).map_err(format_error)?;
    snapshot(&app).map_err(format_error)
}

#[tauri::command]
pub async fn disconnect_oura(app: AppHandle) -> Result<AppSnapshot, String> {
    if let Some(tokens) = storage::load_tokens().map_err(format_error)? {
        let _ = auth::revoke_access_token(&tokens.access_token).await;
    }

    storage::clear_tokens().map_err(format_error)?;
    storage::clear_cache(&app).map_err(format_error)?;
    snapshot(&app).map_err(format_error)
}

#[tauri::command]
pub async fn refresh_live_data(app: AppHandle) -> Result<AppSnapshot, String> {
    oura::refresh_sleep_cache(&app)
        .await
        .map_err(format_error)?;
    snapshot(&app).map_err(format_error)
}

fn snapshot(app: &AppHandle) -> Result<AppSnapshot> {
    let env = AppEnv::load();
    let tokens = storage::load_tokens()?;
    let auth = AuthStatus {
        connected: tokens.is_some(),
        has_refresh_token: tokens
            .as_ref()
            .and_then(|bundle| bundle.refresh_token.as_ref())
            .is_some(),
        expires_at: tokens.and_then(|bundle| bundle.expires_at.map(|value| value.to_rfc3339())),
    };
    let cache = storage::load_cache(app)?;

    Ok(AppSnapshot {
        env: env.status(),
        auth,
        cache,
    })
}

fn format_error(error: anyhow::Error) -> String {
    error.to_string()
}
