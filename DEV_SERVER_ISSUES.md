# Dev-Server Issues (192.168.0.99)

## Problems Encountered

### 1. Database Instability
```
[warn] reolink.0 get state error: DB closed
[warn] reolink.0 Cannot connect/reconnect to objects DB. Stopping adapter.
[info] reolink.0 terminating
```

**Root Cause:** dev-server (`.dev-server/default/`) setup is unstable
- Multiple adapter crashes
- DB connection failures
- Adapter won't restart automatically

### 2. No Adapter Configuration
- `ioBroker.json` has `null` config for reolink.0
- Manual config via Admin UI needed
- But adapter keeps crashing before config can be applied

### 3. Neolink Not Running
```bash
ps aux | grep neolink
# No processes found
```

**Why:** Adapter crashes before starting neolink processes

---

## Recommendation: Test on Production System

**192.168.0.18** (Visual System) is better for testing because:
- ✅ Stable ioBroker installation
- ✅ Real configuration
- ✅ No dev-server instability
- ✅ Actual camera integration

---

## Testing on 192.168.0.18 (Production)

### 1. Update Adapter

```bash
# SSH to 192.168.0.18
ssh <user>@192.168.0.18

# Navigate to adapter directory (if using custom install)
cd /path/to/ioBroker.reolink

# OR: Use npm if installed from registry
npm install iobroker.reolink@latest

# OR: Install from GitHub
cd /opt/iobroker  # or wherever ioBroker is installed
npm install bloop16/ioBroker.reolink#main
```

### 2. Configure via Admin UI

1. Open Admin: `http://192.168.0.18:<admin-port>`
2. Go to **Instances** → **reolink.0**
3. Click **Configure** (🔧 icon)
4. Set **Battery Camera Config** (see `TEST_MANUAL_INSTRUCTIONS.md`)
5. **Save & Close**

### 3. Enable MQTT

```bash
# Via CLI:
iobroker setState reolink.0.mqtt.enable true

# OR via Admin UI:
# Objects → reolink.0 → mqtt.enable → Set to true
```

### 4. Check Logs

```bash
iobroker logs --adapter reolink --lines 50
```

**Expected:**
```
[info] reolink.0 Starting RTSP process for battery camera: Camera01
[info] reolink.0 MQTT topics will use camera name: Camera01
[info] reolink.0 [Camera01] RTSP process started
[warn] reolink.0 ⚠️ BATTERY DRAIN: MQTT enabled!
[info] reolink.0 ✅ MQTT process started - Camera publishing to broker
[info] reolink.0 ✅ MQTT client connected
[info] reolink.0 [MQTT] Subscribed to: neolink/Camera01/status/motion
[info] reolink.0 [MQTT] Subscribed to: neolink/Camera01/status/battery_level
[info] reolink.0 [MQTT] Subscribed to: neolink/Camera01/status/floodlight
[info] reolink.0 [MQTT] Subscribed to: neolink/Camera01/status/preview
```

### 5. Verify Neolink Processes

```bash
ps aux | grep neolink
```

**Expected:**
```
<user>  <pid>  neolink rtsp --config=neolink-rtsp-Camera01.toml
<user>  <pid>  neolink mqtt --config=neolink-mqtt-Camera01.toml
```

### 6. Monitor MQTT

```bash
mosquitto_sub -h 192.168.0.110 -t "neolink/Camera01/status/#" -v
```

**Expected:**
```
neolink/Camera01/status/motion clear
neolink/Camera01/status/battery_level 91
neolink/Camera01/status/floodlight off
```

### 7. Check ioBroker States

```bash
iobroker state get reolink.0.status.motion
iobroker state get reolink.0.status.battery_level
iobroker state get reolink.0.status.floodlight
```

**Expected:**
- `status.motion = false` (boolean)
- `status.battery_level = 91` (number)
- `status.floodlight = false` (boolean)

### 8. Test Floodlight

```bash
iobroker setState reolink.0.floodlight true
# Wait 2 seconds
iobroker state get reolink.0.status.floodlight
# Expected: true
```

### 9. Test Motion

**Walk in front of camera, then:**
```bash
iobroker state get reolink.0.status.motion
# Expected: true (immediately after motion)
# Wait 5 seconds...
iobroker state get reolink.0.status.motion
# Expected: false
```

---

## If Neolink Still Not Publishing

### Check Neolink Config

```bash
# Find config files
find /opt/iobroker -name "neolink-*.toml" 2>/dev/null

# View MQTT config
cat /path/to/neolink-mqtt-Camera01.toml
```

**Expected MQTT config:**
```toml
bind = "127.0.0.1"
bind_port = 8554

[[cameras]]
name = "Camera01"
username = "<username>"
password = "<password>"
uid = "95270005ODHZABIH"
address = "192.168.30.24:9000"
pause_on_client = true
pause_timeout = 2.1
idle_disconnect = true

[[cameras.mqtt]]
broker_addr = "192.168.0.110"
port = 1883
credentials = ["<mqtt-user>", "<mqtt-pass>"]

[[cameras.mqtt.discovery]]
topic = "neolink/Camera01/status/motion"
[[cameras.mqtt.discovery]]
topic = "neolink/Camera01/status/battery_level"
[[cameras.mqtt.discovery]]
topic = "neolink/Camera01/status/floodlight"
```

### Manual Neolink Test

```bash
# Test MQTT mode manually
cd /opt/iobroker/node_modules/iobroker.reolink/lib
./neolink-linux-x64 mqtt --config=/path/to/neolink-mqtt-Camera01.toml
```

**Expected output:**
```
[INFO] Connecting to camera...
[INFO] Camera connected
[INFO] Publishing to MQTT broker: 192.168.0.110:1883
[INFO] MQTT connected
```

**If this works manually but not via adapter:**
→ Check adapter logs for errors during neolink spawn

---

## Common Issues & Fixes

### Issue 1: "Connection refused" to MQTT broker
**Fix:** Check MQTT broker is running:
```bash
systemctl status mosquitto
# OR
ps aux | grep mosquitto
```

### Issue 2: Neolink binary not executable
**Fix:**
```bash
chmod +x /opt/iobroker/node_modules/iobroker.reolink/lib/neolink-*
```

### Issue 3: Camera UID wrong
**Fix:** Get correct UID from Reolink app or camera settings

### Issue 4: MQTT credentials wrong
**Fix:** Test MQTT connection:
```bash
mosquitto_pub -h 192.168.0.110 -u <user> -P <pass> -t "test" -m "hello"
```

---

## Next Steps

1. ✅ Test on **192.168.0.18** (Production system)
2. Report results with:
   - Adapter logs
   - Neolink process status (`ps aux | grep neolink`)
   - MQTT messages (`mosquitto_sub`)
   - State values
3. If working → Deploy to production ✅
4. If not working → Debug with logs + manual neolink test
