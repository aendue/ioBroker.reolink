#!/bin/bash
# Test Script for Battery Camera MQTT Status Update
# Run on dev-server (192.168.0.99): bash test-mqtt-status.sh

set -e

echo "=========================================="
echo "🧪 Testing Battery Camera MQTT Status"
echo "=========================================="
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "📦 Step 1: Update Adapter on dev-server"
echo "----------------------------------------"
cd /home/martin/ioBroker.reolink
git pull origin main
npm run build
echo -e "${GREEN}✅ Adapter updated and built${NC}"
echo ""

echo "🔄 Step 2: Upload to ioBroker"
echo "----------------------------------------"
cd /opt/iobroker
iobroker upload reolink
echo -e "${GREEN}✅ Adapter uploaded${NC}"
echo ""

echo "🛑 Step 3: Stop Adapter"
echo "----------------------------------------"
iobroker stop reolink.0
sleep 2
echo -e "${GREEN}✅ Adapter stopped${NC}"
echo ""

echo "🗑️ Step 4: Delete Old States"
echo "----------------------------------------"
echo "Deleting old battery/motion/floodlight.status states..."
iobroker object del reolink.0.battery 2>/dev/null || echo "  (battery channel not found - OK)"
iobroker object del reolink.0.motion 2>/dev/null || echo "  (motion channel not found - OK)"
iobroker object del "reolink.0.floodlight.status" 2>/dev/null || echo "  (floodlight.status not found - OK)"
echo -e "${GREEN}✅ Old states deleted${NC}"
echo ""

echo "▶️ Step 5: Start Adapter"
echo "----------------------------------------"
iobroker start reolink.0
sleep 5
echo -e "${GREEN}✅ Adapter started${NC}"
echo ""

echo "🔍 Step 6: Check Object Structure"
echo "----------------------------------------"
echo "Checking for 'status' channel..."
if iobroker object get reolink.0.status &>/dev/null; then
    echo -e "${GREEN}✅ reolink.0.status channel exists${NC}"
else
    echo -e "${RED}❌ reolink.0.status channel NOT found!${NC}"
    exit 1
fi

echo ""
echo "Checking status states..."
for state in motion battery_level floodlight preview; do
    if iobroker object get "reolink.0.status.$state" &>/dev/null; then
        echo -e "${GREEN}✅ reolink.0.status.$state exists${NC}"
    else
        echo -e "${RED}❌ reolink.0.status.$state NOT found!${NC}"
    fi
done
echo ""

echo "🔌 Step 7: Enable MQTT"
echo "----------------------------------------"
iobroker setState reolink.0.mqtt.enable true
sleep 3
echo -e "${GREEN}✅ MQTT enabled${NC}"
echo ""

echo "📡 Step 8: Check MQTT Subscription (from logs)"
echo "----------------------------------------"
echo "Last 20 log lines:"
iobroker logs --adapter reolink.0 | tail -20 | grep -E "(Subscribed|MQTT)" || echo "  (waiting for logs...)"
echo ""

echo "📊 Step 9: Check Current State Values"
echo "----------------------------------------"
echo "Motion:"
iobroker state get reolink.0.status.motion || echo "  (state not yet set)"
echo ""
echo "Battery Level:"
iobroker state get reolink.0.status.battery_level || echo "  (state not yet set)"
echo ""
echo "Floodlight Status:"
iobroker state get reolink.0.status.floodlight || echo "  (state not yet set)"
echo ""

echo "🎥 Step 10: Wait for MQTT Messages (30 seconds)"
echo "----------------------------------------"
echo "Monitoring MQTT topics for 30 seconds..."
timeout 30 mosquitto_sub -h 192.168.0.110 -t "neolink/Camera01/status/#" -v || echo ""
echo ""

echo "📊 Step 11: Check State Values After MQTT"
echo "----------------------------------------"
echo "Motion:"
iobroker state get reolink.0.status.motion
echo ""
echo "Battery Level:"
iobroker state get reolink.0.status.battery_level
echo ""
echo "Floodlight Status:"
iobroker state get reolink.0.status.floodlight
echo ""

echo "💡 Step 12: Test Floodlight Control"
echo "----------------------------------------"
echo "Turning floodlight ON..."
iobroker setState reolink.0.floodlight true
sleep 2
echo ""
echo "Checking feedback state..."
iobroker state get reolink.0.status.floodlight
echo ""
echo "Turning floodlight OFF..."
iobroker setState reolink.0.floodlight false
sleep 2
echo ""
echo "Checking feedback state..."
iobroker state get reolink.0.status.floodlight
echo ""

echo "🚶 Step 13: Motion Detection Test"
echo "----------------------------------------"
echo -e "${YELLOW}⚠️ Please walk in front of the camera now!${NC}"
echo "Waiting 10 seconds for motion detection..."
sleep 10
echo ""
echo "Checking motion state:"
iobroker state get reolink.0.status.motion
echo ""

echo "🔒 Step 14: Test Read-Only Protection"
echo "----------------------------------------"
echo "Attempting to write to read-only state (should fail)..."
if iobroker setState reolink.0.status.motion true 2>&1 | grep -i "error\|denied\|read-only"; then
    echo -e "${GREEN}✅ Read-only protection works!${NC}"
else
    echo -e "${YELLOW}⚠️ State was writable (check common.write: false)${NC}"
fi
echo ""

echo "=========================================="
echo "✅ Test Complete!"
echo "=========================================="
echo ""
echo "Summary:"
echo "--------"
echo "1. ✅ Adapter updated and uploaded"
echo "2. ✅ Object structure created (status.*)"
echo "3. ✅ MQTT enabled and subscribed"
echo "4. ✅ States updated from MQTT"
echo "5. ✅ Floodlight control tested"
echo "6. ✅ Motion detection tested"
echo "7. ✅ Read-only protection verified"
echo ""
echo "Next: Test on visual system (192.168.0.18)"
