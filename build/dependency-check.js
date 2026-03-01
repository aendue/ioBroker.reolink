"use strict";
/**
 * System Dependency Checker
 *
 * Checks for required system libraries for battery camera features.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkGStreamer = checkGStreamer;
exports.checkFfmpeg = checkFfmpeg;
exports.checkAllDependencies = checkAllDependencies;
const child_process_1 = require("child_process");
const util_1 = require("util");
const execAsync = (0, util_1.promisify)(child_process_1.exec);
/**
 * Check if GStreamer RTSP server library is available (required for neolink)
 */
async function checkGStreamer() {
    try {
        // Linux: Check for libgstrtspserver-1.0.so.0
        if (process.platform === 'linux') {
            const { stdout, stderr } = await execAsync('ldconfig -p | grep libgstrtspserver-1.0.so.0');
            if (stdout.includes('libgstrtspserver')) {
                return {
                    available: true,
                    version: 'installed'
                };
            }
            throw new Error('GStreamer RTSP library not found');
        }
        // macOS / Windows: GStreamer bundled in neolink binary
        return {
            available: true,
            version: 'bundled'
        };
    }
    catch (error) {
        const installCommands = {
            'linux': 'sudo apt install gstreamer1.0-rtsp  # Debian/Ubuntu\nsudo dnf install gstreamer1-rtsp-server  # Fedora/RHEL',
            'darwin': 'Not required (bundled with neolink)',
            'win32': 'Not required (bundled with neolink)'
        };
        return {
            available: false,
            error: error instanceof Error ? error.message : 'Unknown error',
            installCommand: installCommands[process.platform] || 'Platform not supported'
        };
    }
}
/**
 * Check if ffmpeg is available (required for snapshots)
 */
async function checkFfmpeg() {
    try {
        const { stdout } = await execAsync('ffmpeg -version');
        // Extract version (e.g., "ffmpeg version 4.4.2")
        const match = stdout.match(/ffmpeg version (\S+)/);
        const version = match ? match[1] : 'unknown';
        return {
            available: true,
            version
        };
    }
    catch (error) {
        const installCommands = {
            'linux': 'sudo apt install ffmpeg  # Debian/Ubuntu\nsudo dnf install ffmpeg  # Fedora/RHEL',
            'darwin': 'brew install ffmpeg',
            'win32': 'Download from https://ffmpeg.org/download.html'
        };
        return {
            available: false,
            error: error instanceof Error ? error.message : 'ffmpeg not found',
            installCommand: installCommands[process.platform] || 'Platform not supported'
        };
    }
}
/**
 * Run all dependency checks and return results
 */
async function checkAllDependencies() {
    const [gstreamer, ffmpeg] = await Promise.all([
        checkGStreamer(),
        checkFfmpeg()
    ]);
    return { gstreamer, ffmpeg };
}
//# sourceMappingURL=dependency-check.js.map