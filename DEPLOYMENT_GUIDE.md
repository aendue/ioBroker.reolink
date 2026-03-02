# DEPLOYMENT_GUIDE.md - ioBroker.reolink v1.4.0-alpha.1

## 🎉 Ready for Testing!

**Status:** All critical bugs fixed, tests passing, ready for production testing

**Branch:** `feature/battery-cam-support`  
**Commit:** `b6071a7`

---

## ✅ What's Fixed

### Critical Bugs (Priority 1)
1. ✅ **Stream auto-start** - RTSP only starts when user enables `streams.enable = true`
2. ✅ **Warning spam** - Changed warn→info for normal operations (clean logs!)
3. ✅ **Battery query working** - 33% reported successfully via CLI approach
4. ✅ **Object structure cleanup** - Only relevant states created per camera type
5. ✅ **Tests fixed** - All 65 tests passing (8 unit + 57 package validation)

### Features Completed
- ✅ Battery level reporting via MQTT + CLI (every 30s)
- ✅ Motion detection via MQTT (event-based)
- ✅ Stream control (user-triggered, auto-disable after 30s)
- ✅ MQTT control (user-triggered, auto-disable after 30s)
- ✅ Conditional state creation (battery cam vs HTTP API cam)
- ✅ Migration cleanup (delete incompatible states)

---

## 📊 Test Results

```bash
npm test
✅ 8 unit tests passing (MQTT message handler)
✅ 57 package validation tests passing

npm run build
✅ TypeScript compilation successful

npm run lint
✅ ESLint clean
```

---

## 🚀 Installation (Production Test)

**⚠️ IMPORTANT:** This will recreate your reolink.0 instance!

### Step 1: Backup Current Config

```bash
# Save current instance config
iobroker get system.adapter.reolink.0 > /tmp/reolink-backup.json
```

### Step 2: Install New Version

```bash
# Stop adapter
iobroker stop reolink.0

# Install from GitHub
cd /opt/iobroker
npm install https://github.com/bloop16/ioBroker.reolink/tarball/feature/battery-cam-support

# Upload new version (⚠️ this deletes the instance!)
iobroker upload reolink

# Recreate instance
iobroker add reolink 0
```

### Step 3: Configure Battery Camera

**Via Admin UI (recommended):**
1. Open Admin → Instances → reolink.0
2. Configure:
   - ✅ Enable "Battery Camera Mode"
   - Camera IP: `192.168.30.24`
   - Camera User: `admin`
   - Camera Password: `fcdkxezn`
   - Camera UID: `95270005ODHZABIH`
   - Camera Name: `Camera01`
   - MQTT Broker: `192.168.0.110`
   - MQTT Port: `1883`
   - MQTT User: `iobroker`
   - MQTT Password: `iobroker`
3. Save & Restart

**Or via CLI:**

```bash
iobroker set reolink.0 \
  --cameraIp '192.168.30.24' \
  --cameraUser 'admin' \
  --cameraPassword 'fcdkxezn' \
  --cameraBatteryName 'Camera01' \
  --mqttBroker '192.168.0.110' \
  --mqttPort 1883 \
  --mqttUsername 'iobroker' \
  --mqttPassword 'iobroker'

# isBatteryCam + cameraUid must be set via Admin UI
```

### Step 4: Start & Verify

```bash
# Start adapter
iobroker start reolink.0

# Wait 10 seconds
sleep 10

# Check logs
iobroker logs --adapter reolink --lines 30

# Expected: "Battery camera ready!" ✅
# NO "BATTERY DRAIN" warnings ✅
# NO auto-start of stream ✅
```

### Step 5: Test States

```bash
# Check battery cam states exist
iobroker state get reolink.0.streams.enable        # should exist ✅
iobroker state get reolink.0.mqtt.enable           # should exist ✅
iobroker state get reolink.0.info.connection       # should exist ✅

# Check HTTP API states DON'T exist
iobroker state get reolink.0.ptzPreset             # should NOT exist ❌
iobroker state get reolink.0.motionDetection       # should NOT exist ❌
```

---

## 🧪 Testing Workflow

### Test 1: Stream Control

```bash
# 1. Enable stream
iobroker state set reolink.0.streams.enable true

# Expected logs:
# ✅ "Starting RTSP stream for battery camera..."
# ✅ "RTSP stream started"
# ✅ "Streaming enabled - auto-disable in 30s"

# 2. Wait 35 seconds
sleep 35

# Expected logs:
# ✅ "Auto-disabling stream after 30s"
# ✅ "RTSP stream stopped"

# 3. Verify stream stopped
iobroker state get reolink.0.streams.enable
# Expected: false ✅
```

### Test 2: MQTT + Battery Query

