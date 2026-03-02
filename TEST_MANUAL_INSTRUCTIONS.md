# Manual Test Instructions for dev-server (192.168.0.99)

## Current Status
✅ Code updated to latest (commit 20a737c)
✅ Dependencies installed (`npm install`)
✅ Adapter built successfully
✅ Adapter running (PID 43893)
❌ No configuration set (needs manual config in Admin UI)

---

## Step-by-Step Test Instructions

### 1. Configure Adapter (Admin UI)
1. Open: http://192.168.0.99:8081 (or correct admin port)
2. Go to: Instances → reolink.0
3. Click: Configure (🔧 icon)
4. Set **Battery Camera Configuration:**
   - ✅ **Enable Battery Camera Mode:** `true`
   - **Camera IP:** `192.168.30.24`
   - **Camera UID:** `95270005ODHZABIH`
   - **Camera Name (MQTT):** `Camera01` (or custom like "Argus3_Garden")
   - **Username:** `<your-reolink-username>`
   - **Password:** `<your-reolink-password>`
   - **Pause Timeout:** `2.1`
   
   **MQTT Settings:**
   - **MQTT Broker:** `192.168.0.110`
   - **MQTT Port:** `1883`
   - **MQTT Username:** `<mqtt-username>`
   - **MQTT Password:** `<mqtt-password>`
   
   **Auto-Disable Timeouts:**
   - **Stream Auto-Disable:** `30` (seconds)
   - **MQTT Auto-Disable:** `30` (seconds)

5. Click: **Save & Close**
6. Wait for adapter restart

---

### 2. Check Object Structure

Run on dev-server:
```bash
cd /home/martin/ioBroker.reolink
dev-server object get reolink.0.status
dev-server object get reolink.0.status.motion
dev-server object get reolink.0.status.battery_level
dev-server object get reolink.0.status.floodlight
dev-server object get reolink.0.status.preview
```

**Expected:**
- `reolink.0.status` - channel exists
- All 4 states exist (motion, battery_level, floodlight, preview)
- All states have `write: false` (read-only)

---

### 3. Check Logs

```bash
tail -f /home/martin/ioBroker.reolink/.dev-server/default/log/iobroker.2026-03-02.log | grep reolink
```

**Expected logs after config:**
```
[info] reolink.0 Reolink adapter has started
[info] reolink.0 Battery camera detected - using neolink
[info] reolink.0 Starting RTSP process for battery camera: Camera01
[info] reolink.0 MQTT topics will use camera name: Camera01
[info] reolink.0 [Camera01] RTSP process started
[info] reolink.0 Battery camera states created
```

---

### 4. Enable MQTT

```bash
dev-server state set reolink.0.mqtt.enable true
```

**Expected logs:**
```
[warn] reolink.0 ⚠️ BATTERY DRAIN: MQTT enabled! Auto-disabling in 30s
[info] reolink.0 MQTT Broker: 192.168.0.110:1883
[info] reolink.0 MQTT topics: neolink/Camera01/status/{motion,battery_level,floodlight,preview}
[info] reolink.0 ✅ MQTT process started - Camera publishing to broker
[info] reolink.0 ✅ MQTT client connected - Ready for floodlight control
[info] reolink.0 [MQTT] Subscribed to: neolink/Camera01/status/motion
[info] reolink.0 [MQTT] Subscribed to: neolink/Camera01/status/battery_level
[info] reolink.0 [MQTT] Subscribed to: neolink/Camera01/status/floodlight
[info] reolink.0 [MQTT] Subscribed to: neolink/Camera01/status/preview
[info] reolink.0 ✅ Subscribed to status topics for Camera01
```

---

### 5. Monitor MQTT Topics

```bash
mosquitto_sub -h 192.168.0.110 -t "neolink/Camera01/status/#" -v
```

**Expected output:**
```
neolink/Camera01/status/motion clear
neolink/Camera01/status/battery_level 91
neolink/Camera01/status/floodlight off
neolink/Camera01/status/preview <base64-image>
```

---

### 6. Check State Updates

```bash
dev-server state get reolink.0.status.motion
dev-server state get reolink.0.status.battery_level
dev-server state get reolink.0.status.floodlight
```

**Expected:**
- `status.motion` = `false` (boolean)
- `status.battery_level` = `91` (or current %)
- `status.floodlight` = `false` (boolean)

---

### 7. Test Motion Detection

**Action:** Walk in front of camera

**Expected:**
1. MQTT receives: `neolink/Camera01/status/motion triggered`
2. Log shows: `[info] reolink.0 Motion detected!`
3. State changes: `status.motion = true`
4. After 5 seconds: `status.motion = false`

**Check:**
```bash
dev-server state get reolink.0.status.motion
# Should be: true (immediately after motion)
# Wait 5 seconds...
dev-server state get reolink.0.status.motion
# Should be: false
```

---

### 8. Test Floodlight Control

**Turn ON:**
```bash
dev-server state set reolink.0.floodlight true
```

**Expected:**
1. Log: `[info] reolink.0 Setting floodlight: ON`
2. MQTT publishes: `neolink/Camera01/floodlight/set on`
3. Camera turns on floodlight
4. Camera publishes: `neolink/Camera01/status/floodlight on`
5. Adapter receives: `[debug] reolink.0 Floodlight status: ON`
6. Feedback state updates: `status.floodlight = true`

**Check feedback:**
```bash
dev-server state get reolink.0.status.floodlight
# Expected: true
```

**Turn OFF:**
```bash
dev-server state set reolink.0.floodlight false
```

**Check feedback:**
```bash
dev-server state get reolink.0.status.floodlight
# Expected: false
```

---

### 9. Test Read-Only Protection

**Try to write to read-only state:**
```bash
dev-server state set reolink.0.status.motion true
```

**Expected:**
- Error or warning (state is read-only)
- OR: State is writable but should NOT be (config bug - fix needed)

---

### 10. Test Auto-Disable

**Wait 30 seconds after enabling MQTT...**

**Expected log:**
```
[warn] reolink.0 ⏱️ Auto-disabling MQTT after 30s (battery protection)
[info] reolink.0 MQTT disabled - battery saving mode
[info] reolink.0 MQTT process stopped
[info] reolink.0 [MQTT] MQTT client disconnected
```

**Check state:**
```bash
dev-server state get reolink.0.mqtt.enable
# Expected: false
```

---

## Summary Checklist

- [ ] Config set in Admin UI
- [ ] Adapter starts without errors
- [ ] Object structure correct (`status.*` channel)
- [ ] All states read-only (`write: false`)
- [ ] MQTT enables successfully
- [ ] Subscriptions confirmed in logs
- [ ] States update from MQTT messages
- [ ] Motion detection works (true → 5s → false)
- [ ] Battery level updates
- [ ] Floodlight control works
- [ ] Floodlight feedback works (`status.floodlight`)
- [ ] Auto-disable works (30s)
- [ ] Read-only protection active

---

## If Issues Found

1. Check logs:
   ```bash
   tail -100 /home/martin/ioBroker.reolink/.dev-server/default/log/iobroker.2026-03-02.log | grep reolink
   ```

2. Check neolink processes:
   ```bash
   ps aux | grep neolink
   ```

3. Check MQTT connection:
   ```bash
   mosquitto_sub -h 192.168.0.110 -t "neolink/#" -v
   ```

4. Report errors with:
   - Log output
   - Error message
   - State values
   - MQTT messages (if any)
