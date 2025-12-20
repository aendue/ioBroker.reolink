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
    | 'Login'
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
export type ReolinkCommandLogin = {
    cmd: 'Login';
    param: { User: { Version: '0'; userName: string; password: string } };
};

// typescript
export enum ReolinkResponseErrorCode {
    NOT_EXIST = -1, // Missing parameters
    OUT_OF_MEM = -2, // Used up memory
    CHECK_ERR = -3, // Check error
    PARAM_ERROR = -4, // Parameters error
    MAX_SESSION = -5, // Reached the max session number.
    PLEASE_LOGIN_FIRST = -6, // Login required
    LOGIN_FAILED = -7, // Login error
    TIMEOUT = -8, // Operation timeout
    NOT_SUPPORT = -9, // Not supported
    PROTOCOL_ERROR = -10, // Protocol error
    FCGI_READ_FAILED = -11, // Failed to read operation
    GET_CONFIG_FAILED = -12, // Failed to get configuration.
    SET_CONFIG_FAILED = -13, // Failed to set configuration.
    MALLOC_FAILED = -14, // Failed to apply for memory
    CREATE_SOCKET_FAILED = -15, // Failed to created socket
    SEND_FAILED = -16, // Failed to send data
    RCV_FAILED = -17, // Failed to receiver data
    OPEN_FILE_FAILED = -18, // Failed to open file
    READ_FILE_FAILED = -19, // Failed to read file
    WRITE_FILE_FAILED = -20, // Failed to write file
    ERROR_TOKEN = -21, // Token error
    STRING_TOO_LONG = -22, // The length of the string exceeds the limit.
    MISSING_PARAM = -23, // Missing parameters
    ERROR_COMMAND = -24, // Command error
    INTERNAL_ERROR = -25, // Internal error
    ABILITY_ERROR = -26, // Ability error
    INVALID_USER = -27, // Invalid user
    USER_ALREADY_EXIST = -28, // User already exist
    MAX_NUMBER_OF_USERS = -29, // Reached the maximum number of users
    SAME_VERSION = -30, // The version is identical to the current one.
    BUSY_UPGRADE = -31, // Ensure only one user can upgrade
    IP_CONFLICT = -32, // Modify IP conflicted with used IP
    NEED_BIND_EMAIL = -34, // Cloud login need bind email first
    UNBIND_CLOUD = -35, // Cloud login unbind camera
    CLOUD_NETWORK_TIMEOUT = -36, // Cloud login get login information out of time
    CLOUD_PASSWORD_ERR = -37, // Cloud login password error
    UID_ERR = -38, // Cloud bind camera uid error
    CLOUD_USER_NOT_EXIST = -39, // Cloud login user doesn’t exist
    UNBIND_FAILED = -40, // Cloud unbind camera failed
    CLOUD_NOT_SUPPORT = -41, // The device doesn’t support cloud
    LOGIN_CLOUD_SERVER_FAILED = -42, // Cloud login server failed
    BIND_FAILED = -43, // Cloud bind camera failed
    CLOUD_UNKNOWN_ERR = -44, // Cloud unknown error
    NEED_VERIFY_CODE = -45, // Cloud bind camera need verify code
    DIGEST_AUTH_FAILED = -46, // An error occurred while using the digest authentication process
    DIGEST_AUTH_NONCE_EXPIRES = -47, // An expired nonce is used in the authentication process
    FETCH_PICTURE_FAILED = -48, // Snap a picture failed
    CHANNEL_INVALID = -49, // Channel is invalid
    DEVICE_OFFLINE = -99, // Device offline
    TEST_FAILED = -100, // Test Email、Ftp、WiFi failed
    CHECK_FIRMWARE_FAILED = -101, // Upgrade checking firmware failed
    DOWNLOAD_ONLINE_FAILED = -102, // Upgrade download online failed
    GET_UPGRADE_STATUS_FAILED = -103, // Upgrade get upgrade status failed
    FREQUENT_LOGINS = -105, // Frequent logins, please try again later!
    ERROR_DOWNLOADING_VIDEO_FILE = -220, // Error downloading video file
    BUSY_VIDEO_RECORDING_TASK = -221, // Busy video recording task
    VIDEO_FILE_NOT_EXIST = -222, // The video file does not exist
    DIGEST_AUTH_NONCE_ERROR = -301, // Digest Authentication nonce error
    AES_DECRYPT_FAILED = -310, // Aes decryption failure
    FTP_LOGIN_FAILED = -451, // ftp test login failed
    FTP_CREATE_DIR_FAILED = -452, // Create ftp dir failed
    FTP_UPLOAD_FAILED = -453, // Upload ftp file failed
    FTP_CONNECT_FAILED = -454, // Cannot connect ftp server
    EMAIL_UNDEFINED_FAILED = -480, // Some undefined errors
    EMAIL_CONNECT_FAILED = -481, // Cannot connect email server
    EMAIL_AUTH_FAILED = -482, // Auth user failed
    EMAIL_NETWORK_ERR = -483, // Email network err
    EMAIL_SERVER_ERR = -484, // Something wrong with email server
    EMAIL_MEMORY_ERR = -485, // Something wrong with memory
    IP_LIMIT_REACHED = -500, // The number of IP addresses reaches the upper limit
    USER_DOES_NOT_EXIST = -501, // The user does not exist
    PASSWORD_ERR = -502, // Password err
    LOGIN_DENY = -503, // Login deny
    LOGIN_NOT_INIT = -505, // Login not init
    LOGIN_LOCKED = -506, // Login locked
    LOGIN_REACH_MAX = -507, // The number of logins reached the upper limit
}

export type ReolinkResponseError = {
    cmd: string;
    code: 0;
    error: { rspCode: ReolinkResponseErrorCode; detail: string };
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
    | ReolinkCommandLogin
    | ReolinkCommandSetAutoFocus;
