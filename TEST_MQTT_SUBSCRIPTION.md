# Test: MQTT Subscription for Battery Camera Status

## Problem
**Current Behavior:**
- Neolink publishes to `neolink/Camera01/status/{motion,battery_level,floodlight,preview}`
- Adapter can publish commands (`floodlight/set`)
- **Adapter does NOT subscribe to status topics**
- ioBroker states are never updated

**Example:**
```
mosquitto_sub -t "neolink/Camera01/status/#"
neolink/Camera01/status/battery_level 91
neolink/Camera01/status/motion clear
neolink/Camera01/status/floodlight off
```

**But in ioBroker:**
- No `battery.level` state
- No `motion.detected` state
- `floodlight` state never updated (no feedback)

## Root Cause
1. `MqttHelper` only has `setFloodlight()` (publish)
2. No `subscribe()` method
3. No message callback handler
4. Missing ioBroker states for MQTT data

## Expected Behavior

### Test 1: MQTT Subscription Setup
When MQTT is enabled (`mqtt.enable = true`):

1. **Subscribe to topics:**
   - `neolink/Camera01/status/motion`
   - `neolink/Camera01/status/battery_level`
   - `neolink/Camera01/status/floodlight`
   - `neolink/Camera01/status/preview`

2. **Create ioBroker states:**
   ```
   reolink.0.battery.level         (number, %, read-only)
   reolink.0.motion.detected       (boolean, read-only)
   reolink.0.floodlight.status     (boolean, read-only) - MQTT feedback
   ```

3. **Update states on message:**
   ```
   MQTT: neolink/Camera01/status/battery_level 91
   → setState('battery.level', 91, true)

   MQTT: neolink/Camera01/status/motion triggered
   → setState('motion.detected', true, true)
   → After 5s: setState('motion.detected', false, true)

   MQTT: neolink/Camera01/status/floodlight on
   → setState('floodlight.status', true, true)
   ```

### Test 2: State Updates in Real-Time
**Scenario:** Motion detected on camera

1. Camera detects motion
2. Neolink publishes: `neolink/Camera01/status/motion triggered`
3. Adapter receives message
4. Updates `reolink.0.motion.detected = true`
5. After 5 seconds: `reolink.0.motion.detected = false`

**Logs:**
```
[MQTT] Message received: neolink/Camera01/status/motion = triggered
Motion detected on Camera01
```

### Test 3: Battery Level Updates
**Scenario:** Battery level changes

1. Neolink publishes: `neolink/Camera01/status/battery_level 85`
2. Adapter receives message
3. Updates `reolink.0.battery.level = 85`

**Logs:**
```
[MQTT] Message received: neolink/Camera01/status/battery_level = 85
Battery level: 85%
```

### Test 4: Floodlight Feedback
**Scenario:** User toggles floodlight, gets confirmation

1. User sets `floodlight = true`
2. Adapter publishes: `neolink/Camera01/floodlight/set on`
3. Camera executes command
4. Neolink publishes: `neolink/Camera01/status/floodlight on`
5. Adapter updates: `floodlight.status = true`

**Result:** User sees floodlight feedback in `floodlight.status` state

### Test 5: Unsubscribe on MQTT Disable
When `mqtt.enable = false`:

1. Stop MQTT process
2. Disconnect MQTT client
3. Unsubscribe from all topics
4. **Keep states** (last known values remain visible)

## Implementation Checklist

### MqttHelper Updates
- [ ] Add `subscribe(topic: string, callback: (message: Buffer) => void)` method
- [ ] Add `unsubscribe(topic: string)` method
- [ ] Add `on('message', handler)` event listener setup
- [ ] Handle disconnect/reconnect gracefully

### main.ts Updates
- [ ] Create subscription states in `createBatteryCamStates()`:
  - `battery.level` (number, %, read-only)
  - `motion.detected` (boolean, read-only)
  - `floodlight.status` (boolean, read-only)
- [ ] Subscribe to topics when MQTT enabled
- [ ] Implement message handlers:
  - `handleMotionMessage(payload: string)`
  - `handleBatteryMessage(payload: string)`
  - `handleFloodlightStatusMessage(payload: string)`
- [ ] Unsubscribe when MQTT disabled
- [ ] Motion detection timeout (5s clear)

### Message Parsing
**Neolink formats:**
- Motion: `"triggered"` | `"clear"`
- Battery: `"91"` (percentage as string)
- Floodlight: `"on"` | `"off"`
- Preview: `"<base64-image>"` (ignore for now)

### Error Handling
- Malformed JSON → log warning, skip
- Invalid payload → log warning, skip
- Connection loss → reconnect automatically (mqtt library handles this)

## Success Criteria

✅ Adapter subscribes to all status topics when MQTT enabled  
✅ Battery level updates in ioBroker state  
✅ Motion detection triggers state (true → 5s → false)  
✅ Floodlight status feedback visible in separate state  
✅ Unsubscribe on MQTT disable  
✅ Logs show incoming MQTT messages  
✅ States survive adapter restart (last known values)  

## Testing on dev-server

```bash
# 1. Enable MQTT
iobroker setState reolink.0.mqtt.enable true

# 2. Trigger motion on camera (walk in front of it)
# 3. Check ioBroker state:
iobroker state get reolink.0.motion.detected
# Expected: true (then false after 5s)

# 4. Check battery level:
iobroker state get reolink.0.battery.level
# Expected: 91 (or current value)

# 5. Toggle floodlight and check feedback:
iobroker setState reolink.0.floodlight true
iobroker state get reolink.0.floodlight.status
# Expected: true

# 6. Monitor MQTT:
mosquitto_sub -h 192.168.0.110 -t "neolink/Camera01/status/#" -v
```
