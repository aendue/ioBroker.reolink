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

## Battery-Powered Cameras (NEW in v1.4.0)

**Reolink battery-powered cameras** (Argus 3 Pro, B400, D400, E1 Outdoor, etc.) use a proprietary "Baichuan" protocol instead of the HTTP API. This adapter now supports these cameras via **neolink** integration!

### ⚠️ IMPORTANT: Battery Saving

**Battery cameras DRAIN QUICKLY when streaming!** This adapter includes battery-saving features:

✅ **Streams disabled by default** - Must be explicitly enabled  
✅ **Auto-pause when no client** - Stream pauses when nobody is watching  
✅ **Idle disconnect** - Connection drops after 2.1s of inactivity  
✅ **MQTT for motion** - Get motion alerts without keeping stream active  

**Best Practice:** Only enable streaming when actively viewing, then disable immediately after!

### Setup Instructions for Battery Cameras

1. **Enable Battery Camera Mode:**
   - In adapter configuration, check ✅ **"Battery-powered camera (uses neolink)"**
   
2. **Enter Camera UID:**
   - Find your camera's UID in the Reolink app:
     - Open Reolink app → Select camera → Settings → Device Info → UID
   - Enter the UID (format: `95270005ODHZABIH`)

3. **Configure Camera:**
   - **IP Address:** Your camera's local IP (e.g., `192.168.30.24`)
   - **Username/Password:** Camera credentials (usually `admin` / your password)
   - **Protocol:** Not used for battery cameras (ignored)

4. **Install System Dependency (Linux only):**
   ```bash
   # Debian/Ubuntu/Proxmox
   sudo apt update && sudo apt install gstreamer1.0-rtsp
   
   # Fedora/RHEL
   sudo dnf install gstreamer1-rtsp-server
   
   # Arch Linux
   sudo pacman -S gst-rtsp-server
   ```

5. **Start Adapter:**
   - The adapter will automatically spawn a neolink process
   - RTSP streams will be available at `rtsp://127.0.0.1:8554/<InstanceName>/mainStream`
   - **Streaming is DISABLED by default** (battery saving)

### Controlling Battery Camera Streams

The adapter creates these control datapoints:

#### Stream Control (Critical for Battery Life!)

- **`streams.enable`** (boolean) - Enable/Disable RTSP streaming
  - ⚠️ **Default: `false`** (battery saving)
  - Set to `true` when you want to view the stream
  - **Auto-disables after timeout** (configurable, default 30s)
  - Set to `false` immediately after viewing to save battery (or wait for auto-disable)
  - Stream auto-pauses when no client connected (even when enabled)
  - Timer is cancelled if manually disabled before timeout

**Auto-Disable Timer:**
- Configurable in adapter settings: `streamAutoDisableSeconds` (default: 30, range: 10-3600)
- Prevents accidental battery drain if you forget to disable
- Logs warning when auto-disabling: `⏱️ Auto-disabling stream after Xs (battery protection)`

#### MQTT Control (Motion & Battery without Streaming!)

- **`mqtt.enable`** (boolean) - Enable MQTT for motion/battery monitoring
  - Allows motion detection WITHOUT keeping stream active
  - Battery level updates via MQTT
  - Topics: `neolink/<camera>/motion`, `neolink/<camera>/battery`
  
- **`mqtt.broker`** (string) - MQTT broker address (default: `127.0.0.1`)
- **`mqtt.port`** (number) - MQTT broker port (default: `1883`)

**Note:** MQTT config changes require adapter restart to take effect.

### What Works with Battery Cameras

✅ **RTSP Live Streams** (Main + Sub Stream)  
✅ **Battery Saving Mode** (auto-pause, idle disconnect, auto-disable timer)  
✅ **Stream Control** (`streams.enable` datapoint with auto-disable)  
✅ **Configurable Timeouts** (auto-disable timer, pause timeout)  
✅ **MQTT Motion Detection** (without streaming)  
✅ **MQTT Battery Level** (% remaining)  
✅ **Snapshot** (via ffmpeg + RTSP, `snapshot` button)  
✅ **Floodlight Control** (via MQTT, `floodlight` switch)  
✅ **Camera UID Display**  
✅ **Connection Status**  
✅ **Multi-Platform** (Linux x64/ARM64/ARM32, macOS, Windows)  
✅ **Raspberry Pi Support** (ARM binaries included)  

