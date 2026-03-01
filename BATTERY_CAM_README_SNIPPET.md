## Battery-Powered Cameras (NEW in v1.4.0)

**Reolink battery-powered cameras** (Argus 3 Pro, B400, D400, E1 Outdoor, etc.) use a proprietary "Baichuan" protocol instead of the HTTP API. This adapter now supports these cameras via **neolink** integration!

### ⚠️ IMPORTANT: Battery Saving

**Battery cameras DRAIN QUICKLY when streaming!** This adapter includes battery-saving features:

✅ **Streams disabled by default** - Must be explicitly enabled  
✅ **Auto-disable timer** - Streams turn off automatically after timeout (default 30s)  
✅ **Auto-pause when no client** - Stream pauses when nobody is watching  
✅ **Configurable pause timeout** - Adjust how long before pause (default 2.1s)  
✅ **MQTT for motion** - Get motion alerts without keeping stream active  

**Best Practice:** Only enable streaming when actively viewing, then let auto-disable handle it!

### System Requirements

#### Linux (Debian/Ubuntu/Proxmox)
\`\`\`bash
# GStreamer RTSP Server (REQUIRED for neolink)
sudo apt update && sudo apt install gstreamer1.0-rtsp

# ffmpeg (OPTIONAL - for snapshot feature)
sudo apt install ffmpeg
\`\`\`

#### Fedora/RHEL
\`\`\`bash
sudo dnf install gstreamer1-rtsp-server ffmpeg
\`\`\`

#### Arch Linux
\`\`\`bash
sudo pacman -S gst-rtsp-server ffmpeg
\`\`\`

#### macOS / Windows
No additional dependencies needed (GStreamer bundled in neolink binary).  
Optional: Install ffmpeg for snapshot feature.

**Note:** The adapter will check for these dependencies at startup and log clear installation instructions if missing.

(Section continues... see full file for complete docs)
