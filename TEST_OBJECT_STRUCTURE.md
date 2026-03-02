# Test: Correct Object Structure for Battery Camera Status

## Problem
**Current Structure (WRONG):**
```
reolink.0.battery.level          ❌
reolink.0.motion.detected        ❌
reolink.0.floodlight.status      ❌
```

Each status type gets its own folder/channel, which is confusing.

**Expected Structure:**
```
reolink.0.status                 (channel)
reolink.0.status.motion          (boolean, read-only)
reolink.0.status.battery_level   (number, %, read-only)
reolink.0.status.floodlight      (boolean, read-only)
reolink.0.status.preview         (string, base64, read-only)
```

Single `status` folder containing all status states from MQTT.

## MQTT Topic Mapping
```
MQTT Topic                              → ioBroker State
neolink/Camera01/status/motion          → reolink.0.status.motion
neolink/Camera01/status/battery_level   → reolink.0.status.battery_level
neolink/Camera01/status/floodlight      → reolink.0.status.floodlight
neolink/Camera01/status/preview         → reolink.0.status.preview
```

## State Definitions

### status.motion
- Type: boolean
- Role: sensor.motion
- Read: true
- Write: false
- Behavior: `true` when "triggered", `false` when "clear" or after 5s timeout

### status.battery_level
- Type: number
- Role: value.battery
- Unit: %
- Min: 0
- Max: 100
- Read: true
- Write: false

### status.floodlight
- Type: boolean
- Role: indicator.status
- Read: true
- Write: false
- Desc: Floodlight state from camera feedback

### status.preview
- Type: string
- Role: text
- Read: true
- Write: false
- Desc: Base64-encoded preview image (updated on motion)

## Control vs Status

**Separation of Concerns:**

### Control (writable)
```
reolink.0.floodlight              (boolean, write: true) - User control
reolink.0.mqtt.enable             (boolean, write: true) - MQTT on/off
reolink.0.streams.enable          (boolean, write: true) - Stream on/off
```

### Status (read-only)
```
reolink.0.status.motion           (boolean, write: false) - MQTT feedback
reolink.0.status.battery_level    (number, write: false) - MQTT feedback
reolink.0.status.floodlight       (boolean, write: false) - MQTT feedback
reolink.0.status.preview          (string, write: false) - MQTT feedback
```

User sets `floodlight = true` → publishes to `neolink/.../floodlight/set`  
Camera executes → publishes to `neolink/.../status/floodlight`  
Adapter updates → `status.floodlight = true`

## MQTT Trigger Behavior

When `mqtt.enable = true`:
1. Start MQTT process (neolink publishes automatically)
2. Connect MQTT client
3. Subscribe to `neolink/Camera01/status/#` (wildcard)
4. Neolink publishes status every ~1s (motion) or on change (battery, floodlight)
5. Adapter receives messages → updates states

**No manual trigger needed** - neolink publishes automatically when MQTT process runs.

## Message Handling Update

```typescript
private async handleMqttMessage(topic: string, message: Buffer): Promise<void> {
    const payload = message.toString().trim();
    
    // Format: neolink/<camera>/status/<type>
    const parts = topic.split('/');
    const messageType = parts[3]; // motion, battery_level, floodlight, preview
    
    // Map directly to status.*
    switch (messageType) {
        case 'motion':
            const isMotion = payload === 'triggered';
            await this.setStateAsync('status.motion', isMotion, true);
            if (isMotion) {
                // Clear after 5s
                setTimeout(() => this.setStateAsync('status.motion', false, true), 5000);
            }
            break;
        case 'battery_level':
            const level = parseInt(payload, 10);
            await this.setStateAsync('status.battery_level', level, true);
            break;
        case 'floodlight':
            const isOn = payload === 'on';
            await this.setStateAsync('status.floodlight', isOn, true);
            break;
        case 'preview':
            await this.setStateAsync('status.preview', payload, true);
            break;
    }
}
```

## Success Criteria

✅ Single `status` channel with all status states  
✅ All status states are read-only (write: false)  
✅ MQTT subscription to wildcard topic: `neolink/<camera>/status/#`  
✅ Status updates automatically when `mqtt.enable = true`  
✅ No manual trigger needed - neolink publishes automatically  
✅ Clean object structure matching MQTT topic hierarchy  

## Testing

```bash
# 1. Enable MQTT
iobroker setState reolink.0.mqtt.enable true

# 2. Check object structure
iobroker object get reolink.0.status
iobroker object get reolink.0.status.motion
iobroker object get reolink.0.status.battery_level
iobroker object get reolink.0.status.floodlight

# 3. Monitor MQTT
mosquitto_sub -h 192.168.0.110 -t "neolink/Camera01/status/#" -v

# 4. Check states update
iobroker state get reolink.0.status.motion
iobroker state get reolink.0.status.battery_level
iobroker state get reolink.0.status.floodlight

# 5. Verify read-only (should fail)
iobroker setState reolink.0.status.motion true
# Expected: Error or warning (state is read-only)
```
