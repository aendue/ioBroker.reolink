/**
 * Neolink Process Manager
 * 
 * Spawns and manages neolink processes for battery-powered cameras.
 */

import { ChildProcess, spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { getNeolinkBinary } from './neolink-binary';

export interface NeolinkConfig {
    name: string;
    username: string;
    password: string;
    uid: string;
    address: string;
    enableMqtt?: boolean;
    mqttBroker?: string;
    mqttPort?: number;
    mqttUser?: string;
    mqttPassword?: string;
}

export interface NeolinkProcess {
    process: ChildProcess;
    config: NeolinkConfig;
    configPath: string;
    startedAt: Date;
}

export class NeolinkManager {
    private processes: Map<string, NeolinkProcess> = new Map();
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
     * Start neolink for a camera
     */
    public async start(config: NeolinkConfig): Promise<void> {
        // Check if already running
        if (this.processes.has(config.name)) {
            throw new Error(`Neolink already running for camera: ${config.name}`);
        }

        // Get binary
        const binary = getNeolinkBinary();
        this.log(config.name, 'info', `Using neolink binary: ${binary.path} (${binary.platform}/${binary.arch})`);

        // Generate config file
        const configPath = await this.generateConfig(config);

        // Spawn neolink process
        const args = ['rtsp', '--config', configPath];
        const proc = spawn(binary.path, args, {
            cwd: this.dataDir,
            stdio: ['ignore', 'pipe', 'pipe']
        });

        // Handle stdout
        proc.stdout?.on('data', (data: Buffer) => {
            const lines = data.toString().split('\n');
            lines.forEach(line => {
                if (line.trim()) {
                    this.log(config.name, 'info', `[neolink] ${line.trim()}`);
                }
            });
        });

        // Handle stderr
        proc.stderr?.on('data', (data: Buffer) => {
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
    public async stop(cameraName: string): Promise<void> {
        const procInfo = this.processes.get(cameraName);
        if (!procInfo) {
            throw new Error(`Neolink not running for camera: ${cameraName}`);
        }

        this.log(cameraName, 'info', 'Stopping neolink...');

        // Kill process
        procInfo.process.kill('SIGTERM');

        // Wait for exit (with timeout)
        await new Promise<void>((resolve) => {
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
    public async stopAll(): Promise<void> {
        const cameras = Array.from(this.processes.keys());
        await Promise.all(cameras.map(name => this.stop(name)));
    }

    /**
     * Check if neolink is running for a camera
     */
    public isRunning(cameraName: string): boolean {
        return this.processes.has(cameraName);
    }

    /**
     * Get RTSP stream URL for a camera
     */
    public getRtspUrl(cameraName: string, stream: 'mainStream' | 'subStream' = 'mainStream'): string {
        return `rtsp://127.0.0.1:8554/${cameraName}/${stream}`;
    }

    /**
     * Generate neolink config file (TOML format)
     */
    private async generateConfig(config: NeolinkConfig): Promise<string> {
        const configPath = path.join(this.dataDir, `neolink-${config.name}.toml`);

        // MQTT section (optional)
        let mqttSection = '';
        if (config.enableMqtt && config.mqttBroker) {
            mqttSection = `
[cameras.mqtt]
  broker_addr = "${config.mqttBroker}"
  port = ${config.mqttPort || 1883}
  ${config.mqttUser ? `username = "${config.mqttUser}"` : ''}
  ${config.mqttPassword ? `password = "${config.mqttPassword}"` : ''}
  enable_motion = true
  enable_battery = true
  enable_preview = false
  enable_floodlight = false
`;
        } else {
            mqttSection = `
[cameras.mqtt]
  enable_motion = false
  enable_floodlight = false
  enable_preview = false
  enable_battery = false
`;
        }

        const tomlContent = `
# Neolink config for ${config.name}
# Generated by ioBroker.reolink adapter
# Battery Saving Mode: Stream pauses when no client connected

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
${mqttSection}
`.trim();

        // Write config with restrictive permissions
        fs.writeFileSync(configPath, tomlContent, { mode: 0o600 });

        return configPath;
    }

    /**
     * Wait for neolink to be ready
     */
    private async waitForReady(cameraName: string, timeoutMs: number): Promise<void> {
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
    private log(cameraName: string, level: string, message: string): void {
        if (this.logCallback) {
            this.logCallback(cameraName, level, message);
        }
    }
}
