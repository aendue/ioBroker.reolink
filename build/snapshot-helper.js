"use strict";
/**
 * Snapshot Helper
 *
 * Captures snapshots from RTSP streams using ffmpeg.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.captureSnapshot = captureSnapshot;
const child_process_1 = require("child_process");
/**
 * Capture snapshot from RTSP stream using ffmpeg
 */
async function captureSnapshot(options) {
    const { rtspUrl, timeoutMs = 10000 } = options;
    return new Promise((resolve, reject) => {
        const args = [
            '-rtsp_transport', 'tcp', // Use TCP for reliable connection
            '-i', rtspUrl, // Input RTSP stream
            '-frames:v', '1', // Capture single frame
            '-f', 'image2pipe', // Output as image pipe
            '-vcodec', 'mjpeg', // JPEG codec
            '-q:v', '2', // Quality (2 = high)
            '-' // Output to stdout
        ];
        const ffmpeg = (0, child_process_1.spawn)('ffmpeg', args, {
            stdio: ['ignore', 'pipe', 'pipe']
        });
        const chunks = [];
        let errorOutput = '';
        // Timeout handler
        const timeout = setTimeout(() => {
            ffmpeg.kill('SIGTERM');
            reject(new Error(`Snapshot timeout after ${timeoutMs}ms`));
        }, timeoutMs);
        // Collect stdout (image data)
        ffmpeg.stdout.on('data', (chunk) => {
            chunks.push(chunk);
        });
        // Collect stderr (ffmpeg logs)
        ffmpeg.stderr.on('data', (chunk) => {
            errorOutput += chunk.toString();
        });
        // Handle process exit
        ffmpeg.on('close', (code) => {
            clearTimeout(timeout);
            if (code === 0 && chunks.length > 0) {
                resolve(Buffer.concat(chunks));
            }
            else {
                const error = errorOutput || `ffmpeg exited with code ${code}`;
                reject(new Error(`Snapshot failed: ${error}`));
            }
        });
        // Handle spawn errors
        ffmpeg.on('error', (err) => {
            clearTimeout(timeout);
            reject(new Error(`Failed to spawn ffmpeg: ${err.message}`));
        });
    });
}
//# sourceMappingURL=snapshot-helper.js.map