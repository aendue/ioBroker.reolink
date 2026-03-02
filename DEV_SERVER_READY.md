# Dev-Server Configuration Instructions

## ✅ Dev-Server is Running!

**Admin UI:** http://192.168.0.99:8081  
**Status:** Online and ready for configuration

---

## 🔧 Configure reolink.0 Instance

### Via Web UI (Recommended):

1. **Open Admin:** http://192.168.0.99:8081
2. Go to **Instances**
3. Find **reolink.0**
4. Click **Configure** (🔧 icon)
5. Switch to **"Battery Camera"** tab
6. Enter configuration:

```
✅ Enable Battery Camera Mode: true
Camera IP: 192.168.30.24
Camera UID: 95270005ODHZABIH
Camera Name (MQTT): Camera01
Username: admin
Password: Bloop2024!
Pause Timeout: 2.1

MQTT Broker: 192.168.0.110
MQTT Port: 1883
MQTT Username: iobroker
MQTT Password: iobroker

Stream Auto-Disable: 30
MQTT Auto-Disable: 30
```

7. Click **Save & Close**
8. Wait for adapter to restart (~5 seconds)

---

## ✅ Verify Adapter is Running

```bash
ssh martin@192.168.0.99
# Password: fcdkxezn

# Check adapter process
ps aux | grep 'io.reolink'

# Expected output:
# martin  <PID>  ... io.reolink.0
```

---

## 📊 Check Logs

```bash
tail -f /home/martin/ioBroker.reolink/.dev-server/default/log/iobroker.$(date +%Y-%m-%d).log | grep reolink
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

## 🔌 Enable MQTT

### Via CLI:
```bash
cd /home/martin/ioBroker.reolink
dev-server state set reolink.0.mqtt.enable true
```

### Via Admin UI:
1. Go to **Objects**
2. Find `reolink.0` → `mqtt` → `enable`
3. Set value to `true`
4. Click ✔️ (checkmark)

**Expected logs:**
```
[warn] reolink.0 ⚠️ BATTERY DRAIN: MQTT enabled! Auto-disabling in 30s
[info] reolink.0 MQTT Broker: 192.168.0.110:1883
[info] reolink.0 MQTT topics: neolink/Camera01/status/{motion,battery_level,floodlight,preview}
[info] reolink.0 ✅ MQTT process started - Camera publishing to broker
[info] reolink.0 ✅ MQTT client connected
[info] reolink.0 [MQTT] Subscribed to: neolink/Camera01/status/motion
[info] reolink.0 [MQTT] Subscribed to: neolink/Camera01/status/battery_level
[info] reolink.0 [MQTT] Subscribed to: neolink/Camera01/status/floodlight
[info] reolink.0 [MQTT] Subscribed to: neolink/Camera01/status/preview
[info] reolink.0 ✅ Subscribed to status topics for Camera01
```

---

## 🧪 Verify Neolink Processes

```bash
ps aux | grep neolink | grep -v grep
```

**Expected:**
```
martin  <PID>  ... neolink rtsp --config=neolink-rtsp-Camera01.toml
martin  <PID>  ... neolink mqtt --config=neolink-mqtt-Camera01.toml
```

**If no processes:**
- Check logs for errors
- Verify camera IP/UID/password
- Check neolink binary permissions: `ls -l ~/.openclaw/workspace-githerbert/ioBroker.reolink/lib/neolink-*`

---

## 📡 Monitor MQTT

```bash
mosquitto_sub -h 192.168.0.110 -u iobroker -P iobroker -t "neolink/Camera01/status/#" -v
```

**Expected output:**
```
neolink/Camera01/status/motion clear
neolink/Camera01/status/battery_level 91
neolink/Camera01/status/floodlight off
neolink/Camera01/status/preview <base64-image-data>
```

---

## 📊 Check ioBroker States

```bash
dev-server state get reolink.0.status.motion
dev-server state get reolink.0.status.battery_level
dev-server state get reolink.0.status.floodlight
```

**Expected:**
```
reolink.0.status.motion = false (boolean)
reolink.0.status.battery_level = 91 (number)
reolink.0.status.floodlight = false (boolean)
```

---

## 🧪 Test Floodlight

```bash
dev-server state set reolink.0.floodlight true
sleep 2
dev-server state get reolink.0.status.floodlight
# Expected: true
```

---

## 🚶 Test Motion Detection

1. **Walk in front of camera**
2. Check state:
```bash
dev-server state get reolink.0.status.motion
# Expected: true (immediately after motion)
```
3. Wait 5 seconds
4. Check again:
```bash
dev-server state get reolink.0.status.motion
# Expected: false
```

---

## 🐛 Troubleshooting

### Issue: Adapter won't start
**Check:**
```bash
tail -100 /home/martin/ioBroker.reolink/.dev-server/default/log/iobroker.$(date +%Y-%m-%d).log | grep reolink
```

### Issue: No neolink processes
**Check binary:**
```bash
cd /home/martin/ioBroker.reolink
ls -l lib/neolink-*
# Should be executable (rwxr-xr-x)
```

**Make executable if needed:**
```bash
chmod +x lib/neolink-*
```

### Issue: MQTT not connecting
**Test MQTT broker:**
```bash
mosquitto_pub -h 192.168.0.110 -u iobroker -P iobroker -t "test" -m "hello"
```

### Issue: Camera connection failed
**Verify credentials:**
- Camera IP: `192.168.30.24`
- UID: `95270005ODHZABIH`
- Username/Password correct?

**Test with neolink manually:**
```bash
cd /home/martin/ioBroker.reolink/lib
./neolink-linux-x64 mqtt --config=<path-to-toml>
```

---

## ✅ Success Checklist

- [ ] Dev-server running (http://192.168.0.99:8081)
- [ ] Adapter configured via Web UI
- [ ] Adapter process running (`ps aux | grep io.reolink`)
- [ ] Logs show successful start
- [ ] MQTT enabled
- [ ] Neolink processes running (rtsp + mqtt)
- [ ] MQTT messages received
- [ ] States updating (`status.motion`, `status.battery_level`, etc.)
- [ ] Floodlight control works
- [ ] Motion detection works
- [ ] Auto-disable works (30s)
