/**
 * System Dependency Checker
 *
 * Checks for required system libraries for battery camera features.
 */

import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface DependencyCheckResult {
    available: boolean;
    version?: string;
    error?: string;
    installCommand?: string;
}

/**
 * Check if GStreamer RTSP server library is available (required for neolink)
 */
export async function checkGStreamer(): Promise<DependencyCheckResult> {
    try {
        // Linux: Check for libgstrtspserver-1.0.so.0
        if (process.platform === 'linux') {
            const { stdout } = await execAsync('ldconfig -p | grep libgstrtspserver-1.0.so.0');

            if (stdout.includes('libgstrtspserver')) {
                return {
                    available: true,
                    version: 'installed',
                };
            }

            throw new Error('GStreamer RTSP library not found');
        }

        // macOS / Windows: GStreamer bundled in neolink binary
        return {
            available: true,
            version: 'bundled',
        };
    } catch (error) {
        const installCommands: Record<string, string> = {
            linux: 'sudo apt install gstreamer1.0-rtsp  # Debian/Ubuntu\nsudo dnf install gstreamer1-rtsp-server  # Fedora/RHEL',
            darwin: 'Not required (bundled with neolink)',
            win32: 'Not required (bundled with neolink)',
        };

        return {
            available: false,
            error: error instanceof Error ? error.message : 'Unknown error',
            installCommand: installCommands[process.platform] || 'Platform not supported',
        };
    }
}

/**
 * Check if ffmpeg is available (required for snapshots)
 */
export async function checkFfmpeg(): Promise<DependencyCheckResult> {
    try {
        const { stdout } = await execAsync('ffmpeg -version');

        // Extract version (e.g., "ffmpeg version 4.4.2")
        const match = stdout.match(/ffmpeg version (\S+)/);
        const version = match ? match[1] : 'unknown';

        return {
            available: true,
            version,
        };
    } catch (error) {
        const installCommands: Record<string, string> = {
            linux: 'sudo apt install ffmpeg  # Debian/Ubuntu\nsudo dnf install ffmpeg  # Fedora/RHEL',
            darwin: 'brew install ffmpeg',
            win32: 'Download from https://ffmpeg.org/download.html',
        };

        return {
            available: false,
            error: error instanceof Error ? error.message : 'ffmpeg not found',
            installCommand: installCommands[process.platform] || 'Platform not supported',
        };
    }
}

/**
 * Run all dependency checks and return results
 */
export async function checkAllDependencies(): Promise<{
    gstreamer: DependencyCheckResult;
    ffmpeg: DependencyCheckResult;
}> {
    const [gstreamer, ffmpeg] = await Promise.all([checkGStreamer(), checkFfmpeg()]);

    return { gstreamer, ffmpeg };
}
