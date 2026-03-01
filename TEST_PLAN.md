# Battery Camera Test Plan

## Test Environment
- **Server:** martin@192.168.0.99 (Debian 12)
- **Camera:** Reolink Argus 3 Pro @ 192.168.30.24
- **Adapter:** ioBroker.reolink v1.4.0-alpha.1
- **Branch:** feature/battery-cam-support (commit 0fc9b47)

---

## Prerequisites

### 1. Install Dependencies

```bash
# On dev-server (192.168.0.99)
sudo apt update
sudo apt install gstreamer1.0-rtsp ffmpeg mosquitto mosquitto-clients

# Enable mosquitto
sudo systemctl enable mosquitto
sudo systemctl start mosquitto
```

### 2. Update Adapter Code

```bash
cd /home/martin/ioBroker.reolink
git fetch origin
git checkout feature/battery-cam-support
git pull
npm install  # New dependency: mqtt
npm run build
```

### 3. Configure Adapter (ioBroker Admin)

**Battery Camera Settings:**
- ✅ Enable: "Battery-powered camera (uses neolink)"
- Camera UID: `95270005ODHZABIH`
- IP Address: `192.168.30.24`
- Username: `admin`
- Password: `fcdkxezn`
- Auto-disable stream: `30` seconds
- Pause timeout: `2.1` seconds

**MQTT Settings:**
- mqtt.enable: `true`
- mqtt.broker: `127.0.0.1`
- mqtt.port: `1883`

**Restart adapter after config!**

---

## Test Cases

### ✅ Test 1: Dependency Checks

**Expected Behavior:**
- Adapter checks for GStreamer on startup
- Logs: `✅ GStreamer RTSP library found`
- Adapter checks for ffmpeg
- Logs: `✅ ffmpeg found (version X.X.X) - Snapshot feature available`

**Verify:**
```bash
# Check adapter log
tail -f /opt/iobroker/log/iobroker.*.log | grep -E "GStreamer|ffmpeg"
```

**Expected output:**
```
✅ GStreamer RTSP library found (installed)
✅ ffmpeg found (4.4.2) - Snapshot feature available
```

**If Missing:**
```
❌ CRITICAL: GStreamer RTSP library NOT FOUND!
📖 Installation instructions:
sudo apt install gstreamer1.0-rtsp
```

---

### ✅ Test 2: RTSP Streaming

**Test Steps:**
1. Enable streaming: `setState('reolink.0.streams.enable', true)`
2. Wait 5 seconds for neolink to start stream
3. Connect RTSP client: `ffplay rtsp://127.0.0.1:8554/reolink.0/mainStream`
4. Verify video playback
5. Wait 30 seconds → Stream should auto-disable

**Expected Logs:**
```
⚠️ BATTERY DRAIN: Streaming enabled! Auto-disabling in 30s to save battery.
⏱️ Auto-disabling stream after 30s (battery protection)
Streaming disabled - battery saving mode
```

**Datapoint Checks:**
- `streams.enable` = `false` after 30s
- `streams.mainStream` = `rtsp://127.0.0.1:8554/reolink.0/mainStream`
- `streams.subStream` = `rtsp://127.0.0.1:8554/reolink.0/subStream`

---

### ✅ Test 3: Snapshot Feature

**Test Steps:**
1. Ensure ffmpeg is installed
2. Enable streaming: `setState('reolink.0.streams.enable', true)`
3. Wait 5 seconds
4. Trigger snapshot: `setState('reolink.0.snapshot', true)`
5. Wait for capture (5-10 seconds)
6. Check `snapshotStatus` = `'success'`
7. Check `snapshotImage` contains base64 JPEG

**Expected Logs:**
```
Capturing snapshot from mainStream...
Snapshot captured successfully (XXXXX bytes)
```

**Verify Snapshot:**
```javascript
// In ioBroker Scripts or Console
const image = getState('reolink.0.snapshotImage').val;
// Should start with: data:image/jpeg;base64,/9j/4AAQ...
```

**Screenshot:** Save `snapshotImage` to file and open in browser:
```bash
# Extract base64 from ioBroker state
echo "<base64-data>" | base64 -d > snapshot.jpg
```

**Expected:** JPEG image of camera view

---

### ✅ Test 4: Floodlight Control

**Prerequisites:**
- Mosquitto MQTT broker running
- Camera has floodlight (Argus 3 Pro: YES ✅)

**Test Steps:**
1. Ensure MQTT enabled: `mqtt.enable = true`
2. Subscribe to MQTT topic:
   ```bash
   mosquitto_sub -h 127.0.0.1 -t 'neolink/#' -v
   ```
3. Turn floodlight ON: `setState('reolink.0.floodlight', true)`
4. Check MQTT message: `neolink/reolink.0/floodlight/set on`
5. Turn floodlight OFF: `setState('reolink.0.floodlight', false)`
6. Check MQTT message: `neolink/reolink.0/floodlight/set off`

**Expected Logs:**
```
[MQTT] Connected to MQTT broker: 127.0.0.1:1883
✅ MQTT client connected - Floodlight control available
Setting floodlight: ON
[MQTT] Published to neolink/reolink.0/floodlight/set: on
Setting floodlight: OFF
[MQTT] Published to neolink/reolink.0/floodlight/set: off
```

**Camera Verification:**
- Floodlight should turn ON when datapoint set to `true`
- Floodlight should turn OFF when datapoint set to `false`
- (Visible if camera is in view or via Reolink app)

---

### ✅ Test 5: MQTT Motion Detection

**Test Steps:**
1. Ensure MQTT enabled
2. Subscribe to motion topic:
   ```bash
   mosquitto_sub -h 127.0.0.1 -t 'neolink/reolink.0/motion'
   ```
