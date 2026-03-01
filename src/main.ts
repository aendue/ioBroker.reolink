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
    private streamAutoDisableTimer: ioBroker.Timeout | undefined = undefined;
    private mqttAutoDisableTimer: ioBroker.Timeout | undefined = undefined;
    private ffmpegAvailable = false;
    private mqttHelper: MqttHelper | null = null;

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
            await this.setState('settings.EmailNotification', state.val);
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
                        default:
                            this.log.error('not defined');
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
                    manual_switch: 0,
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
                            val: 'Error or not supported',
                            ack: true,
                        });
                    } else {
                        await this.setState('RAW.Email', {
                            val: JSON.stringify(mail),
                            ack: true,
                        });
                        await this.setState('settings.EmailNotification', {
                            val: mail.value.Email.enable,
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

    async setMailNotification(state: 0 | 1 | 2): Promise<void> {
        if (state === 0 || state === 1) {
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
        } else {
            this.log.error('Set mail notification: Value not supported!');
            await this.getMailNotification();
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
            // Stop neolink if running
            if (this.neolinkManager) {
                this.log.info('Stopping neolink processes...');

                // Also disconnect MQTT
                const mqttPromise = this.mqttHelper ? this.mqttHelper.disconnect() : Promise.resolve();

                Promise.all([this.neolinkManager.stopAll(), mqttPromise])
                    .then(() => {
                        this.log.info('Neolink and MQTT stopped');
                        callback();
                    })
                    .catch(err => {
                        this.log.error(`Failed to stop services: ${err.message}`);
                        callback();
                    });
                return;
            }

            // Here you must clear all timeouts or intervals that may still be active
            // clearTimeout(timeout1);
            // clearTimeout(timeout2);
            // ...
            // clearInterval(interval1);
            if (this.refreshStateTimeout) {
                this.log.debug('refreshStateTimeout: UNLOAD');
                this.clearTimeout(this.refreshStateTimeout);
            }
            if (this.streamAutoDisableTimer) {
                this.log.debug('streamAutoDisableTimer: UNLOAD');
                this.clearTimeout(this.streamAutoDisableTimer);
            }
            if (this.mqttAutoDisableTimer) {
                this.log.debug('mqttAutoDisableTimer: UNLOAD');
                this.clearTimeout(this.mqttAutoDisableTimer);
            }
        } catch (error) {
            this.log.error(`onUnload: ${error}`);
        }
        callback();
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
                    await this.audioAlarmPlay(parseInt(state.val as string, 10));
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
                    await this.setMailNotification(parseInt(state.val as string, 10) as 0 | 1);
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

        try {
            // Check system dependencies
            this.log.info('Checking system dependencies for battery camera...');
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
                // Log callback
                switch (level) {
                    case 'error':
                        this.log.error(`[${cameraName}] ${message}`);
                        break;
                    case 'warn':
                        this.log.warn(`[${cameraName}] ${message}`);
                        break;
                    default:
                        this.log.info(`[${cameraName}] ${message}`);
                }
            });

            // Prepare neolink config
            const neolinkConfig: NeolinkConfig = {
                name: this.name, // Use adapter instance name as camera name
                username: this.config.cameraUser,
                password: this.config.cameraPassword,
                uid: this.config.cameraUID,
                address: this.config.cameraIp,
                pauseTimeout: this.config.pauseTimeout || 2.1,
                // MQTT config (optional, from adapter settings)
                // Start with MQTT disabled by default (user must enable via mqtt.enable state)
                enableMqtt: false,
                mqttBroker: this.config.mqttBroker || '127.0.0.1',
                mqttPort: this.config.mqttPort || 1883,
                mqttUser: this.config.mqttUsername,
                mqttPassword: this.config.mqttPassword,
            };

            // Start neolink
            this.log.info(`Starting neolink for battery camera: ${neolinkConfig.name}`);
            if (neolinkConfig.mqttBroker) {
                this.log.info(`MQTT enabled: ${neolinkConfig.mqttBroker}:${neolinkConfig.mqttPort}`);
            }
            await this.neolinkManager.start(neolinkConfig);

            // Create battery cam states
            await this.createBatteryCamStates();

            // Get RTSP URLs
            const mainStreamUrl = this.neolinkManager.getRtspUrl(this.name, 'mainStream');
            const subStreamUrl = this.neolinkManager.getRtspUrl(this.name, 'subStream');

            this.log.info(`RTSP Main Stream: ${mainStreamUrl}`);
            this.log.info(`RTSP Sub Stream: ${subStreamUrl}`);

            await this.setStateAsync('streams.mainStream', mainStreamUrl, true);
            await this.setStateAsync('streams.subStream', subStreamUrl, true);
            await this.setStateAsync('info.neolink_status', 'running', true);
            await this.setStateAsync('info.connection', true, true);

            // Subscribe to control states
            this.subscribeStates('streams.enable');
            this.subscribeStates('mqtt.enable');
            this.subscribeStates('snapshot');
            this.subscribeStates('floodlight');

            this.log.info('Battery camera ready!');
            this.log.warn('⚠️ Streaming is DISABLED by default to save battery. Enable via streams.enable datapoint.');
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
        await this.setStateAsync('floodlight', false, true);

        this.log.debug('Battery camera states created');
    }

    /**
     * Restart neolink with updated MQTT config
     * Used by handleBatteryCamMqttControl to enable/disable MQTT at runtime
     */
    private async restartNeolinkWithMqtt(enableMqtt: boolean): Promise<void> {
        if (!this.neolinkManager) {
            this.log.warn('Neolink manager not initialized');
            return;
        }

        try {
            // Stop current neolink process
            if (this.neolinkManager.isRunning(this.name)) {
                this.log.info('Stopping neolink for MQTT config update...');
                await this.neolinkManager.stop(this.name);
            }

            // Prepare neolink config with updated MQTT setting
            const neolinkConfig: NeolinkConfig = {
                name: this.name,
                username: this.config.cameraUser,
                password: this.config.cameraPassword,
                uid: this.config.cameraUID,
                address: this.config.cameraIp,
                pauseTimeout: this.config.pauseTimeout || 2.1,
                // MQTT config - controlled by enableMqtt parameter
                enableMqtt: enableMqtt,
                mqttBroker: this.config.mqttBroker || '127.0.0.1',
                mqttPort: this.config.mqttPort || 1883,
                mqttUser: this.config.mqttUsername,
                mqttPassword: this.config.mqttPassword,
                enableFloodlight: enableMqtt, // Floodlight control requires MQTT
            };

            // Restart neolink with new config
            this.log.info(`Restarting neolink (MQTT: ${enableMqtt ? 'enabled' : 'disabled'})...`);
            await this.neolinkManager.start(neolinkConfig);

            // Update states
            await this.setStateAsync('info.neolink_status', 'running', true);
            this.log.info('✅ Neolink restarted successfully');
        } catch (error) {
            this.log.error(`Failed to restart neolink: ${error instanceof Error ? error.message : error}`);
            await this.setStateAsync('info.neolink_status', 'error', true);
            throw error;
        }
    }

    /**
     * Handle stream enable/disable for battery camera
     * Note: Streams are managed by neolink's pause_on_client feature.
     * This only controls the auto-disable timer for battery protection.
     */
    private async handleBatteryCamStreamControl(enable: boolean): Promise<void> {
        if (!this.neolinkManager) {
            this.log.warn('Neolink manager not initialized');
            return;
        }

        // Clear existing timer
        if (this.streamAutoDisableTimer) {
            this.clearTimeout(this.streamAutoDisableTimer);
            this.streamAutoDisableTimer = undefined;
        }

        if (enable) {
            // Get auto-disable timeout from config (default: 30s)
            const autoDisableSeconds = this.config.streamAutoDisableSeconds || 30;

            this.log.warn(
                `⚠️ BATTERY DRAIN: Streaming enabled! Auto-disabling in ${autoDisableSeconds}s to save battery.`,
            );
            await this.setStateAsync('streams.enable', true, true);

            // Set auto-disable timer
            this.streamAutoDisableTimer = this.setTimeout(async () => {
                this.log.warn(`⏱️ Auto-disabling stream after ${autoDisableSeconds}s (battery protection)`);
                await this.setStateAsync('streams.enable', false, false);
                this.streamAutoDisableTimer = undefined;
            }, autoDisableSeconds * 1000);

            // Note: Neolink streams auto-pause when no RTSP client is connected (pause_on_client=true)
            // This timer is an additional battery protection layer
        } else {
            this.log.info('Streaming disabled - battery saving mode');
            await this.setStateAsync('streams.enable', false, true);
            // Neolink will disconnect on idle (idle_disconnect=true in config)
        }
    }

    /**
     * Handle MQTT enable/disable for battery camera
     * Restarts neolink with updated MQTT config and manages auto-disable timer
     */
    private async handleBatteryCamMqttControl(): Promise<void> {
        if (!this.neolinkManager) {
            this.log.warn('Neolink manager not initialized');
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

            this.log.warn(`⚠️ BATTERY DRAIN: MQTT enabled! Auto-disabling in ${autoDisableSeconds}s to save battery.`);
            this.log.info(`MQTT Broker: ${broker}:${port}`);
            this.log.info('MQTT topics: neolink/<camera>/status/{motion,battery_level,floodlight,preview}');
            this.log.info('Control topic: neolink/<camera>/control/floodlight');

            // Restart neolink with MQTT enabled
            await this.restartNeolinkWithMqtt(true);

            // Initialize MQTT helper for subscribing to topics and floodlight control
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

                    await this.mqttHelper.connect();
                    this.log.info('✅ MQTT client connected - Ready for floodlight control');
                    this.log.info(`Neolink will publish to: neolink/${this.name}/status/{motion,battery_level,floodlight,preview}`);
                } catch (error) {
                    this.log.error(`Failed to connect MQTT client: ${error instanceof Error ? error.message : error}`);
                    this.log.error(`Check MQTT broker settings: ${broker}:${port}`);
                    this.mqttHelper = null;
                }
            }

            // Set auto-disable timer
            this.mqttAutoDisableTimer = this.setTimeout(async () => {
                this.log.warn(`⏱️ Auto-disabling MQTT after ${autoDisableSeconds}s (battery protection)`);
                await this.setStateAsync('mqtt.enable', false, false);
                this.mqttAutoDisableTimer = undefined;
            }, autoDisableSeconds * 1000);

            await this.setStateAsync('mqtt.enable', true, true);
        } else {
            this.log.info('MQTT disabled - battery saving mode');

            // Restart neolink with MQTT disabled
            await this.restartNeolinkWithMqtt(false);

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
            this.log.info('Capturing snapshot from mainStream...');

            const rtspUrl = this.neolinkManager.getRtspUrl(this.name, 'mainStream');
            const imageBuffer = await captureSnapshot({ rtspUrl, timeoutMs: 15000 });

            // Convert to base64
            const base64Image = `data:image/jpeg;base64,${imageBuffer.toString('base64')}`;

            await this.setStateAsync('snapshotImage', base64Image, true);
            await this.setStateAsync('snapshotStatus', 'success', true);

            this.log.info(`Snapshot captured successfully (${imageBuffer.length} bytes)`);
        } catch (error) {
            this.log.error(`Snapshot failed: ${error instanceof Error ? error.message : error}`);
            await this.setStateAsync('snapshotStatus', 'error', true);
        }
    }

    /**
     * Handle floodlight control for battery camera
     */
    private async handleBatteryCamFloodlight(enabled: boolean): Promise<void> {
        if (!this.mqttHelper) {
            this.log.error('Floodlight control failed: MQTT not connected');
            this.log.error('Enable MQTT in adapter settings (mqtt.enable = true)');
            await this.setStateAsync('floodlight', !enabled, true); // Revert state
            return;
        }

        try {
            this.log.info(`Setting floodlight: ${enabled ? 'ON' : 'OFF'}`);
            await this.mqttHelper.setFloodlight(this.name, enabled);
            await this.setStateAsync('floodlight', enabled, true);
        } catch (error) {
            this.log.error(`Floodlight control failed: ${error instanceof Error ? error.message : error}`);
            await this.setStateAsync('floodlight', !enabled, true); // Revert on error
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
