import { Adapter, type AdapterOptions } from '@iobroker/adapter-core';
import axios, { type AxiosError, type AxiosInstance } from 'axios';
import https from 'node:https';
import path from 'node:path';
import * as utils from '@iobroker/adapter-core';
import { NeolinkManager, type NeolinkConfig } from './neolink-manager';
import { checkAllDependencies } from './dependency-check';
import { captureSnapshot } from './snapshot-helper';
import { MqttHelper } from './mqtt-helper';
import type {
    ReoLinkCamAdapterConfig,
    ReolinkCommand,
    ReolinkCommandAudioAlarmPlay,
    ReolinkCommandGetRec,
    ReolinkCommandGetWhiteLed,
    ReolinkCommandName,
    ReolinkCommandPtzCheck,
    ReolinkCommandPtzControl,
    ReolinkCommandSetAiCfg,
    ReolinkCommandSetAutoFocus,
    ReolinkCommandSetEmailV20,
    ReolinkCommandSetFtp,
    ReolinkCommandSetIrLights,
    ReolinkCommandSetPtzGuard,
    ReolinkCommandSetPush,
    ReolinkCommandSetRec,
    ReolinkCommandSetWhiteLed,
    ReolinkCommandStartZoomFocus,
    ReolinkResponseError,
} from './types';

// typescript
export const ReolinkErrorMessages: Record<number, string> = {
    [-1]: 'Missing parameters',
    [-2]: 'Used up memory',
    [-3]: 'Check error',
    [-4]: 'Parameters error',
    [-5]: 'Reached the max session number.',
    [-6]: 'Login required',
    [-7]: 'Login error',
    [-8]: 'Operation timeout',
    [-9]: 'Not supported',
    [-10]: 'Protocol error',
    [-11]: 'Failed to read operation',
    [-12]: 'Failed to get configuration.',
    [-13]: 'Failed to set configuration.',
    [-14]: 'Failed to apply for memory',
    [-15]: 'Failed to created socket',
    [-16]: 'Failed to send data',
    [-17]: 'Failed to receiver data',
    [-18]: 'Failed to open file',
    [-19]: 'Failed to read file',
    [-20]: 'Failed to write file',
    [-21]: 'Token error',
    [-22]: 'The length of the string exceeds the limit.',
    [-23]: 'Missing parameters',
    [-24]: 'Command error',
    [-25]: 'Internal error',
    [-26]: 'Ability error',
    [-27]: 'Invalid user',
    [-28]: 'User already exist',
    [-29]: 'Reached the maximum number of users',
    [-30]: 'The version is identical to the current one.',
    [-31]: 'Ensure only one user can upgrade',
    [-32]: 'Modify IP conflicted with used IP',
    [-34]: 'Cloud login need bind email first',
    [-35]: 'Cloud login unbind camera',
    [-36]: 'Cloud login get login information out of time',
    [-37]: 'Cloud login password error',
    [-38]: 'Cloud bind camera uid error',
    [-39]: 'Cloud login user doesn’t exist',
    [-40]: 'Cloud unbind camera failed',
    [-41]: 'The device doesn’t support cloud',
    [-42]: 'Cloud login server failed',
    [-43]: 'Cloud bind camera failed',
    [-44]: 'Cloud unknown error',
    [-45]: 'Cloud bind camera need verify code',
    [-46]: 'An error occurred while using the digest authentication process',
    [-47]: 'An expired nonce is used in the authentication process',
    [-48]: 'Snap a picture failed',
    [-49]: 'Channel is invalid',
    [-99]: 'Device offline',
    [-100]: 'Test Email、Ftp、WiFi failed',
    [-101]: 'Upgrade checking firmware failed',
    [-102]: 'Upgrade download online failed',
    [-103]: 'Upgrade get upgrade status failed',
    [-105]: 'Frequent logins, please try again later!',
    [-220]: 'Error downloading video file',
    [-221]: 'Busy video recording task',
    [-222]: 'The video file does not exist',
    [-301]: 'Digest Authentication nonce error',
    [-310]: 'Aes decryption failure',
    [-451]: 'ftp test login failed',
    [-452]: 'Create ftp dir failed',
    [-453]: 'Upload ftp file failed',
    [-454]: 'Cannot connect ftp server',
    [-480]: 'Some undefined errors',
    [-481]: 'Cannot connect email server',
    [-482]: 'Auth user failed',
    [-483]: 'Email network err',
    [-484]: 'Something wrong with email server',
    [-485]: 'Something wrong with memory',
    [-500]: 'The number of IP addresses reaches the upper limit',
    [-501]: 'The user does not exist',
    [-502]: 'Password err',
    [-503]: 'Login deny',
    [-505]: 'Login not init',
    [-506]: 'Login locked',
    [-507]: 'The number of logins reached the upper limit',
};

export function getReolinkErrorMessage(code: number): string {
    return ReolinkErrorMessages[code] ?? `Unknown error ${code}`;
}

class ReoLinkCamAdapter extends Adapter {
    declare config: ReoLinkCamAdapterConfig;
    private sslValidation = false;
    private readonly refreshIntervalRecording = 10;
    private refreshIntervalRecordingTimer = 0;
    private apiConnected = false;
    private reolinkApiClient: AxiosInstance | null = null;
    private refreshStateTimeout: ioBroker.Timeout | undefined = undefined;
    private neolinkManager: NeolinkManager | null = null;
    private neolinkConfig: NeolinkConfig | null = null; // Store for MQTT control
    private streamAutoDisableTimer: ioBroker.Timeout | undefined = undefined;
    private mqttAutoDisableTimer: ioBroker.Timeout | undefined = undefined;
    private ptzAutoStopTimer: ioBroker.Timeout | undefined = undefined;
    private ffmpegAvailable = false;
    private mqttHelper: MqttHelper | null = null;
    private mqttBatteryQueryInterval: ioBroker.Interval | undefined = undefined;
    private mqttControlBusy = false;

    constructor(options?: Partial<AdapterOptions>) {
        super({
            ...options,
            name: 'reolink',
        });

        this.on('ready', this.onReady.bind(this));
        this.on('stateChange', this.onStateChange.bind(this));
        this.on('message', this.onMessage.bind(this));
        this.on('unload', this.onUnload.bind(this));
    }

    /**
     * @param command send to reolink
     * @param genRndSeed needed for snap
     * @param withChannel for multi devices
     */
    genUrl(command: ReolinkCommandName, genRndSeed?: boolean, withChannel?: boolean): string {
        let urlString = `/api.cgi?cmd=${command}&`;
        let password = encodeURIComponent(this.config.cameraPassword);
        if (this.config.UriEncodedPassword !== undefined) {
            if (!this.config.UriEncodedPassword) {
                password = this.config.cameraPassword;
            }
        }
        if (withChannel === true) {
            urlString += `channel=${this.config.cameraChannel}&`;
        }
        if (genRndSeed === true) {
            const randomSeed = Math.round(Math.random() * 100000000000000).toString(16);
            urlString += `rs=${randomSeed}&`;
        }
        urlString += `user=${this.config.cameraUser}&password=${password}`;
        return urlString;
    }

    async onReady(): Promise<void> {
        await this.setState('info.connection', false, true);
        this.log.info('Reolink adapter has started');
        if (!this.config.cameraIp) {
            this.log.error('Camera Ip not set - please check instance!');
            return;
        }
        if (!this.config.cameraUser || !this.config.cameraPassword) {
            this.log.error('Username and/or password not set properly - please check instance!');
            return;
        }

        // Check if this is a battery-powered camera
        if (this.config.isBatteryCam) {
            this.log.info('Battery-powered camera detected - using neolink');
            await this.startBatteryCam();
            return; // Don't continue with HTTP API
        }

        // HTTP API camera mode:
        // 1. Remove any leftover battery cam states (in case user switched camera type)
        // 2. Create HTTP cam states dynamically (analog to createBatteryCamStates for battery cams)
        await this.cleanupBatteryCamStates();
        await this.createHttpCamStates();

        if (!this.config.cameraProtocol) {
            this.log.error('no protocol (http/https) set!');
            return;
        }
        // check Checkbox of ssl validation is set
        this.sslValidation = this.config.sslvalid ?? false;

        this.reolinkApiClient = axios.create({
            baseURL:
                this.config.cameraIp.startsWith('http://') || this.config.cameraIp.startsWith('https://')
                    ? this.config.cameraIp
                    : `${this.config.cameraProtocol}://${this.config.cameraIp}`,
            timeout: 4000,
            responseType: 'json',
            responseEncoding: 'binary',
            httpsAgent: new https.Agent({
                rejectUnauthorized: this.sslValidation,
            }),
        });

        this.log.info(`Current IP: ${this.config.cameraIp}`);
        await this.setState('network.ip', { val: this.config.cameraIp, ack: true });
        await this.setState('network.channel', {
            val: Number(this.config.cameraChannel),
            ack: true,
        });

        // first API Call...if something isn't working, stop Adapter
        try {
            await this.getDevInfo();
        } catch (error) {
            this.log.error(`${error}: ${error.code}`);
        }

        if (!this.apiConnected) {
            return;
        }

        await this.getLocalLink();
        await this.refreshState('onReady');
        await this.getDriveInfo();
        await this.getPtzGuardInfo();
        await this.getAutoFocus();
        await this.getZoomAndFocus();
        await this.getIrLights();
        await this.getWhiteLed();
        await this.getRecording();

        this.log.debug('getStateAsync start Email notification');
        //create state dynamically
        const state = await this.getStateAsync('device.name');
        if (state) {
            await this.setState('Device.Name', state.val);
        }
        await this.getMailNotification();
        this.subscribeStates('settings.EmailNotification');
        this.log.debug('Email notification subscribed');
        this.log.debug('start subscriptions');
        // Subscribe on states
        this.subscribeStates('settings.ir');
        this.subscribeStates('settings.switchLed');
        this.subscribeStates('settings.ledBrightness');
        this.subscribeStates('settings.ledMode');
        this.subscribeStates('settings.ptzPreset');
        this.subscribeStates('settings.ptzPatrol');
        this.subscribeStates('settings.autoFocus');
        this.subscribeStates('settings.setZoomFocus');
        this.subscribeStates('settings.push');
        this.subscribeStates('settings.ftp');
        this.subscribeStates('settings.scheduledRecording');
        this.subscribeStates('settings.playAlarm');
        this.subscribeStates('settings.getDiscData');
        this.subscribeStates('settings.ptzEnableGuard');
        this.subscribeStates('settings.ptzCheck');
        this.subscribeStates('settings.ptzGuardTimeout');
        this.subscribeStates('command.reboot');
        this.subscribeStates('ai_config.*');
    }

    // function for getting motion detection
    async getMdState(): Promise<void> {
        if (this.reolinkApiClient) {
            try {
                // cmd, channel, user, password
                const MdInfoValues = await this.reolinkApiClient.get(this.genUrl('GetMdState', false, true));

                this.log.debug(
                    `camMdStateInfo ${JSON.stringify(MdInfoValues.status)}: ${JSON.stringify(MdInfoValues.data)}`,
                );

                if (MdInfoValues.status === 200) {
                    this.apiConnected = true;
                    await this.setState('network.connected', {
                        val: this.apiConnected,
                        ack: true,
                    });

                    const MdValues = MdInfoValues.data[0];

                    this.log.debug(`Motion Detection value: ${MdValues.value.state}`);
                    await this.setState('sensor.motion', {
                        val: !!MdValues.value.state,
                        ack: true,
                    });
                }
            } catch (error) {
                const errorMessage = error.message.toString();
                if (errorMessage.includes('timeout of')) {
                    this.log.debug(`get md state: ${error}`);
                } else {
                    this.log.error(`get md state: ${error}`);
                }
                this.apiConnected = false;
                await this.setState('network.connected', {
                    val: this.apiConnected,
                    ack: true,
                });
            }
        }
    }

    async getAiState(): Promise<void> {
        if (this.reolinkApiClient) {
            try {
                // cmd, channel, user, password
                const AiInfoValues = await this.reolinkApiClient.get(this.genUrl('GetAiState', false, true));

                this.log.debug(
                    `camAiStateInfo ${JSON.stringify(AiInfoValues.status)}: ${JSON.stringify(AiInfoValues.data)}`,
                );

                if (AiInfoValues.status === 200) {
                    this.apiConnected = true;
                    await this.setState('network.connected', {
                        val: this.apiConnected,
                        ack: true,
                    });

                    const AiValues = AiInfoValues.data[0];
                    try {
                        await this.setState('sensor.dog_cat.state', {
                            val: !!AiValues.value.dog_cat.alarm_state,
                            ack: true,
                        });
                        await this.setState('sensor.dog_cat.support', {
                            val: !!AiValues.value.dog_cat.support,
                            ack: true,
                        });
                        this.log.debug(`dog_cat_state detection:${AiValues.value.dog_cat.alarm_state}`);
                    } catch (error) {
                        this.log.debug(`get ai state animal: ${error}`);
                        this.log.debug('dog cat state not found.');
                    }
                    try {
                        await this.setState('sensor.face.state', {
                            val: !!AiValues.value.face.alarm_state,
                            ack: true,
                        });
                        await this.setState('sensor.face.support', {
                            val: !!AiValues.value.face.support,
                            ack: true,
                        });
                        this.log.debug(`face_state detection:${AiValues.value.face.alarm_state}`);
                    } catch (error) {
                        this.log.debug(`get ai state face: ${error}`);
                        this.log.debug('face state not found.');
                    }
                    try {
                        await this.setState('sensor.people.state', {
                            val: !!AiValues.value.people.alarm_state,
                            ack: true,
                        });
                        await this.setState('sensor.people.support', {
                            val: !!AiValues.value.people.support,
                            ack: true,
                        });
                        this.log.debug(`people_state detection:${AiValues.value.people.alarm_state}`);
                    } catch (error) {
                        this.log.debug(`get ai state people: ${error}`);
                        this.log.debug('people state not found.');
                    }
                    try {
                        await this.setState('sensor.vehicle.state', {
                            val: !!AiValues.value.vehicle.alarm_state,
                            ack: true,
                        });
                        await this.setState('sensor.vehicle.support', {
                            val: !!AiValues.value.vehicle.support,
                            ack: true,
                        });
                        this.log.debug(`vehicle_state detection:${AiValues.value.vehicle.alarm_state}`);
                    } catch (error) {
                        this.log.debug(`get ai state vehicle: ${error}`);
                        this.log.debug('vehicle state not found.');
                    }
                }
            } catch (error) {
                const errorMessage = error.message.toString();
                if (errorMessage.includes('timeout of')) {
                    this.log.debug(`get ai state general: ${error}`);
                } else {
                    this.log.error(`get ai state general: ${error}`);
                }
                this.apiConnected = false;
                await this.setState('network.connected', {
                    val: this.apiConnected,
                    ack: true,
                });
            }
        }
    }

