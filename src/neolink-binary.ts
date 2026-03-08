/**
 * Neolink Binary Manager
 *
 * Downloads the appropriate neolink binary for the current platform on demand
 * from GitHub Releases and caches it in the lib/ directory.
 *
 * This replaces the previous approach of bundling AGPL-3.0 binaries directly
 * in the adapter package, which caused licensing concerns.
 */

import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import * as https from 'https';

/** Pinned neolink version — update this when upgrading neolink */
export const NEOLINK_VERSION = '0.6.2';

/** GitHub Releases base URL for neolink */
const RELEASE_BASE = `https://github.com/QuantumEntangledAndy/neolink/releases/download/v${NEOLINK_VERSION}`;

export interface NeolinkBinary {
    path: string;
    platform: string;
    arch: string;
}

/**
 * Map the current platform/arch to the neolink binary filename used in GitHub Releases.
 */
function getBinaryName(): string {
    const platform = os.platform();
    const arch = os.arch();

    if (platform === 'linux') {
        if (arch === 'x64') return 'neolink-linux-x64';
        if (arch === 'arm64') return 'neolink-linux-arm64';
        if (arch === 'arm') return 'neolink-linux-arm';
        throw new Error(
            `Unsupported Linux architecture: ${arch}. Battery camera support requires x64, arm64, or arm.`,
        );
    }
    if (platform === 'darwin') {
        // macOS: one binary covers both Intel (x64) and Apple Silicon (arm64)
        return 'neolink-macos-x64';
    }
    if (platform === 'win32') {
        return 'neolink-win-x64.exe';
    }
    throw new Error(
        `Unsupported platform: ${platform} ${arch}. ` +
            `Battery camera support requires Linux (x64/arm64/arm), macOS, or Windows (x64).`,
    );
}

/**
 * Download a file from a URL to a local path, following HTTP redirects.
 * GitHub release downloads redirect to S3, so redirect handling is required.
 */
function downloadFile(url: string, destPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(destPath);

        const request = (currentUrl: string): void => {
            https
                .get(currentUrl, (response) => {
                    // Follow redirects (GitHub releases redirect to S3)
                    if (response.statusCode === 301 || response.statusCode === 302) {
                        const location = response.headers.location;
                        if (!location) {
                            reject(new Error('Redirect without location header'));
                            return;
                        }
                        request(location);
                        return;
                    }

                    if (response.statusCode !== 200) {
                        reject(new Error(`Download failed: HTTP ${response.statusCode} for ${currentUrl}`));
                        return;
                    }

                    response.pipe(file);
                    file.on('finish', () => {
                        file.close();
                        resolve();
                    });
                })
                .on('error', (err) => {
                    fs.unlink(destPath, () => {}); // Clean up partial file
                    reject(err);
                });
        };

        request(url);
        file.on('error', (err) => {
            fs.unlink(destPath, () => {}); // Clean up partial file
            reject(err);
        });
    });
}

/**
 * Ensure the neolink binary for the current platform is available.
 * Downloads from GitHub Releases if not already present or not executable.
 *
 * @param logFn Optional callback for progress messages (e.g. adapter.log.info)
 */
export async function ensureNeolinkBinary(logFn?: (msg: string) => void): Promise<NeolinkBinary> {
    const platform = os.platform();
    const arch = os.arch();
    const binaryName = getBinaryName();
    const libDir = path.join(__dirname, '..', 'lib');
    const binaryPath = path.join(libDir, binaryName);

    // Ensure lib/ directory exists (it won't be in the repo anymore)
    if (!fs.existsSync(libDir)) {
        fs.mkdirSync(libDir, { recursive: true });
    }

    // Check if binary already exists and is executable — skip download if so
    if (fs.existsSync(binaryPath)) {
        if (platform !== 'win32') {
            try {
                fs.accessSync(binaryPath, fs.constants.X_OK);
                return { path: binaryPath, platform, arch };
            } catch {
                // Not executable — re-download
            }
        } else {
            return { path: binaryPath, platform, arch };
        }
    }

    // Download binary from GitHub Releases
    const downloadUrl = `${RELEASE_BASE}/${binaryName}`;
    logFn?.(`Downloading neolink v${NEOLINK_VERSION} for ${platform}/${arch} ...`);
    logFn?.(`  Source: ${downloadUrl}`);

    try {
        await downloadFile(downloadUrl, binaryPath);
    } catch (err) {
        // Clean up any partial download before throwing
        if (fs.existsSync(binaryPath)) fs.unlinkSync(binaryPath);
        throw new Error(
            `Failed to download neolink binary: ${err instanceof Error ? err.message : err}\n` +
                `You can manually place the binary at: ${binaryPath}\n` +
                `Download URL: ${downloadUrl}`,
        );
    }

    // Make executable on Unix
    if (platform !== 'win32') {
        fs.chmodSync(binaryPath, 0o755);
    }

    logFn?.(`Neolink v${NEOLINK_VERSION} ready: ${binaryPath}`);
    return { path: binaryPath, platform, arch };
}

/**
 * Get the neolink version string from an already-downloaded binary.
 */
export function getNeolinkVersion(binaryPath: string): Promise<string> {
    return new Promise((resolve, reject) => {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { spawn } = require('child_process');
        const proc = spawn(binaryPath, ['--version']);

        let output = '';
        proc.stdout.on('data', (data: Buffer) => {
            output += data.toString();
        });

        proc.on('close', (code: number) => {
            if (code === 0) {
                const match = output.match(/neolink\s+(\S+)/);
                resolve(match ? match[1] : 'unknown');
            } else {
                reject(new Error(`Failed to get neolink version (exit code ${code})`));
            }
        });

        proc.on('error', (err: Error) => {
            reject(err);
        });
    });
}
