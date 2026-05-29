/**
 * Minimal ambient type declarations for the `onvif` package (v0.8.x),
 * which ships no TypeScript types. Only the subset used by this adapter
 * (camera connect + event pull-point subscription) is declared.
 */
declare module 'onvif' {
    import { EventEmitter } from 'node:events';

    export interface CamOptions {
        hostname: string;
        username?: string;
        password?: string;
        port?: number;
        path?: string;
        timeout?: number;
        autoconnect?: boolean;
        useSecure?: boolean;
        preserveAddress?: boolean;
    }

    /**
     * A single notification message as delivered by the pull-point loop.
     * The exact shape is firmware-dependent, hence `any`.
     */
    export type OnvifNotificationMessage = any;

    export class Cam extends EventEmitter {
        hostname: string;
        username?: string;
        password?: string;
        port: number;

        constructor(options: CamOptions, callback?: (error: Error | null) => void);

        connect(callback: (error: Error | null) => void): void;

        unsubscribe(callback?: (error: Error | null) => void): void;

        on(event: 'event', listener: (message: OnvifNotificationMessage, xml: string) => void): this;
        on(event: 'eventsError', listener: (error: Error) => void): this;
        on(event: string, listener: (...args: any[]) => void): this;
    }
}
