/**
 * MQTT Helper for Battery Camera Features
 * 
 * Provides MQTT client for floodlight control via neolink.
 */

import * as mqtt from 'mqtt';

export interface MqttConfig {
    broker: string;
    port?: number;
    username?: string;
    password?: string;
}

export class MqttHelper {
    private client: mqtt.MqttClient | null = null;
    private config: MqttConfig;
    private logCallback?: (level: string, message: string) => void;

    constructor(config: MqttConfig, logCallback?: (level: string, message: string) => void) {
        this.config = config;
        this.logCallback = logCallback;
    }

    /**
     * Connect to MQTT broker
     */
    public async connect(): Promise<void> {
        return new Promise((resolve, reject) => {
            const url = `mqtt://${this.config.broker}:${this.config.port || 1883}`;
            
            this.client = mqtt.connect(url, {
                username: this.config.username,
                password: this.config.password,
                reconnectPeriod: 5000
            });

            this.client.on('connect', () => {
                this.log('info', `Connected to MQTT broker: ${url}`);
                resolve();
            });

            this.client.on('error', (err: Error) => {
                this.log('error', `MQTT error: ${err.message}`);
                reject(err);
            });

            this.client.on('offline', () => {
                this.log('warn', 'MQTT client offline');
            });

            this.client.on('reconnect', () => {
                this.log('info', 'MQTT reconnecting...');
            });
        });
    }

    /**
     * Disconnect from MQTT broker
     */
    public async disconnect(): Promise<void> {
        if (this.client) {
            return new Promise((resolve) => {
                this.client!.end(false, () => {
                    this.log('info', 'MQTT client disconnected');
                    resolve();
                });
            });
        }
    }

    /**
     * Publish message to topic
     */
    public async publish(topic: string, message: string): Promise<void> {
        if (!this.client || !this.client.connected) {
            throw new Error('MQTT client not connected');
        }

        return new Promise((resolve, reject) => {
            this.client!.publish(topic, message, (err) => {
                if (err) {
                    reject(err);
                } else {
                    this.log('info', `Published to ${topic}: ${message}`);
                    resolve();
                }
            });
        });
    }

    /**
     * Control floodlight via neolink MQTT
     */
    public async setFloodlight(cameraName: string, enabled: boolean): Promise<void> {
        const topic = `neolink/${cameraName}/floodlight/set`;
        const message = enabled ? 'on' : 'off';
        await this.publish(topic, message);
    }

    private log(level: string, message: string): void {
        if (this.logCallback) {
            this.logCallback(level, message);
        }
    }
}