3. Trigger motion in front of camera
4. Check MQTT message: `neolink/reolink.0/motion detected` (or similar)

**Expected:**
- Motion events arrive via MQTT WITHOUT stream enabled
- Battery-friendly motion detection!

---

### ✅ Test 6: Auto-Disable Timer

**Test Steps:**
1. Set custom timeout: `streamAutoDisableSeconds = 10` (in config)
2. Restart adapter
3. Enable streaming: `streams.enable = true`
4. Start timer
5. Wait 10 seconds
6. Verify `streams.enable = false` after 10s

**Expected Logs:**
```
⚠️ BATTERY DRAIN: Streaming enabled! Auto-disabling in 10s to save battery.
⏱️ Auto-disabling stream after 10s (battery protection)
```

---

### ✅ Test 7: Configurable Pause Timeout

**Test Steps:**
1. Set custom timeout: `pauseTimeout = 5.0` (in config)
2. Restart adapter
3. Check neolink TOML config:
   ```bash
   cat /opt/iobroker/iobroker-data/reolink_0/neolink-reolink.0.toml
   ```
4. Verify `timeout = 5.0` in `[cameras.pause]` section

**Expected Config:**
```toml
[cameras.pause]
  on_motion = true
  on_client = true
  timeout = 5.0
```

---

## Error Scenarios

### ❌ Missing GStreamer

**Setup:** Uninstall GStreamer
```bash
sudo apt remove gstreamer1.0-rtsp
```

**Expected:**
```
❌ CRITICAL: GStreamer RTSP library NOT FOUND!
Battery camera requires GStreamer RTSP server library to function.
📖 Installation instructions:
sudo apt install gstreamer1.0-rtsp  # Debian/Ubuntu
Adapter will not start battery camera without this dependency.
```

**Datapoint:** `info.connection = false`

### ❌ Missing ffmpeg

**Setup:** Uninstall ffmpeg
```bash
sudo apt remove ffmpeg
```

**Expected:**
```
⚠️ Optional: ffmpeg NOT FOUND
Snapshot feature will not be available without ffmpeg.
📖 To enable snapshots, install ffmpeg:
sudo apt install ffmpeg  # Debian/Ubuntu
```

**Behavior:** Adapter starts normally, snapshot fails with error

### ❌ MQTT Not Connected

**Setup:** Stop mosquitto
```bash
sudo systemctl stop mosquitto
```

**Expected when triggering floodlight:**
```
Floodlight control failed: MQTT not connected
Enable MQTT in adapter settings (mqtt.enable = true)
```

**Datapoint:** `floodlight` reverts to previous state

---

## Documentation Screenshots Needed

### Screenshot 1: Adapter Config UI
- Battery camera checkbox enabled
- Camera UID field filled
- Auto-disable timer set to 30
- Pause timeout set to 2.1
- MQTT enabled with broker address

### Screenshot 2: Datapoints Tree
- `info.uid` = Camera UID
- `info.neolink_status` = "running"
- `streams.enable` = false
- `streams.mainStream` = RTSP URL
- `streams.subStream` = RTSP URL
- `mqtt.enable` = true
- `snapshot` = button
- `snapshotImage` = (base64)
- `snapshotStatus` = "idle"
- `floodlight` = false

### Screenshot 3: Adapter Log
- ✅ GStreamer found
- ✅ ffmpeg found
- ✅ MQTT connected
- ⚠️ Battery drain warning when stream enabled
- ⏱️ Auto-disable after timeout

### Screenshot 4: Snapshot Image
- Actual captured JPEG from camera
- Shows snapshot quality

### Screenshot 5: MQTT Monitor
- mosquitto_sub output showing:
  - `neolink/reolink.0/motion` events
  - `neolink/reolink.0/floodlight/set` commands
  - `neolink/reolink.0/battery` level (if supported)

---

## Performance Metrics

**To collect:**
- Neolink startup time: ~ seconds
- Snapshot capture time: ~ seconds
- RTSP stream latency: ~ ms
- Battery drain rate:
  - Stream enabled: ~% per hour
  - Stream disabled: ~% per hour
  - MQTT only: ~% per hour

---

## Success Criteria

✅ All dependency checks pass  
✅ RTSP streaming works  
✅ Auto-disable timer works (30s default)  
✅ Snapshot captures valid JPEG  
✅ Floodlight control works via MQTT  
✅ MQTT motion detection works  
✅ Configurable timeouts work  
✅ Clear error messages for missing deps  
✅ No crashes or errors in normal operation  

---

## Test Results

**Date:** ___________  
**Tester:** ___________  
**Environment:** Dev-Server (192.168.0.99)  
**Adapter Version:** v1.4.0-alpha.1 (commit 0fc9b47)  

| Test Case | Status | Notes |
|-----------|--------|-------|
| Dependency Checks | ⏳ |  |
| RTSP Streaming | ⏳ |  |
| Snapshot Feature | ⏳ |  |
| Floodlight Control | ⏳ |  |
| MQTT Motion | ⏳ |  |
| Auto-Disable Timer | ⏳ |  |
| Pause Timeout | ⏳ |  |
| Missing GStreamer | ⏳ |  |
| Missing ffmpeg | ⏳ |  |
| MQTT Disconnected | ⏳ |  |

**Overall Result:** ⏳ PENDING

---

## Next Steps After Testing

1. ✅ Fix any bugs found
2. ✅ Collect screenshots
3. ✅ Update README with screenshots
4. ✅ Create user documentation
5. ✅ Merge PR
6. 🚀 Release v1.4.0!
