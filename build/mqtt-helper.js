"use strict";
/**
 * MQTT Helper for Battery Camera Features
 *
 * Provides MQTT client for floodlight control via neolink.
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
exports.MqttHelper = void 0;
const mqtt = __importStar(require("mqtt"));
class MqttHelper {
    client = null;
    config;
    logCallback;
    constructor(config, logCallback) {
        this.config = config;
        this.logCallback = logCallback;
    }
    /**
     * Connect to MQTT broker
     */
    async connect() {
        return new Promise((resolve, reject) => {
            const url = `mqtt://${this.config.broker}:${this.config.port || 1883}`;
            this.client = mqtt.connect(url, {
                username: this.config.username,
                password: this.config.password,
                reconnectPeriod: 5000,
            });
            this.client.on('connect', () => {
                this.log('info', `Connected to MQTT broker: ${url}`);
                resolve();
            });
            this.client.on('error', (err) => {
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
    async disconnect() {
        if (this.client) {
            return new Promise(resolve => {
                this.client.end(false, () => {
                    this.log('info', 'MQTT client disconnected');
                    resolve();
                });
            });
        }
    }
    /**
     * Publish message to topic
     */
    async publish(topic, message) {
        if (!this.client || !this.client.connected) {
            throw new Error('MQTT client not connected');
        }
        return new Promise((resolve, reject) => {
            this.client.publish(topic, message, err => {
                if (err) {
                    reject(err);
                }
                else {
                    this.log('info', `Published to ${topic}: ${message}`);
                    resolve();
                }
            });
        });
    }
    /**
     * Control floodlight via neolink MQTT
     */
    async setFloodlight(cameraName, enabled) {
        const topic = `neolink/${cameraName}/floodlight/set`;
        const message = enabled ? 'on' : 'off';
        await this.publish(topic, message);
    }
    log(level, message) {
        if (this.logCallback) {
            this.logCallback(level, message);
        }
    }
}
exports.MqttHelper = MqttHelper;
//# sourceMappingURL=mqtt-helper.js.map