    async getAiCfg(): Promise<void> {
        if (!this.reolinkApiClient) {
            return;
        }

        try {
            // cmd, channel, user, password
            const cfg = await this.reolinkApiClient.get(this.genUrl('GetAiCfg', false, true));

            this.log.debug(`GetAiCfg ${JSON.stringify(cfg.status)}: ${JSON.stringify(cfg.data)}`);

            if (cfg.status !== 200) {
                return;
            }

            this.apiConnected = true;
            await this.setState('network.connected', {
                val: this.apiConnected,
                ack: true,
            });

            const val = cfg.data[0].value;
            try {
                await this.setState('ai_config.raw', {
                    val: JSON.stringify(val),
                    ack: true,
                });
                this.log.debug(`ai_config.raw = ${JSON.stringify(val)}`);
            } catch (error) {
                this.log.debug(`ai_config.raw: ${error}`);
            }
        } catch (error) {
            const errorMessage = error.message.toString();
            if (errorMessage.includes('timeout of')) {
                this.log.debug(`get ai config general: ${error}`);
            } else {
                this.log.error(`get ai config general: ${error}`);
            }
            this.apiConnected = false;
            await this.setState('network.connected', {
                val: this.apiConnected,
                ack: true,
            });
        }
    }

    async setAiCfg(jsonString: string): Promise<void> {
        try {
            const command: ReolinkCommandSetAiCfg[] = [
                {
                    cmd: 'SetAiCfg',
                    param: JSON.parse(jsonString),
                },
            ];

            await this.sendCmd(command, 'SetAiCfg');
        } catch (error) {
            this.log.error(`setAiCfg: ${error}`);
        }

        // Immediately after patching the settings, get the new settings.
        await this.getAiCfg();
    }

    // function for getting general information of camera device
    async getDevInfo(): Promise<void> {
        if (this.reolinkApiClient) {
            try {
                this.log.debug('getDevinfo');
                // cmd, channel, user, password
                const devInfoValues = await this.reolinkApiClient.get(this.genUrl('GetDevInfo', false, true));
                this.log.debug(
                    `camMdStateInfo ${JSON.stringify(devInfoValues.status)}: ${JSON.stringify(devInfoValues.data)}`,
                );

                if (devInfoValues.status === 200) {
                    await this.setState('info.connection', true, true);
                    this.apiConnected = true;
                    await this.setState('network.connected', {
                        val: this.apiConnected,
                        ack: true,
                    });
                    const DevValues = devInfoValues.data[0];

                    await this.setState('device.buildDay', {
                        val: DevValues.value.DevInfo.buildDay,
                        ack: true,
                    });
                    await this.setState('device.cfgVer', {
                        val: DevValues.value.DevInfo.cfgVer,
                        ack: true,
                    });
                    await this.setState('device.detail', {
                        val: DevValues.value.DevInfo.detail,
                        ack: true,
                    });
                    await this.setState('device.diskNum', {
                        val: DevValues.value.DevInfo.diskNum,
                        ack: true,
                    });
                    await this.setState('device.firmVer', {
                        val: DevValues.value.DevInfo.firmVer,
                        ack: true,
                    });
                    await this.setState('device.model', {
                        val: DevValues.value.DevInfo.model,
                        ack: true,
                    });
                    await this.setState('device.name', {
                        val: DevValues.value.DevInfo.name,
                        ack: true,
                    });
                    await this.setState('device.serial', {
                        val: DevValues.value.DevInfo.serial,
                        ack: true,
                    });
                    await this.setState('device.wifi', {
                        val: DevValues.value.DevInfo.wifi,
                        ack: true,
                    });
                }
            } catch (error) {
                await this.setState('info.connection', false, true);
                if (((error as AxiosError).response as any)?.error?.rspCode) {
                    const response: ReolinkResponseError = (error as AxiosError).response?.data as ReolinkResponseError;
                    this.log.error(`Cannot get local link: ${getReolinkErrorMessage(response.error.rspCode)}`);
                }
                this.apiConnected = false;
                await this.setState('network.connected', {
                    val: this.apiConnected,
                    ack: true,
                });
                // this.log.error(error + ": " + error.code);
                throw error;
            }
        }
    }

    async getPtzGuardInfo(): Promise<void> {
        if (this.reolinkApiClient) {
            try {
                // cmd, user, password
                const ptzGuardInfoData = await this.reolinkApiClient.get(this.genUrl('GetPtzGuard', false, false));
                this.log.debug(
                    `ptz guard info ${JSON.stringify(ptzGuardInfoData.status)}: ${JSON.stringify(ptzGuardInfoData.data)}`,
                );
            } catch (error) {
                this.log.error(`ptz guard info: ${error}`);
            }
        }
    }

    async getDriveInfo(): Promise<void> {
        if (this.reolinkApiClient) {
            try {
                // cmd, user, password
                const driveInfoData = await this.reolinkApiClient.get(this.genUrl('GetHddInfo', false, false));
                this.log.debug(
                    `getDriveInfo ${JSON.stringify(driveInfoData.status)}: ${JSON.stringify(driveInfoData.data)}`,
                );

                if (driveInfoData.status === 200) {
                    const driveInfoValues = driveInfoData.data[0];
                    const numberOfDiscs = Object.keys(driveInfoValues.value.HddInfo).length;
                    if (numberOfDiscs > 0) {
                        if (numberOfDiscs > 1) {
                            this.log.warn(`Only the first disc is read. You have ${numberOfDiscs.toString()} Discs!`);
                        }
                        await this.setState('disc.capacity', {
                            val: driveInfoValues.value.HddInfo[0].capacity,
                            ack: true,
                        });
                        let discFormatted = false;
                        if (driveInfoValues.value.HddInfo[0].format === 1) {
                            discFormatted = true;
                        }
                        await this.setState('disc.formatted', {
                            val: discFormatted,
                            ack: true,
                        });
                        await this.setState('disc.free', {
                            val: driveInfoValues.value.HddInfo[0].size,
                            ack: true,
                        });
                        let discMounted = false;
                        if (driveInfoValues.value.HddInfo[0].mount === 1) {
                            discMounted = true;
                        }
                        await this.setState('disc.mounted', {
                            val: discMounted,
                            ack: true,
                        });
                    } else {
                        // no sd card inserted
                        await this.setState('disc.capacity', { val: 0, ack: true });
                        await this.setState('disc.formatted', { val: false, ack: true });
                        await this.setState('disc.free', { val: 0, ack: true });
                        await this.setState('disc.mounted', { val: false, ack: true });
                    }
                }
            } catch (error) {
                const errorMessage = error.message.toString();
                if (errorMessage.includes('timeout of')) {
                    this.log.debug(`drive info ${error}`);
                } else {
                    this.log.error(`drive info ${error}`);
                }
            }
        }
    }

    async getLocalLink(): Promise<void> {
        if (this.reolinkApiClient) {
            try {
                // cmd, channel, user, password
                const LinkInfoValues = await this.reolinkApiClient.get(this.genUrl('GetLocalLink', false, true));
                this.log.debug(
                    `LinkInfoValues ${JSON.stringify(LinkInfoValues.status)}: ${JSON.stringify(LinkInfoValues.data)}`,
                );

                if (LinkInfoValues.status === 200) {
                    this.apiConnected = true;
                    await this.setState('network.connected', {
                        val: this.apiConnected,
                        ack: true,
                    });
                    const LinkValues = LinkInfoValues.data[0];

                    await this.setState('network.activeLink', {
                        val: LinkValues.value.LocalLink.activeLink,
                        ack: true,
                    });
                    await this.setState('network.mac', {
                        val: LinkValues.value.LocalLink.mac,
                        ack: true,
                    });
                    await this.setState('network.dns', {
                        val: LinkValues.value.LocalLink.dns.dns1,
                        ack: true,
                    });
                    await this.setState('network.gateway', {
                        val: LinkValues.value.LocalLink.static.gateway,
                        ack: true,
                    });
                    await this.setState('network.mask', {
                        val: LinkValues.value.LocalLink.static.mask,
                        ack: true,
                    });
                    await this.setState('network.networkType', {
                        val: LinkValues.value.LocalLink.type,
                        ack: true,
                    });
                }
            } catch (error) {
                this.apiConnected = false;

                if ((error as AxiosError).response) {
                    const response: ReolinkResponseError = (error as AxiosError).response?.data as ReolinkResponseError;
                    this.log.error(`Cannot get local link: ${getReolinkErrorMessage(response.error.rspCode)}`);
                }

                await this.setState('network.connected', {
                    val: this.apiConnected,
                    ack: true,
                });

                this.log.error(`get local link: ${error}`);
            }
        }
    }

    async getSnapshot(): Promise<{ type: string; base64: string } | null> {
        if (this.reolinkApiClient) {
            try {
                // cmd, channel, rs, user, password
                const snapShot = await this.reolinkApiClient.get(this.genUrl('Snap', true, true));
                const contentType = snapShot.headers['content-type'];
                const base64data = Buffer.from(snapShot.data, 'binary').toString('base64');
                return { type: contentType, base64: base64data };
            } catch (error) {
                this.log.error(`get snapshot: ${error}`);
                return null;
            }
        }
        return null;
    }

    async sendCmd(cmdObject: ReolinkCommand[], cmdName: ReolinkCommandName): Promise<void> {
        this.log.debug(`sendCmd: ${cmdName}`);
        this.log.debug(`sendCmdObj: ${JSON.stringify(cmdObject)}`);
        try {
            if (this.reolinkApiClient) {
                // cmd, user, password
                const result = await this.reolinkApiClient.post(this.genUrl(cmdName, false, false), cmdObject);
                this.log.debug(JSON.stringify(result.status));
                this.log.debug(JSON.stringify(result.data));
                if ('error' in result.data[0]) {
                    this.log.error(`sendCmd ${cmdName}: ${JSON.stringify(result.data[0].error.detail)}`);

                    switch (cmdName) {
                        case 'SetAutoFocus':
                            await this.setState('settings.autoFocus', {
                                val: 'Error or not supported',
                                ack: true,
                            });
                            break;
                        case 'AudioAlarmPlay':
                            // error detail already logged above; no state update needed
                            break;
                        default:
                            this.log.error(`sendCmd ${cmdName}: not defined`);
                    }
                }
            }
        } catch (error) {
            this.log.error(`send cmd: ${error}`);
            this.log.error(`sendCmd ${cmdName}connection error`);
        }
    }

    async ptzCtrl(ptzPreset: number): Promise<void> {
        const ptzPresetCmd: ReolinkCommandPtzControl[] = [
            {
                cmd: 'PtzCtrl',
                action: 0,
                param: {
                    channel: Number(this.config.cameraChannel),
                    id: ptzPreset,
                    op: 'ToPos',
                    speed: 32,
                },
            },
        ];
        await this.sendCmd(ptzPresetCmd, 'PtzCtrl');
    }

    async ptzCtrl2(ptzPatrolPos: number): Promise<void> {
        if (ptzPatrolPos === 0) {
            const ptzPresetCmd: ReolinkCommandPtzControl[] = [
                {
                    cmd: 'PtzCtrl',
                    param: {
                        channel: Number(this.config.cameraChannel),
                        op: 'StopPatrol',
                    },
                },
            ];
            await this.sendCmd(ptzPresetCmd, 'PtzCtrl');
        } else {
            const ptzPresetCmd: ReolinkCommandPtzControl[] = [
                {
                    cmd: 'PtzCtrl',
                    param: {
                        channel: Number(this.config.cameraChannel),
                        op: 'StartPatrol',
                        id: ptzPatrolPos,
                    },
                },
            ];
            await this.sendCmd(ptzPresetCmd, 'PtzCtrl');
        }
    }

    async setPush(state: boolean): Promise<void> {
        const pushOnCmd: ReolinkCommandSetPush[] = [
            {
                cmd: 'SetPushV20',
                param: {
                    Push: {
                        enable: state ? 1 : 0,
                    },
                },
            },
        ];
        await this.sendCmd(pushOnCmd, 'SetPush');
    }

    async setFtp(ftpOn: boolean): Promise<void> {
        const ftpOnCmd: ReolinkCommandSetFtp[] = [
            {
                cmd: 'SetFtpV20',
                param: {
                    Ftp: {
                        enable: ftpOn ? 1 : 0,
                    },
                },
            },
        ];
        await this.sendCmd(ftpOnCmd, 'SetFtp');
    }

