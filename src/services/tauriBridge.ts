import { invoke } from "@tauri-apps/api/core";
import type { BackendSnapshot, OuraAuthLaunch } from "../types/app";

export async function getBackendSnapshot(): Promise<BackendSnapshot> {
  if (!isTauriRuntime()) {
    return browserSnapshot();
  }

  return invoke<BackendSnapshot>("get_app_snapshot");
}

export async function refreshLiveData(): Promise<BackendSnapshot> {
  if (!isTauriRuntime()) {
    throw new Error("Live refresh is only available from the Tauri desktop app.");
  }

  return invoke<BackendSnapshot>("refresh_live_data");
}

export async function connectOura(): Promise<OuraAuthLaunch> {
  if (!isTauriRuntime()) {
    throw new Error("Oura sign-in is only available from the Tauri desktop app.");
  }

  return invoke<OuraAuthLaunch>("connect_oura");
}

export async function finishOuraConnect(callbackUrl: string): Promise<BackendSnapshot> {
  if (!isTauriRuntime()) {
    throw new Error("Oura sign-in is only available from the Tauri desktop app.");
  }

  return invoke<BackendSnapshot>("finish_oura_connect", { callbackUrl });
}

export async function disconnectOura(): Promise<BackendSnapshot> {
  if (!isTauriRuntime()) {
    return browserSnapshot();
  }

  return invoke<BackendSnapshot>("disconnect_oura");
}

function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

function browserSnapshot(): BackendSnapshot {
  return {
    env: {
      liveConfigured: false,
      missing: ["OURA_CLIENT_ID", "OURA_CLIENT_SECRET", "OURA_REDIRECT_URI"],
      redirectUri: null,
      scopes: ["daily"],
    },
    auth: {
      connected: false,
      hasRefreshToken: false,
      expiresAt: null,
    },
    cache: null,
  };
}
