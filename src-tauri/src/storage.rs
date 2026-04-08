use anyhow::{Context, Result};
use keyring::Entry;
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

use crate::types::{CachedSleepPayload, PendingOAuth, TokenBundle};

const SERVICE_NAME: &str = "DreamCatcher";
const TOKEN_NAME: &str = "oura_tokens";
const TOKEN_FILE: &str = "tokens.json";
const CACHE_FILE: &str = "sleep-cache.json";
const PENDING_OAUTH_FILE: &str = "pending-oauth.json";

pub fn save_tokens(app: &AppHandle, tokens: &TokenBundle) -> Result<()> {
    let serialized = serde_json::to_string(tokens)?;

    if let Ok(entry) = Entry::new(SERVICE_NAME, TOKEN_NAME) {
        let _ = entry.set_password(&serialized);
    }

    let path = token_path(app)?;
    fs::write(path, serialized.as_bytes())?;
    Ok(())
}

pub fn load_tokens(app: &AppHandle) -> Result<Option<TokenBundle>> {
    if let Ok(entry) = Entry::new(SERVICE_NAME, TOKEN_NAME) {
        match entry.get_password() {
            Ok(serialized) => return Ok(Some(serde_json::from_str(&serialized)?)),
            Err(keyring::Error::NoEntry) => {}
            Err(_) => {}
        }
    }

    let path = token_path(app)?;
    if !path.exists() {
        return Ok(None);
    }

    let bytes = fs::read(path)?;
    Ok(Some(serde_json::from_slice(&bytes)?))
}

pub fn clear_tokens(app: &AppHandle) -> Result<()> {
    if let Ok(entry) = Entry::new(SERVICE_NAME, TOKEN_NAME) {
        match entry.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => {}
            Err(error) => return Err(error.into()),
        }
    }

    let path = token_path(app)?;
    if path.exists() {
        fs::remove_file(path)?;
    }

    Ok(())
}

pub fn save_pending_oauth(app: &AppHandle, pending: &PendingOAuth) -> Result<()> {
    let path = pending_oauth_path(app)?;
    let serialized = serde_json::to_vec_pretty(pending)?;
    fs::write(path, serialized)?;
    Ok(())
}

pub fn load_pending_oauth(app: &AppHandle) -> Result<Option<PendingOAuth>> {
    let path = pending_oauth_path(app)?;
    if !path.exists() {
        return Ok(None);
    }

    let bytes = fs::read(path)?;
    Ok(Some(serde_json::from_slice(&bytes)?))
}

pub fn clear_pending_oauth(app: &AppHandle) -> Result<()> {
    let path = pending_oauth_path(app)?;
    if path.exists() {
        fs::remove_file(path)?;
    }

    Ok(())
}

pub fn save_cache(app: &AppHandle, payload: &CachedSleepPayload) -> Result<()> {
    let path = cache_path(app)?;
    let serialized = serde_json::to_vec_pretty(payload)?;
    fs::write(path, serialized)?;
    Ok(())
}

pub fn load_cache(app: &AppHandle) -> Result<Option<CachedSleepPayload>> {
    let path = cache_path(app)?;
    if !path.exists() {
        return Ok(None);
    }

    let bytes = fs::read(path)?;
    Ok(Some(serde_json::from_slice(&bytes)?))
}

pub fn clear_cache(app: &AppHandle) -> Result<()> {
    let path = cache_path(app)?;
    if path.exists() {
        fs::remove_file(path)?;
    }

    Ok(())
}

fn token_path(app: &AppHandle) -> Result<PathBuf> {
    data_path(app, TOKEN_FILE)
}

fn cache_path(app: &AppHandle) -> Result<PathBuf> {
    data_path(app, CACHE_FILE)
}

fn pending_oauth_path(app: &AppHandle) -> Result<PathBuf> {
    data_path(app, PENDING_OAUTH_FILE)
}

fn data_path(app: &AppHandle, file_name: &str) -> Result<PathBuf> {
    let directory = app
        .path()
        .app_data_dir()
        .context("Could not resolve the app data directory")?;
    fs::create_dir_all(&directory)?;
    Ok(directory.join(file_name))
}
