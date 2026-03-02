# Test: MQTT Mode for Neolink

## Problem
**Current Behavior:**
- Neolink starts with `rtsp` mode only
- No MQTT topics published to broker
- Camera status/motion/battery not available via MQTT

**Expected Behavior:**
- When `mqtt.enable = true`:
  - Neolink MQTT process spawns (`neolink mqtt --config=...`)
  - Topics published to MQTT broker:
    - `neolink/reolink/status/motion`
    - `neolink/reolink/status/battery_level`
    - `neolink/reolink/status/floodlight`
    - `neolink/reolink/status/preview`
- RTSP process runs independently (always active)

## Root Cause
Neolink has **two separate modes**:
- `neolink rtsp` → RTSP server (no MQTT publishing)
- `neolink mqtt` → MQTT publishing (no RTSP server)

**Cannot run both in same process!**

## Solution Architecture
Run **TWO separate neolink processes**:
1. **RTSP Process** (always running):
   - `neolink rtsp --config=neolink-rtsp.toml`
   - Provides RTSP streams
   - MQTT config removed from TOML

2. **MQTT Process** (when `mqtt.enable = true`):
   - `neolink mqtt --config=neolink-mqtt.toml`
   - Publishes to MQTT broker
   - No RTSP config in TOML

## Test Cases

### Test 1: RTSP Process (Always Running)
```bash
# Check RTSP process
ps aux | grep "neolink rtsp"
# Expected: Process running with PID

# Check RTSP streams
ffprobe rtsp://127.0.0.1:8554/reolink/mainStream
# Expected: Stream metadata shown
```

### Test 2: MQTT Process (When Enabled)
```bash
# Enable MQTT
iobroker setState reolink.0.mqtt.enable true

# Wait 5 seconds
sleep 5

# Check MQTT process
ps aux | grep "neolink mqtt"
# Expected: Process running with PID

# Check MQTT topics
mosquitto_sub -h 192.168.0.110 -t "neolink/#" -v
# Expected:
# neolink/reolink/status/motion clear
# neolink/reolink/status/battery_level 91
# neolink/reolink/status/floodlight off
```

### Test 3: MQTT Process Stop
```bash
# Disable MQTT
iobroker setState reolink.0.mqtt.enable false

# Wait 2 seconds
sleep 2

# Check MQTT process stopped
ps aux | grep "neolink mqtt"
# Expected: No process found

# Check RTSP still running
ps aux | grep "neolink rtsp"
# Expected: Process still running
```

### Test 4: Auto-Disable Timer
```bash
# Enable MQTT
iobroker setState reolink.0.mqtt.enable true

# Wait 31 seconds (default auto-disable: 30s)
sleep 31

# Check state
iobroker getState reolink.0.mqtt.enable
# Expected: false (auto-disabled)

# Check MQTT process
ps aux | grep "neolink mqtt"
# Expected: No process found (stopped)
```

## Implementation Checklist

- [ ] Update `NeolinkManager` to support two process types
- [ ] Split TOML generation: `rtsp` and `mqtt` configs
- [ ] Update `start()` to spawn RTSP process always
- [ ] Add `startMqtt()` to spawn MQTT process on-demand
- [ ] Add `stopMqtt()` to kill MQTT process only
- [ ] Update `handleBatteryCamMqttControl()` to use new methods
- [ ] Test on dev-server (192.168.0.99)
- [ ] Verify MQTT topics in MQTT Explorer

## Success Criteria

✅ RTSP process runs independently of MQTT state  
✅ MQTT process starts when `mqtt.enable = true`  
✅ MQTT topics published to broker (motion, battery_level, floodlight)  
✅ MQTT process stops when `mqtt.enable = false`  
✅ Auto-disable timer works (30s default)  
✅ No battery drain when MQTT disabled  