    async setAutoFocus(autoFocusStr: number | string): Promise<void> {
        if (autoFocusStr === 'Error or not supported') {
            return;
        }
        const autoFocusVal = parseInt(autoFocusStr as string, 10);
        if (autoFocusVal === 0 || autoFocusVal === 1) {
            const autoFocusCmd: ReolinkCommandSetAutoFocus[] = [
                {
                    cmd: 'SetAutoFocus',
                    action: 0,
                    param: {
                        AutoFocus: {
                            channel: Number(this.config.cameraChannel),
                            disable: autoFocusVal,
                        },
                    },
                },
            ];
            await this.sendCmd(autoFocusCmd, 'SetAutoFocus');
        } else {
            this.log.error('Auto focus: Value not supported!');
            await this.getAutoFocus();
        }
    }

    async getAutoFocus(): Promise<void> {
        if (this.reolinkApiClient) {
            try {
                const getAutoFocusCmd = [
                    {
                        cmd: 'GetAutoFocus',
                        action: 0,
                        param: {
                            channel: Number(this.config.cameraChannel),
                        },
                    },
                ];
                // cmd, user, password
                const autoFocusValue = await this.reolinkApiClient.post(
                    this.genUrl('GetAutoFocus', false, false),
                    getAutoFocusCmd,
                );

                this.log.debug(
                    `AutoFocusValue ${JSON.stringify(autoFocusValue.status)}: ${JSON.stringify(autoFocusValue.data)}`,
                );

                if (autoFocusValue.status === 200) {
                    this.apiConnected = true;
                    await this.setState('network.connected', {
                        val: this.apiConnected,
                        ack: true,
                    });
                    const autoFocus = autoFocusValue.data[0];

                    if ('error' in autoFocus) {
                        this.log.debug(`Error or not supported ${this.getAutoFocus.name}`);
                        await this.setState('settings.autoFocus', {
                            val: 'Error or not supported',
                            ack: true,
                        });
                    } else {
                        // The datatype of the object is string.
                        // 1 - means forbid (but is there any effect?)
                        // 0 - means not disabled
                        const intState = autoFocus.value.AutoFocus.disable;
                        if (intState === 0) {
                            await this.setState('settings.autoFocus', {
                                val: '0',
                                ack: true,
                            });
                        } else if (intState === 1) {
                            await this.setState('settings.autoFocus', {
                                val: '1',
                                ack: true,
                            });
                        } else {
                            await this.setState('settings.autoFocus', {
                                val: 'Unknown',
                                ack: true,
                            });
                        }
                    }
                }
            } catch (error) {
                this.apiConnected = false;
                await this.setState('network.connected', {
                    val: this.apiConnected,
                    ack: true,
                });
                this.log.error(`get auto focus: ${error}`);
            }
        }
    }

    async getZoomAndFocus(): Promise<void> {
        if (this.reolinkApiClient) {
            try {
                const getZoomFocusCmd = [
                    {
                        cmd: 'GetZoomFocus',
                        action: 0,
                        param: {
                            channel: Number(this.config.cameraChannel),
                        },
                    },
                ];
                // cmd, user, password
                const ZoomFocusValue = await this.reolinkApiClient.post(
                    this.genUrl('GetZoomFocus', false, false),
                    getZoomFocusCmd,
                );

                this.log.debug(
                    `ZoomFocusValue ${JSON.stringify(ZoomFocusValue.status)}: ${JSON.stringify(ZoomFocusValue.data)}`,
                );

                if (ZoomFocusValue.status === 200) {
                    this.apiConnected = true;
                    await this.setState('network.connected', {
                        val: this.apiConnected,
                        ack: true,
                    });
                    const ZoomFocus = ZoomFocusValue.data[0];

                    if ('error' in ZoomFocus) {
                        this.log.debug(`Error or not supported ${this.getZoomAndFocus.name}`);

                        return;
                    }

                    // zoom is the zoom position. See setZoomFocus()
                    const zoom = ZoomFocus.value.ZoomFocus.zoom.pos;
                    // the lens focus is adjusted during autofocus procedure.
                    const focus = ZoomFocus.value.ZoomFocus.focus.pos;

                    await this.setState('settings.setZoomFocus', {
                        val: zoom,
                        ack: true,
                    });
                    await this.setState('settings.focus', { val: focus, ack: true });
                }
            } catch (error) {
                this.apiConnected = false;
                await this.setState('network.connected', {
                    val: this.apiConnected,
                    ack: true,
                });
                this.log.error(`get zoom and focus: ${error}`);
            }
        }
    }

    async startZoomFocus(pos: number): Promise<void> {
        const startZoomCmd: ReolinkCommandStartZoomFocus[] = [
            {
                cmd: 'StartZoomFocus',
                action: 0,
                param: {
                    ZoomFocus: {
                        channel: Number(this.config.cameraChannel),
                        pos,
                        op: 'ZoomPos',
                    },
                },
            },
        ];
        await this.sendCmd(startZoomCmd, 'StartZoomFocus');
    }

    async setPtzCheck(): Promise<void> {
        const ptzCheckCmd: ReolinkCommandPtzCheck[] = [
            {
                cmd: 'PtzCheck',
                action: 0,
                param: {
                    channel: Number(this.config.cameraChannel),
                },
            },
        ];
        await this.sendCmd(ptzCheckCmd, 'PtzCheck');
    }

    async setScheduledRecording(state: boolean): Promise<void> {
        if (state !== true && state !== false) {
            this.log.error('Set scheduled recording: Value not supported!');
            await this.getRecording();

            return;
        }

        const scheduledRecordingCmd: ReolinkCommandSetRec[] = [
            {
                cmd: 'SetRecV20',
                param: {
                    Rec: {
                        enable: state ? 1 : 0, // The description in API Guide v8 had this key inside `schedule`, which does not work.
                        schedule: {
                            channel: Number(this.config.cameraChannel),
                        },
                    },
                },
            },
        ];

        await this.sendCmd(scheduledRecordingCmd, 'SetRecV20');
    }

    async getRecording(): Promise<void> {
        if (!this.reolinkApiClient) {
            return;
        }

        try {
            const recordingCmd: ReolinkCommandGetRec[] = [
                {
                    cmd: 'GetRecV20',
                    action: 1,
                    param: {
                        channel: Number(this.config.cameraChannel),
                    },
                },
            ];
            // cmd, user, password
            const recordingSettingsResponse = await this.reolinkApiClient.post(
                this.genUrl('GetRecV20', false, false),
                recordingCmd,
            );

            this.log.debug(
                `recordingSettings ${JSON.stringify(recordingSettingsResponse.status)}: ${JSON.stringify(recordingSettingsResponse.data)}`,
            );
            if (recordingSettingsResponse.status !== 200) {
                return;
            }

            this.apiConnected = true;
            await this.setState('network.connected', {
                val: this.apiConnected,
                ack: true,
            });

            const recordingSettingValues = recordingSettingsResponse.data[0];
            this.log.debug(`rec set val: ${JSON.stringify(recordingSettingValues)}`);
            // This response object contains much more than `enable`.
            // There would be as well `overwrite`, `postRec`, `preRec`, `saveDay` and the 4 schedule tables as "1010.."-string
            if (recordingSettingValues.error != null) {
                this.log.debug(`get record settings error ${recordingSettingValues.error.detail}`);
            } else {
                const scheduledRecordingState = recordingSettingValues.value.Rec.enable;
                if (scheduledRecordingState === 0) {
                    await this.setState('settings.scheduledRecording', {
                        val: false,
                        ack: true,
                    });
                } else if (scheduledRecordingState === 1) {
                    await this.setState('settings.scheduledRecording', {
                        val: true,
                        ack: true,
                    });
                } else {
                    this.log.error(`An unknown scheduled recording state was detected: ${scheduledRecordingState}`);
                }
            }
        } catch (error) {
            this.apiConnected = false;
            await this.setState('network.connected', {
                val: this.apiConnected,
                ack: true,
            });
            const errorMessage = error.message.toString();
            if (errorMessage.includes('timeout of')) {
                this.log.debug(`get recording: ${error}`);
            } else {
                this.log.error(`get recording: ${error}`);
            }
        }
    }

    async audioAlarmPlay(count: number): Promise<void> {
        const audioAlarmPlayCmd: ReolinkCommandAudioAlarmPlay[] = [
            {
                cmd: 'AudioAlarmPlay',
                action: 0,
                param: {
                    alarm_mode: 'times',
                    times: count,
                    channel: Number(this.config.cameraChannel),
                },
            },
        ];
        await this.sendCmd(audioAlarmPlayCmd, 'AudioAlarmPlay');
    }

    async setIrLights(irValue: 'Error or not supported' | 'Auto' | 'Off' | 'On'): Promise<void> {
        if (irValue === 'Error or not supported') {
            return;
        }
        if (irValue === 'Auto' || irValue === 'Off' || irValue === 'On') {
            const irCmd: ReolinkCommandSetIrLights[] = [
                {
                    cmd: 'SetIrLights',
                    action: 0,
                    param: {
                        IrLights: {
                            channel: Number(this.config.cameraChannel),
                            state: irValue,
                        },
                    },
                },
            ];
            this.log.debug(JSON.stringify(irCmd));
            await this.sendCmd(irCmd, 'SetIrLights');
        } else {
            this.log.error('Set ir lights: Value not supported!');
            await this.getIrLights();
        }
    }

    async getIrLights(): Promise<void> {
        if (this.reolinkApiClient) {
            try {
                // cmd, channel, user, password
                const IrLightValue = await this.reolinkApiClient.get(this.genUrl('GetIrLights', false, true));
                this.log.debug(
                    `IrLightValue ${JSON.stringify(IrLightValue.status)}: ${JSON.stringify(IrLightValue.data)}`,
                );

                if (IrLightValue.status === 200) {
                    this.apiConnected = true;
                    await this.setState('network.connected', {
                        val: this.apiConnected,
                        ack: true,
                    });

                    const IrLights = IrLightValue.data[0];

                    // Check answer
                    if ('error' in IrLights) {
                        this.log.debug(`Error or not supported ${this.getIrLights.name}`);
                        await this.setState('settings.autoFocus', {
                            val: 'Error or not supported',
                            ack: true,
                        });
                    } else {
                        await this.setState('settings.ir', {
                            val: IrLights.value.IrLights.state,
                            ack: true,
                        });
                    }
                }
            } catch (error) {
                this.apiConnected = false;
                await this.setState('network.connected', {
                    val: this.apiConnected,
                    ack: true,
                });
                this.log.error(`get ir lights: ${error}`);
            }
        }
    }

    async switchWhiteLed(ledState: boolean): Promise<void> {
        const switchWhiteLedCmd: ReolinkCommandSetWhiteLed[] = [
            {
                cmd: 'SetWhiteLed',
                param: {
                    WhiteLed: {
                        channel: Number(this.config.cameraChannel),
                        state: ledState ? 1 : 0,
                    },
                },
            },
        ];
        await this.sendCmd(switchWhiteLedCmd, 'SetWhiteLed');
    }

    async setWhiteLed(bright: number): Promise<void> {
        const setBrightnessCmd: ReolinkCommandSetWhiteLed[] = [
            {
                cmd: 'SetWhiteLed',
                param: {
                    WhiteLed: {
                        channel: Number(this.config.cameraChannel),
                        bright,
                    },
                },
            },
        ];
        await this.sendCmd(setBrightnessCmd, 'SetWhiteLed');
    }

    async setWhiteLedMode(mode: 0 | 1 | 2 | 3): Promise<void> {
        // mode 0 = off        -> Manual switching. See https://github.com/aendue/ioBroker.reolink/issues/25 @johndoetheanimal for possible restrictions
        // mode 1 = night mode -> Night Smart Mode
        // mode 2 = unknown    -> Maybe `Always on at night` if supported.
        // mode 3 = Timer mode -> Optional: [ { "cmd":"SetWhiteLed", "action":0, "param":{ "WhiteLed":{ "LightingSchedule":{ "EndHour":23, "EndMin":50, "StartHour":23, "StartMin":29 }, "mode":3, "channel":0 } } } ]
        if (mode !== 0 && mode !== 1 && mode !== 2 && mode !== 3) {
            this.log.error(`White Led mode ${mode as number} not supported!`);
            return;
        }
        const setModeCmd: ReolinkCommandSetWhiteLed[] = [
            {
                cmd: 'SetWhiteLed',
                param: {
                    WhiteLed: {
                        channel: Number(this.config.cameraChannel),
                        mode,
                    },
                },
            },
        ];
        await this.sendCmd(setModeCmd, 'SetWhiteLed');
    }

    async getWhiteLed(): Promise<void> {
        if (this.reolinkApiClient) {
            try {
                const getLedCmd: ReolinkCommandGetWhiteLed[] = [
                    {
                        cmd: 'GetWhiteLed',
                        action: 0,
                        param: {
                            channel: Number(this.config.cameraChannel),
                        },
                    },
                ];
                // cmd, channel, user, password
                const whiteLedValue = await this.reolinkApiClient.post(
                    this.genUrl('GetWhiteLed', false, true),
                    getLedCmd,
                );

                this.log.debug(
                    `whiteLedValue ${JSON.stringify(whiteLedValue.status)}: ${JSON.stringify(whiteLedValue.data)}`,
                );

                if (whiteLedValue.status === 200) {
                    this.apiConnected = true;
                    await this.setState('network.connected', {
                        val: this.apiConnected,
                        ack: true,
                    });

                    const whiteLed = whiteLedValue.data[0];
                    const brightness = whiteLed.value.WhiteLed.bright;
                    const mode = whiteLed.value.WhiteLed.mode;
                    const switchLed = !!whiteLed.value.WhiteLed.state;

                    await this.setState('settings.ledBrightness', {
                        val: brightness,
                        ack: true,
                    });
                    await this.setState('settings.ledMode', { val: mode, ack: true });
                    await this.setState('settings.switchLed', {
                        val: switchLed,
                        ack: true,
                    });
                }
            } catch (error) {
                this.apiConnected = false;
                await this.setState('network.connected', {
                    val: this.apiConnected,
                    ack: true,
                });
                this.log.error(`get white led: ${error}`);
            }
        }
    }

