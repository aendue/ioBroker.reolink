![Logo](admin/reolink.png)
# ioBroker.reolink

[![NPM version](https://img.shields.io/npm/v/iobroker.reolink.svg)](https://www.npmjs.com/package/iobroker.reolink)
[![Downloads](https://img.shields.io/npm/dm/iobroker.reolink.svg)](https://www.npmjs.com/package/iobroker.reolink)
![Number of Installations](https://iobroker.live/badges/reolink-installed.svg)
![Current version in stable repository](https://iobroker.live/badges/reolink-stable.svg)
[![Dependency Status](https://img.shields.io/david/aendue/iobroker.reolink.svg)](https://david-dm.org/aendue/iobroker.reolink)

[![NPM](https://nodei.co/npm/iobroker.reolink.png?downloads=true)](https://nodei.co/npm/iobroker.reolink/)

**Tests:** ![Test and Release](https://github.com/aendue/ioBroker.reolink/workflows/Test%20and%20Release/badge.svg)

## reolink adapter for ioBroker

Adapter for ioBroker Plattform to get [Reolink camera](https://reolink.com/) information.

In general, all newer Reolink cameras support API commands. They just differ in their supported commands.

One reminder to the password. Try with or without URI encoding, when you have only one special char. Better use no special char and simply a longer password for the same security. Check with http://cam.ip.add.ress/api.cgi?cmd=GetDevInfo&channel=0&user=username&password=yoursecurity if your credentials are working.

If you wish to have any specific API command included...just let me know.

## Implemented functions

### SET
 - PTZ Control / PTZ Guard
 - Push Notification
 - Set Autofocus
        values: 0,1
 - Set IR light
        values: Auto, Off
 - Set LED light
 - Set Mail Notification
        values: 0, 1
 - Play Audio Alarm
 - Zoom Focus

 Functions can be triggert by changing reolink.<Instanze>.settings states.

 ### GET

 - Device Info
 - PTZ Info
 - Drive Info
 - Network Info
 - Motion Detection
 - Auto Focus
 - Snapshot
 - IR Light
 - LED Light
 - Mail Notification

### Push notification settings

Push notifications to a phone will only be provided if the following conditions are met:
 - The Push notifications switch in the adapter is ON.
 - For NVRs, both the global and channel switch are ON.
 - The Push-notification in the Reolink App of that phone is ON.

The Push-notification in the Reolink app is independent of the adapter setting. It is also independent of the settings on other phones connected to the same camera. Reolink does this so you have an independent way of turning off push notifications per phone. This means deactivating push at iobroker does not touch the toggle button in the app at all.

### Example Usage of get image:

```js
sendTo("reolink.0",{action: "snap"}, function(result){
    sendTo("matrix-org.0",{file:result});
});
```
// content from **result** is JSON :
```json
{ "type": "image/png","base64": "iVBORw....askldfj" }
```

for telegram this is working
```js
sendTo("reolink.0",{action: "snap"}, function(result){
    const buffer =Buffer.from(result.base64, "base64");
    sendTo('telegram.0', {
        text: buffer,
        type: "photo",
        caption: 'the image'
    });
});
```

## Battery-Powered Cameras 

Battery cameras (Argus 3 Pro,...) use a proprietary protocol. This adapter supports them via **neolink**.

### Quick Setup

1. **Enable in Config:** ✅ "Battery-powered camera"
2. **Enter Camera UID:** Find in Reolink app → Device Info
3. **Install Dependency (Linux):**
   ```bash
   sudo apt install gstreamer1.0-rtsp
   ```
4. **Start Adapter** → RTSP streams at `rtsp://127.0.0.1:8554/<InstanceName>/mainStream`

### Battery Saving

**Battery drains fast when active!** Use these controls:

- **`streams.enable`** (boolean) - Enable/disable streaming
  - Default: `false` (battery saving)
  - Auto-disables after 30s (configurable)
  - Pauses when no client connected
  
- **`mqtt.enable`** (boolean) - Motion/battery via MQTT
  - No streaming needed for motion detection
  - Auto-disables after 30s
  - Configure broker in adapter settings

**Best Practice:** Enable only when viewing, then disable immediately!

### Features

✅ RTSP streams (main + sub)  
✅ Snapshot (requires ffmpeg)  
✅ Floodlight control (via MQTT)  
✅ Motion detection (via MQTT)  
✅ Battery level (via MQTT)  
✅ Multi-platform (Linux x64/ARM, macOS, Windows)  

❌ PTZ control  
❌ HTTP API features  

### MQTT Setup

Configure in adapter settings:
- **Broker Host** (default: 127.0.0.1)
- **Broker Port** (default: 1883)
- **Username/Password** (optional)

Topics:
- `neolink/<camera>/status/motion`
- `neolink/<camera>/status/battery_level`
- `neolink/<camera>/control/floodlight`

### Troubleshooting

**"Camera UID required"** → Enter UID from Reolink app  
**"libgstrtspserver not found"** → `sudo apt install gstreamer1.0-rtsp`  
**Stream won't connect** → Enable `streams.enable`, wait 5s  
**Battery drains fast** → Disable streaming when not viewing, use MQTT for motion  

---

## Known Working Cameras

### HTTP API (Standard)
RLC-420-5MP, E1 Zoom, RLC-522, RLC-810A, RLC-823A, Duo 3 PoE

### Battery Cameras (via Neolink)

✅ Argus 3 Pro

---

## Changelog
<!--
    Placeholder for the next version (at the beginning of the line):
    ### **WORK IN PROGRESS**
-->
### **WORK IN PROGRESS**
* (bloop-herbert-bot) 🔋 **Battery Camera Support via Neolink**
  - Support for Reolink battery cameras (Argus 3 Pro)
  - Integrated neolink v0.6.2 (RTSP bridge for Baichuan protocol)
  - ARM support - Raspberry Pi compatible!
  - Runtime MQTT + Stream control with auto-disable (30s default)
  - Config fields: `isBatteryCam`, `cameraUID`, `mqttAutoDisableSeconds`, `streamAutoDisableSeconds`
  - RTSP stream URLs exposed: `rtsp://127.0.0.1:8554/<InstanceName>/mainStream`
  - **Battery Saving Features:**
    - Streams DISABLED by default (enable via `streams.enable` datapoint)
    - **Auto-disable timer** - Stream automatically disables after timeout (default 30s, configurable 10-3600s)
    - **Configurable pause timeout** - Adjust stream pause delay (default 2.1s, range 1-10s)
    - Auto-pause when no RTSP client connected
    - Idle disconnect after timeout
    - MQTT support for motion/battery monitoring WITHOUT streaming
  - **MQTT Integration:**
    - Motion detection via MQTT (no streaming needed)
    - Battery level monitoring via MQTT
    - Configurable MQTT broker (`mqtt.enable`, `mqtt.broker`, `mqtt.port`)
    - **Floodlight control** - Turn camera floodlight on/off via MQTT
  - **Snapshot Feature:**
    - Capture snapshots from RTSP stream using ffmpeg
    - `snapshot` button datapoint triggers capture
    - `snapshotImage` datapoint contains base64 JPEG
    - `snapshotStatus` shows capture status (idle/capturing/success/error)
  - **Dependency Checking:**
    - Automatic check for GStreamer RTSP library (required, Linux only)
    - Automatic check for ffmpeg (optional, for snapshots)
    - Clear error messages with installation instructions in adapter log
  - **System Dependencies:** 
    - **Required:** GStreamer RTSP library on Linux (`gstreamer1.0-rtsp`)
    - **Optional:** ffmpeg for snapshot feature
  - Zero breaking changes - HTTP API cameras work as before

### 1.3.0 (2025-12-20)
* (agross) AiCfg config
* (oelison) bump some libs #202
* (bluefox) migration to ts
* (bot) revoking classic token #204
* (oelison) state changes from info log to debug #206

### 1.2.3 (2025-06-30)
* (oelison) settings email notification #170
* (oelison) testing node.js 24 #172

### 1.2.2 (2025-05-01)
* (oelison) update readme #141 #155
* (oelison) supress errors with axios timeout #154

### 1.2.1 (2025-02-09)
* (oelison) set some errors to debug logs

### 1.2.0 (2025-02-07)
* (oelison) update disk info
* (oelison) uri enconding is switchable (helps sometimes by one special char)
* (oelison) #28 PTZ check added

### 1.1.2 (2024-09-14)
* (oelison) [#22](https://github.com/aendue/ioBroker.reolink/issues/22) password with some more special chars works now
* (oelison) adapter warnings resolved

### 1.1.1 (2024-08-03)
* (oelison) removed warnings from adapter check
* (olli) added ftp support
* (oelison) channel now distinguishing most requests
* (oelison) [#79](https://github.com/aendue/ioBroker.reolink/issues/79) error messages with more info where

### 1.1.0 (2024-05-16)
* (Nibbels) [#56](https://github.com/aendue/ioBroker.reolink/issues/56) added function to switch scheduled recording on and off
* (Nibbels) [#25](https://github.com/aendue/ioBroker.reolink/issues/25) detach led light from led light mode
* (Nibbels) added setWhiteLedMode function
* (Nibbels) read zoom and focus with POST request (works on RLC-823A v3.1)
* (oelison) removed node 16

### 1.0.3 (2024-01-21)
* (oelison) [#49](https://github.com/aendue/ioBroker.reolink/issues/49)
* (oelison) [#47](https://github.com/aendue/ioBroker.reolink/issues/47)

### 1.0.2 (2023-12-19)
* (oelison) known working cameras added
* (oelison) setIrLights accept "On" now
* (oelison) [#40](https://github.com/aendue/ioBroker.reolink/issues/40)
* (oelison) [#42](https://github.com/aendue/ioBroker.reolink/issues/42)

### 1.0.1 (2023-11-11)
* (oelison) resolve review for latest adapter addition
* (oelison) maybe the last node 16 version
* (oelison) booleans are now false/true and not 0/1

## License
MIT License

Copyright (c) 2025 Andy Grundt <andygrundt@gmail.com>

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
