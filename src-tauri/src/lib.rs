mod auth;
mod commands;
mod config;
mod oura;
mod storage;
mod types;

pub fn run() {
    dotenvy::dotenv().ok();

    let _ = tracing_subscriber::fmt()
        .with_env_filter(tracing_subscriber::EnvFilter::from_default_env())
        .with_target(false)
        .try_init();

    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            commands::get_app_snapshot,
            commands::connect_oura,
            commands::disconnect_oura,
            commands::refresh_live_data,
        ])
        .run(tauri::generate_context!())
        .expect("error while running DreamCatcher");
}