    async setPtzGuard(enable: boolean): Promise<void> {
        const setPtzGuardCmd: ReolinkCommandSetPtzGuard[] = [
            {
                cmd: 'SetPtzGuard',
                action: 0,
                param: {
                    PtzGuard: {
                        channel: Number(this.config.cameraChannel),
                        cmdStr: 'setPos',
                        benable: enable ? 1 : 0,
                        bSaveCurrentPos: 0,
                    },
                },
            },
        ];
        await this.sendCmd(setPtzGuardCmd, 'setPtzGuard');
        await this.getPtzGuardInfo();
    }

    async setPtzGuardTimeout(timeout: number): Promise<void> {
        const setPtzGuardCmd: ReolinkCommandSetPtzGuard[] = [
            {
                cmd: 'SetPtzGuard',
                action: 0,
                param: {
                    PtzGuard: {
                        channel: Number(this.config.cameraChannel),
                        cmdStr: 'setPos',
                        timeout,
                        bSaveCurrentPos: 0,
                    },
                },
            },
        ];
        await this.sendCmd(setPtzGuardCmd, 'SetPtzGuardTimeout');
        await this.getPtzGuardInfo();
    }

    async refreshState(source: string): Promise<void> {
        this.log.debug(`refreshState': started from "${source}"`);

        await this.getMdState();
        await this.getAiState();
        await this.getAiCfg();
        await this.getMailNotification();
        this.refreshIntervalRecordingTimer++;
        if (this.refreshIntervalRecordingTimer > this.refreshIntervalRecording) {
            await this.getRecording();
            await this.getDriveInfo();
            this.refreshIntervalRecordingTimer = 0;
        }

        // Delete Timer
        if (this.refreshStateTimeout) {
            this.log.debug(`refreshStateTimeout: CLEARED by ${source}`);
            this.clearTimeout(this.refreshStateTimeout);
        }

        // Create new Timer (to re-run actions)
        if (!this.apiConnected) {
            const notConnectedTimeout = 10;
            this.refreshStateTimeout = this.setTimeout(async () => {
                this.refreshStateTimeout = null;
                await this.refreshState('timeout (API not connected)');
            }, notConnectedTimeout * 1000);
            // this.log.debug(`refreshStateTimeout: re-created refresh timeout (API not connected): id ${this.refreshStateTimeout}- secounds: ${notConnectedTimeout}`);
        } else {
            let refreshInterval = parseInt(this.config.apiRefreshInterval as string);
            if (refreshInterval > 10000) {
                refreshInterval = 10000;
            }
            if (refreshInterval < 1) {
                refreshInterval = 1;
            }
            this.refreshStateTimeout = this.setTimeout(async () => {
                this.refreshStateTimeout = null;
                await this.refreshState('timeout(default');
            }, refreshInterval * 1000);
            // this.log.debug(`refreshStateTimeout: re-created refresh timeout (default): id ${this.refreshStateTimeout}- seconds: ${this.config.apiRefreshInterval}`);
        }
    }

    async getMailNotification(): Promise<void> {
        if (this.reolinkApiClient) {
            try {
                // cmd, user, password
                const mailValue = await this.reolinkApiClient.get(this.genUrl('GetEmailV20', false, false));
                this.log.debug(`mailValue ${JSON.stringify(mailValue.status)}: ${JSON.stringify(mailValue.data)}`);

                if (mailValue.status === 200) {
                    this.apiConnected = true;
                    await this.setState('network.connected', {
                        val: this.apiConnected,
                        ack: true,
                    });

                    const mail = mailValue.data[0];

                    //Antwort pruefen
                    if ('error' in mail) {
                        this.log.debug(`Error or not supported ${this.getMailNotification.name}`);
                        await this.setState('settings.EmailNotification', {
                            val: false,
                            ack: true,
                        });
                    } else {
                        await this.setState('RAW.Email', {
                            val: JSON.stringify(mail),
                            ack: true,
                        });
                        await this.setState('settings.EmailNotification', {
                            val: Boolean(mail.value.Email.enable),
                            ack: true,
                        });
                    }
                }
            } catch (error) {
                this.apiConnected = false;
                await this.setState('network.connected', {
                    val: this.apiConnected,
                    ack: true,
                });
                this.log.error(`get mail notification: ${error}`);
            }
        }
    }

    async setMailNotification(state: boolean): Promise<void> {
        const mail = await this.getStateAsync('RAW.Email');
        if (mail) {
            const val = JSON.parse(mail.val as string).value.Email;
            const mailCmd: ReolinkCommandSetEmailV20[] = [
                {
                    cmd: 'SetEmailV20',
                    param: {
                        Email: {
                            ssl: val.ssl,
                            enable: state ? 1 : 0,
                            smtpPort: val.smtpPort,
                            smtpServer: val.smtpServer,
                            userName: val.userName,
                            nickName: val.nickName,
                            addr1: val.addr1,
                            addr2: val.addr2,
                            addr3: val.addr3,
                            interval: val.interval,
                        },
                    },
                },
            ];
            // this.log.debug(JSON.stringify(mailCmd));
            await this.sendCmd(mailCmd, 'SetEmailV20');
        } else {
            this.log.error('Set mail notification: Cannot find RAW.Email!');
        }
    }

    async rebootCam(): Promise<void> {
        if (this.reolinkApiClient) {
            try {
                // cmd, user, password
                const mailValue = await this.reolinkApiClient.get(this.genUrl('Reboot', false, false));
                this.log.debug(`mailValue ${JSON.stringify(mailValue.status)}: ${JSON.stringify(mailValue.data)}`);

                if (mailValue.status === 200) {
                    this.apiConnected = true;
                    await this.setState('network.connected', {
                        val: this.apiConnected,
                        ack: true,
                    });
                    this.log.info(`${this.config.cameraIp} reboot triggered!`);
                }
            } catch (error) {
                this.apiConnected = false;
                await this.setState('network.connected', {
                    val: this.apiConnected,
                    ack: true,
                });
                this.log.error(`reboot cam: ${error}`);
            }
        }
    }

    /**
     * Is called when adapter shuts down - callback has to be called under any circumstances!
     *
     * @param callback last execution
     */
    onUnload(callback: () => void): void {
        try {
            // Clear all timers first
            if (this.refreshStateTimeout) {
                this.clearTimeout(this.refreshStateTimeout);
            }
            if (this.streamAutoDisableTimer) {
                this.clearTimeout(this.streamAutoDisableTimer);
            }
            if (this.mqttAutoDisableTimer) {
                this.clearTimeout(this.mqttAutoDisableTimer);
            }
            if (this.mqttBatteryQueryInterval) {
                this.clearInterval(this.mqttBatteryQueryInterval);
            }

            // Stop MQTT client + neolink processes
            const promises: Promise<void>[] = [];
            if (this.mqttHelper) {
                this.log.debug('Disconnecting MQTT client...');
                promises.push(this.mqttHelper.disconnect());
            }
            if (this.neolinkManager) {
                this.log.debug('Stopping neolink processes (MQTT first, then RTSP)...');
                promises.push(this.neolinkManager.stopMqtt().then(() => this.neolinkManager!.stopRtsp()));
            }

            if (promises.length > 0) {
                Promise.all(promises)
                    .then(() => {
                        this.log.debug('All services stopped');
                        callback();
                    })
                    .catch(err => {
                        this.log.error(`Failed to stop services: ${err.message}`);
                        callback();
                    });
                return;
            }

            callback();
        } catch (error) {
            this.log.error(`onUnload: ${error}`);
            callback();
        }
    }

    /**
     * Is called if a subscribed state changes
     *
     * @param id contain the changed property
     * @param state contain the new state
     */
    async onStateChange(id: string, state: ioBroker.State | null | undefined): Promise<void> {
        if (state) {
            if (!state.ack) {
                // The state was changed
                this.log.debug(`state ${id} changed: ${state.val} (ack = ${state.ack})`);
                const idValues = id.split('.');
                const propName = idValues[idValues.length - 1];
                this.log.debug(`Changed state: ${propName}`);

                // Battery camera controls
                if (id.endsWith('streams.enable')) {
                    await this.handleBatteryCamStreamControl(!!state.val);
                    return;
                }
                if (id.endsWith('mqtt.enable')) {
                    await this.handleBatteryCamMqttControl();
                    return;
                }
                if (id.endsWith('snapshot')) {
                    await this.handleBatteryCamSnapshot();
                    return;
                }
                if (id.endsWith('floodlight')) {
                    await this.handleBatteryCamFloodlight(!!state.val);
                    return;
                }
                if (id.endsWith('pir')) {
                    await this.handleBatteryCamPir(!!state.val);
                    return;
                }
                if (id.endsWith('query.battery')) {
                    await this.queryBatteryStatus();
                    await this.setStateAsync('query.battery', false, true);
                    return;
                }
                if (id.endsWith('ptz.preset')) {
                    await this.handleBatteryCamPtzPreset(state.val as number);
                    return;
                }
                if (
                    id.endsWith('ptz.up') ||
                    id.endsWith('ptz.down') ||
                    id.endsWith('ptz.left') ||
                    id.endsWith('ptz.right')
                ) {
                    const dir = id.split('.').pop() as 'up' | 'down' | 'left' | 'right';
                    if (state.val === true) {
                        await this.handleBatteryCamPtzStart(dir);
                    } else {
                        await this.handleBatteryCamPtzStop();
                    }
                    return;
                }

                if (id.endsWith('ai_config.raw')) {
                    await this.setAiCfg(state.val as string);
                    return;
                }

                if (propName == 'ir') {
                    await this.setIrLights(state.val as 'Error or not supported' | 'Auto' | 'Off' | 'On');
                } else if (propName === 'ptzPreset') {
                    await this.ptzCtrl(state.val as number);
                } else if (propName === 'ptzPatrol') {
                    await this.ptzCtrl2(state.val as number);
                } else if (propName === 'autoFocus') {
                    await this.setAutoFocus(state.val as number | string);
                } else if (propName === 'setZoomFocus') {
                    await this.startZoomFocus(parseInt(state.val as string, 10));
                } else if (propName === 'push') {
                    await this.setPush(!!state.val);
                } else if (propName === 'ftp') {
                    await this.setFtp(
                        state.val === true || state.val === 'true' || state.val === 1 || state.val === '1',
                    );
                } else if (propName === 'scheduledRecording') {
                    await this.setScheduledRecording(
                        state.val === true || state.val === 'true' || state.val === 1 || state.val === '1',
                    );
                } else if (propName === 'playAlarm') {
                    let alarmCount: number;
                    if (typeof state.val === 'boolean') {
                        alarmCount = state.val ? 1 : 0;
                    } else {
                        alarmCount = parseInt(state.val as string, 10);
                    }
                    if (alarmCount > 0 && !isNaN(alarmCount)) {
                        await this.audioAlarmPlay(alarmCount);
                    }
                } else if (propName === 'switchLed') {
                    await this.switchWhiteLed(
                        state.val === true || state.val === 'true' || state.val === 1 || state.val === '1',
                    );
                } else if (propName === 'ledBrightness') {
                    await this.setWhiteLed(parseInt(state.val as string, 10));
                } else if (propName === 'ledMode') {
                    await this.setWhiteLedMode(parseInt(state.val as string, 10) as 0 | 1 | 2 | 3);
                } else if (propName === 'getDiscData') {
                    await this.getDriveInfo();
                } else if (propName === 'ptzEnableGuard') {
                    await this.setPtzGuard(
                        state.val === true || state.val === 'true' || state.val === 1 || state.val === '1',
                    );
                } else if (propName === 'ptzCheck') {
                    await this.setPtzCheck();
                } else if (propName === 'ptzGuardTimeout') {
                    await this.setPtzGuardTimeout(parseInt(state.val as string, 10));
                } else if (propName === 'EmailNotification') {
                    await this.setMailNotification(Boolean(state.val));
                }
                if (propName === 'reboot') {
                    await this.rebootCam();
                }
            }
        } else {
            // The state was deleted
            this.log.debug(`state ${id} deleted`);
        }
    }

    async onMessage(obj: ioBroker.Message): Promise<void> {
        if (typeof obj === 'object') {
            // this.log.debug(JSON.stringify(obj));
            // {"command":"send","message":{"action":"snap"},"from":"system.adapter.javascript.0","callback":{"message":{"action":"snap"},"id":13,"ack":false,"time":1660317360713},"_id":42782776}
            if (obj.message.action === 'snap') {
                const image = await this.getSnapshot();
                if (obj.callback) {
                    if (image) {
                        this.log.debug('send back the image!');
                        this.sendTo(obj.from, obj.command, image, obj.callback);
                    }
                }
            }
        }
    }

