/**
 * Neolink Process Manager
 *
 * Manages TWO separate neolink processes:
 * 1. RTSP process (always running) - provides RTSP streams
 * 2. MQTT process (on-demand) - publishes motion/battery/floodlight to MQTT broker
 */

import type { ChildProcess } from 'child_process';
import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { getNeolinkBinary } from './neolink-binary';

export interface NeolinkConfig {
    name: string;
    username: string;
    password: string;
    uid: string;
    address: string;
    mqttBroker?: string;
    mqttPort?: number;
    mqttUser?: string;
    mqttPassword?: string;
    pauseTimeout?: number;
    enableFloodlight?: boolean;
}

export interface NeolinkProcess {
    process: ChildProcess;
    config: NeolinkConfig;
    configPath: string;
    startedAt: Date;
    mode: 'rtsp' | 'mqtt';
}

export class NeolinkManager {
    private rtspProcess: NeolinkProcess | null = null;
    private mqttProcess: NeolinkProcess | null = null;
    private dataDir: string;
    private logCallback?: (cameraName: string, level: string, message: string) => void;

    constructor(dataDir: string, logCallback?: (cameraName: string, level: string, message: string) => void) {
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
    public async startRtsp(config: NeolinkConfig): Promise<void> {
        if (this.rtspProcess) {
            throw new Error(`RTSP process already running for camera: ${config.name}`);
        }

        const binary = getNeolinkBinary();
        this.log(config.name, 'info', `Starting RTSP process: ${binary.path} (${binary.platform}/${binary.arch})`);

        // Generate RTSP-only config (no MQTT section)
        const configPath = this.generateRtspConfig(config);

        // Spawn neolink RTSP process
        const proc = spawn(binary.path, ['rtsp', '--config', configPath], {
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

        this.log(config.name, 'info', `RTSP process started (PID: ${proc.pid})`);
        await this.waitForReady(config.name, 'rtsp', 5000);
    }

    /**
     * Start MQTT process (publishes to MQTT broker)
     */
    public async startMqtt(config: NeolinkConfig): Promise<void> {
        if (this.mqttProcess) {
            throw new Error(`MQTT process already running for camera: ${config.name}`);
        }

        const binary = getNeolinkBinary();
        this.log(config.name, 'info', `Starting MQTT process: ${binary.path}`);

        // Generate MQTT-only config
        const configPath = this.generateMqttConfig(config);

        // Spawn neolink MQTT process
        const proc = spawn(binary.path, ['mqtt', '--config', configPath], {
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

        this.log(config.name, 'info', `MQTT process started (PID: ${proc.pid})`);
        await this.waitForReady(config.name, 'mqtt', 3000);
    }

    /**
     * Stop RTSP process
     */
    public async stopRtsp(): Promise<void> {
        if (!this.rtspProcess) {
            return;
        }

        await this.stopProcess(this.rtspProcess);
        this.rtspProcess = null;
    }

    /**
     * Stop MQTT process
     */
    public async stopMqtt(): Promise<void> {
        if (!this.mqttProcess) {
            return;
        }

        await this.stopProcess(this.mqttProcess);
        this.mqttProcess = null;
    }

    /**
     * Stop all neolink processes
     */
    public async stopAll(): Promise<void> {
        await Promise.all([this.stopRtsp(), this.stopMqtt()]);
    }

    /**
     * Check if RTSP process is running
     */
    public isRtspRunning(): boolean {
        return this.rtspProcess !== null && this.rtspProcess.process.exitCode === null;
    }

    /**
     * Check if MQTT process is running
     */
    public isMqttRunning(): boolean {
        return this.mqttProcess !== null && this.mqttProcess.process.exitCode === null;
    }

    /**
     * Get RTSP stream URL
     */
    public getRtspUrl(cameraName: string, stream: 'mainStream' | 'subStream' = 'mainStream'): string {
        return `rtsp://127.0.0.1:8554/${cameraName}/${stream}`;
    }

    /**
     * Generate RTSP-only config (no MQTT)
     */
    private generateRtspConfig(config: NeolinkConfig): string {
        const configPath = path.join(this.dataDir, `neolink-rtsp-${config.name}.toml`);

        const tomlContent = `
# Neolink RTSP config for ${config.name}
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
  timeout = ${config.pauseTimeout || 2.1}
`.trim();

        fs.writeFileSync(configPath, tomlContent, { mode: 0o600 });
        return configPath;
    }

    /**
     * Generate MQTT-only config
     */
    private generateMqttConfig(config: NeolinkConfig): string {
        const configPath = path.join(this.dataDir, `neolink-mqtt-${config.name}.toml`);

        const tomlContent = `
# Neolink MQTT config for ${config.name}
# Generated by ioBroker.reolink adapter

[[cameras]]
name = "${config.name}"
username = "${config.username}"
password = "${config.password}"
uid = "${config.uid}"
address = "${config.address}"
discovery = "local"

[cameras.mqtt]
  broker_addr = "${config.mqttBroker || '127.0.0.1'}"
  port = ${config.mqttPort || 1883}
  ${config.mqttUser ? `username = "${config.mqttUser}"` : ''}
  ${config.mqttPassword ? `password = "${config.mqttPassword}"` : ''}
  enable_motion = true
  enable_battery = true
  enable_floodlight = ${config.enableFloodlight !== false}
  enable_preview = true
  # Status topics that neolink will publish to
  discovery = [
    "neolink/${config.name}/status/motion",
    "neolink/${config.name}/status/battery_level",
    "neolink/${config.name}/status/floodlight",
    "neolink/${config.name}/status/preview"
  ]
  # Control topics that neolink will subscribe to  
  control = ["neolink/${config.name}/floodlight/set"]
`.trim();

        fs.writeFileSync(configPath, tomlContent, { mode: 0o600 });
        return configPath;
    }

    /**
     * Setup process handlers (stdout/stderr/exit/error)
     */
    private setupProcessHandlers(proc: ChildProcess, cameraName: string, mode: 'rtsp' | 'mqtt'): void {
        const prefix = mode.toUpperCase();

        proc.stdout?.on('data', (data: Buffer) => {
            const lines = data.toString().split('\n');
            lines.forEach(line => {
                if (line.trim()) {
                    this.log(cameraName, 'info', `[${prefix}] ${line.trim()}`);
                }
            });
        });

        proc.stderr?.on('data', (data: Buffer) => {
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
            } else {
                this.mqttProcess = null;
            }
        });

        proc.on('error', err => {
            this.log(cameraName, 'error', `${prefix} process error: ${err.message}`);
            if (mode === 'rtsp') {
                this.rtspProcess = null;
            } else {
                this.mqttProcess = null;
            }
        });
    }

    /**
     * Stop a process
     */
    private async stopProcess(procInfo: NeolinkProcess): Promise<void> {
        this.log(procInfo.config.name, 'info', `Stopping ${procInfo.mode.toUpperCase()} process...`);

        procInfo.process.kill('SIGTERM');

        await new Promise<void>(resolve => {
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

        if (fs.existsSync(procInfo.configPath)) {
            fs.unlinkSync(procInfo.configPath);
        }

        this.log(procInfo.config.name, 'info', `${procInfo.mode.toUpperCase()} process stopped`);
    }

    /**
     * Wait for process to be ready
     */
    private async waitForReady(cameraName: string, mode: 'rtsp' | 'mqtt', timeoutMs: number): Promise<void> {
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
    private log(cameraName: string, level: string, message: string): void {
        if (this.logCallback) {
            this.logCallback(cameraName, level, message);
        }
    }
}