❌ **PTZ Control** (not supported by battery cameras)  
❌ **Email/FTP settings** (not applicable to battery cams)  

❌ **PTZ Control** (not supported by battery cameras)  
❌ **Email/FTP settings** (not applicable to battery cams)  
❌ **Snapshots via HTTP** (use RTSP + ffmpeg instead)

### Neolink Features Supported

This adapter leverages all battery-saving features from neolink:

- ✅ **`pause_on_client`** - Stream pauses when no RTSP client connected
- ✅ **`pause_on_motion`** - Wake camera on motion
- ✅ **`idle_disconnect`** - Disconnect after timeout
- ✅ **MQTT motion** - Get motion events without streaming
- ✅ **MQTT battery** - Battery percentage monitoring
- ✅ **Local discovery** - Finds camera on local network

### Technical Details

- **Neolink Version:** v0.6.2 (bundled with adapter)
- **Supported Platforms:** Linux x64, macOS (Intel + Apple Silicon), Windows x64
- **RTSP Port:** 8554 (localhost only, not exposed to network)
- **Config Storage:** Adapter data directory with restrictive permissions (chmod 600)
- **System Dependency:** GStreamer RTSP Server library required (Linux/BSD)

### Troubleshooting Battery Cameras

**Problem:** Adapter fails to start with "Battery camera requires Camera UID"
- **Solution:** Enter the camera UID in adapter configuration (find in Reolink app)

**Problem:** Neolink process dies during startup
- **Solution:** Check camera IP/credentials, ensure camera is online and accessible

**Problem:** Error "libgstrtspserver-1.0.so.0: cannot open shared object file"
- **Solution:** Install GStreamer RTSP library:
  ```bash
  sudo apt install gstreamer1.0-rtsp
  ```

**Problem:** Cannot connect to RTSP stream
- **Solution:** 
  1. Check if `streams.enable` is set to `true`
  2. Wait 5-10 seconds after adapter start
  3. Verify stream URL: `rtsp://127.0.0.1:8554/<InstanceName>/mainStream`
  4. Camera might be sleeping - try triggering motion

**Problem:** Battery drains too fast
- **Solution:** 
  1. Disable streaming when not viewing: `streams.enable = false`
  2. Use MQTT for motion detection instead of continuous streaming
  3. Neolink auto-pauses, but camera wakes on connection attempts
  4. Consider increasing `timeout` in neolink config (requires manual edit)

**Problem:** "Unsupported platform" error
- **Solution:** Battery camera support requires Linux x64, macOS, or Windows x64. ARM (Raspberry Pi) not yet supported.

**Problem:** MQTT not working
- **Solution:** 
  1. Check MQTT broker is running and accessible
  2. Verify `mqtt.broker` and `mqtt.port` settings
  3. Restart adapter after changing MQTT config
  4. Check MQTT broker logs for connections from neolink

---

## Known working cameras (firmware out of year 2023)

### HTTP API Cameras (Standard)
- RLC-420-5MP
- E1 Zoom
- RLC-522
- RLC-810A
- RLC-823A
- Duo 3 PoE

### Battery Cameras (via Neolink)
- ✅ Argus 3 Pro
- ✅ E1 Outdoor (battery model)
- ✅ B400
- ✅ D400
- ⚠️ Other battery-powered models (should work but untested)

## Known *NOT* working cameras

- E1 Pro (requires specific API commands not yet implemented)
- Argus 4 (battery camera - testing needed)

## Changelog
<!--
    Placeholder for the next version (at the beginning of the line):
    ### **WORK IN PROGRESS**
-->
### **WORK IN PROGRESS**
* (bloop-herbert-bot) 🔋 **Battery Camera Support via Neolink - COMPLETE**
  - Added support for Reolink battery-powered cameras (Argus 3 Pro, B400, D400, E1 Outdoor)
  - Integrated neolink v0.6.2 (Rust RTSP bridge for Baichuan protocol)
  - Bundled neolink binaries for Linux (x64/ARM64/ARM32), macOS, Windows x64 (~100MB)
  - **NEW:** ARM support - Raspberry Pi compatible! (ARM64 + ARM32 binaries)
  - New config options: `isBatteryCam`, `cameraUID`, `streamAutoDisableSeconds`, `pauseTimeout`
  - Automatic neolink process spawning for battery cameras
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