    /**
     * Start battery camera with neolink
     */
    private async startBatteryCam(): Promise<void> {
        // Validate battery cam config
        if (!this.config.cameraUID) {
            this.log.error('Battery camera requires Camera UID - please set it in adapter config!');
            return;
        }

        // Remove any leftover HTTP cam states (in case user switched camera type)
        await this.cleanupHttpCamStates();

        try {
            // Check system dependencies
            this.log.debug('Checking system dependencies for battery camera...');
            const deps = await checkAllDependencies();

            // GStreamer check (critical for neolink RTSP server)
            if (!deps.gstreamer.available) {
                this.log.error('❌ CRITICAL: GStreamer RTSP library NOT FOUND!');
                this.log.error('Battery camera requires GStreamer RTSP server library to function.');
                this.log.error('📖 Installation instructions:');
                this.log.error(deps.gstreamer.installCommand || 'See README.md Battery Camera section');
                this.log.error('Adapter will not start battery camera without this dependency.');
                await this.setStateAsync('info.connection', false, true);
                return;
            }
            this.log.info(`✅ GStreamer RTSP library found (${deps.gstreamer.version})`);

            // ffmpeg check (optional, for snapshot feature)
            if (!deps.ffmpeg.available) {
                this.log.warn('⚠️ Optional: ffmpeg NOT FOUND');
                this.log.warn('Snapshot feature will not be available without ffmpeg.');
                this.log.warn('📖 To enable snapshots, install ffmpeg:');
                this.log.warn(deps.ffmpeg.installCommand || 'See README.md');
                this.ffmpegAvailable = false;
            } else {
                this.log.info(`✅ ffmpeg found (${deps.ffmpeg.version}) - Snapshot feature available`);
                this.ffmpegAvailable = true;
            }

            // Initialize neolink manager
            // Use absolute path in ioBroker data directory
            const dataDir = path.join(utils.getAbsoluteDefaultDataDir(), this.namespace.replace(/\./g, '_'));
            this.neolinkManager = new NeolinkManager(dataDir, (cameraName, level, message) => {
                switch (level) {
                    case 'error':
                        this.log.error(`[${cameraName}] ${message}`);
                        break;
                    case 'warn':
                        this.log.warn(`[${cameraName}] ${message}`);
                        break;
                    case 'debug':
                        this.log.debug(`[${cameraName}] ${message}`);
                        break;
                    default:
                        this.log.info(`[${cameraName}] ${message}`);
                }
            });

            // Kill any orphaned neolink processes from previous runs
            await this.neolinkManager.killOrphanedProcesses();

            // Prepare neolink config
            const cameraName = this.config.cameraBatteryName || 'Camera01';
            this.neolinkConfig = {
                name: cameraName, // Friendly camera name for MQTT topics
                username: this.config.cameraUser,
                password: this.config.cameraPassword,
                uid: this.config.cameraUID,
                address: this.config.cameraIp,
                pauseTimeout: this.config.pauseTimeout || 2.1,
                // MQTT config (from adapter settings, used when MQTT is enabled)
                mqttBroker: this.config.mqttBroker || '127.0.0.1',
                mqttPort: this.config.mqttPort || 1883,
                mqttUser: this.config.mqttUsername,
                mqttPassword: this.config.mqttPassword,
                enableFloodlight: true,
            };

            // DON'T start RTSP automatically - only when user enables streams!
            // Store config for later use
            this.log.info(`Battery camera configured: ${cameraName}`);
            this.log.debug(`MQTT topics will use camera name: ${cameraName}`);

            // Create battery cam states
            await this.createBatteryCamStates();

            // Calculate RTSP URLs (will be available when stream starts)
            // Use camera name (not adapter name) for RTSP URLs - already defined above
            const mainStreamUrl = this.neolinkManager.getRtspUrl(this.neolinkConfig.name, 'mainStream');
            const subStreamUrl = this.neolinkManager.getRtspUrl(this.neolinkConfig.name, 'subStream');

            this.log.debug(`RTSP Main Stream URL (when enabled): ${mainStreamUrl}`);
            this.log.debug(`RTSP Sub Stream URL (when enabled): ${subStreamUrl}`);

            await this.setStateAsync('streams.mainStream', mainStreamUrl, true);
            await this.setStateAsync('streams.subStream', subStreamUrl, true);
            await this.setStateAsync('info.neolink_status', 'stopped', true);
            await this.setStateAsync('info.connection', true, true);

            // Subscribe to control states
            this.subscribeStates('streams.enable');
            this.subscribeStates('mqtt.enable');
            this.subscribeStates('snapshot');
            this.subscribeStates('floodlight');
            this.subscribeStates('pir');
            this.subscribeStates('ptz.preset');
            this.subscribeStates('ptz.up');
            this.subscribeStates('ptz.down');
            this.subscribeStates('ptz.left');
            this.subscribeStates('ptz.right');
            this.subscribeStates('query.battery');

            this.log.info('Battery camera ready!');

            // Query initial PIR status via CLI (needs time for RTSP to connect)
            this.setTimeout(() => {
                void this.queryPirState();
            }, 10000);
        } catch (error) {
            this.log.error(`Failed to start battery camera: ${error instanceof Error ? error.message : error}`);
            await this.setStateAsync('info.neolink_status', 'error', true);
            await this.setStateAsync('info.connection', false, true);
        }
    }

    /**
     * Create state objects for battery cameras
     */
    private async createBatteryCamStates(): Promise<void> {
        // Info states
        await this.setObjectNotExistsAsync('info.uid', {
            type: 'state',
            common: {
                name: 'Camera UID',
                type: 'string',
                role: 'info',
                read: true,
                write: false,
            },
            native: {},
        });
        await this.setStateAsync('info.uid', this.config.cameraUID, true);

        await this.setObjectNotExistsAsync('info.neolink_status', {
            type: 'state',
            common: {
                name: 'Neolink Status',
                type: 'string',
                role: 'info.status',
                read: true,
                write: false,
                states: {
                    running: 'Running',
                    stopped: 'Stopped',
                    error: 'Error',
                },
            },
            native: {},
        });

        // Stream URLs
        await this.setObjectNotExistsAsync('streams', {
            type: 'channel',
            common: {
                name: 'RTSP Streams',
            },
            native: {},
        });

        await this.setObjectNotExistsAsync('streams.mainStream', {
            type: 'state',
            common: {
                name: 'Main Stream RTSP URL',
                type: 'string',
                role: 'text.url',
                read: true,
                write: false,
            },
            native: {},
        });

        await this.setObjectNotExistsAsync('streams.subStream', {
            type: 'state',
            common: {
                name: 'Sub Stream RTSP URL',
                type: 'string',
                role: 'text.url',
                read: true,
                write: false,
                desc: 'Sub stream RTSP URL. NOTE: May use H.265 (HEVC) - if white noise appears, use mainStream or set subStream to H.264 in Reolink app.',
            },
            native: {},
        });

        // Stream control (battery saving!)
        await this.setObjectNotExistsAsync('streams.enable', {
            type: 'state',
            common: {
                name: 'Enable Streaming (Battery Drain!)',
                type: 'boolean',
                role: 'switch.enable',
                read: true,
                write: true,
                def: false,
                desc: 'Enable RTSP streaming. WARNING: Drains battery quickly! Only enable when actively viewing.',
            },
            native: {},
        });
        await this.setStateAsync('streams.enable', false, true);

        // MQTT control
        await this.setObjectNotExistsAsync('mqtt', {
            type: 'channel',
            common: {
                name: 'MQTT Motion & Battery',
            },
            native: {},
        });

        await this.setObjectNotExistsAsync('mqtt.enable', {
            type: 'state',
            common: {
                name: 'Enable MQTT (Motion/Battery)',
                type: 'boolean',
                role: 'switch.enable',
                read: true,
                write: true,
                def: false,
                desc: 'Enable MQTT for motion detection and battery level monitoring (configure broker in adapter settings)',
            },
            native: {},
        });
        await this.setStateAsync('mqtt.enable', false, true);

        // Status channel (MQTT feedback from camera)
        await this.setObjectNotExistsAsync('status', {
            type: 'channel',
            common: {
                name: 'Camera Status (MQTT)',
            },
            native: {},
        });

        await this.setObjectNotExistsAsync('status.motion', {
            type: 'state',
            common: {
                name: 'Motion Detection',
                type: 'boolean',
                role: 'sensor.motion',
                read: true,
                write: false,
                desc: 'Motion detection from camera (requires mqtt.enable = true)',
            },
            native: {},
        });
        await this.setStateAsync('status.motion', false, true);

        await this.setObjectNotExistsAsync('status.battery_level', {
            type: 'state',
            common: {
                name: 'Battery Level',
                type: 'number',
                role: 'value.battery',
                unit: '%',
                read: true,
                write: false,
                min: 0,
                max: 100,
                desc: 'Battery level from camera (requires mqtt.enable = true)',
            },
            native: {},
        });

        // Initialize status states with default values
        await this.setStateAsync('status.motion', false, true);

        // Snapshot (requires ffmpeg)
        await this.setObjectNotExistsAsync('snapshot', {
            type: 'state',
            common: {
                name: 'Snapshot (trigger capture)',
                type: 'boolean',
                role: 'button',
                read: false,
                write: true,
                desc: 'Set to true to capture snapshot from mainStream (requires ffmpeg)',
            },
            native: {},
        });

        await this.setObjectNotExistsAsync('snapshotImage', {
            type: 'state',
            common: {
                name: 'Latest Snapshot Image',
                type: 'string',
                role: 'image',
                read: true,
                write: false,
                desc: 'Base64-encoded JPEG snapshot',
            },
            native: {},
        });

        await this.setObjectNotExistsAsync('snapshotStatus', {
            type: 'state',
            common: {
                name: 'Snapshot Status',
                type: 'string',
                role: 'info.status',
                read: true,
                write: false,
                states: {
                    idle: 'Idle',
                    capturing: 'Capturing...',
                    success: 'Success',
                    error: 'Error',
                },
            },
            native: {},
        });
        await this.setStateAsync('snapshotStatus', 'idle', true);

        // PIR control (requires MQTT)
        await this.setObjectNotExistsAsync('pir', {
            type: 'state',
            common: {
                name: 'PIR On/Off',
                type: 'boolean',
                role: 'switch',
                read: true,
                write: true,
                def: false,
                desc: 'Control camera PIR sensor (requires MQTT enabled)',
            },
            native: {},
        });

        // Floodlight control (requires MQTT)
        await this.setObjectNotExistsAsync('floodlight', {
            type: 'state',
            common: {
                name: 'Floodlight On/Off',
                type: 'boolean',
                role: 'switch.light',
                read: true,
                write: true,
                def: false,
                desc: 'Control camera floodlight (requires MQTT enabled)',
            },
            native: {},
        });

        // PTZ control (pan/tilt/zoom via neolink CLI)
        await this.setObjectNotExistsAsync('ptz', {
            type: 'channel',
            common: {
                name: 'PTZ Control',
            },
            native: {},
        });

        await this.setObjectNotExistsAsync('ptz.preset', {
            type: 'state',
            common: {
                name: { en: 'Move to PTZ Preset', de: 'Zu PTZ-Preset fahren' },
                type: 'number',
                role: 'value',
                read: true,
                write: true,
                min: 0,
                max: 255,
                def: 0,
                desc: 'Enter preset ID and write to move camera to that position',
            },
            native: {},
        });
        await this.setStateAsync('ptz.preset', 0, true);

        await this.setObjectNotExistsAsync('ptz.up', {
            type: 'state',
            common: {
                name: { en: 'PTZ Up (true = move, false = stop)', de: 'PTZ Hoch (true = bewegen, false = stopp)' },
                type: 'boolean',
                role: 'switch',
                read: true,
                write: true,
                def: false,
            },
            native: {},
        });

        await this.setObjectNotExistsAsync('ptz.down', {
            type: 'state',
            common: {
                name: { en: 'PTZ Down (true = move, false = stop)', de: 'PTZ Runter (true = bewegen, false = stopp)' },
                type: 'boolean',
                role: 'switch',
                read: true,
                write: true,
                def: false,
            },
            native: {},
        });

        await this.setObjectNotExistsAsync('ptz.left', {
            type: 'state',
            common: {
                name: { en: 'PTZ Left (true = move, false = stop)', de: 'PTZ Links (true = bewegen, false = stopp)' },
                type: 'boolean',
                role: 'switch',
                read: true,
                write: true,
                def: false,
            },
            native: {},
        });

        await this.setObjectNotExistsAsync('ptz.right', {
            type: 'state',
            common: {
                name: { en: 'PTZ Right (true = move, false = stop)', de: 'PTZ Rechts (true = bewegen, false = stopp)' },
                type: 'boolean',
                role: 'switch',
                read: true,
                write: true,
                def: false,
            },
            native: {},
        });

        await this.setObjectNotExistsAsync('ptz.speed', {
            type: 'state',
            common: {
                name: { en: 'PTZ Speed (1–100)', de: 'PTZ Geschwindigkeit (1–100)' },
                type: 'number',
                role: 'level',
                min: 1,
                max: 100,
                read: true,
                write: true,
                def: 32,
            },
            native: {},
        });
        await this.setStateAsync('ptz.speed', 32, true);

        await this.setObjectNotExistsAsync('query', {
            type: 'channel',
            common: {
                name: 'Neolink Queries',
            },
            native: {},
        });

        await this.setObjectNotExistsAsync('query.battery', {
            type: 'state',
            common: {
                name: 'Query Battery Status',
                type: 'boolean',
                role: 'button',
                read: false,
                write: true,
                def: false,
                desc: 'Send MQTT query for battery status',
            },
            native: {},
        });
        await this.setStateAsync('query.battery', false, true);

        this.log.debug('Battery camera states created');
    }

