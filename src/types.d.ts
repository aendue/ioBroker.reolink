export type ReoLinkCamAdapterConfig = {
    cameraType: string;
    cameraIp: string;
    cameraProtocol: 'https' | 'http';
    cameraChannel: number;
    cameraUser: string;
    cameraPassword: string;
    apiRefreshInterval: string | number;
    sslvalid: boolean;
    UriEncodedPassword: boolean;
};

export type ReolinkCommandName =
    | 'AudioAlarmPlay'
    | 'GetAiCfg'
    | 'GetAiState'
    | 'GetAutoFocus'
    | 'GetDevInfo'
    | 'GetEmailV20'
    | 'GetHddInfo'
    | 'GetIrLights'
    | 'GetLocalLink'
    | 'GetMdState'
    | 'GetPtzGuard'
    | 'GetRecV20'
    | 'GetWhiteLed'
    | 'GetZoomFocus'
    | 'PtzCheck'
    | 'PtzCtrl'
    | 'SetAiCfg'
    | 'SetAutoFocus'
    | 'SetEmailV20'
    | 'SetFtp'
    | 'SetIrLights'
    | 'SetPtzGuard'
    | 'SetPtzGuardTimeout'
    | 'SetPush'
    | 'SetPushV20'
    | 'SetRecV20'
    | 'SetWhiteLed'
    | 'Reboot'
    | 'Snap'
    | 'StartZoomFocus'
    | 'setPtzGuard';

export type ReolinkCommandPtzControl = {
    cmd: 'PtzCtrl';
    action?: 0;
    param: {
        channel: number;
        id?: number;
        op: 'ToPos' | 'StopPatrol' | 'StartPatrol';
        speed?: 32;
    };
};

export type ReolinkCommandSetAiCfg = {
    cmd: 'SetAiCfg';
    param: any;
};

export type ReolinkCommandSetPush = {
    cmd: 'SetPushV20';
    param: {
        Push: {
            enable: 0 | 1;
        };
    };
};

export type ReolinkCommandSetFtp = {
    cmd: 'SetFtpV20';
    param: {
        Ftp: {
            enable: 0 | 1;
        };
    };
};

export type ReolinkCommandSetAutoFocus = {
    cmd: 'SetAutoFocus';
    action: 0;
    param: {
        AutoFocus: {
            channel: number;
            disable: 0 | 1;
        };
    };
};

export type ReolinkCommandStartZoomFocus = {
    cmd: 'StartZoomFocus';
    action: 0;
    param: {
        ZoomFocus: {
            channel: number;
            pos: number;
            op: 'ZoomPos';
        };
    };
};

export type ReolinkCommandSetRec = {
    cmd: 'SetRecV20';
    param: {
        Rec: {
            enable: 0 | 1; // The description in API Guide v8 had this key inside `schedule`, which does not work.
            schedule: {
                channel: number;
            };
        };
    };
};

export type ReolinkCommandGetRec = {
    cmd: 'GetRecV20';
    action: 1;
    param: {
        channel: number;
    };
};

export type ReolinkCommandAudioAlarmPlay = {
    cmd: 'AudioAlarmPlay';
    action: 0;
    param: {
        alarm_mode: 'times';
        manual_switch: 0;
        times: number;
        channel: number;
    };
};

export type ReolinkCommandSetIrLights = {
    cmd: 'SetIrLights';
    action: 0;
    param: {
        IrLights: {
            channel: number;
            state: 'Auto' | 'On' | 'Off';
        };
    };
};

export type ReolinkCommandSetWhiteLed = {
    cmd: 'SetWhiteLed';
    param: {
        WhiteLed: {
            state?: number;
            channel: number;
            mode?: 0 | 1 | 2 | 3;
            bright?: number;
            LightingSchedule?: { EndHour: number; EndMin: number; StartHour: number; StartMin: number };
            wlAiDetectType?: { dog_cat: number; face: number; people: number; vehicle: number };
        };
    };
};

export type ReolinkCommandGetWhiteLed = {
    cmd: 'GetWhiteLed';
    action: 0;
    param: {
        channel: number;
    };
};

export type ReolinkCommandPtzCheck = {
    cmd: 'PtzCheck';
    action: 0;
    param: {
        channel: number;
    };
};

export type ReolinkCommandSetPtzGuard = {
    cmd: 'SetPtzGuard';
    action: 0;
    param: {
        PtzGuard: {
            channel: number;
            cmdStr: 'setPos';
            benable?: 0 | 1;
            bSaveCurrentPos: 0 | 1;
            bexistPos?: 0 | 1;
            timeout?: number;
        };
    };
};

export type ReolinkCommandSetEmailV20 = {
    cmd: 'SetEmailV20';
    param: {
        Email: {
            enable: 0 | 1; // this value is not described in the documentation

            ssl: 0 | 1;
            smtpPort: number;
            smtpServer: string;
            userName: string;
            nickName: string;
            addr1: string;
            addr2: string;
            addr3: string;
            interval: '${number} Minutes';
            Schedule?: {
                enable: 0 | 1;
                table: any;
            };
        };
    };
};

export type ReolinkCommand =
    | ReolinkCommandPtzControl
    | ReolinkCommandSetAiCfg
    | ReolinkCommandSetPush
    | ReolinkCommandSetFtp
    | ReolinkCommandStartZoomFocus
    | ReolinkCommandSetRec
    | ReolinkCommandGetRec
    | ReolinkCommandPtzCheck
    | ReolinkCommandAudioAlarmPlay
    | ReolinkCommandSetIrLights
    | ReolinkCommandSetWhiteLed
    | ReolinkCommandGetWhiteLed
    | ReolinkCommandSetPtzGuard
    | ReolinkCommandSetEmailV20
    | ReolinkCommandSetAutoFocus;