```bash
# 1. Enable MQTT
iobroker state set reolink.0.mqtt.enable true

# Expected logs:
# ✅ "Starting MQTT process: Camera01"
# ✅ "MQTT enabled - auto-disable in 30s"
# ✅ "[Battery Query] Battery level: XX%"

# 2. Wait 10 seconds, check battery state
sleep 10
iobroker state get reolink.0.status.battery_level

# Expected: Number (0-100) ✅

# 3. Check motion state (if motion occurs)
iobroker state get reolink.0.status.motion

# Expected: true (if motion) or false ✅

# 4. Wait 35 seconds for auto-disable
sleep 35

# Expected logs:
# ✅ "Auto-disabling MQTT after 30s"
# ✅ "MQTT process stopped"

# 5. Battery query should STILL work (config file kept)
sleep 30
iobroker logs --adapter reolink --lines 10 | grep "Battery Query"

# Expected: New battery query! ✅
```

### Test 3: Clean Logs

```bash
# Check last 50 log entries
iobroker logs --adapter reolink --lines 50

# Should NOT see:
# ❌ "⚠️ BATTERY DRAIN"
# ❌ "⚠️ Streaming is DISABLED by default"
# ❌ "⏱️ Auto-disabling..."

# Should see:
# ✅ "Battery camera ready!"
# ✅ "Streaming enabled - auto-disable in 30s" (when enabled)
# ✅ "MQTT enabled - auto-disable in 30s" (when enabled)
# ✅ "[Battery Query] Battery level: XX%"
```

---

## 📝 Known Limitations

### Not Yet Implemented
- ❓ Floodlight status updates (untested)
- ❓ Preview image updates (untested)
- ❓ Motion → Stream auto-start (future feature)

### By Design
- ✅ Stream auto-disables after 30s (battery protection)
- ✅ MQTT auto-disables after 30s (battery protection)
- ✅ Battery query runs every 30s (even when MQTT disabled)
- ✅ Config file persists after MQTT stop (for battery queries)

---

## 🔧 Troubleshooting

### Stream doesn't start
```bash
# Check state
iobroker state get reolink.0.streams.enable

# Try manual enable
iobroker state set reolink.0.streams.enable true

# Check logs
iobroker logs --adapter reolink --lines 20
```

### Battery level not updating
```bash
# Check MQTT was enabled at least once
iobroker state get reolink.0.mqtt.enable

# Enable MQTT (creates config)
iobroker state set reolink.0.mqtt.enable true
sleep 15

# Check logs for battery query
iobroker logs --adapter reolink --lines 30 | grep "Battery"
```

### Old HTTP API states still exist
```bash
# Restart adapter to trigger cleanup
iobroker restart reolink.0
sleep 10

# Check again
iobroker state get reolink.0.ptzPreset
# Should fail: "state not found" ✅
```

---

## 📊 Expected Object Tree

After successful setup, you should see:

```
reolink.0
├── info
│   ├── connection (boolean) ✅
│   ├── uid (string) ✅
│   └── neolink_status (string) ✅
├── streams
│   ├── mainStream (string - RTSP URL) ✅
│   ├── subStream (string - RTSP URL) ✅
│   └── enable (boolean - USER CONTROLS!) ✅
├── mqtt
│   └── enable (boolean - USER CONTROLS!) ✅
├── status (channel)
│   ├── motion (boolean - from MQTT) ✅
│   ├── battery_level (number - from CLI) ✅
│   ├── floodlight (boolean - from MQTT) ⚠️ untested
│   └── preview (string - base64 from MQTT) ⚠️ untested
├── snapshot (boolean - trigger) ✅
├── snapshotImage (string - base64) ✅
├── snapshotStatus (string) ✅
└── floodlight (boolean - control) ✅
```

**Total: ~16 states** (clean!)

---

## 🎯 Success Criteria

- ✅ Adapter starts without errors
- ✅ No "Camera Ip not set" error
- ✅ No auto-start of RTSP stream
- ✅ Clean logs (no warning spam)
- ✅ Battery level reported (number 0-100)
- ✅ Motion detection works (true/false)
- ✅ Stream control works (enable/disable)
- ✅ MQTT control works (enable/disable)
- ✅ Auto-disable timers work (30s)
- ✅ Only battery cam states created

---

## 🚀 Next Steps

After successful testing:

1. ✅ Version bump to `1.4.0-alpha.2`
2. ✅ Update CHANGELOG.md
3. ✅ Test floodlight status (if available)
4. ✅ Test preview image (if available)
5. ✅ Consider production release (1.4.0)

---

## 📞 Support

**Issues?** Post in Discord #github channel or create GitHub issue.

**Working?** 🎉 Congrats! You now have a fully functional battery camera adapter!