    /**
     * Cleanup battery camera states when switching to HTTP API mode
     */
    private async cleanupBatteryCamStates(): Promise<void> {
        this.log.debug('Cleaning up battery camera states...');

        const batteryCamStates = [
            'streams',
            'streams.mainStream',
            'streams.subStream',
            'streams.enable',
            'mqtt',
            'mqtt.enable',
            'status',
            'status.motion',
            'status.battery_level',
            'snapshotImage',
            'snapshotStatus',
            'floodlight',
            'pir',
            'ptz',
            'ptz.preset',
            'ptz.up',
            'ptz.down',
            'ptz.left',
            'ptz.right',
            'query',
            'query.battery',
            'info.uid',
            'info.neolink_status',
        ];

        for (const stateId of batteryCamStates) {
            try {
                const obj = await this.getObjectAsync(stateId);
                if (obj) {
                    await this.delObjectAsync(stateId);
                    this.log.debug(`Deleted battery cam state: ${stateId}`);
                }
            } catch {
                // Ignore - state might not exist
            }
        }

        this.log.debug('Battery camera states cleanup complete');
    }

    /**
     * Create state objects for HTTP API cameras (standard Reolink cameras).
     * Called on adapter start when isBatteryCam = false, analogous to
     * createBatteryCamStates() for battery cameras. This ensures all states
     * exist before any setState() call, without relying on instanceObjects.
     */
    private async createHttpCamStates(): Promise<void> {
        this.log.debug('Creating HTTP camera states...');

        // --- AI Config ---
        await this.setObjectNotExistsAsync('ai_config', { type: 'channel', common: { name: 'AI Config' }, native: {} });
        await this.setObjectNotExistsAsync('ai_config.raw', {
            type: 'state',
            common: { role: 'value', name: { en: 'Raw AI Config' }, type: 'object', read: true, write: true },
            native: {},
        });

        // --- Sensor ---
        await this.setObjectNotExistsAsync('sensor', {
            type: 'channel',
            common: { name: { en: 'sensor', de: 'sensor' } },
            native: {},
        });
        await this.setObjectNotExistsAsync('sensor.motion', {
            type: 'state',
            common: {
                role: 'sensor.motion',
                name: { en: 'motion detection', de: 'Bewegungserkennung' },
                type: 'boolean',
                read: true,
                write: false,
            },
            native: {},
        });
        await this.setObjectNotExistsAsync('sensor.dog_cat', {
            type: 'channel',
            common: { name: { en: 'dog cat', de: 'hund katze' } },
            native: {},
        });
        await this.setObjectNotExistsAsync('sensor.dog_cat.state', {
            type: 'state',
            common: {
                role: 'value',
                name: { en: 'dog cat detection', de: 'hund katze erkennung' },
                type: 'boolean',
                read: true,
                write: false,
            },
            native: {},
        });
        await this.setObjectNotExistsAsync('sensor.dog_cat.support', {
            type: 'state',
            common: {
                role: 'value',
                name: { en: 'dog cat support', de: 'hund katze unterstützung' },
                type: 'boolean',
                read: true,
                write: false,
            },
            native: {},
        });
        await this.setObjectNotExistsAsync('sensor.face', {
            type: 'channel',
            common: { name: { en: 'face', de: 'gesicht' } },
            native: {},
        });
        await this.setObjectNotExistsAsync('sensor.face.state', {
            type: 'state',
            common: {
                role: 'value',
                name: { en: 'face detection', de: 'gesichtserkennung' },
                type: 'boolean',
                read: true,
                write: false,
            },
            native: {},
        });
        await this.setObjectNotExistsAsync('sensor.face.support', {
            type: 'state',
            common: {
                role: 'value',
                name: { en: 'face support', de: 'gesicht unterstützung' },
                type: 'boolean',
                read: true,
                write: false,
            },
            native: {},
        });
        await this.setObjectNotExistsAsync('sensor.people', {
            type: 'channel',
            common: { name: { en: 'people', de: 'personen' } },
            native: {},
        });
        await this.setObjectNotExistsAsync('sensor.people.state', {
            type: 'state',
            common: {
                role: 'value',
                name: { en: 'people detection', de: 'personenerkennung' },
                type: 'boolean',
                read: true,
                write: false,
            },
            native: {},
        });
        await this.setObjectNotExistsAsync('sensor.people.support', {
            type: 'state',
            common: {
                role: 'value',
                name: { en: 'people support', de: 'personen unterstützung' },
                type: 'boolean',
                read: true,
                write: false,
            },
            native: {},
        });
        await this.setObjectNotExistsAsync('sensor.vehicle', {
            type: 'channel',
            common: { name: { en: 'vehicle', de: 'fahrzeug' } },
            native: {},
        });
        await this.setObjectNotExistsAsync('sensor.vehicle.state', {
            type: 'state',
            common: {
                role: 'value',
                name: { en: 'vehicle detection', de: 'fahrzeugerkennung' },
                type: 'boolean',
                read: true,
                write: false,
            },
            native: {},
        });
        await this.setObjectNotExistsAsync('sensor.vehicle.support', {
            type: 'state',
            common: {
                role: 'value',
                name: { en: 'vehicle support', de: 'fahrzeug unterstützung' },
                type: 'boolean',
                read: true,
                write: false,
            },
            native: {},
        });

        // --- Disc ---
        await this.setObjectNotExistsAsync('disc', {
            type: 'channel',
            common: { name: { en: 'disc', de: 'festplatte' } },
            native: {},
        });
        await this.setObjectNotExistsAsync('disc.capacity', {
            type: 'state',
            common: {
                role: 'value',
                name: { en: 'disc capacity', de: 'festplattenkapazität' },
                type: 'number',
                unit: 'MB',
                read: true,
                write: false,
            },
            native: {},
        });
        await this.setObjectNotExistsAsync('disc.formatted', {
            type: 'state',
            common: {
                role: 'value',
                name: { en: 'disc formatted', de: 'festplatte formatiert' },
                type: 'boolean',
                read: true,
                write: false,
            },
            native: {},
        });
        await this.setObjectNotExistsAsync('disc.mounted', {
            type: 'state',
            common: {
                role: 'value',
                name: { en: 'disc mounted', de: 'festplatte eingehängt' },
                type: 'boolean',
                read: true,
                write: false,
            },
            native: {},
        });
        await this.setObjectNotExistsAsync('disc.free', {
            type: 'state',
            common: {
                role: 'value',
                name: { en: 'disc free', de: 'festplatte frei' },
                type: 'number',
                unit: 'MB',
                read: true,
                write: false,
            },
            native: {},
        });

        // --- Network ---
        await this.setObjectNotExistsAsync('network', {
            type: 'channel',
            common: { name: { en: 'network', de: 'netzwerk' } },
            native: {},
        });
        await this.setObjectNotExistsAsync('network.ip', {
            type: 'state',
            common: {
                role: 'info.ip',
                name: { en: 'IP address', de: 'IP-Adresse' },
                type: 'string',
                read: true,
                write: false,
            },
            native: {},
        });
        await this.setObjectNotExistsAsync('network.channel', {
            type: 'state',
            common: { role: 'value', name: { en: 'channel', de: 'kanal' }, type: 'number', read: true, write: false },
            native: {},
        });
        await this.setObjectNotExistsAsync('network.connected', {
            type: 'state',
            common: {
                role: 'indicator.connected',
                name: { en: 'connected', de: 'verbunden' },
                type: 'boolean',
                read: true,
                write: false,
            },
            native: {},
        });
        await this.setObjectNotExistsAsync('network.mac', {
            type: 'state',
            common: {
                role: 'info.mac',
                name: { en: 'MAC address', de: 'MAC-Adresse' },
                type: 'string',
                read: true,
                write: false,
            },
            native: {},
        });
        await this.setObjectNotExistsAsync('network.activeLink', {
            type: 'state',
            common: {
                role: 'value',
                name: { en: 'active link', de: 'aktiver link' },
                type: 'string',
                read: true,
                write: false,
            },
            native: {},
        });
        await this.setObjectNotExistsAsync('network.dns', {
            type: 'state',
            common: { role: 'info.ip', name: { en: 'DNS', de: 'DNS' }, type: 'string', read: true, write: false },
            native: {},
        });
        await this.setObjectNotExistsAsync('network.gateway', {
            type: 'state',
            common: {
                role: 'info.ip',
                name: { en: 'gateway', de: 'gateway' },
                type: 'string',
                read: true,
                write: false,
            },
            native: {},
        });
        await this.setObjectNotExistsAsync('network.mask', {
            type: 'state',
            common: {
                role: 'value',
                name: { en: 'subnet mask', de: 'subnetzmaske' },
                type: 'string',
                read: true,
                write: false,
            },
            native: {},
        });
        await this.setObjectNotExistsAsync('network.networkType', {
            type: 'state',
            common: {
                role: 'value',
                name: { en: 'network type', de: 'netzwerktyp' },
                type: 'string',
                read: true,
                write: false,
            },
            native: {},
        });

        // --- Device ---
        await this.setObjectNotExistsAsync('device', {
            type: 'channel',
            common: { name: { en: 'device', de: 'gerät' } },
            native: {},
        });
        await this.setObjectNotExistsAsync('device.model', {
            type: 'state',
            common: { role: 'value', name: { en: 'model', de: 'modell' }, type: 'string', read: true, write: false },
            native: {},
        });
        await this.setObjectNotExistsAsync('device.buildDay', {
            type: 'state',
            common: {
                role: 'value',
                name: { en: 'build day', de: 'build tag' },
                type: 'string',
                read: true,
                write: false,
            },
            native: {},
        });
        await this.setObjectNotExistsAsync('device.cfgVer', {
            type: 'state',
            common: {
                role: 'value',
                name: { en: 'config version', de: 'konfigurationsversion' },
                type: 'string',
                read: true,
                write: false,
            },
            native: {},
        });
        await this.setObjectNotExistsAsync('device.detail', {
            type: 'state',
            common: { role: 'value', name: { en: 'detail', de: 'detail' }, type: 'string', read: true, write: false },
            native: {},
        });
        await this.setObjectNotExistsAsync('device.diskNum', {
            type: 'state',
            common: {
                role: 'value',
                name: { en: 'disk number', de: 'festplattenanzahl' },
                type: 'number',
                read: true,
                write: false,
            },
            native: {},
        });
        await this.setObjectNotExistsAsync('device.firmVer', {
            type: 'state',
            common: {
                role: 'value',
                name: { en: 'firmware version', de: 'firmwareversion' },
                type: 'string',
                read: true,
                write: false,
            },
            native: {},
        });
        await this.setObjectNotExistsAsync('device.name', {
            type: 'state',
            common: { role: 'info.name', name: { en: 'name', de: 'name' }, type: 'string', read: true, write: false },
            native: {},
        });
        await this.setObjectNotExistsAsync('device.serial', {
            type: 'state',
            common: {
                role: 'value',
                name: { en: 'serial', de: 'seriennummer' },
                type: 'string',
                read: true,
                write: false,
            },
            native: {},
        });
        await this.setObjectNotExistsAsync('device.wifi', {
            type: 'state',
            common: { role: 'value', name: { en: 'wifi', de: 'wifi' }, type: 'number', read: true, write: false },
            native: {},
        });

        // --- Settings ---
        await this.setObjectNotExistsAsync('settings', {
            type: 'channel',
            common: { name: { en: 'settings', de: 'einstellungen' } },
            native: {},
        });
        await this.setObjectNotExistsAsync('settings.ir', {
            type: 'state',
            common: {
                role: 'switch',
                name: { en: 'infrared', de: 'infrarot' },
                type: 'string',
                read: true,
                write: true,
            },
            native: {},
        });
        await this.setObjectNotExistsAsync('settings.switchLed', {
            type: 'state',
            common: {
                role: 'switch',
                name: { en: 'LED switch', de: 'LED-Schalter' },
                type: 'boolean',
                read: true,
                write: true,
            },
            native: {},
        });
        await this.setObjectNotExistsAsync('settings.ledBrightness', {
            type: 'state',
            common: {
                role: 'level',
                name: { en: 'LED brightness', de: 'LED-Helligkeit' },
                type: 'number',
                read: true,
                write: true,
            },
            native: {},
        });
        await this.setObjectNotExistsAsync('settings.ledMode', {
            type: 'state',
            common: {
                role: 'value',
                name: { en: 'LED mode', de: 'LED-Modus' },
                type: 'number',
                read: true,
                write: true,
            },
            native: {},
        });
        await this.setObjectNotExistsAsync('settings.ptzPreset', {
            type: 'state',
            common: {
                role: 'value',
                name: { en: 'PTZ preset', de: 'PTZ-preset' },
                type: 'number',
                read: true,
                write: true,
            },
            native: {},
        });
        await this.setObjectNotExistsAsync('settings.ptzPatrol', {
            type: 'state',
            common: {
                role: 'switch',
                name: { en: 'PTZ patrol', de: 'PTZ-patrol' },
                type: 'boolean',
                read: true,
                write: true,
            },
            native: {},
        });
        await this.setObjectNotExistsAsync('settings.push', {
            type: 'state',
            common: {
                role: 'switch',
                name: { en: 'push notification', de: 'push-benachrichtigung' },
                type: 'boolean',
                read: true,
                write: true,
            },
            native: {},
        });
        await this.setObjectNotExistsAsync('settings.ftp', {
            type: 'state',
            common: {
                role: 'switch',
                name: { en: 'FTP', de: 'FTP' },
                type: 'boolean',
                read: true,
                write: true,
            },
            native: {},
        });
        await this.setObjectNotExistsAsync('settings.autoFocus', {
            type: 'state',
            common: {
                role: 'switch',
                name: { en: 'auto focus', de: 'autofokus' },
                type: 'string',
                read: true,
                write: true,
            },
            native: {},
        });
        await this.setObjectNotExistsAsync('settings.EmailNotification', {
            type: 'state',
            common: {
                role: 'switch',
                name: { en: 'email notification', de: 'E-Mail-Benachrichtigung' },
                type: 'boolean',
                read: true,
                write: true,
            },
            native: {},
        });
        await this.setObjectNotExistsAsync('settings.setZoomFocus', {
            type: 'state',
            common: {
                role: 'value',
                name: { en: 'set zoom focus', de: 'zoom fokus setzen' },
                type: 'number',
                read: true,
                write: true,
            },
            native: {},
        });
        await this.setObjectNotExistsAsync('settings.focus', {
            type: 'state',
            common: { role: 'value', name: { en: 'focus', de: 'fokus' }, type: 'number', read: true, write: false },
            native: {},
        });
        await this.setObjectNotExistsAsync('settings.scheduledRecording', {
            type: 'state',
            common: {
                role: 'switch',
                name: { en: 'scheduled recording', de: 'geplante aufnahme' },
                type: 'boolean',
                read: true,
                write: true,
            },
            native: {},
        });
        await this.setObjectNotExistsAsync('settings.playAlarm', {
            type: 'state',
            common: {
                role: 'value',
                name: { en: 'play alarm (number of times)', de: 'alarm abspielen (anzahl)' },
                type: 'number',
                min: 0,
                max: 10,
                def: 1,
                read: true,
                write: true,
            },
            native: {},
        });
        await this.setObjectNotExistsAsync('settings.getDiscData', {
            type: 'state',
            common: {
                role: 'switch',
                name: { en: 'get disc data', de: 'festplattendaten abrufen' },
                type: 'boolean',
                read: true,
                write: true,
            },
            native: {},
        });
        await this.setObjectNotExistsAsync('settings.ptzEnableGuard', {
            type: 'state',
            common: {
                role: 'switch',
                name: { en: 'PTZ enable guard', de: 'PTZ-wächter aktivieren' },
                type: 'boolean',
                read: true,
                write: true,
            },
            native: {},
        });
        await this.setObjectNotExistsAsync('settings.ptzCheck', {
            type: 'state',
            common: {
                role: 'switch',
                name: { en: 'PTZ check', de: 'PTZ-prüfung' },
                type: 'boolean',
                read: true,
                write: true,
            },
            native: {},
        });
        await this.setObjectNotExistsAsync('settings.ptzGuardTimeout', {
            type: 'state',
            common: {
                role: 'value',
                name: { en: 'PTZ guard timeout', de: 'PTZ-wächter timeout' },
                type: 'number',
                read: true,
                write: true,
            },
            native: {},
        });

        // --- Command ---
        await this.setObjectNotExistsAsync('command', {
            type: 'channel',
            common: { name: { en: 'command', de: 'befehl' } },
            native: {},
        });
        await this.setObjectNotExistsAsync('command.reboot', {
            type: 'state',
            common: {
                role: 'button',
                name: { en: 'reboot', de: 'neustart' },
                type: 'boolean',
                read: false,
                write: true,
            },
            native: {},
        });

        // --- RAW ---
        await this.setObjectNotExistsAsync('RAW', {
            type: 'channel',
            common: { name: { en: 'RAW', de: 'RAW' } },
            native: {},
        });
        await this.setObjectNotExistsAsync('RAW.Email', {
            type: 'state',
            common: {
                role: 'value',
                name: { en: 'Email RAW config', de: 'E-Mail RAW Konfiguration' },
                type: 'object',
                read: true,
                write: true,
            },
            native: {},
        });

        this.log.debug('HTTP camera states created');
    }

