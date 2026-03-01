/**
 * Snapshot Helper
 * 
 * Captures snapshots from RTSP streams using ffmpeg.
 */

import { spawn } from 'child_process';

export interface SnapshotOptions {
    rtspUrl: string;
    timeoutMs?: number;
}

/**
 * Capture snapshot from RTSP stream using ffmpeg
 */
export async function captureSnapshot(options: SnapshotOptions): Promise<Buffer> {
    const { rtspUrl, timeoutMs = 10000 } = options;

    return new Promise((resolve, reject) => {
        const args = [
            '-rtsp_transport', 'tcp',       // Use TCP for reliable connection
            '-i', rtspUrl,                  // Input RTSP stream
            '-frames:v', '1',               // Capture single frame
            '-f', 'image2pipe',             // Output as image pipe
            '-vcodec', 'mjpeg',             // JPEG codec
            '-q:v', '2',                    // Quality (2 = high)
            '-'                              // Output to stdout
        ];

        const ffmpeg = spawn('ffmpeg', args, {
            stdio: ['ignore', 'pipe', 'pipe']
        });

        const chunks: Buffer[] = [];
        let errorOutput = '';

        // Timeout handler
        const timeout = setTimeout(() => {
            ffmpeg.kill('SIGTERM');
            reject(new Error(`Snapshot timeout after ${timeoutMs}ms`));
        }, timeoutMs);

        // Collect stdout (image data)
        ffmpeg.stdout.on('data', (chunk: Buffer) => {
            chunks.push(chunk);
        });

        // Collect stderr (ffmpeg logs)
        ffmpeg.stderr.on('data', (chunk: Buffer) => {
            errorOutput += chunk.toString();
        });

        // Handle process exit
        ffmpeg.on('close', (code: number) => {
            clearTimeout(timeout);

            if (code === 0 && chunks.length > 0) {
                resolve(Buffer.concat(chunks));
            } else {
                const error = errorOutput || `ffmpeg exited with code ${code}`;
                reject(new Error(`Snapshot failed: ${error}`));
            }
        });

        // Handle spawn errors
        ffmpeg.on('error', (err: Error) => {
            clearTimeout(timeout);
            reject(new Error(`Failed to spawn ffmpeg: ${err.message}`));
        });
    });
}
