"use strict";
/**
 * Neolink Process Manager
 *
 * Spawns and manages neolink processes for battery-powered cameras.
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.NeolinkManager = void 0;
const child_process_1 = require("child_process");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const neolink_binary_1 = require("./neolink-binary");
class NeolinkManager {
    processes = new Map();
    dataDir;
    logCallback;
    constructor(dataDir, logCallback) {
        this.dataDir = dataDir;
        this.logCallback = logCallback;
        // Ensure data directory exists
        if (!fs.existsSync(this.dataDir)) {
            fs.mkdirSync(this.dataDir, { recursive: true });
        }
    }
    /**
     * Start neolink for a camera
     */
    async start(config) {
        // Check if already running
        if (this.processes.has(config.name)) {
            throw new Error(`Neolink already running for camera: ${config.name}`);
        }
        // Get binary
        const binary = (0, neolink_binary_1.getNeolinkBinary)();
        this.log(config.name, 'info', `Using neolink binary: ${binary.path} (${binary.platform}/${binary.arch})`);
        // Generate config file
        const configPath = await this.generateConfig(config);
        // Spawn neolink process
        const args = ['rtsp', '--config', configPath];
        const proc = (0, child_process_1.spawn)(binary.path, args, {
            cwd: this.dataDir,
            stdio: ['ignore', 'pipe', 'pipe']
        });
        // Handle stdout
        proc.stdout?.on('data', (data) => {
            const lines = data.toString().split('\n');
            lines.forEach(line => {
                if (line.trim()) {
                    this.log(config.name, 'info', `[neolink] ${line.trim()}`);
                }
            });
        });
        // Handle stderr
        proc.stderr?.on('data', (data) => {
            const lines = data.toString().split('\n');
            lines.forEach(line => {
                if (line.trim()) {
                    this.log(config.name, 'warn', `[neolink] ${line.trim()}`);
                }
            });
        });
        // Handle process exit
        proc.on('exit', (code, signal) => {
            this.log(config.name, 'warn', `Neolink process exited (code: ${code}, signal: ${signal})`);
            this.processes.delete(config.name);
        });
        // Handle process error
        proc.on('error', (err) => {
            this.log(config.name, 'error', `Neolink process error: ${err.message}`);
            this.processes.delete(config.name);
        });
        // Store process
        this.processes.set(config.name, {
            process: proc,
            config,
            configPath,
            startedAt: new Date()
        });
        this.log(config.name, 'info', `Neolink started (PID: ${proc.pid})`);
        // Wait for RTSP server to be ready (give it 5 seconds)
        await this.waitForReady(config.name, 5000);
    }
    /**
     * Stop neolink for a camera
     */
    async stop(cameraName) {
        const procInfo = this.processes.get(cameraName);
        if (!procInfo) {
            throw new Error(`Neolink not running for camera: ${cameraName}`);
        }
        this.log(cameraName, 'info', 'Stopping neolink...');
        // Kill process
        procInfo.process.kill('SIGTERM');
        // Wait for exit (with timeout)
        await new Promise((resolve) => {
            const timeout = setTimeout(() => {
                // Force kill if not exited
                if (procInfo.process.exitCode === null) {
                    this.log(cameraName, 'warn', 'Force killing neolink (SIGKILL)');
                    procInfo.process.kill('SIGKILL');
                }
                resolve();
            }, 5000);
            procInfo.process.on('exit', () => {
                clearTimeout(timeout);
                resolve();
            });
        });
        // Clean up config file
        if (fs.existsSync(procInfo.configPath)) {
            fs.unlinkSync(procInfo.configPath);
        }
        this.processes.delete(cameraName);
        this.log(cameraName, 'info', 'Neolink stopped');
    }
    /**
     * Stop all neolink processes
     */
    async stopAll() {
        const cameras = Array.from(this.processes.keys());
        await Promise.all(cameras.map(name => this.stop(name)));
    }
    /**
     * Check if neolink is running for a camera
     */
    isRunning(cameraName) {
        return this.processes.has(cameraName);
    }
    /**
     * Get RTSP stream URL for a camera
     */
    getRtspUrl(cameraName, stream = 'mainStream') {
        return `rtsp://127.0.0.1:8554/${cameraName}/${stream}`;
    }
    /**
     * Generate neolink config file (TOML format)
     */
    async generateConfig(config) {
        const configPath = path.join(this.dataDir, `neolink-${config.name}.toml`);
        const tomlContent = `
# Neolink config for ${config.name}
# Generated by ioBroker.reolink adapter

[[cameras]]
name = "${config.name}"
username = "${config.username}"
password = "${config.password}"
uid = "${config.uid}"
address = "${config.address}"
discovery = "local"
idle_disconnect = true

[cameras.pause]
  on_motion = true
  on_client = true
  timeout = 2.1

[cameras.mqtt]
  enable_motion = false
  enable_floodlight = false
  enable_preview = false
  enable_battery = false
`.trim();
        // Write config with restrictive permissions
        fs.writeFileSync(configPath, tomlContent, { mode: 0o600 });
        return configPath;
    }
    /**
     * Wait for neolink to be ready
     */
    async waitForReady(cameraName, timeoutMs) {
        const startTime = Date.now();
        while (Date.now() - startTime < timeoutMs) {
            // Check if process still running
            const procInfo = this.processes.get(cameraName);
            if (!procInfo || procInfo.process.exitCode !== null) {
                throw new Error(`Neolink process died during startup`);
            }
            // Simple delay (in real implementation, could check RTSP port)
            await new Promise(resolve => setTimeout(resolve, 500));
        }
        this.log(cameraName, 'info', 'Neolink RTSP server ready');
    }
    /**
     * Log helper
     */
    log(cameraName, level, message) {
        if (this.logCallback) {
            this.logCallback(cameraName, level, message);
        }
    }
}
exports.NeolinkManager = NeolinkManager;
//# sourceMappingURL=neolink-manager.js.map