    /**
     * Cleanup HTTP camera states when switching to battery cam mode.
     * Removes all states that were created by createHttpCamStates().
     */
    private async cleanupHttpCamStates(): Promise<void> {
        this.log.debug('Cleaning up HTTP camera states...');

        const httpCamObjects = [
            'ai_config.raw',
            'ai_config',
            'sensor.motion',
            'sensor.dog_cat.state',
            'sensor.dog_cat.support',
            'sensor.dog_cat',
            'sensor.face.state',
            'sensor.face.support',
            'sensor.face',
            'sensor.people.state',
            'sensor.people.support',
            'sensor.people',
            'sensor.vehicle.state',
            'sensor.vehicle.support',
            'sensor.vehicle',
            'sensor',
            'disc.capacity',
            'disc.formatted',
            'disc.mounted',
            'disc.free',
            'disc',
            'network.ip',
            'network.channel',
            'network.connected',
            'network.mac',
            'network.activeLink',
            'network.dns',
            'network.gateway',
            'network.mask',
            'network.networkType',
            'network',
            'device.model',
            'device.buildDay',
            'device.cfgVer',
            'device.detail',
            'device.diskNum',
            'device.firmVer',
            'device.name',
            'device.serial',
            'device.wifi',
            'device',
            'settings.ir',
            'settings.switchLed',
            'settings.ledBrightness',
            'settings.ledMode',
            'settings.ptzPreset',
            'settings.ptzPatrol',
            'settings.push',
            'settings.ftp',
            'settings.autoFocus',
            'settings.EmailNotification',
            'settings.setZoomFocus',
            'settings.focus',
            'settings.scheduledRecording',
            'settings.playAlarm',
            'settings.getDiscData',
            'settings.ptzEnableGuard',
            'settings.ptzCheck',
            'settings.ptzGuardTimeout',
            'settings',
            'command.reboot',
            'command',
            'RAW.Email',
            'RAW',
        ];

        for (const id of httpCamObjects) {
            try {
                const obj = await this.getObjectAsync(id);
                if (obj) {
                    await this.delObjectAsync(id);
                    this.log.debug(`Deleted HTTP cam state: ${id}`);
                }
            } catch {
                // Ignore - object might not exist
            }
        }

        this.log.debug('HTTP camera states cleanup complete');
    }

    /**
     * Handle stream enable/disable for battery camera
     * Note: Streams are managed by neolink's pause_on_client feature.
     * This only controls the auto-disable timer for battery protection.
     */
    private async handleBatteryCamStreamControl(enable: boolean): Promise<void> {
        if (!this.neolinkManager || !this.neolinkConfig) {
            this.log.warn('Neolink manager not initialized');
            return;
        }

        // Clear existing timer
        if (this.streamAutoDisableTimer) {
            this.clearTimeout(this.streamAutoDisableTimer);
            this.streamAutoDisableTimer = undefined;
        }

        if (enable) {
            // Start RTSP process if not running
            if (!this.neolinkManager.isRtspRunning()) {
                this.log.info('Starting RTSP stream for battery camera...');
                await this.neolinkManager.startRtsp(this.neolinkConfig);
                await this.setStateAsync('info.neolink_status', 'running', true);
                this.log.info('✅ RTSP stream started');
            }

            // Get auto-disable timeout from config (default: 30s)
            const autoDisableSeconds = this.config.streamAutoDisableSeconds || 30;

            this.log.debug(`Streaming enabled - auto-disable in ${autoDisableSeconds}s (battery protection)`);
            await this.setStateAsync('streams.enable', true, true);

            // Set auto-disable timer
            this.streamAutoDisableTimer = this.setTimeout(async () => {
                this.log.debug(`Auto-disabling stream after ${autoDisableSeconds}s (battery protection)`);
                await this.setStateAsync('streams.enable', false, false);
                this.streamAutoDisableTimer = undefined;
            }, autoDisableSeconds * 1000);

            // Note: Neolink streams auto-pause when no RTSP client is connected (pause_on_client=true)
            // This timer is an additional battery protection layer
        } else {
            this.log.debug('Streaming disabled - stopping RTSP process');

            // Stop RTSP process
            if (this.neolinkManager.isRtspRunning()) {
                await this.neolinkManager.stopRtsp();
                await this.setStateAsync('info.neolink_status', 'stopped', true);
                this.log.debug('RTSP stream stopped');
            }

            await this.setStateAsync('streams.enable', false, true);
            // Neolink will disconnect on idle (idle_disconnect=true in config)
        }
    }

    /**
     * Handle MQTT enable/disable for battery camera
     * Starts/stops separate MQTT process for publishing topics
     */
    private async handleBatteryCamMqttControl(): Promise<void> {
        if (this.mqttControlBusy) {
            this.log.debug('MQTT control already in progress, skipping');
            return;
        }
        if (!this.neolinkManager || !this.neolinkConfig) {
            this.log.warn('Neolink manager not initialized');
            return;
        }
        this.mqttControlBusy = true;
        try {
            await this._handleBatteryCamMqttControlInner();
        } finally {
            this.mqttControlBusy = false;
        }
    }

    private async _handleBatteryCamMqttControlInner(): Promise<void> {
        if (!this.neolinkManager || !this.neolinkConfig) {
            return;
        }

        const mqttEnable = await this.getStateAsync('mqtt.enable');
        if (!mqttEnable) {
            return;
        }

        // Clear existing MQTT auto-disable timer
        if (this.mqttAutoDisableTimer) {
            this.clearTimeout(this.mqttAutoDisableTimer);
            this.mqttAutoDisableTimer = undefined;
        }

        if (mqttEnable.val) {
            // Get MQTT config from adapter settings
            const broker = this.config.mqttBroker || '127.0.0.1';
            const port = this.config.mqttPort || 1883;
            const username = this.config.mqttUsername;
            const password = this.config.mqttPassword;

            // Get auto-disable timeout from config (default: 30s)
            const autoDisableSeconds = this.config.mqttAutoDisableSeconds || 30;

            this.log.info(`MQTT enabled - auto-disable in ${autoDisableSeconds}s (battery protection)`);
            this.log.debug(`MQTT Broker: ${broker}:${port}`);
            this.log.debug(`MQTT topics: neolink/${this.neolinkConfig.name}/status/{motion,battery_level,floodlight}`);
            this.log.debug(`Control topics: neolink/${this.neolinkConfig.name}/control/floodlight`);
            this.log.debug(`Query topics: neolink/${this.neolinkConfig.name}/query/battery`);

            // Start MQTT process
            try {
                await this.neolinkManager.startMqtt(this.neolinkConfig);
                this.log.info('✅ MQTT process started - Camera publishing to broker');
            } catch (error) {
                this.log.error(`Failed to start MQTT process: ${error instanceof Error ? error.message : error}`);
                await this.setStateAsync('mqtt.enable', false, true);
                return;
            }

            // Initialize MQTT helper for floodlight control
            if (!this.mqttHelper) {
                try {
                    this.mqttHelper = new MqttHelper(
                        {
                            broker,
                            port,
                            username,
                            password,
                        },
                        (level, message) => {
                            switch (level) {
                                case 'error':
                                    this.log.error(`[MQTT] ${message}`);
                                    break;
                                case 'warn':
                                    this.log.warn(`[MQTT] ${message}`);
                                    break;
                                default:
                                    this.log.info(`[MQTT] ${message}`);
                            }
                        },
                    );

                    // Register message handler BEFORE connect to catch all messages
                    this.mqttHelper.onMessage((topic, message) => {
                        void this.handleMqttMessage(topic, message);
                    });

                    await this.mqttHelper.connect();
                    this.log.info('✅ MQTT client connected');

                    // Subscribe to all status topics with wildcard
                    const cameraName = this.neolinkConfig.name;
                    await this.mqttHelper.subscribe(`neolink/${cameraName}/status/#`);

                    // Re-initialize states
                    await this.setStateAsync('status.motion', false, true);

                    // Send initial battery query via CLI (not MQTT - subprocess doesn't respond to MQTT queries)
                    void this.queryBatteryStatus();

                    // Query initial PIR status via CLI (more reliable than MQTT query)
                    this.setTimeout(() => {
                        void this.queryPirState();
                    }, 5000);

                    // Start periodic battery query via CLI (every 30s)
                    this.mqttBatteryQueryInterval = this.setInterval(() => {
                        void this.queryBatteryStatus();
                    }, 30000);

                    this.log.debug(`Subscribed to status topics for ${cameraName}`);
                } catch (error) {
                    this.log.error(`Failed to connect MQTT client: ${error instanceof Error ? error.message : error}`);
                    this.log.error(`Check MQTT broker settings: ${broker}:${port}`);
                    this.mqttHelper = null;
                }
            }

            // Set auto-disable timer
            this.mqttAutoDisableTimer = this.setTimeout(async () => {
                this.log.debug(`Auto-disabling MQTT after ${autoDisableSeconds}s (battery protection)`);
                await this.setStateAsync('mqtt.enable', false, true);
                this.mqttAutoDisableTimer = undefined;
                await this.handleBatteryCamMqttControl();
            }, autoDisableSeconds * 1000);

            await this.setStateAsync('mqtt.enable', true, true);
        } else {
            this.log.debug('MQTT disabled - battery saving mode');

            // Clear battery query interval
            if (this.mqttBatteryQueryInterval) {
                this.clearInterval(this.mqttBatteryQueryInterval);
                this.mqttBatteryQueryInterval = undefined;
            }

            // Stop MQTT process
            try {
                await this.neolinkManager.stopMqtt();
                this.log.debug('MQTT process stopped');
            } catch (error) {
                this.log.error(`Failed to stop MQTT process: ${error instanceof Error ? error.message : error}`);
            }

            // Disconnect MQTT helper
            if (this.mqttHelper) {
                await this.mqttHelper.disconnect();
                this.mqttHelper = null;
            }

            await this.setStateAsync('mqtt.enable', false, true);
        }
    }

