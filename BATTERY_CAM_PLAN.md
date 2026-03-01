# Battery Camera Support Implementation Plan

## Goal
Add support for Reolink battery-powered cameras (Argus 3 Pro, B400, D400, E1, etc.) via neolink integration.

## Problem
Battery-powered Reolink cameras use the proprietary "Baichuan" protocol (port 9000) instead of the HTTP API. They don't support native RTSP or ONVIF.

## Solution
Integrate **neolink** (https://github.com/QuantumEntangledAndy/neolink) to bridge Baichuan protocol to RTSP.

---

## Architecture

### Detection
1. Add config option: `isBatteryCam: boolean`
2. If `true` → Use neolink path
3. If `false` → Use existing HTTP API path (no changes)

### Neolink Integration

**Bundle neolink binaries:**
```
lib/
├── neolink-linux-x64
├── neolink-linux-arm64
├── neolink-macos
└── neolink-windows.exe
```

**Spawn neolink:**
```typescript
import { spawn } from 'child_process';

const neolinkProcess = spawn('./lib/neolink-linux-x64', [
  'rtsp',
  '--config', neolinkConfigPath
]);
```

**Neolink config (TOML):**
```toml
[[cameras]]
name = "Camera01"
username = "admin"
password = "secret"
uid = "95270005ODHZABIH"
address = "192.168.30.24"
```

**RTSP Output:**
```
rtsp://127.0.0.1:8554/Camera01/mainStream
rtsp://127.0.0.1:8554/Camera01/subStream
```

---

## Implementation Steps

### Phase 1: Detection & Config
- [ ] Add `isBatteryCam` checkbox to admin UI (jsonConfig.json)
- [ ] Add `cameraUID` field for battery cams
- [ ] Update io-package.json with new config options
- [ ] Validate config (UID required for battery cams)

### Phase 2: Neolink Binary Management
- [ ] Download neolink binaries (v0.6.2)
- [ ] Add to `lib/` folder
- [ ] Create binary selector (OS/arch detection)
- [ ] Add to `.files` in package.json
- [ ] Test binary execution permissions

### Phase 3: Neolink Process Management
- [ ] Generate neolink config TOML from adapter config
- [ ] Spawn neolink process on adapter start
- [ ] Handle process lifecycle (restart on crash)
- [ ] Kill neolink on adapter stop
- [ ] Log neolink stdout/stderr

### Phase 4: RTSP Integration
- [ ] Connect to RTSP stream (snapshot via ffmpeg/gstreamer)
- [ ] Implement battery status polling (MQTT or neolink API)
- [ ] Implement motion detection (MQTT topics)
- [ ] Update state objects for battery cams

### Phase 5: Testing
- [ ] Test with Camera01 (192.168.30.24, Argus 3 Pro)
- [ ] Test with Camera02 (192.168.30.31)
- [ ] Test adapter restart (neolink cleanup)
- [ ] Test config changes (neolink reload)
- [ ] Test error handling (camera offline, wrong credentials)

### Phase 6: Documentation
- [ ] Update README.md with battery cam instructions
- [ ] Add CHANGELOG entry
- [ ] Document neolink configuration
- [ ] Add troubleshooting guide

---

## State Structure

**For Battery Cameras:**
```
reolink.0
└── Camera01 (battery cam)
    ├── info
    │   ├── uid (string)
    │   ├── battery_level (number, %)
    │   ├── charging (boolean)
    │   └── neolink_status (string: running/stopped/error)
    ├── motion
    │   └── detected (boolean)
    ├── snapshot
    │   └── url (string, RTSP URL)
    └── streams
        ├── mainStream (string, rtsp://...)
        └── subStream (string, rtsp://...)
```

---

## Config Example

**Admin UI:**
```json
{
  "cameras": [
    {
      "name": "Camera01",
      "ip": "192.168.30.24",
      "username": "admin",
      "password": "secret",
      "isBatteryCam": true,
      "cameraUID": "95270005ODHZABIH"
    },
    {
      "name": "Camera02",
      "ip": "192.168.0.101",
      "username": "admin",
      "password": "secret",
      "isBatteryCam": false
    }
  ]
}
```

---

## Compatibility

### Existing Features (HTTP API Cams)
✅ **No breaking changes!**
- All existing features remain unchanged
- HTTP API cameras work exactly as before
- Battery cam support is opt-in

### New Features (Battery Cams via Neolink)
- ✅ RTSP stream URLs
- ✅ Battery level monitoring
- ✅ Motion detection (MQTT)
- ❌ PTZ control (not supported by battery cams)
- ❌ Email/FTP settings (not applicable)

---

## Dependencies

**New npm packages:**
```bash
npm install toml  # For neolink config generation
```

**Optional (for RTSP snapshots):**
```bash
npm install fluent-ffmpeg  # RTSP snapshot extraction
```

**System dependencies:**
- None! Neolink is bundled as static binary

---

## Security Considerations

- ⚠️ **Neolink config contains plaintext passwords**
  - Store in adapter's private data folder
  - Set restrictive file permissions (chmod 600)
  - Don't log config content

- ⚠️ **RTSP streams are unencrypted**
  - Only listen on localhost by default
  - Document security implications

---

## Testing Checklist

### Manual Testing
- [ ] Install adapter on dev-server (192.168.0.99)
- [ ] Configure Camera01 as battery cam
- [ ] Verify neolink starts
- [ ] Check RTSP stream accessible
- [ ] Verify battery level updates
- [ ] Test motion detection
- [ ] Stop adapter → neolink killed
- [ ] Restart adapter → neolink restarts

### Automated Testing
- [ ] Unit tests for config validation
- [ ] Unit tests for binary selection
- [ ] Integration test: spawn/kill neolink
- [ ] Mock RTSP responses

---

## Timeline

**Phase 1-2:** Config + Binaries (2-3 hours)  
**Phase 3:** Process Management (2-3 hours)  
**Phase 4:** RTSP Integration (3-4 hours)  
**Phase 5:** Testing (2-3 hours)  
**Phase 6:** Documentation (1 hour)

**Total:** ~12-16 hours

---

## Questions / Decisions Needed

1. **Binary bundling:**
   - Ship all binaries (larger package) ✅
   - OR download on-demand (network dependency) ❌

2. **RTSP port:**
   - Hardcoded 8554 ✅
   - OR configurable per camera ❌

3. **Neolink updates:**
   - Manual updates (ship with adapter version) ✅
   - OR auto-update from GitHub releases ❌

4. **Battery polling interval:**
   - Default 1 hour ✅
   - Configurable? ❌

**Decision: Keep it simple for v1. Ship binaries, hardcode port 8554, manual updates.**

---

## Resources

- Neolink GitHub: https://github.com/QuantumEntangledAndy/neolink
- Neolink v0.6.2 Release: https://github.com/QuantumEntangledAndy/neolink/releases/tag/v0.6.2
- Wiki.js RAG: Camera credentials at 192.168.30.24 & 192.168.30.31
- Test Server: ioBroker on 192.168.0.99
