# MQTT Testing Summary - TOML Config Fixed

## 🐛 Bugs Fixed (2026-03-02 20:00-20:35)

### Bug 1: Missing MQTT Topics Configuration
**Issue:** Neolink MQTT process connected but didn't publish any messages  
**Cause:** Missing `discovery` and `control` topic definitions in TOML config  
**Fix:** Added topic arrays to `[cameras.mqtt]` section (Commit 4125d5b)

###Bug 2: TOML Parse Error
**Issue:** `[[cameras.mqtt.discovery]]` caused parse error  
**Cause:** Wrong syntax - tried to use table arrays instead of string arrays  
**Fix:** Changed to simple string arrays (Commit 46b54f1)

**Correct TOML syntax:**
```toml
[cameras.mqtt]
  broker_addr = "192.168.0.110"
  port = 1883
  username = "iobroker"
  password = "iobroker"
  enable_motion = true
  enable_battery = true
  enable_floodlight = true
  enable_preview = true
  # Status topics that neolink will publish to
  discovery = [
    "neolink/Camera01/status/motion",
    "neolink/Camera01/status/battery_level",
    "neolink/Camera01/status/floodlight",
    "neolink/Camera01/status/preview"
  ]
  # Control topics that neolink will subscribe to  
  control = ["neolink/Camera01/floodlight/set"]
```

---

## ✅ What's Working

1. **Adapter Startup:**
   - ✅ GStreamer dependency check fixed
   - ✅ Battery camera mode active
   - ✅ RTSP process connects to camera
   - ✅ States created (`status.motion`, `status.battery_level`, `status.floodlight`, `status.preview`)

2. **MQTT Connection:**
   - ✅ MQTT client connects to broker (192.168.0.110:1883)
   - ✅ Subscriptions successful (4 topics)
   - ✅ Floodlight control command published

3. **Floodlight Control:**
   - ✅ Command sent: `neolink/Camera01/floodlight/set: on`
   - ✅ MQTT publish successful

---

## ❌ Not Yet Tested

1. **MQTT Message Reception:**
   - ❓ Neolink publishing to discovery topics?
   - ❓ States updating from MQTT messages?
   - ❓ Motion detection working?
   - ❓ Battery level updates?
   - ❓ Floodlight status feedback?

**Why not tested:** Dev-server DB instability caused repeated crashes during testing

---

## 🚧 Dev-Server Issues

**Problem:** Redis DB crashes randomly  
**Symptoms:**
```
get state error: DB closed
Cannot connect/reconnect to objects DB. Stopping adapter.
```

**Impact:** Cannot complete MQTT testing reliably

**Recommendation:** Test on production system (192.168.0.18) where ioBroker is stable

---

## 📋 Next Steps

### Option 1: Production System Testing (Recommended)

Test on **192.168.0.18** where MQTT was already running:

```bash
ssh <user>@192.168.0.18

# Pull latest code
cd /path/to/ioBroker.reolink
git pull origin main
npm run build
npm pack
cd /opt/iobroker
npm install /path/to/iobroker.reolink-1.4.0-alpha.1.tgz

# Restart adapter
iobroker restart reolink.0

# Enable MQTT
iobroker state set reolink.0.mqtt.enable true

# Wait 5 seconds, then check logs
iobroker logs --adapter reolink --lines 50 | grep -E 'MQTT|mqtt'

# Check if neolink MQTT config is correct
find /opt/iobroker -name 'neolink-mqtt-*.toml' -exec cat {} \;

# Check states
iobroker state get reolink.0.status.motion
iobroker state get reolink.0.status.battery_level
iobroker state get reolink.0.status.floodlight

# Test floodlight
iobroker state set reolink.0.floodlight true
sleep 2
iobroker state get reolink.0.status.floodlight  # Should be true

# Test motion
# Walk in front of camera, then:
iobroker state get reolink.0.status.motion  # Should be true
```

### Option 2: Dev-Server with Manual MQTT Check

If must use dev-server:

1. Install `mosquitto-clients`: `sudo apt install mosquitto-clients`
2. Monitor MQTT messages directly:
   ```bash
   mosquitto_sub -h 192.168.0.110 -u iobroker -P iobroker -t "neolink/#" -v
   ```
3. Enable MQTT in adapter
4. Watch for messages in mosquitto_sub output

---

## 📊 Expected Results (When Fixed)

### MQTT Messages (mosquitto_sub):
```
neolink/Camera01/status/motion clear
neolink/Camera01/status/motion triggered
neolink/Camera01/status/battery_level 91
neolink/Camera01/status/floodlight off
neolink/Camera01/status/floodlight on
neolink/Camera01/status/preview <base64-data>
```

### Adapter Logs:
```
[info] ✅ MQTT process started - Camera publishing to broker
[info] ✅ MQTT client connected
[info] [MQTT] Subscribed to: neolink/Camera01/status/motion
[info] [MQTT] Subscribed to: neolink/Camera01/status/battery_level
[info] [MQTT] Subscribed to: neolink/Camera01/status/floodlight
[info] [MQTT] Subscribed to: neolink/Camera01/status/preview
[debug] [MQTT] Received message: neolink/Camera01/status/motion = triggered
[info] Motion detected!
[debug] [MQTT] Received message: neolink/Camera01/status/battery_level = 91
[info] Battery level: 91%
[debug] [MQTT] Received message: neolink/Camera01/status/floodlight = on
[info] Floodlight status: ON
```

### ioBroker States:
```
reolink.0.status.motion = true (then false after 5s)
reolink.0.status.battery_level = 91
reolink.0.status.floodlight = true
reolink.0.status.preview = "<base64-image>"
```

---

## 🔧 Latest Commits

- `46b54f1` - fix(mqtt): Correct TOML syntax for discovery/control topics
- `4125d5b` - fix(mqtt): Add discovery and control topics to neolink MQTT config
- `0d25ce5` - fix(deps): Use /sbin/ldconfig for GStreamer check

---

**Status:** MQTT config fixed, ready for production testing ✅  
**Blocker:** Dev-server instability - recommend production testing  
**ETA:** 5-10 minutes to verify on production system
