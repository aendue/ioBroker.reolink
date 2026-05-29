# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

An **ioBroker adapter** for Reolink cameras. Source is TypeScript in `src/`, compiled to `build/` (the published `main` is `build/main.js`). It runs as a long-lived adapter process under the ioBroker runtime, exposing camera data and controls as ioBroker *states* (objects).

## Commands

```bash
npm run build          # Compile src/ → build/ (tsc -p tsconfig.build.json). Required before running.
npm run check          # Type-check only, no emit (tsc -p tsconfig.check.json)
npm run lint           # ESLint (@iobroker/eslint-config, flat config in eslint.config.mjs)

npm test               # test:js + test:unit + test:package
npm run test:unit      # @iobroker/testing unit harness (mocks the adapter)
npm run test:js        # Mocha over *.test.js (e.g. test/unit/mqtt-message-handler.test.js)
npm run test:integration  # Spins up a real js-controller and starts the adapter
npm run test:package   # Validates package.json / io-package.json consistency

# Run a single mocha test file:
npx mocha test/unit/mqtt-message-handler.test.js
```

There is **no watch task**; rebuild manually after editing `src/`. Node >= 20 is required.

`npm run translate` runs `translate-adapter` to fill `admin/i18n/*.json` from the English source. `npm run release` uses `@alcalzone/release-script` (updates version across package.json, io-package.json, README changelog).

## Architecture

### Two camera modes — the central branch

Everything keys off `config.isBatteryCam` in `onReady()` (`src/main.ts`). The two modes share almost no runtime code and create **disjoint sets of states**:

- **HTTP API cameras** (standard, mains-powered): talk to the camera's `/api.cgi` JSON HTTP API over an axios client (`reolinkApiClient`). State tree: `device.*`, `network.*`, `sensor.*`, `disc.*`, `settings.*`, `command.*`, `ai_config.*`, `RAW.*`. **Wired doorbells** are a sub-case of this mode: when `config.isDoorbell` is set, `createDoorbellStates()` adds `sensor.visitor.*` and `doorbell.*` (quick reply / auto reply / audio file list); when unset, `removeDoorbellStates()` deletes them. The shared id list is `doorbellObjectIds` (also spread into `cleanupHttpCamStates`). **Ring detection is NOT done via HTTP** — most doorbells don't expose `visitor` in `GetAiState` (confirmed against a real device). Instead `OnvifHelper` (`src/onvif-helper.ts`) opens an ONVIF PullPoint subscription (port `config.onvifPort`, Reolink default 8000) and `handleVisitorEvent()` drives `sensor.visitor.state` (with a 10 s auto-clear fallback timer `visitorClearTimer`). The `getAiState()` visitor branch is kept only as a best-effort complement for models that do expose it.
- **Battery cameras** (Argus PT, etc.): use the proprietary Reolink P2P protocol via the external **neolink** binary. State tree: `streams.*`, `mqtt.*`, `status.*`, `ptz.*`, `query.*`, `floodlight`, `pir`, `snapshot*`, `info.neolink_status`.

On startup each mode calls `cleanup<other>CamStates()` to delete the opposite mode's states, then `create<thisMode>CamStates()`. **States are created dynamically in code, not via `io-package.json` `instanceObjects`** — so when adding a state you must add it to the relevant `create...` method *and* its `cleanup...` list, keeping the two in sync.

### HTTP API flow

- `genUrl(command, genRndSeed?, withChannel?)` builds the `/api.cgi?cmd=...&user=...&password=...` query string. Password URI-encoding is toggleable via `config.UriEncodedPassword` (a workaround for cameras that choke on special chars — see README).
- `sendCmd(cmdObject[], cmdName)` POSTs command arrays; the many `getX()`/`setX()` methods wrap individual Reolink commands. Reolink uses both GET (`Snap`, `GetDevInfo`, ...) and POST (`GetWhiteLed`, `GetRecV20`, ...) for different commands — match the existing method when adding one.
- `refreshState(source)` is a **self-rescheduling polling loop** (`setTimeout`, not `setInterval`): polls motion/AI/mail every cycle, and recording/disc info every `refreshIntervalRecording` (10th) cycle. Interval comes from `config.apiRefreshInterval`, clamped 1–10000s; 10s fixed retry when disconnected.
- Writable states are driven by `subscribeStates(...)` + the `onStateChange` dispatcher, which routes by the **last path segment** (`propName`) for HTTP states and by `id.endsWith(...)` for battery states.
- `ReolinkErrorMessages` / `getReolinkErrorMessage(code)` map Reolink's negative rspCodes to text.

### Battery camera subsystem (`src/neolink-*.ts`, `src/mqtt-helper.ts`)

- **`neolink-binary.ts`**: downloads the pinned `NEOLINK_VERSION` binary from GitHub Releases on first use into `lib/` (per-platform asset, extracted with adm-zip). Not bundled — this avoids shipping the AGPL-3.0 binary. Update `NEOLINK_VERSION` to upgrade.
- **`neolink-manager.ts`**: manages **two separate neolink child processes** — an `rtsp` process (RTSP streams) and an `mqtt` process (publishes motion/battery/floodlight/PIR). Generates per-mode TOML config files in the adapter's data dir (`utils.getAbsoluteDefaultDataDir()/<namespace>`). PTZ, battery, and PIR queries shell out to the neolink CLI (`exec`) against an existing config file. Config files are deliberately kept after stop (CLI queries reuse them).
- **`mqtt-helper.ts`**: thin `mqtt` client wrapper. The adapter subscribes to `neolink/<camera>/status/#` and publishes control to `neolink/<camera>/control/{floodlight,pir}`. Incoming messages are parsed in `handleMqttMessage` (topic format `neolink/<camera>/status/<type>`).
- **`snapshot-helper.ts`**: captures a JPEG from the RTSP stream via `ffmpeg` (optional dependency).
- **`dependency-check.ts`**: verifies GStreamer RTSP lib (Linux, required) and ffmpeg (optional, for snapshots).
- **Battery protection** is a recurring concern: streaming and MQTT auto-disable after configurable timeouts (`streamAutoDisableTimer`, `mqttAutoDisableTimer`), and floodlight/PIR controls auto-start MQTT if needed. Don't remove these timers without understanding the battery-drain implications.

### Adapter messaging

`onMessage` handles `sendTo` calls from other adapters — currently `{action: "snap"}` returns a base64 image (see README for the snap usage pattern). `onUnload` must clear all timers/intervals and stop neolink processes + MQTT before calling `callback()`.

## Conventions

- `config` is typed via `ReoLinkCamAdapterConfig` in `src/types.d.ts`; all Reolink command payloads have explicit `Reolink*` types there. Add new command names to the `ReolinkCommandName` union.
- All state reads/writes use `setState`/`setStateAsync` with `ack: true` for values *from* the camera and `ack: false` only when commanding. The `onStateChange` handler ignores `ack: true` changes (those are its own echoes).
- Adapter config UI is JSON-based (`admin/jsonConfig.json`, `adminUI.config: "json"`); translations live in `admin/i18n/`.
- Timeout/interval handles use ioBroker's `setTimeout`/`setInterval`/`clearTimeout` (adapter-scoped), not the global ones, so they're cleaned up on unload.
