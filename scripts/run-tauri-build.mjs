import { spawn } from "node:child_process";
import { resolve } from "node:path";

const tauriCliPath = resolve("node_modules", "@tauri-apps", "cli", "tauri.js");
const tauriEnv = { ...process.env };

for (const key of Object.keys(tauriEnv)) {
  if (key.toLowerCase().startsWith("npm_")) {
    delete tauriEnv[key];
  }
}

const child = spawn(process.execPath, [tauriCliPath, "build", ...process.argv.slice(2)], {
  stdio: "inherit",
  shell: false,
  cwd: process.cwd(),
  env: tauriEnv,
});

child.on("error", (error) => {
  console.error("Failed to launch Tauri CLI:", error.message);
  process.exit(1);
});

child.on("exit", (code) => {
  process.exit(code ?? 1);
});
