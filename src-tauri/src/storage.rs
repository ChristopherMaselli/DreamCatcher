use anyhow::{Context, Result};
use keyring::Entry;
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

use crate::types::{CachedSleepPayload, TokenBundle};

const SERVICE_NAME: &str = "DreamCatcher";
const TOKEN_NAME: &str = "oura_tokens";
const CACHE_FILE: &str = "sleep-cache.json";

pub fn save_tokens(tokens: &TokenBundle) -> Result<()> {
    let entry = Entry::new(SERVICE_NAME, TOKEN_NAME)?;
    let serialized = serde_json::to_string(tokens)?;
    entry.set_password(&serialized)?;
    Ok(())
}

pub fn load_tokens() -> Result<Option<TokenBundle>> {
    let entry = Entry::new(SERVICE_NAME, TOKEN_NAME)?;

    match entry.get_password() {
        Ok(serialized) => Ok(Some(serde_json::from_str(&serialized)?)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(error) => Err(error.into()),
    }
}

pub fn clear_tokens() -> Result<()> {
    let entry = Entry::new(SERVICE_NAME, TOKEN_NAME)?;

    match entry.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(error) => Err(error.into()),
    }
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

fn cache_path(app: &AppHandle) -> Result<PathBuf> {
    let directory = app
        .path()
        .app_data_dir()
        .context("Could not resolve the app data directory")?;
    fs::create_dir_all(&directory)?;
    Ok(directory.join(CACHE_FILE))
}