    /**
     * Handle snapshot capture for battery camera
     */
    private async handleBatteryCamSnapshot(): Promise<void> {
        if (!this.neolinkManager) {
            this.log.warn('Neolink manager not initialized');
            await this.setStateAsync('snapshotStatus', 'error', true);
            return;
        }

        if (!this.ffmpegAvailable) {
            this.log.error('Snapshot failed: ffmpeg not available');
            this.log.error('Install ffmpeg to enable snapshot feature (see README.md)');
            await this.setStateAsync('snapshotStatus', 'error', true);
            return;
        }

        try {
            await this.setStateAsync('snapshotStatus', 'capturing', true);

            // Ensure RTSP stream is running
            const wasRunning = this.neolinkManager.isRtspRunning();
            if (!wasRunning) {
                this.log.debug('Starting RTSP stream for snapshot...');
                if (!this.neolinkConfig) {
                    throw new Error('Neolink config not available');
                }
                await this.neolinkManager.startRtsp(this.neolinkConfig);
                await this.setStateAsync('info.neolink_status', 'running', true);

                this.log.debug('Waiting for RTSP stream to be fully ready (8 seconds)...');
                await new Promise(resolve => setTimeout(resolve, 8000));
            }

            this.log.debug('Capturing snapshot from mainStream...');
            const cameraName = this.neolinkConfig!.name;
            const rtspUrl = this.neolinkManager.getRtspUrl(cameraName, 'mainStream');
            this.log.debug(`Snapshot RTSP URL: ${rtspUrl}`);
            const imageBuffer = await captureSnapshot({ rtspUrl, timeoutMs: 15000 });

            // Convert to base64
            const base64Image = `data:image/jpeg;base64,${imageBuffer.toString('base64')}`;

            await this.setStateAsync('snapshotImage', base64Image, true);
            await this.setStateAsync('snapshotStatus', 'success', true);

            this.log.info(`Snapshot captured successfully (${imageBuffer.length} bytes)`);

            // If we started the stream for the snapshot, stop it after capture to save battery
            if (!wasRunning) {
                this.log.debug('Stopping RTSP stream after snapshot');
                await this.neolinkManager.stopRtsp();
                await this.setStateAsync('info.neolink_status', 'stopped', true);
            }
        } catch (error) {
            this.log.error(`Snapshot failed: ${error instanceof Error ? error.message : error}`);
            await this.setStateAsync('snapshotStatus', 'error', true);

            // Clean up: stop stream if we started it
            if (this.neolinkManager && !this.neolinkManager.isRtspRunning()) {
                try {
                    await this.neolinkManager.stopRtsp();
                    await this.setStateAsync('info.neolink_status', 'stopped', true);
                } catch {
                    // Ignore cleanup errors
                }
            }
        }
    }

    /**
     * Query battery status via CLI and update state
     */
    private async queryBatteryStatus(): Promise<void> {
        if (!this.neolinkManager) {
            this.log.warn('[Battery Query] Neolink manager not available');
            return;
        }

        try {
            this.log.debug('[Battery Query] Requesting battery status via CLI...');
            const xmlOutput = await this.neolinkManager.queryBatteryStatus();

            // Parse XML output to extract battery level
            // Expected format: <battery><batteryPercent>87</batteryPercent>...</battery>
            const match = xmlOutput.match(/<batteryPercent>(\d+)<\/batteryPercent>/);

            if (match && match[1]) {
                const batteryLevel = parseInt(match[1], 10);
                await this.setStateAsync('status.battery_level', batteryLevel, true);
                this.log.debug(`[Battery Query] Battery level: ${batteryLevel}%`);
            } else {
                this.log.warn(
                    `[Battery Query] Could not parse battery level from response: ${xmlOutput.substring(0, 200)}`,
                );
            }
        } catch (error) {
            this.log.debug(
                `[Battery Query] Failed (camera may be sleeping): ${error instanceof Error ? error.message : error}`,
            );
        }
    }

    /**
     * Query PIR status via CLI and update state
     */
    private async queryPirState(): Promise<void> {
        if (!this.neolinkManager) {
            return;
        }

        try {
            const xmlOutput = await this.neolinkManager.queryPirStatus();
            const match = xmlOutput.match(/<enable>(\d)<\/enable>/);
            if (match) {
                const enabled = match[1] === '1';
                this.log.debug(`PIR status via CLI: ${enabled ? 'ON' : 'OFF'}`);
                await this.setStateAsync('pir', enabled, true);
            } else {
                this.log.debug(`Could not parse PIR status from: ${xmlOutput.substring(0, 200)}`);
            }
        } catch (error) {
            this.log.debug(
                `PIR query failed (camera may be sleeping): ${error instanceof Error ? error.message : error}`,
            );
        }
    }

    /**
     * Handle MQTT messages from neolink
     */
    private async handleMqttMessage(topic: string, message: Buffer): Promise<void> {
        this.log.debug(`[MQTT] Incoming: ${topic} (${message.length} bytes)`);

        // Extract camera name and message type from topic
        // Format: neolink/<camera>/status/<type>[/...]
        const parts = topic.split('/');
        if (parts.length < 4 || parts[0] !== 'neolink' || parts[2] !== 'status') {
            this.log.warn(`[MQTT] Unexpected topic: ${topic}`);
            return;
        }

        const messageType = parts[3];

        const payload = message.toString().trim();
        this.log.debug(`[MQTT] Message received: ${topic} = ${payload}`);

        switch (messageType) {
            case 'motion':
                await this.handleMotionMessage(payload);
                break;
            case 'battery_level':
                await this.handleBatteryMessage(payload);
                break;
            case 'floodlight':
                await this.handleFloodlightStatusMessage(payload);
                break;
            case 'pir':
                await this.handlePirStatusMessage(payload);
                break;
            case 'ptz':
                this.log.debug(`[MQTT] PTZ status: ${payload}`);
                break;
            default:
                this.log.debug(`[MQTT] Unknown message type: ${messageType}`);
        }
    }

    /**
     * Handle motion detection message
     */
    private async handleMotionMessage(payload: string): Promise<void> {
        if (payload === 'triggered' || payload === 'on') {
            this.log.info('Motion detected!');
            await this.setStateAsync('status.motion', true, true);

            // Clear motion after 5 seconds
            this.setTimeout(async () => {
                await this.setStateAsync('status.motion', false, true);
            }, 5000);
        } else if (payload === 'clear' || payload === 'off') {
            await this.setStateAsync('status.motion', false, true);
        }
    }

    /**
     * Handle battery level message
     */
    private async handleBatteryMessage(payload: string): Promise<void> {
        const batteryLevel = parseInt(payload, 10);
        if (isNaN(batteryLevel) || batteryLevel < 0 || batteryLevel > 100) {
            this.log.warn(`[MQTT] Invalid battery level: ${payload}`);
            return;
        }

        this.log.debug(`Battery level via MQTT: ${batteryLevel}%`);
        await this.setStateAsync('status.battery_level', batteryLevel, true);
    }

    /**
     * Handle floodlight status message
     */
    private async handleFloodlightStatusMessage(payload: string): Promise<void> {
        const enabled = payload === 'on';
        this.log.debug(`Floodlight status: ${enabled ? 'ON' : 'OFF'}`);
        await this.setStateAsync('floodlight', enabled, true);
    }

    /**
     * Handle PIR status message
     */
    private async handlePirStatusMessage(payload: string): Promise<void> {
        const enabled = payload === 'on';
        this.log.debug(`PIR status: ${enabled ? 'ON' : 'OFF'}`);
        await this.setStateAsync('pir', enabled, true);
    }

    /**
     * Handle PIR control for battery camera.
     * Auto-starts MQTT if not running (waits for connection).
     */
    private async handleBatteryCamPir(enabled: boolean): Promise<void> {
        if (!this.mqttHelper) {
            if (!this.neolinkConfig || !this.neolinkManager) {
                this.log.error('PIR control failed: neolink not initialized');
                await this.setStateAsync('pir', !enabled, true);
                return;
            }

            if (!this.neolinkManager.isMqttRunning()) {
                this.log.info('PIR: MQTT not active, starting automatically...');
                await this.setStateAsync('mqtt.enable', true, true);
                await this.handleBatteryCamMqttControl();
            } else {
                let waited = 0;
                while (!this.mqttHelper && waited < 10000) {
                    await new Promise(resolve => setTimeout(resolve, 200));
                    waited += 200;
                }
            }

            if (!this.mqttHelper) {
                this.log.error('PIR control failed: MQTT connection timeout');
                await this.setStateAsync('pir', !enabled, true);
                return;
            }
        }

        try {
            this.log.info(`Setting PIR: ${enabled ? 'ON' : 'OFF'}`);
            await this.mqttHelper.setPir(this.neolinkConfig!.name, enabled);
            await this.setStateAsync('pir', enabled, true);
        } catch (error) {
            this.log.error(`PIR control failed: ${error instanceof Error ? error.message : error}`);
            await this.setStateAsync('pir', !enabled, true);
        }
    }

    /**
     * Handle floodlight control for battery camera.
     * Auto-starts MQTT if not running (waits for connection).
     */
    private async handleBatteryCamFloodlight(enabled: boolean): Promise<void> {
        if (!this.mqttHelper) {
            if (!this.neolinkConfig || !this.neolinkManager) {
                this.log.error('Floodlight control failed: neolink not initialized');
                await this.setStateAsync('floodlight', !enabled, true);
                return;
            }

            if (!this.neolinkManager.isMqttRunning()) {
                // MQTT completely off — start it now (ack=true so onStateChange doesn't re-trigger)
                this.log.info('Floodlight: MQTT not active, starting automatically...');
                await this.setStateAsync('mqtt.enable', true, true);
                await this.handleBatteryCamMqttControl();
            } else {
                // MQTT process is starting concurrently — wait up to 10s for helper to connect
                let waited = 0;
                while (!this.mqttHelper && waited < 10000) {
                    await new Promise(resolve => setTimeout(resolve, 200));
                    waited += 200;
                }
            }

            if (!this.mqttHelper) {
                this.log.error('Floodlight control failed: MQTT connection timeout');
                await this.setStateAsync('floodlight', !enabled, true);
                return;
            }
        }

        try {
            this.log.info(`Setting floodlight: ${enabled ? 'ON' : 'OFF'}`);
            await this.mqttHelper.setFloodlight(this.neolinkConfig!.name, enabled);
            await this.setStateAsync('floodlight', enabled, true);
        } catch (error) {
            this.log.error(`Floodlight control failed: ${error instanceof Error ? error.message : error}`);
            await this.setStateAsync('floodlight', !enabled, true); // Revert on error
        }
    }

    /**
     * Move battery camera PTZ to a preset position via neolink CLI
     */
    private async handleBatteryCamPtzPreset(presetId: number): Promise<void> {
        if (!this.neolinkManager) {
            this.log.error('PTZ preset failed: neolink not initialized');
            return;
        }
        try {
            this.log.debug(`PTZ: moving to preset ${presetId}`);
            await this.neolinkManager.ptzPreset(presetId);
        } catch (error) {
            this.log.error(`PTZ preset failed: ${error instanceof Error ? error.message : error}`);
        }
    }

    /**
     * Start PTZ movement in a direction. Auto-stops after 5s as safety net.
     * In VIS: configure button with mousedown=true, mouseup=false for hold-to-move.
     */
    private async handleBatteryCamPtzStart(direction: 'left' | 'right' | 'up' | 'down'): Promise<void> {
        if (this.ptzAutoStopTimer) {
            this.clearTimeout(this.ptzAutoStopTimer);
            this.ptzAutoStopTimer = undefined;
        }
        // Reset all other direction switches
        for (const d of ['up', 'down', 'left', 'right']) {
            if (d !== direction) {
                await this.setStateAsync(`ptz.${d}`, false, true);
            }
        }
        const speed = ((await this.getStateAsync('ptz.speed'))?.val as number) ?? 32;
        await this.handleBatteryCamPtzMove(direction, speed);
        // Auto-stop after 5s
        this.ptzAutoStopTimer = this.setTimeout(async () => {
            this.ptzAutoStopTimer = undefined;
            await this.handleBatteryCamPtzStop();
        }, 5000);
    }

    /**
     * Stop PTZ movement.
     */
    private async handleBatteryCamPtzStop(): Promise<void> {
        if (this.ptzAutoStopTimer) {
            this.clearTimeout(this.ptzAutoStopTimer);
            this.ptzAutoStopTimer = undefined;
        }
        for (const d of ['up', 'down', 'left', 'right']) {
            await this.setStateAsync(`ptz.${d}`, false, true);
        }
        await this.handleBatteryCamPtzMove('stop');
    }

    /**
     * Move battery camera PTZ in a direction via neolink CLI
     */
    private async handleBatteryCamPtzMove(
        direction: 'left' | 'right' | 'up' | 'down' | 'stop',
        speed?: number,
    ): Promise<void> {
        if (!this.neolinkManager) {
            this.log.error('PTZ move failed: neolink not initialized');
            return;
        }
        try {
            const amount = direction === 'stop' ? 0 : 100;
            this.log.debug(`PTZ: moving ${direction}`);
            await this.neolinkManager.ptzMove(direction, amount, speed);
        } catch (error) {
            this.log.error(`PTZ move failed: ${error instanceof Error ? error.message : error}`);
        }
    }
}

if (require.main !== module) {
    // Export the constructor in compact mode
    module.exports = (options: Partial<AdapterOptions> | undefined) => new ReoLinkCamAdapter(options);
} else {
    // otherwise start the instance directly
    (() => new ReoLinkCamAdapter())();
}
