# ⚠️ IMPORTANT: Logs are from PRODUCTION SYSTEM!

## Status Check (2026-03-02 18:25)

### ❌ Dev-Server (192.168.0.99)
- ✅ Admin UI running: http://192.168.0.99:22426
- ❌ reolink.0 adapter: **NOT RUNNING** (no process)
- ❌ States: **NOT CREATED** (no objects found)
- ❌ Config: **NOT SET** (needs manual config via Admin UI)

### ✅ Production System (192.168.0.18)
**The logs you sent are from production system!**

```
reolink.0 2026-03-02 18:24:16.557 info Subscribed to status topics for Camera01
reolink.0 2026-03-02 18:24:16.503 info MQTT client connected
reolink.0 2026-03-02 18:24:16.454 info MQTT process started
reolink.0 2026-03-02 18:24:13.450 info [Camera01] MQTT process started (PID: 25572)
reolink.0 2026-03-02 18:24:13.447 info [Camera01] Starting MQTT process
```

**Production system has:**
- ✅ MQTT running (PID 25572)
- ✅ Connected to broker (192.168.0.110:1883)
- ✅ Subscribed to all 4 topics
- ✅ Neolink publishing

---

## Next Steps

### Option 1: Configure Dev-Server (192.168.0.99)
1. Open Admin UI: http://192.168.0.99:22426
2. Go to Instances → reolink.0 → Configure
3. Set Battery Camera config
4. Save & Close
5. Wait for adapter restart
6. Check logs: `tail -f /home/martin/ioBroker.reolink/.dev-server/default/log/iobroker.2026-03-02.log | grep reolink`

### Option 2: Test on Production System (192.168.0.18) ⭐
**MQTT is already running there!**

```bash
# SSH to production
ssh <user>@192.168.0.18

# Check states
iobroker state get reolink.0.status.motion
iobroker state get reolink.0.status.battery_level
iobroker state get reolink.0.status.floodlight

# Monitor MQTT
mosquitto_sub -h 192.168.0.110 -u iobroker -P iobroker -t "neolink/Camera01/status/#" -v

# Test floodlight
iobroker state set reolink.0.floodlight true
sleep 2
iobroker state get reolink.0.status.floodlight
# Expected: true

# Test motion
# Walk in front of camera, then:
iobroker state get reolink.0.status.motion
# Expected: true (then false after 5s)
```

---

## Recommendation

**Test on production system (192.168.0.18) first!**

MQTT is already running there with proper config. You can verify:
1. States exist and update
2. MQTT subscription works
3. Floodlight control works
4. Motion detection works

**After production testing works → configure dev-server for debugging**

---

## Where are you testing?

Please confirm:
- [ ] Dev-server (192.168.0.99) - needs config via Admin UI
- [ ] Production system (192.168.0.18) - MQTT already running

Send logs from **the system you want to test**!
