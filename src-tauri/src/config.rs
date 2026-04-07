use anyhow::{anyhow, Result};
use std::env;

use crate::types::EnvStatus;

const DEFAULT_SCOPE: &str = "daily";

#[derive(Debug, Clone)]
pub struct AppEnv {
    pub client_id: Option<String>,
    pub client_secret: Option<String>,
    pub redirect_uri: Option<String>,
    pub scopes: Vec<String>,
}

#[derive(Debug, Clone)]
pub struct LiveEnv {
    pub client_id: String,
    pub client_secret: String,
    pub redirect_uri: String,
    pub scopes: Vec<String>,
}

impl AppEnv {
    pub fn load() -> Self {
        dotenvy::dotenv().ok();

        Self {
            client_id: env::var("OURA_CLIENT_ID").ok().filter(|value| !value.trim().is_empty()),
            client_secret: env::var("OURA_CLIENT_SECRET")
                .ok()
                .filter(|value| !value.trim().is_empty()),
            redirect_uri: env::var("OURA_REDIRECT_URI")
                .ok()
                .filter(|value| !value.trim().is_empty()),
            scopes: parse_scopes(env::var("OURA_SCOPES").ok()),
        }
    }

    pub fn status(&self) -> EnvStatus {
        let mut missing = Vec::new();

        if self.client_id.is_none() {
            missing.push("OURA_CLIENT_ID".to_string());
        }
        if self.client_secret.is_none() {
            missing.push("OURA_CLIENT_SECRET".to_string());
        }
        if self.redirect_uri.is_none() {
            missing.push("OURA_REDIRECT_URI".to_string());
        }

        EnvStatus {
            live_configured: missing.is_empty(),
            missing,
            redirect_uri: self.redirect_uri.clone(),
            scopes: self.scopes.clone(),
        }
    }

    pub fn require_live(&self) -> Result<LiveEnv> {
        let status = self.status();
        if !status.live_configured {
            return Err(anyhow!(
                "Missing required Oura configuration: {}",
                status.missing.join(", ")
            ));
        }

        Ok(LiveEnv {
            client_id: self.client_id.clone().unwrap_or_default(),
            client_secret: self.client_secret.clone().unwrap_or_default(),
            redirect_uri: self.redirect_uri.clone().unwrap_or_default(),
            scopes: self.scopes.clone(),
        })
    }
}

fn parse_scopes(raw: Option<String>) -> Vec<String> {
    let scopes = raw
        .unwrap_or_else(|| DEFAULT_SCOPE.to_string())
        .split(|character: char| character == ',' || character.is_whitespace())
        .filter(|part| !part.trim().is_empty())
        .map(|part| part.trim().to_string())
        .collect::<Vec<_>>();

    if scopes.is_empty() {
        vec![DEFAULT_SCOPE.to_string()]
    } else {
        scopes
    }
}
