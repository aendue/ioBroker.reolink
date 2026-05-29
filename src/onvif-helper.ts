/**
 * ONVIF Event Helper for Doorbell Cameras
 *
 * Reolink doorbells do not expose the button press ("visitor") through the
 * HTTP polling API (GetAiState has no `visitor` field on these models). Instead
 * the press is delivered as an ONVIF event.
 *
 * This helper connects to the camera's ONVIF service and starts a PullPoint
 * subscription (long-poll). No inbound webhook / open port is required: the
 * `onvif` library pulls messages as soon as an `event` listener is attached.
 */

import { Cam, type OnvifNotificationMessage } from 'onvif';

export interface OnvifConfig {
    /** Camera host or IP (without protocol) */
    host: string;
    /** ONVIF port (Reolink default: 8000) */
    port: number;
    username: string;
    password: string;
}

export type OnvifLogLevel = 'info' | 'warn' | 'error' | 'debug';

/** A flattened ONVIF SimpleItem (`<tt:SimpleItem Name=".." Value=".."/>`) */
interface SimpleItem {
    name: string;
    value: unknown;
}

export class OnvifHelper {
    private cam: Cam | null = null;
    private readonly config: OnvifConfig;
    private readonly logCallback: (level: OnvifLogLevel, message: string) => void;
    /** Called whenever a doorbell "visitor" (button press) event is received */
    private readonly onVisitor: (active: boolean) => void;
    /** Optional: called on ONVIF motion events */
    private readonly onMotion?: (active: boolean) => void;

    constructor(
        config: OnvifConfig,
        onVisitor: (active: boolean) => void,
        logCallback: (level: OnvifLogLevel, message: string) => void,
        onMotion?: (active: boolean) => void,
    ) {
        this.config = config;
        this.onVisitor = onVisitor;
        this.logCallback = logCallback;
        this.onMotion = onMotion;
    }

    /**
     * Connect to the camera's ONVIF service and start the event pull loop.
     */
    public connect(): Promise<void> {
        return new Promise((resolve, reject) => {
            this.cam = new Cam(
                {
                    hostname: this.config.host,
                    port: this.config.port,
                    username: this.config.username,
                    password: this.config.password,
                    timeout: 120000,
                },
                error => {
                    if (error) {
                        this.cam = null;
                        reject(error);
                        return;
                    }
                    this.log('info', `ONVIF connected (${this.config.host}:${this.config.port})`);

                    // Attaching an 'event' listener makes the onvif library start the
                    // PullPoint subscription and long-poll for messages automatically.
                    this.cam!.on('event', (message: OnvifNotificationMessage) => {
                        try {
                            this.handleEvent(message);
                        } catch (err) {
                            this.log('debug', `ONVIF event parse error: ${err instanceof Error ? err.message : err}`);
                        }
                    });
                    this.cam!.on('eventsError', (err: Error) => {
                        this.log('warn', `ONVIF events error: ${err.message}`);
                    });

                    resolve();
                },
            );
        });
    }

    /**
     * Stop the event loop and unsubscribe.
     */
    public disconnect(): Promise<void> {
        return new Promise(resolve => {
            if (!this.cam) {
                resolve();
                return;
            }
            const cam = this.cam;
            this.cam = null;
            // Removing the 'event' listener stops the pull loop on its next cycle.
            cam.removeAllListeners('event');
            cam.removeAllListeners('eventsError');
            try {
                cam.unsubscribe(() => {
                    this.log('debug', 'ONVIF unsubscribed');
                    resolve();
                });
            } catch {
                resolve();
            }
        });
    }

    /**
     * Parse a notification message and dispatch visitor / motion callbacks.
     *
     * Reolink encodes the event KIND in the topic (e.g.
     * `tns1:RuleEngine/MyRuleDetector/Visitor`) and the boolean value in a
     * SimpleItem named "State" (rule detectors / MotionAlarm) or "IsMotion"
     * (cell motion). The "Source" SimpleItem is just a channel token and must
     * be ignored.
     */
    private handleEvent(message: OnvifNotificationMessage): void {
        const topic = this.extractTopic(message);
        const items = this.extractSimpleItems(message);

        this.log('debug', `ONVIF event: topic="${topic}" items=${JSON.stringify(items)}`);

        // Doorbell button press
        if (/visitor/i.test(topic)) {
            this.onVisitor(this.readState(items));
            return;
        }

        // Motion (optional — only if a handler was provided)
        if (this.onMotion && /motion/i.test(topic)) {
            this.onMotion(this.readState(items));
        }
    }

    /**
     * Read the boolean alarm state from an event's SimpleItems. Prefers the
     * "State"/"IsMotion" item; falls back to any item that is not "Source"
     * (covers models that name the value item after the detector).
     */
    private readState(items: SimpleItem[]): boolean {
        const item =
            items.find(i => /^(state|ismotion)$/i.test(i.name)) ?? items.find(i => i.name.toLowerCase() !== 'source');
        return item ? this.toBool(item.value) : false;
    }

    /** Extract the topic string from a notification message */
    private extractTopic(message: OnvifNotificationMessage): string {
        const topic = message?.topic;
        if (!topic) {
            return '';
        }
        // linerase keeps the text node under `_`
        return (typeof topic === 'object' ? (topic._ ?? '') : topic).toString();
    }

    /** Collect SimpleItems from both `data` and `source` containers, as a flat list */
    private extractSimpleItems(message: OnvifNotificationMessage): SimpleItem[] {
        const result: SimpleItem[] = [];
        const inner = message?.message?.message;
        if (!inner) {
            return result;
        }
        for (const container of [inner.data, inner.source]) {
            let simpleItem = container?.simpleItem;
            if (!simpleItem) {
                continue;
            }
            if (!Array.isArray(simpleItem)) {
                simpleItem = [simpleItem];
            }
            for (const item of simpleItem) {
                const attrs = item?.$ ?? item;
                if (attrs && attrs.Name !== undefined) {
                    result.push({ name: String(attrs.Name), value: attrs.Value });
                }
            }
        }
        return result;
    }

    private toBool(value: unknown): boolean {
        return value === true || value === 'true' || value === 1 || value === '1';
    }

    private log(level: OnvifLogLevel, message: string): void {
        this.logCallback(level, message);
    }
}
