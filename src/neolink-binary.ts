/**
 * Neolink Binary Manager
 * 
 * Selects and manages the appropriate neolink binary for the current platform.
 */

import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';

export interface NeolinkBinary {
    path: string;
    platform: string;
    arch: string;
}

/**
 * Get the appropriate neolink binary for the current platform
 */
export function getNeolinkBinary(): NeolinkBinary {
    const platform = os.platform();
    const arch = os.arch();

    let binaryName: string;

    if (platform === 'linux') {
        if (arch === 'x64') {
            binaryName = 'neolink-linux-x64';
        } else if (arch === 'arm64') {
            binaryName = 'neolink-linux-arm64';
        } else if (arch === 'arm') {
            binaryName = 'neolink-linux-arm';
        } else {
            throw new Error(
                `Unsupported Linux architecture: ${arch}. ` +
                `Battery camera support requires x64, arm64, or arm.`
            );
        }
    } else if (platform === 'darwin' && (arch === 'x64' || arch === 'arm64')) {
        // macOS universal binary works for both Intel and Apple Silicon
        binaryName = 'neolink-macos-x64';
    } else if (platform === 'win32' && (arch === 'x64' || arch === 'ia32')) {
        binaryName = 'neolink-win-x64.exe';
    } else {
        throw new Error(
            `Unsupported platform: ${platform} ${arch}. ` +
            `Battery camera support requires Linux (x64/arm64/arm), macOS (x64/arm64), or Windows (x64).`
        );
    }

    const binaryPath = path.join(__dirname, '..', 'lib', binaryName);

    // Verify binary exists
    if (!fs.existsSync(binaryPath)) {
        throw new Error(
            `Neolink binary not found: ${binaryPath}. ` +
            `Please reinstall the adapter or report this issue.`
        );
    }

    // Verify binary is executable (Unix only)
    if (platform !== 'win32') {
        try {
            fs.accessSync(binaryPath, fs.constants.X_OK);
        } catch (err) {
            throw new Error(
                `Neolink binary is not executable: ${binaryPath}. ` +
                `Try running: chmod +x ${binaryPath}`
            );
        }
    }

    return {
        path: binaryPath,
        platform,
        arch
    };
}

/**
 * Get neolink version
 */
export function getNeolinkVersion(binaryPath: string): Promise<string> {
    return new Promise((resolve, reject) => {
        const { spawn } = require('child_process');
        const proc = spawn(binaryPath, ['--version']);

        let output = '';
        proc.stdout.on('data', (data: Buffer) => {
            output += data.toString();
        });

        proc.on('close', (code: number) => {
            if (code === 0) {
                // Extract version from "neolink 0.6.2" format
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
