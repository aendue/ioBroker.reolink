# Dev-Server vs Production Testing

## ❌ Dev-Server Issue (192.168.0.99)

**Problem:** Database instability causing repeated crashes

```
2026-03-02 18:45:47.923 warn reolink.0 get state error: DB closed
2026-03-02 18:45:51.922 warn Cannot connect/reconnect to objects DB. Stopping adapter.
```

**Root Cause:** dev-server Redis DB is unstable - happens randomly, not related to MQTT feature

**Workaround attempted:** Multiple restarts, but DB keeps failing

---

## ✅ Production System (192.168.0.18) - RECOMMENDED

**Your logs show MQTT already working there:**

```
reolink.0 2026-03-02 18:24:16.557 info Subscribed to status topics for Camera01
reolink.0 2026-03-02 18:24:16.503 info MQTT client connected - Ready for floodlight control
reolink.0 2026-03-02 18:24:16.454 info MQTT process started - Camera publishing to broker
reolink.0 2026-03-02 18:24:13.450 info [Camera01] MQTT process started (PID: 25572)
```

---

## 🧪 Test MQTT on Production System

### SSH to Production:
```bash
ssh <user>@192.168.0.18
```

### 1. Check if MQTT still enabled:
```bash
iobroker state get reolink.0.mqtt.enable
```

**If false:** Enable it:
```bash
iobroker state set reolink.0.mqtt.enable true
```

### 2. Check States Values:
```bash
iobroker state get reolink.0.status.motion
iobroker state get reolink.0.status.battery_level
iobroker state get reolink.0.status.floodlight
iobroker state get reolink.0.status.preview
```

**Expected:**
- `motion`: `false` or `true` (boolean)
- `battery_level`: `91` or similar (number, %)
- `floodlight`: `false` or `true` (boolean)
- `preview`: Base64 string or `null`

**If all are `null`:** States not updating from MQTT

### 3. Monitor MQTT Messages:
```bash
mosquitto_sub -h 192.168.0.110 -u iobroker -P iobroker -t "neolink/Camera01/status/#" -v
```

**Expected output:**
```
neolink/Camera01/status/motion clear
neolink/Camera01/status/battery_level 91
neolink/Camera01/status/floodlight off
neolink/Camera01/status/preview <base64>
```

**If no messages:** Neolink MQTT process not publishing

### 4. Check Neolink Processes:
```bash
ps aux | grep neolink
```

**Expected:**
```
<user>  <pid>  neolink rtsp --config=...
<user>  <pid>  neolink mqtt --config=...
```

**If only RTSP running:** MQTT process not started

### 5. Check Adapter Logs:
```bash
iobroker logs --adapter reolink --lines 50
```

**Look for:**
- ✅ `[MQTT] Connected to MQTT broker`
- ✅ `[MQTT] Subscribed to: neolink/Camera01/status/motion`
- ✅ `[MQTT] Subscribed to: neolink/Camera01/status/battery_level`
- ✅ `[MQTT] Subscribed to: neolink/Camera01/status/floodlight`
- ✅ `[MQTT] Subscribed to: neolink/Camera01/status/preview`
- ❌ Any MQTT connection errors?
- ❌ Any neolink MQTT process errors?

### 6. Test Floodlight Control:
```bash
# Turn ON
iobroker state set reolink.0.floodlight true

# Wait 2 seconds for MQTT roundtrip
sleep 2

# Check feedback state
iobroker state get reolink.0.status.floodlight
# Expected: true
```

**If feedback state doesn't update:**
- Check MQTT messages: `mosquitto_sub -h 192.168.0.110 -t "neolink/Camera01/status/floodlight" -v`
- Check if camera actually turned on floodlight (physically check)
- Check adapter logs for MQTT receive errors

### 7. Test Motion Detection:
```bash
# Walk in front of camera

# Immediately check state
iobroker state get reolink.0.status.motion
# Expected: true

# Wait 5 seconds
sleep 5

# Check again
iobroker state get reolink.0.status.motion
# Expected: false (motion timeout)
```

---

## 🐛 Troubleshooting

### Issue: States are all `null`

**Possible causes:**
1. **Neolink MQTT process not running**
   - Check `ps aux | grep neolink`
   - Should see 2 processes (rtsp + mqtt)

2. **Neolink not publishing to MQTT broker**
   - Test: `mosquitto_sub -h 192.168.0.110 -t "neolink/#" -v`
   - If no messages → check neolink MQTT config

3. **Adapter not subscribing**
   - Check logs for `[MQTT] Subscribed to:` messages
   - If missing → MQTT client connection failed

4. **MQTT broker credentials wrong**
   - Test: `mosquitto_pub -h 192.168.0.110 -u iobroker -P iobroker -t "test" -m "hello"`
   - If fails → check MQTT credentials in adapter config

### Issue: Floodlight control doesn't work

**Possible causes:**
1. **MQTT not enabled**
   - Check `iobroker state get reolink.0.mqtt.enable`
   - Must be `true`

2. **Neolink MQTT not subscribed to control topic**
   - Check neolink MQTT config: `neolink/Camera01/control/floodlight`
   - Should be in `[[cameras.mqtt.control]]` section

3. **Camera doesn't support MQTT floodlight control**
   - Try controlling via Reolink app instead
   - Check camera firmware version

### Issue: Motion detection doesn't trigger

**Possible causes:**
1. **Motion detection disabled on camera**
   - Check Reolink app: Settings → Detection → Motion Detection

2. **Neolink not publishing motion events**
   - Check `mosquitto_sub -h 192.168.0.110 -t "neolink/Camera01/status/motion" -v`
   - Walk in front of camera
   - Should see `triggered` message

3. **Adapter not receiving MQTT messages**
   - Check logs: `[MQTT] Motion detected!`
   - If missing → subscription or parsing issue

---

## 📝 Report Back

Please test on **192.168.0.18** (production) and send:

1. **State values:**
   ```bash
   iobroker state get reolink.0.status.motion
   iobroker state get reolink.0.status.battery_level
   iobroker state get reolink.0.status.floodlight
   ```

2. **MQTT messages:**
   ```bash
   mosquitto_sub -h 192.168.0.110 -u iobroker -P iobroker -t "neolink/Camera01/status/#" -v | head -20
   ```

3. **Neolink processes:**
   ```bash
   ps aux | grep neolink
   ```

4. **Adapter logs (last 50 lines):**
   ```bash
   iobroker logs --adapter reolink --lines 50
   ```

---

**Dev-server is too unstable for testing. Production system has stable MQTT already running - let's debug there!**
