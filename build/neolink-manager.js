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
    /** Cached binary path after first successful download */
    cachedBinaryPath = null;
    constructor(dataDir, logCallback) {
        this.dataDir = dataDir;
        this.logCallback = logCallback;
        // Ensure data directory exists
        if (!fs.existsSync(this.dataDir)) {
            fs.mkdirSync(this.dataDir, { recursive: true });
        }
    }
    /**
     * Ensure the neolink binary is downloaded and return its path.
     * Downloads once on first call, then returns the cached path.
     */
    async ensureBinary() {
        if (this.cachedBinaryPath) {
            return this.cachedBinaryPath;
        }
        const binary = await (0, neolink_binary_1.ensureNeolinkBinary)(msg => this.log('neolink', 'info', msg));
        this.cachedBinaryPath = binary.path;
        return binary.path;
    }
    /**
     * Start RTSP process (provides RTSP streams)
     */
    async startRtsp(config) {
        if (this.rtspProcess) {
            throw new Error(`RTSP process already running for camera: ${config.name}`);
        }
        const binaryPath = await this.ensureBinary();
        this.log(config.name, 'debug', `Starting RTSP process: ${binaryPath}`);
        // Generate RTSP-only config (no MQTT section)
        const configPath = this.generateRtspConfig(config);
        // Spawn neolink RTSP process
        const proc = (0, child_process_1.spawn)(binaryPath, ['rtsp', '--config', configPath], {
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
        this.log(config.name, 'debug', `RTSP process started (PID: ${proc.pid})`);
        await this.waitForReady(config.name, 'rtsp', 5000);
    }
    /**
     * Start MQTT process (publishes to MQTT broker)
     */
    async startMqtt(config) {
        if (this.mqttProcess) {
            this.log(config.name, 'debug', 'MQTT process already running, stopping first...');
            await this.stopMqtt();
        }
        const binaryPath = await this.ensureBinary();
        this.log(config.name, 'debug', `Starting MQTT process: ${binaryPath}`);
        // Generate MQTT-only config
        const configPath = this.generateMqttConfig(config);
        // Spawn neolink MQTT process
        const proc = (0, child_process_1.spawn)(binaryPath, ['mqtt', '--config', configPath], {
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
        this.log(config.name, 'debug', `MQTT process started (PID: ${proc.pid})`);
        await this.waitForReady(config.name, 'mqtt', 3000);
    }
    /**
     * Kill any orphaned neolink processes from previous runs.
     * Uses pkill to find neolink processes matching our config directory.
     */
    async killOrphanedProcesses() {
        return new Promise(resolve => {
            (0, child_process_1.exec)(`pkill -f "neolink.*(mqtt|rtsp).*${this.dataDir.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`, () => {
                // pkill returns exit code 1 if no processes found — that's fine
                resolve();
            });
        });
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

[mqtt]
server = "${config.mqttBroker || '127.0.0.1'}"
port = ${config.mqttPort || 1883}
${config.mqttUser && config.mqttPassword ? `credentials = ["${config.mqttUser}", "${config.mqttPassword}"]` : ''}

[[cameras]]
name = "${config.name}"
username = '${config.username}'
password = '${config.password}'
uid = "${config.uid}"
address = "${config.address}"
discovery = "local"

[cameras.mqtt]
  enable_motion = true
  enable_battery = true
  enable_floodlight = ${config.enableFloodlight !== false}
  enable_pir = true
  battery_update = 10000
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
                    this.log(cameraName, 'debug', `[${prefix}] ${line.trim()}`);
                }
            });
        });
        proc.stderr?.on('data', (data) => {
            const lines = data.toString().split('\n');
            lines.forEach(line => {
                if (line.trim()) {
                    this.log(cameraName, 'debug', `[${prefix}] ${line.trim()}`);
                }
            });
        });
        proc.on('exit', (code, signal) => {
            // SIGTERM/SIGKILL = intentional stop by us → debug
            // unexpected exit (code != 0, no signal) → warn
            const intentional = signal === 'SIGTERM' || signal === 'SIGKILL';
            const level = intentional || code === 0 ? 'debug' : 'warn';
            this.log(cameraName, level, `${prefix} process exited (code: ${code}, signal: ${signal})`);
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
        this.log(procInfo.config.name, 'debug', `Stopping ${procInfo.mode.toUpperCase()} process...`);
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
        this.log(procInfo.config.name, 'debug', `${procInfo.mode.toUpperCase()} process stopped`);
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
        this.log(cameraName, 'debug', `${mode.toUpperCase()} process ready`);
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
     * Get the path to an available neolink config file (RTSP or MQTT).
     * PTZ and other CLI commands need any valid config with camera credentials.
     */
    getAvailableConfigPath() {
        if (!this.currentConfig) {
            throw new Error('Neolink not configured');
        }
        const rtspConfig = path.join(this.dataDir, `neolink-rtsp-${this.currentConfig.name}.toml`);
        if (fs.existsSync(rtspConfig)) {
            return rtspConfig;
        }
        const mqttConfig = path.join(this.dataDir, `neolink-mqtt-${this.currentConfig.name}.toml`);
        if (fs.existsSync(mqttConfig)) {
            return mqttConfig;
        }
        throw new Error('No neolink config found - start RTSP or MQTT first');
    }
    /**
     * Move PTZ camera to a stored preset via CLI
     */
    async ptzPreset(presetId) {
        if (!this.currentConfig) {
            throw new Error('Neolink not configured');
        }
        const configPath = this.getAvailableConfigPath();
        const neolinkBin = await this.ensureBinary();
        const cmd = `"${neolinkBin}" ptz --config="${configPath}" ${this.currentConfig.name} preset ${presetId}`;
        this.log(this.currentConfig.name, 'debug', `PTZ preset command: ${cmd}`);
        return new Promise((resolve, reject) => {
            (0, child_process_1.exec)(cmd, { timeout: 10000 }, (error, _stdout, stderr) => {
                if (error) {
                    this.log(this.currentConfig.name, 'error', `PTZ preset failed: ${error.message}`);
                    reject(new Error(`PTZ preset failed: ${error.message}`));
                    return;
                }
                if (stderr) {
                    this.log(this.currentConfig.name, 'debug', `PTZ preset stderr: ${stderr.trim()}`);
                }
                this.log(this.currentConfig.name, 'debug', `PTZ moved to preset ${presetId}`);
                resolve();
            });
        });
    }
    /**
     * Move PTZ camera in a direction via CLI
     * direction: left | right | up | down | stop
     * amount: number of steps (use 1 for directional, 0 for stop)
     * speed: optional movement speed
     */
    async ptzMove(direction, amount = 1, speed) {
        if (!this.currentConfig) {
            throw new Error('Neolink not configured');
        }
        const configPath = this.getAvailableConfigPath();
        const neolinkBin = await this.ensureBinary();
        const speedArg = speed !== undefined ? ` ${speed}` : '';
        const cmd = `"${neolinkBin}" ptz --config="${configPath}" ${this.currentConfig.name} control ${amount} ${direction}${speedArg}`;
        this.log(this.currentConfig.name, 'debug', `PTZ move command: ${cmd}`);
        return new Promise((resolve, reject) => {
            (0, child_process_1.exec)(cmd, { timeout: 10000 }, (error, _stdout, stderr) => {
                if (error) {
                    this.log(this.currentConfig.name, 'error', `PTZ move failed: ${error.message}`);
                    reject(new Error(`PTZ move failed: ${error.message}`));
                    return;
                }
                if (stderr) {
                    this.log(this.currentConfig.name, 'debug', `PTZ move stderr: ${stderr.trim()}`);
                }
                this.log(this.currentConfig.name, 'debug', `PTZ moved ${direction}`);
                resolve();
            });
        });
    }
    /**
     * Query PIR status via CLI
     * Returns XML: <RfAlarmCfg>...<enable>1</enable>...</RfAlarmCfg>
     */
    async queryPirStatus() {
        const configPath = this.getAvailableConfigPath();
        const neolinkBin = await this.ensureBinary();
        const cmd = `"${neolinkBin}" pir --config="${configPath}" ${this.currentConfig.name}`;
        this.log(this.currentConfig.name, 'debug', `Querying PIR status: ${cmd}`);
        return new Promise((resolve, reject) => {
            (0, child_process_1.exec)(cmd, { timeout: 15000 }, (error, stdout, stderr) => {
                if (error) {
                    reject(new Error(`PIR query failed: ${error.message}`));
                    return;
                }
                if (stderr) {
                    this.log(this.currentConfig.name, 'debug', `PIR query stderr: ${stderr.trim()}`);
                }
                const output = stdout.trim();
                this.log(this.currentConfig.name, 'debug', `PIR query response: ${output}`);
                resolve(output);
            });
        });
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
        const neolinkBin = await this.ensureBinary();
        const cmd = `"${neolinkBin}" battery --config="${configPath}" ${this.currentConfig.name}`;
        this.log(this.currentConfig.name, 'debug', `Querying battery status: ${cmd}`);
        return new Promise((resolve, reject) => {
            (0, child_process_1.exec)(cmd, { timeout: 15000 }, (error, stdout, stderr) => {
                if (error) {
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