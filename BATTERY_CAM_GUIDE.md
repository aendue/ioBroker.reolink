# Battery Camera User Guide

## 🔋 Reolink Battery-Powered Cameras with ioBroker

Complete guide for using Reolink Argus 3 Pro, B400, D400, E1 Outdoor and similar battery cameras with ioBroker.reolink adapter.

---

## Why Battery Cameras Are Different

**Normal Reolink cameras:**
- Always powered (PoE or wall adapter)
- HTTP API for control
- No battery concerns

**Battery cameras:**
- Run on rechargeable batteries
- Proprietary "Baichuan" protocol (no HTTP API)
- **Streaming drains battery FAST!**
- Motion detection via MQTT saves battery

This adapter uses **neolink** to bridge the Baichuan protocol to standard RTSP streams.

---

## Quick Start (5 Minutes)

### 1. Install System Dependencies

**Debian/Ubuntu/Proxmox:**
```bash
sudo apt update
sudo apt install gstreamer1.0-rtsp ffmpeg
```

**Raspberry Pi (same as above):**
```bash
sudo apt install gstreamer1.0-rtsp ffmpeg
```

### 2. Configure Adapter

1. Open ioBroker Admin → Adapters → Reolink
2. Click **"+"** to add new instance
3. In configuration:
   - ✅ Check: **"Battery-powered camera (uses neolink)"**
   - Enter Camera UID (find in Reolink app → Settings → Device Info)
   - Enter camera IP address (e.g., 192.168.1.100)
   - Enter username/password (usually `admin` / your password)
4. Click **Save**
5. Adapter will restart automatically

### 3. Verify It Works

1. Check adapter log (should see):
   ```
   ✅ GStreamer RTSP library found
   ✅ ffmpeg found (version X.X.X)
   Battery camera ready!
   ```

2. Check datapoints (Objects tab):
   - `reolink.0.info.neolink_status` = "running"
   - `reolink.0.streams.mainStream` = RTSP URL

✅ **Done!** Camera is ready.

---

## Basic Usage

### View Live Stream

**Important:** Streaming drains battery! Only enable when needed.

**Method 1: ioBroker Script**
```javascript
// Enable streaming (auto-disables after 30s)
setState('reolink.0.streams.enable', true);

// Stream URL: rtsp://127.0.0.1:8554/reolink.0/mainStream
```

**Method 2: VLC Media Player**
1. Enable streaming via datapoint
2. Open VLC → Media → Open Network Stream
3. Enter URL: `rtsp://127.0.0.1:8554/reolink.0/mainStream`
4. Click Play

**Method 3: ioBroker VIS**
```html
<!-- Add RTSP widget -->
<iframe src="rtsp://127.0.0.1:8554/reolink.0/mainStream"></iframe>
```

**Auto-Disable:**
- Stream automatically disables after 30 seconds (default)
- Change timeout in adapter config: "Auto-disable stream after (seconds)"
- Manual disable: `setState('reolink.0.streams.enable', false)`

---

### Capture Snapshot

**Requires:** ffmpeg installed

**Script:**
```javascript
// Trigger snapshot
setState('reolink.0.snapshot', true);

// Wait for capture
setTimeout(() => {
    const image = getState('reolink.0.snapshotImage').val;
    // image is base64-encoded JPEG
    console.log('Snapshot ready:', image.substring(0, 50));
}, 5000);
```

**Status:**
- `reolink.0.snapshotStatus`:
  - `idle` = Ready to capture
  - `capturing` = Capture in progress
  - `success` = Capture complete
  - `error` = Capture failed

**Display in VIS:**
```html
<img src="{reolink.0.snapshotImage}" />
```

---

### Motion Detection (Battery-Friendly!)

**Important:** Get motion alerts WITHOUT streaming = Huge battery savings!

**Setup:**
1. Enable MQTT in adapter config:
   - `mqtt.enable` = true
   - `mqtt.broker` = 127.0.0.1 (or your MQTT server)
   - `mqtt.port` = 1883
2. Restart adapter
3. Subscribe to motion topic:
   ```bash
   mosquitto_sub -h 127.0.0.1 -t 'neolink/reolink.0/motion'
   ```

**ioBroker Script (React to Motion):**
```javascript
// Subscribe to MQTT adapter
on({ id: 'mqtt.0.neolink.reolink.0.motion', change: 'any' }, () => {
    console.log('Motion detected on camera!');
    
    // Send notification
    sendTo('telegram', 'Motion detected on front door camera');
    
    // Optional: Capture snapshot
    setState('reolink.0.snapshot', true);
});
```

**Topics:**
- `neolink/reolink.0/motion` = Motion detected
- `neolink/reolink.0/battery` = Battery level (%)

---

### Control Floodlight

**Requires:** MQTT enabled, camera with floodlight (Argus 3 Pro, E1 Outdoor)

