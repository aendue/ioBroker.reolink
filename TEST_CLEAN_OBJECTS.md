# TEST_CLEAN_OBJECTS.md - Object Structure Cleanup Test Plan

## Goal
Clean up object/state structure to only create relevant states based on camera type.

## Problem
Currently ALL states are created for ALL cameras, causing confusion:
- HTTP API cameras get battery/MQTT states (wrong!)
- Battery cameras get HTTP API control states (wrong!)

## Solution: Conditional State Creation

### Battery Camera (isBatteryCam = true)
**ONLY create these states:**

```
reolink.0.
├── info.connection (boolean, read)
├── streams.enable (boolean, write) ← Controls RTSP stream on/off
├── snapshot.trigger (boolean, write)
├── snapshot.image (string, read) ← Base64 image
├── snapshotStatus (string, read)
├── mqtt.enable (boolean, write) ← Controls MQTT on/off
└── status. (channel) ← MQTT feedback states
    ├── motion (boolean, read)
    ├── battery_level (number, read)
    ├── floodlight (boolean, read)
    └── preview (string, read) ← Base64 preview
```

**DO NOT create:**
- ❌ `ptzPreset` (HTTP API only)
- ❌ `motionDetection` (HTTP API only)
- ❌ `email` (HTTP API only)
- ❌ `ftp` (HTTP API only)
- ❌ `push` (HTTP API only)
- ❌ `record` (HTTP API only)
- ❌ `audioAlarm` (HTTP API only)
- ❌ Any HTTP API control states

### HTTP API Camera (isBatteryCam = false)
**ONLY create these states:**

```
reolink.0.
├── info.connection (boolean, read)
├── ptzPreset (number, write)
├── motionDetection (boolean, write)
├── email (boolean, write)
├── ftp (boolean, write)
├── push (boolean, write)
├── record (boolean, write)
├── audioAlarm (boolean, write)
└── ... (all HTTP API control states)
```

**DO NOT create:**
- ❌ `streams.enable` (battery cam only)
- ❌ `mqtt.enable` (battery cam only)
- ❌ `status.*` channel (battery cam only)

## Test Procedure

### Test 1: Fresh Install - Battery Camera
```bash
# 1. Configure as battery camera (Argus 3 Pro)
iobroker stop reolink.0
iobroker upload reolink
iobroker start reolink.0

# 2. Wait 30s for adapter to initialize
sleep 30

# 3. Check objects exist (battery cam)
iobroker object get reolink.0.streams.enable    # should exist ✅
iobroker object get reolink.0.mqtt.enable       # should exist ✅
iobroker object get reolink.0.status.motion     # should exist ✅
iobroker object get reolink.0.status.battery_level  # should exist ✅

# 4. Check objects DO NOT exist (HTTP API)
iobroker object get reolink.0.ptzPreset         # should fail ❌
iobroker object get reolink.0.motionDetection   # should fail ❌
iobroker object get reolink.0.email             # should fail ❌
```

### Test 2: Fresh Install - HTTP API Camera
```bash
# 1. Configure as HTTP API camera (e.g., RLC-410)
# Edit config: isBatteryCam = false
iobroker stop reolink.0
iobroker upload reolink
iobroker start reolink.0

# 2. Wait 30s
sleep 30

# 3. Check objects exist (HTTP API)
iobroker object get reolink.0.ptzPreset         # should exist ✅
iobroker object get reolink.0.motionDetection   # should exist ✅

# 4. Check objects DO NOT exist (battery cam)
iobroker object get reolink.0.streams.enable    # should fail ❌
iobroker object get reolink.0.mqtt.enable       # should fail ❌
iobroker object get reolink.0.status.motion     # should fail ❌
```

### Test 3: Migration - Battery Camera
```bash
# 1. Upgrade existing battery camera installation
npm install /tmp/iobroker.reolink-1.4.0-alpha.2.tgz
iobroker restart reolink.0

# 2. Check old HTTP API states are deleted
iobroker object get reolink.0.ptzPreset         # should fail ❌
iobroker object get reolink.0.motionDetection   # should fail ❌

# 3. Check battery states still exist
iobroker object get reolink.0.status.battery_level  # should exist ✅
```

## Expected Object Tree (Battery Cam)

```
reolink.0
├── info
│   └── connection (boolean, read)
├── streams
│   └── enable (boolean, write) ← User controls this!
├── snapshot
│   ├── trigger (boolean, write)
│   └── image (string, read)
├── snapshotStatus (string, read)
├── mqtt
│   └── enable (boolean, write) ← User controls this!
└── status (channel)
    ├── motion (boolean, read)
    ├── battery_level (number, read)
    ├── floodlight (boolean, read)
    └── preview (string, read)
```

## Expected Object Tree (HTTP API Cam)

```
reolink.0
├── info
│   └── connection (boolean, read)
├── ptzPreset (number, write)
├── motionDetection (boolean, write)
├── email (boolean, write)
├── ftp (boolean, write)
├── push (boolean, write)
├── record (boolean, write)
├── audioAlarm (boolean, write)
├── sirens
│   ├── play (boolean, write)
│   └── ... (other siren controls)
└── ... (other HTTP API states)
```

## Critical Rules

1. **Conditional Creation:** Check `isBatteryCam` before creating EVERY state
2. **Migration Cleanup:** Delete incompatible states on upgrade
3. **No Warnings:** Don't log errors if optional states don't exist
4. **Clear Separation:** Battery cam = neolink, HTTP API = native API

## Success Criteria

- ✅ Battery cam: Only 9 states (info, streams, snapshot, mqtt, status.*)
- ✅ HTTP API cam: Only HTTP API control states
- ✅ No confusing extra states
- ✅ Clean logs (no "state not found" warnings)
- ✅ Clear user experience

## Notes

**Why this matters:**
- Users get confused seeing irrelevant states
- Battery cam users try HTTP API controls (doesn't work)
- HTTP API users see MQTT/battery states (doesn't apply)
- Clean structure = better UX

**Implementation files:**
- `src/main.ts` - `async onReady()` - conditional state creation
- `io-package.json` - Remove ALL predefined states (create dynamically)
