use chrono::{DateTime, Duration, Utc};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct OuraSleepSession {
    pub id: Option<String>,
    pub day: Option<String>,
    pub bedtime_start: Option<String>,
    pub bedtime_end: Option<String>,
    pub duration: Option<i64>,
    pub total_sleep_duration: Option<i64>,
    pub time_in_bed: Option<i64>,
    pub awake_time: Option<i64>,
    pub deep_sleep_duration: Option<i64>,
    pub light_sleep_duration: Option<i64>,
    pub rem_sleep_duration: Option<i64>,
    pub sleep_phase_5_min: Option<String>,
    pub hypnogram_5min: Option<String>,
    pub sleep_algorithm_version: Option<String>,
    pub score: Option<i64>,
    pub status: Option<String>,
    pub r#type: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CachedSleepPayload {
    pub fetched_at: String,
    pub sessions: Vec<OuraSleepSession>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EnvStatus {
    pub live_configured: bool,
    pub missing: Vec<String>,
    pub redirect_uri: Option<String>,
    pub scopes: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthStatus {
    pub connected: bool,
    pub has_refresh_token: bool,
    pub expires_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppSnapshot {
    pub env: EnvStatus,
    pub auth: AuthStatus,
    pub cache: Option<CachedSleepPayload>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TokenBundle {
    pub access_token: String,
    pub refresh_token: Option<String>,
    pub token_type: String,
    pub expires_at: Option<DateTime<Utc>>,
    pub scopes: Vec<String>,
}

impl TokenBundle {
    pub fn is_expired(&self) -> bool {
        self.expires_at
            .map(|expires_at| expires_at <= Utc::now() + Duration::seconds(90))
            .unwrap_or(false)
    }
}

#[derive(Debug, Deserialize)]
pub struct OAuthTokenResponse {
    pub access_token: String,
    pub refresh_token: Option<String>,
    pub token_type: Option<String>,
    pub expires_in: Option<i64>,
    pub scope: Option<String>,
}
