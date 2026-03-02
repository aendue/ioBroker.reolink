"use strict";
/**
 * Neolink Process Manager
 *
 * Manages TWO separate neolink processes:
 * 1. RTSP process (always running) - provides RTSP streams
 * 2. MQTT process (on-demand) - publishes motion/battery/floodlight to MQTT broker
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
    rtspProcess = null;
    mqttProcess = null;
    currentConfig = null;
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
     * Start RTSP process (provides RTSP streams)
     */
    async startRtsp(config) {
        if (this.rtspProcess) {
            throw new Error(`RTSP process already running for camera: ${config.name}`);
        }
        const binary = (0, neolink_binary_1.getNeolinkBinary)();
        this.log(config.name, 'info', `Starting RTSP process: ${binary.path} (${binary.platform}/${binary.arch})`);
        // Generate RTSP-only config (no MQTT section)
        const configPath = this.generateRtspConfig(config);
        // Spawn neolink RTSP process
        const proc = (0, child_process_1.spawn)(binary.path, ['rtsp', '--config', configPath], {
            cwd: this.dataDir,
            stdio: ['ignore', 'pipe', 'pipe'],
        });
        this.setupProcessHandlers(proc, config.name, 'rtsp');
        this.rtspProcess = {
            process: proc,
            config,
            configPath,
            startedAt: new Date(),
            mode: 'rtsp',
        };
        // Store config for battery queries
        this.currentConfig = config;
        this.log(config.name, 'info', `RTSP process started (PID: ${proc.pid})`);
        await this.waitForReady(config.name, 'rtsp', 5000);
    }
    /**
     * Start MQTT process (publishes to MQTT broker)
     */
    async startMqtt(config) {
        if (this.mqttProcess) {
            throw new Error(`MQTT process already running for camera: ${config.name}`);
        }
        const binary = (0, neolink_binary_1.getNeolinkBinary)();
        this.log(config.name, 'info', `Starting MQTT process: ${binary.path}`);
        // Generate MQTT-only config
        const configPath = this.generateMqttConfig(config);
        // Spawn neolink MQTT process
        const proc = (0, child_process_1.spawn)(binary.path, ['mqtt', '--config', configPath], {
            cwd: this.dataDir,
            stdio: ['ignore', 'pipe', 'pipe'],
        });
        this.setupProcessHandlers(proc, config.name, 'mqtt');
        this.mqttProcess = {
            process: proc,
            config,
            configPath,
            startedAt: new Date(),
            mode: 'mqtt',
        };
        // Store config for battery queries
        this.currentConfig = config;
        this.log(config.name, 'info', `MQTT process started (PID: ${proc.pid})`);
        await this.waitForReady(config.name, 'mqtt', 3000);
    }
    /**
     * Stop RTSP process
     */
    async stopRtsp() {
        if (!this.rtspProcess) {
            return;
        }
        await this.stopProcess(this.rtspProcess);
        this.rtspProcess = null;
    }
    /**
     * Stop MQTT process
     */
    async stopMqtt() {
        if (!this.mqttProcess) {
            return;
        }
        await this.stopProcess(this.mqttProcess);
        this.mqttProcess = null;
    }
    /**
     * Stop all neolink processes
     */
    async stopAll() {
        await Promise.all([this.stopRtsp(), this.stopMqtt()]);
    }
    /**
     * Check if RTSP process is running
     */
    isRtspRunning() {
        return this.rtspProcess !== null && this.rtspProcess.process.exitCode === null;
    }
    /**
     * Check if MQTT process is running
     */
    isMqttRunning() {
        return this.mqttProcess !== null && this.mqttProcess.process.exitCode === null;
    }
    /**
     * Get RTSP stream URL
     */
    getRtspUrl(cameraName, stream = 'mainStream') {
        return `rtsp://127.0.0.1:8554/${cameraName}/${stream}`;
    }
    /**
     * Generate RTSP-only config (no MQTT)
     */
    generateRtspConfig(config) {
        const configPath = path.join(this.dataDir, `neolink-rtsp-${config.name}.toml`);
        // TOML: Use literal strings (single quotes) for passwords to avoid escape issues
        // Literal strings treat backslashes as-is, no escaping needed
        const tomlContent = `
# Neolink RTSP config for ${config.name}
# Generated by ioBroker.reolink adapter

[[cameras]]
name = "${config.name}"
username = '${config.username}'
password = '${config.password}'
uid = "${config.uid}"
address = "${config.address}"
discovery = "local"
idle_disconnect = true

[cameras.pause]
  on_motion = true
  on_client = true
  timeout = ${config.pauseTimeout || 2.1}
`.trim();
        fs.writeFileSync(configPath, tomlContent, { mode: 0o600 });
        this.log(config.name, 'debug', `RTSP config written to: ${configPath}`);
        return configPath;
    }
    /**
     * Generate MQTT-only config
     */
    generateMqttConfig(config) {
        const configPath = path.join(this.dataDir, `neolink-mqtt-${config.name}.toml`);
        // TOML: Use literal strings (single quotes) for passwords to avoid escape issues
        // Literal strings treat backslashes as-is, no escaping needed
        const tomlContent = `
# Neolink MQTT config for ${config.name}
# Generated by ioBroker.reolink adapter

[[cameras]]
name = "${config.name}"
username = '${config.username}'
password = '${config.password}'
uid = "${config.uid}"
address = "${config.address}"
discovery = "local"

[cameras.mqtt]
  broker_addr = "${config.mqttBroker || '127.0.0.1'}"
  port = ${config.mqttPort || 1883}
  ${config.mqttUser ? `username = '${config.mqttUser}'` : ''}
  ${config.mqttPassword ? `password = '${config.mqttPassword}'` : ''}
  enable_motion = true
  enable_battery = true
  enable_floodlight = ${config.enableFloodlight !== false}
  enable_preview = true
  battery_update = 10000
  preview_update = 10000
  floodlight_update = 10000
`.trim();
        fs.writeFileSync(configPath, tomlContent, { mode: 0o600 });
        this.log(config.name, 'debug', `MQTT config written to: ${configPath}`);
        return configPath;
    }
    /**
     * Setup process handlers (stdout/stderr/exit/error)
     */
    setupProcessHandlers(proc, cameraName, mode) {
        const prefix = mode.toUpperCase();
        proc.stdout?.on('data', (data) => {
            const lines = data.toString().split('\n');
            lines.forEach(line => {
                if (line.trim()) {
                    this.log(cameraName, 'info', `[${prefix}] ${line.trim()}`);
                }
            });
        });
        proc.stderr?.on('data', (data) => {
            const lines = data.toString().split('\n');
            lines.forEach(line => {
                if (line.trim()) {
                    this.log(cameraName, 'warn', `[${prefix}] ${line.trim()}`);
                }
            });
        });
        proc.on('exit', (code, signal) => {
            this.log(cameraName, 'warn', `${prefix} process exited (code: ${code}, signal: ${signal})`);
            if (mode === 'rtsp') {
                this.rtspProcess = null;
            }
            else {
                this.mqttProcess = null;
            }
        });
        proc.on('error', err => {
            this.log(cameraName, 'error', `${prefix} process error: ${err.message}`);
            if (mode === 'rtsp') {
                this.rtspProcess = null;
            }
            else {
                this.mqttProcess = null;
            }
        });
    }
    /**
     * Stop a process
     */
    async stopProcess(procInfo) {
        this.log(procInfo.config.name, 'info', `Stopping ${procInfo.mode.toUpperCase()} process...`);
        procInfo.process.kill('SIGTERM');
        await new Promise(resolve => {
            const timeout = setTimeout(() => {
                if (procInfo.process.exitCode === null) {
                    this.log(procInfo.config.name, 'warn', `Force killing ${procInfo.mode.toUpperCase()} (SIGKILL)`);
                    procInfo.process.kill('SIGKILL');
                }
                resolve();
            }, 5000);
            procInfo.process.on('exit', () => {
                clearTimeout(timeout);
                resolve();
            });
        });
        // DON'T delete config file - battery queries still need it!
        // Config will be regenerated when process starts again
        this.log(procInfo.config.name, 'debug', `Config file kept at: ${procInfo.configPath}`);
        this.log(procInfo.config.name, 'info', `${procInfo.mode.toUpperCase()} process stopped`);
    }
    /**
     * Wait for process to be ready
     */
    async waitForReady(cameraName, mode, timeoutMs) {
        const startTime = Date.now();
        while (Date.now() - startTime < timeoutMs) {
            const procInfo = mode === 'rtsp' ? this.rtspProcess : this.mqttProcess;
            if (!procInfo || procInfo.process.exitCode !== null) {
                throw new Error(`${mode.toUpperCase()} process died during startup`);
            }
            await new Promise(resolve => setTimeout(resolve, 500));
        }
        this.log(cameraName, 'info', `${mode.toUpperCase()} process ready`);
    }
    /**
     * Log helper
     */
    log(cameraName, level, message) {
        if (this.logCallback) {
            this.logCallback(cameraName, level, message);
        }
    }
    /**
     * Query battery status via CLI (while MQTT subprocess is running)
     */
    async queryBatteryStatus() {
        if (!this.currentConfig) {
            throw new Error('Neolink not configured');
        }
        const configPath = path.join(this.dataDir, `neolink-mqtt-${this.currentConfig.name}.toml`);
        if (!fs.existsSync(configPath)) {
            throw new Error('MQTT config not found - start MQTT first');
        }
        const neolinkBin = (0, neolink_binary_1.getNeolinkBinary)().path;
        const cmd = `"${neolinkBin}" battery --config="${configPath}" ${this.currentConfig.name}`;
        this.log(this.currentConfig.name, 'debug', `Querying battery status: ${cmd}`);
        return new Promise((resolve, reject) => {
            (0, child_process_1.exec)(cmd, { timeout: 15000 }, (error, stdout, stderr) => {
                if (error) {
                    this.log(this.currentConfig.name, 'error', `Battery query failed: ${error.message}`);
                    reject(new Error(`Battery query failed: ${error.message}`));
                    return;
                }
                if (stderr) {
                    this.log(this.currentConfig.name, 'debug', `Battery query stderr: ${stderr.trim()}`);
                }
                const output = stdout.trim();
                this.log(this.currentConfig.name, 'debug', `Battery query response: ${output}`);
                resolve(output);
            });
        });
    }
}
exports.NeolinkManager = NeolinkManager;
//# sourceMappingURL=neolink-manager.js.map