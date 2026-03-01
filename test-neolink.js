#!/usr/bin/env node
/**
 * Minimal Neolink Test
 * Tests neolink spawning without ioBroker
 */

const { NeolinkManager } = require('./build/neolink-manager');
const path = require('path');
const fs = require('fs');

async function test() {
    console.log('🧪 Neolink Test Start\n');

    // Create temp dir
    const dataDir = '/tmp/neolink-test';
    if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
    }

    // Initialize manager
    const manager = new NeolinkManager(dataDir, (cam, level, msg) => {
        console.log(`[${level.toUpperCase()}] [${cam}] ${msg}`);
    });

    // Camera config
    const config = {
        name: 'Camera01',
        username: 'admin',
        password: 'fcdkxezn',
        uid: '95270005ODHZABIH',
        address: '192.168.30.24'
    };

    try {
        console.log('Starting neolink for', config.name);
        await manager.start(config);

        console.log('\n✅ Neolink started!');
        console.log('RTSP URLs:');
        console.log('  Main:', manager.getRtspUrl(config.name, 'mainStream'));
        console.log('  Sub:', manager.getRtspUrl(config.name, 'subStream'));

        console.log('\nPress Ctrl+C to stop...');
        
        // Keep running
        process.on('SIGINT', async () => {
            console.log('\n\n🛑 Stopping neolink...');
            await manager.stopAll();
            console.log('✅ Stopped. Cleanup done.');
            process.exit(0);
        });

    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    }
}

test();