**Script:**
```javascript
// Turn ON
setState('reolink.0.floodlight', true);

// Turn OFF
setState('reolink.0.floodlight', false);
```

**Automation Example (Motion-Activated Light):**
```javascript
on({ id: 'mqtt.0.neolink.reolink.0.motion', change: 'any' }, () => {
    // Motion detected → Turn on floodlight for 30 seconds
    setState('reolink.0.floodlight', true);
    
    setTimeout(() => {
        setState('reolink.0.floodlight', false);
    }, 30000);
});
```

---

## Advanced Configuration

### Battery Saving Settings

**Auto-Disable Timer:**
- **What:** Automatically disable streaming after X seconds
- **Default:** 30 seconds
- **Range:** 10-3600 seconds
- **Config:** Adapter Settings → "Auto-disable stream after (seconds)"
- **Why:** Prevents accidental battery drain if you forget to disable

**Pause Timeout:**
- **What:** How long before stream pauses when no client connected
- **Default:** 2.1 seconds
- **Range:** 1.0-10.0 seconds
- **Config:** Adapter Settings → "Stream pause timeout (seconds)"
- **Why:** Shorter = faster battery savings, Longer = smoother reconnects

**Recommendation:**
- Auto-disable: 30s for quick checks, 300s (5 min) for monitoring
- Pause timeout: 2.1s (default works well)

---

### MQTT Broker Setup

**Option 1: Local Mosquitto (Recommended)**
```bash
# Install
sudo apt install mosquitto mosquitto-clients

# Enable & Start
sudo systemctl enable mosquitto
sudo systemctl start mosquitto

# Test
mosquitto_sub -h 127.0.0.1 -t '#'
```

**Option 2: ioBroker MQTT Adapter**
1. Install MQTT Broker adapter from ioBroker
2. Configure on port 1883
3. Use in reolink adapter config

**Adapter Config:**
- `mqtt.enable` = true
- `mqtt.broker` = 127.0.0.1 (or IP of MQTT server)
- `mqtt.port` = 1883

---

## Datapoints Reference

### Info
- `info.uid` (string) - Camera UID
- `info.neolink_status` (string) - Process status (running/stopped/error)
- `info.connection` (boolean) - Camera connected

### Streams
- `streams.enable` (boolean) - Enable/disable RTSP streaming
- `streams.mainStream` (string) - RTSP URL for main stream
- `streams.subStream` (string) - RTSP URL for sub stream

### MQTT
- `mqtt.enable` (boolean) - Enable MQTT features
- `mqtt.broker` (string) - MQTT broker address
- `mqtt.port` (number) - MQTT broker port

### Snapshot
- `snapshot` (boolean button) - Trigger snapshot capture
- `snapshotImage` (string) - Base64-encoded JPEG image
- `snapshotStatus` (string) - Capture status (idle/capturing/success/error)

### Floodlight
- `floodlight` (boolean) - Floodlight on/off control

---

## Troubleshooting

### Problem: "GStreamer RTSP library NOT FOUND"

**Cause:** Missing system dependency (Linux only)

**Solution:**
```bash
# Debian/Ubuntu/Proxmox/Raspberry Pi
sudo apt install gstreamer1.0-rtsp

# Fedora/RHEL
sudo dnf install gstreamer1-rtsp-server

# Arch Linux
sudo pacman -S gst-rtsp-server
```

**Verify:**
```bash
ldconfig -p | grep libgstrtspserver
```

---

### Problem: Snapshot fails with "ffmpeg not available"

**Cause:** ffmpeg not installed

**Solution:**
```bash
# Debian/Ubuntu/Raspberry Pi
sudo apt install ffmpeg

# Fedora/RHEL
sudo dnf install ffmpeg

# macOS
brew install ffmpeg

# Windows
# Download from https://ffmpeg.org/download.html
```

---

### Problem: Battery drains too fast

**Causes & Solutions:**

1. **Streaming left enabled**
   - Check: `streams.enable` should be `false`
   - Fix: Disable after viewing

2. **Auto-disable not working**
   - Check adapter log for timer messages
   - Verify config: "Auto-disable stream after" is set

3. **Too many RTSP clients**
   - Each VLC/VIS connection wakes camera
   - Use snapshot feature instead of continuous streaming

4. **Motion detection too sensitive**
   - Adjust in Reolink app (not adapter setting)

**Best practices:**
- ✅ Use MQTT for motion detection (no streaming!)
- ✅ Use snapshot instead of live view when possible
- ✅ Keep auto-disable at 30s or less
- ✅ Disable stream when not actively viewing

---

### Problem: Floodlight doesn't work

**Checklist:**
1. ✅ Camera has floodlight? (Argus 3 Pro: YES, B400: NO)
2. ✅ MQTT enabled in adapter config?
3. ✅ MQTT broker running? Test: `mosquitto_sub -h 127.0.0.1 -t '#'`
4. ✅ Adapter restarted after MQTT config change?
5. ✅ Check adapter log for MQTT connection messages

