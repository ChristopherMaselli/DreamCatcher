# DreamCatcher

DreamCatcher is a Windows-first Tauri desktop MVP for reviewing the last 7 nights of Oura sleep data and highlighting the final two REM blocks before your final wake-up. It is designed as a personal dashboard to help estimate a manual wake window for WILD lucid dreaming attempts.

## Stack

- Tauri 2
- React
- TypeScript
- Rust backend for OAuth, token storage, and live Oura fetches

## Project Plan Summary

1. Use a local Tauri desktop shell so the app stays private and runs entirely on your machine.
2. Keep Oura OAuth and token handling in Rust so secrets do not need to live in the browser layer.
3. Fetch recent sleep documents from Oura, cache them locally, and normalize them in TypeScript.
4. Infer REM blocks from the 5-minute stage timeline, then highlight the last two before final wake.
5. Use a simple heuristic over the last 7 nights to suggest a manual WILD wake window.
6. Keep live mode empty by default when no real data exists, and only show the mock week when you explicitly switch to it.

## Folder Structure

- `src/`
- `src/components/` reusable dashboard UI pieces
- `src/services/` bridge, normalization, REM extraction, and WILD heuristic logic
- `src/types/` frontend models for backend state and Oura sleep data
- `src/mocks/` realistic 7 day mock Oura-like dataset
- `src-tauri/src/` Rust auth, storage, Oura client, and command modules
- `src-tauri/tauri.conf.json` desktop window and build config
- `.env.example` environment variable template

## Prerequisites

- Node.js 20+
- npm 8+
- Rust/Cargo
- Tauri Windows prerequisites
- Microsoft C++ Build Tools with Desktop development with C++
- Microsoft Edge WebView2 runtime

The official Tauri Windows prerequisites guide is here:
https://v2.tauri.app/start/prerequisites/

## Environment Variables

Create a `.env` file in the project root and paste your Oura values there.

```env
OURA_CLIENT_ID=your_oura_client_id
OURA_CLIENT_SECRET=your_oura_client_secret
OURA_REDIRECT_URI=http://127.0.0.1:37321/callback
OURA_SCOPES=daily
```

### What each variable does

- `OURA_CLIENT_ID`: your Oura OAuth application client ID
- `OURA_CLIENT_SECRET`: your Oura OAuth application client secret
- `OURA_REDIRECT_URI`: must exactly match the redirect URI registered in the Oura developer portal
- `OURA_SCOPES`: optional, defaults to `daily`

## Oura Developer Setup

1. Sign in to the Oura developer portal.
2. Create an OAuth application.
3. Register `http://127.0.0.1:37321/callback` as the redirect URI, or choose another localhost URI and use that exact value in `.env`.
4. Copy the client ID and client secret into your root `.env` file.
5. Start DreamCatcher and click `Connect Oura`.

## Where To Paste Your Oura Credentials

Paste all three values into the root project file:

- `.env`

Specifically:

- `OURA_CLIENT_ID`
- `OURA_CLIENT_SECRET`
- `OURA_REDIRECT_URI`

## Running In Development On Windows

```bash
npm install
npm run desktop-dev
```

If you only want to preview the React UI in a browser tab, you can also run:

```bash
npm run dev
```

If port `1420` is already busy, stop the existing Vite or Node process before starting the desktop app. Inside the app, `Live Oura` is the default mode. If there is no live sleep data yet, the week remains empty until you connect or refresh. Press `Use Mock Week` only when you want the built-in sample data.

## Building The Windows Desktop App

```bash
npm install
npm run desktop-build
```

Tauri will place the Windows build artifacts in `src-tauri/target/`.

## How DreamCatcher Works

- The Rust backend opens the Oura OAuth page in your system browser.
- Oura redirects back to a temporary localhost listener inside the app.
- Tokens are stored in the OS credential store through the `keyring` crate.
- Cached live sleep documents are stored in the app data directory as JSON.
- The React app normalizes recent sleep sessions, picks the main overnight session per day, groups contiguous REM epochs, and highlights the last two groups before wake.
- The selected day is pinned at the top so you can inspect its full sleep timestream in detail.
- Each day has a checkbox that decides whether it contributes to tonight's WILD estimate.
- A slider lets you exclude very late after-midnight sleep starts from the estimate without throwing out normal evening bedtimes.
- If no live connection is available, DreamCatcher keeps the week empty until you explicitly switch to the mock week.

## Known Assumptions and Limitations

- DreamCatcher assumes Oura sleep-stage timelines are available as a 5-minute hypnogram string and interprets REM by grouping contiguous REM epochs.
- The app highlights REM blocks, not medically validated REM "cycles." This is an MVP inference for personal use.
- If Oura omits stage-level detail for a session, the app shows a summary card and a graceful placeholder instead of a detailed timeline.
- The bedtime cutoff slider excludes late after-midnight starts from the estimate instead of weighting them gradually.
- The current heuristic uses the last 7 nights only and does not learn from dream outcomes yet.
- Disconnect currently clears the stored token and cached live sleep data from the app.

## Future Improvements

- notifications and alarm integration
- longer history and trend views
- per-user learning for wake timing suggestions
- dream outcome logging and journaling

## Key Files

- `src/App.tsx`
- `src/components/SelectedSleepPanel.tsx`
- `src/components/DashboardCalendar.tsx`
- `src/services/sleepNormalizer.ts`
- `src/services/suggestionHeuristic.ts`
- `src/mocks/mockSleepData.ts`
- `src-tauri/src/auth.rs`
- `src-tauri/src/oura.rs`
- `src-tauri/src/storage.rs`
- `src-tauri/src/commands.rs`

## Notes For Live Oura Data

DreamCatcher is intentionally defensive about the live Oura payload shape. The Rust side stores a permissive subset of sleep document fields, and the TypeScript adapter isolates the REM-stage interpretation so it is easy to adjust if Oura changes or clarifies field names in the future.

