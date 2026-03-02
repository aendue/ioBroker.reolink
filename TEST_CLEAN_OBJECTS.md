# Test: Clean Object Structure for Battery Cameras

## Problem
**Current Behavior:**
- Battery camera creates ALL states (HTTP API + Battery)
- HTTP API states don't work for battery cameras
- Object tree is cluttered and confusing
- MQTT topics use adapter instance name instead of friendly camera name

**Example Issues:**
```
reolink.0.device.model          ❌ (HTTP API - doesn't work)
reolink.0.sensor.people.state   ❌ (HTTP API - doesn't work)
reolink.0.settings.ir           ❌ (HTTP API - doesn't work)
reolink.0.disc.capacity         ❌ (HTTP API - doesn't work)
```

## Root Causes
1. **Object Creation:** `createBatteryCamStates()` called AFTER `onReady()` creates HTTP states
2. **Camera Naming:** Uses adapter instance name (`this.name`) instead of config-based friendly name
3. **No Conditional Logic:** All states created regardless of camera type

## Expected Behavior

### Test 1: Battery Camera - Minimal Object Tree
```
reolink.0.info.uid              ✅ Camera UID
reolink.0.info.connection       ✅ Connection status
reolink.0.info.neolink_status   ✅ Neolink process status

reolink.0.streams.mainStream    ✅ RTSP URL
reolink.0.streams.subStream     ✅ RTSP URL
reolink.0.streams.enable        ✅ Stream control

reolink.0.mqtt.enable           ✅ MQTT control

reolink.0.snapshot              ✅ Snapshot trigger
reolink.0.snapshotImage         ✅ Base64 image
reolink.0.snapshotStatus        ✅ Status (idle/capturing/success/error)

reolink.0.floodlight            ✅ Floodlight on/off

reolink.0.battery.level         ✅ Battery percentage (via MQTT subscription)
reolink.0.motion.detected       ✅ Motion state (via MQTT subscription)
reolink.0.floodlight.status     ✅ Floodlight state (via MQTT subscription)
```

**NOT Created:**
- `device.*` ❌
- `network.*` ❌
- `disc.*` ❌
- `sensor.*` ❌
- `settings.*` ❌
- `command.*` ❌
- `RAW.*` ❌

### Test 2: HTTP API Camera - Full Object Tree
```
reolink.0.device.*              ✅ All device info
reolink.0.network.*             ✅ Network settings
reolink.0.disc.*                ✅ Storage info
reolink.0.sensor.*              ✅ AI detection
reolink.0.settings.*            ✅ Camera settings
reolink.0.command.*             ✅ Commands
```

**NOT Created:**
- `streams.*` ❌ (no RTSP via neolink)
- `mqtt.enable` ❌ (no MQTT mode)

### Test 3: MQTT Camera Name
**Config:** User can set friendly camera name
- Config field: `cameraBatteryName` (default: "Camera01")
- Used for MQTT topics: `neolink/<cameraBatteryName>/status/*`
- Displayed in logs

**Example:**
```
Config: cameraBatteryName = "Argus3_Garden"
Topics: neolink/Argus3_Garden/status/motion
        neolink/Argus3_Garden/status/battery_level
```

## Implementation Checklist

- [ ] Add `cameraBatteryName` config field (default: "Camera01")
- [ ] Update neolink config generator to use friendly name
- [ ] Split `onReady()` into two paths:
  - `startBatteryCam()` → Battery states only
  - `startHttpCam()` → HTTP API states only
- [ ] Create MQTT subscription states:
  - `battery.level` (number, %, read-only)
  - `motion.detected` (boolean, read-only)
  - `floodlight.status` (boolean, read-only from MQTT feedback)
- [ ] Subscribe to MQTT topics in `handleBatteryCamMqttControl()`
- [ ] Update MqttHelper to support subscriptions
- [ ] Test object tree on fresh adapter install

## Success Criteria

✅ Battery camera creates ONLY battery-related states  
✅ HTTP camera creates ONLY HTTP API states  
✅ MQTT topics use friendly camera name  
✅ MQTT subscription updates ioBroker states  
✅ Object tree is clean and logical  
✅ No unused/broken states visible  