**Debug:**
```bash
# Subscribe to all neolink topics
mosquitto_sub -h 127.0.0.1 -t 'neolink/#' -v

# Should see when triggering floodlight:
neolink/reolink.0/floodlight/set on
```

---

### Problem: Cannot find Camera UID

**Solution 1: Reolink App**
1. Open Reolink app
2. Select camera
3. Settings → Device Info → UID
4. Copy the 16-character code (e.g., `95270005ODHZABIH`)

**Solution 2: Camera Web Interface**
1. Access camera via browser: `http://<camera-ip>`
2. Login
3. Settings → Device Info
4. Find UID

**Solution 3: Command Line (if camera reachable)**
```bash
# Scan for Reolink cameras on network
nmap -p 9000 192.168.1.0/24
```

---

## Performance & Battery Life

### Battery Life Expectations

**Streaming disabled (MQTT motion only):**
- ~2-3 months per charge (typical)
- ~4-6 months with solar panel

**Streaming enabled:**
- ~2-4 hours continuous streaming
- ~50-100 views per charge (30s each)

**Factors:**
- Temperature (cold = faster drain)
- WiFi signal strength
- Motion frequency
- Camera firmware

### Optimize Battery Life

1. **Use MQTT motion detection**
   - No streaming = huge savings
   - React to motion without waking camera

2. **Short viewing sessions**
   - Default 30s auto-disable is good
   - Manually disable after viewing

3. **WiFi signal**
   - Weak signal = more battery drain
   - Consider WiFi extender if far from router

4. **Solar panel**
   - Reolink solar panel keeps battery topped up
   - Essential for high-traffic areas

---

## Integration Examples

### Blockly Script (VIS Dashboard)

```javascript
// Motion-activated snapshot
on({ id: 'mqtt.0.neolink.reolink.0.motion', change: 'any' }, () => {
    setState('reolink.0.snapshot', true);
});
```

### Node-RED Flow

```json
[
  {
    "id": "motion_input",
    "type": "mqtt in",
    "topic": "neolink/reolink.0/motion",
    "broker": "mqtt_broker",
    "name": "Motion Detector"
  },
  {
    "id": "snapshot_trigger",
    "type": "change",
    "rules": [
      { "t": "set", "p": "payload", "to": "true" }
    ],
    "name": "Trigger Snapshot"
  },
  {
    "id": "iobroker_out",
    "type": "iobroker out",
    "topic": "reolink.0.snapshot",
    "name": "Capture"
  }
]
```

### Telegram Notification (Motion Alert)

```javascript
on({ id: 'mqtt.0.neolink.reolink.0.motion', change: 'any' }, () => {
    // Capture snapshot
    setState('reolink.0.snapshot', true);
    
    // Wait for capture
    setTimeout(() => {
        const status = getState('reolink.0.snapshotStatus').val;
        if (status === 'success') {
            const image = getState('reolink.0.snapshotImage').val;
            
            // Send to Telegram
            sendTo('telegram', {
                text: '🚨 Motion detected on front door camera!',
                photo: image
            });
        }
    }, 5000);
});
```

---

## FAQ

**Q: Can I use multiple battery cameras?**  
A: Yes! Create one adapter instance per camera.

**Q: Does this work with Reolink NVR?**  
A: No, battery cameras don't connect to NVR (WiFi only).

**Q: Can I view the stream remotely (outside home network)?**  
A: Not directly (RTSP is localhost only). Use ioBroker VIS with remote access or VPN.

**Q: Does neolink support PTZ?**  
A: No, battery cameras don't have PTZ (no motors = battery life).

**Q: Can I record video?**  
A: Not yet (future feature). Use Reolink app for recording or SD card.

**Q: What about 2-way audio?**  
A: Not supported by neolink yet.

**Q: Is ARM (Raspberry Pi) supported?**  
A: YES! ✅ ARM64 and ARM32 binaries included.

---

## Support & Resources

**Documentation:**
- ioBroker Forum: https://forum.iobroker.net
- GitHub Issues: https://github.com/bloop16/ioBroker.reolink
- Neolink Project: https://github.com/QuantumEntangledAndy/neolink

**Community:**
- Discord: ioBroker Community
- Reddit: r/ioBroker

**Bug Reports:**
- GitHub: https://github.com/bloop16/ioBroker.reolink/issues
- Include: Adapter version, camera model, error log

---

## Credits

- **Adapter:** bloop-herbert-bot (herbert) 🤖
- **Neolink:** QuantumEntangledAndy
- **Testing:** Martin (@bloop6489)

---

**Last Updated:** 2026-03-01  
**Version:** v1.4.0-alpha.1
