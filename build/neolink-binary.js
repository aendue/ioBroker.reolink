"use strict";
/**
 * Neolink Binary Manager
 *
 * Downloads the appropriate neolink binary for the current platform on demand
 * from GitHub Releases and caches it in the lib/ directory.
 *
 * This replaces the previous approach of bundling AGPL-3.0 binaries directly
 * in the adapter package, which caused licensing concerns.
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.NEOLINK_VERSION = void 0;
exports.ensureNeolinkBinary = ensureNeolinkBinary;
exports.getNeolinkVersion = getNeolinkVersion;
const os = __importStar(require("os"));
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const https = __importStar(require("https"));
const adm_zip_1 = __importDefault(require("adm-zip"));
/** Pinned neolink version — update this when upgrading neolink */
exports.NEOLINK_VERSION = '0.6.2';
/** GitHub Releases base URL for neolink */
const RELEASE_BASE = `https://github.com/QuantumEntangledAndy/neolink/releases/download/v${exports.NEOLINK_VERSION}`;
/** Map platform/arch to the ZIP asset name on GitHub Releases */
function getAssetName() {
    const platform = os.platform();
    const arch = os.arch();
    if (platform === 'linux') {
        if (arch === 'x64') {
            return 'neolink_linux_x86_64_ubuntu.zip';
        }
        if (arch === 'arm64') {
            return 'neolink_linux_arm64.zip';
        }
        if (arch === 'arm') {
            return 'neolink_linux_armhf.zip';
        }
        throw new Error(`Unsupported Linux architecture: ${arch}. Requires x64, arm64, or arm.`);
    }
    if (platform === 'darwin') {
        return 'neolink_macos.zip';
    }
    if (platform === 'win32') {
        return 'neolink_windows.zip';
    }
    throw new Error(`Unsupported platform: ${platform} ${arch}. Requires Linux (x64/arm64/arm), macOS, or Windows (x64).`);
}
/** Local binary name after extraction */
function getLocalBinaryName() {
    return os.platform() === 'win32' ? 'neolink.exe' : 'neolink';
}
/**
 * Download a file from a URL to a local path, following HTTP redirects.
 * GitHub release downloads redirect to S3, so redirect handling is required.
 */
function downloadFile(url, destPath) {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(destPath);
        const request = (currentUrl) => {
            https
                .get(currentUrl, response => {
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
                .on('error', err => {
                fs.unlink(destPath, () => { }); // Clean up partial file
                reject(err);
            });
        };
        request(url);
        file.on('error', err => {
            fs.unlink(destPath, () => { }); // Clean up partial file
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
async function ensureNeolinkBinary(logFn) {
    const platform = os.platform();
    const arch = os.arch();
    const localName = getLocalBinaryName();
    const libDir = path.join(__dirname, '..', 'lib');
    const binaryPath = path.join(libDir, localName);
    if (!fs.existsSync(libDir)) {
        fs.mkdirSync(libDir, { recursive: true });
    }
    // Check if binary already exists and is executable
    if (fs.existsSync(binaryPath)) {
        if (platform !== 'win32') {
            try {
                fs.accessSync(binaryPath, fs.constants.X_OK);
                return { path: binaryPath, platform, arch };
            }
            catch {
                // Not executable — re-download
            }
        }
        else {
            return { path: binaryPath, platform, arch };
        }
    }
    // Download ZIP from GitHub Releases
    const assetName = getAssetName();
    const downloadUrl = `${RELEASE_BASE}/${assetName}`;
    const zipPath = path.join(libDir, assetName);
    logFn?.(`Downloading neolink v${exports.NEOLINK_VERSION} for ${platform}/${arch} ...`);
    logFn?.(`Source: ${downloadUrl}`);
    try {
        await downloadFile(downloadUrl, zipPath);
    }
    catch (err) {
        if (fs.existsSync(zipPath)) {
            fs.unlinkSync(zipPath);
        }
        throw new Error(`Failed to download neolink binary: ${err instanceof Error ? err.message : err}\n` +
            `You can manually place the binary at: ${binaryPath}\n` +
            `Download URL: ${downloadUrl}`);
    }
    // Extract neolink binary from ZIP using adm-zip (pure Node.js, no system dependencies)
    try {
        const zip = new adm_zip_1.default(zipPath);
        const targetName = platform === 'win32' ? 'neolink.exe' : 'neolink';
        const entry = zip.getEntries().find(e => path.basename(e.entryName) === targetName && !e.isDirectory);
        if (!entry) {
            throw new Error(`Binary '${targetName}' not found inside ${assetName}`);
        }
        fs.writeFileSync(binaryPath, entry.getData());
    }
    catch (err) {
        if (fs.existsSync(binaryPath)) {
            fs.unlinkSync(binaryPath);
        }
        if (fs.existsSync(zipPath)) {
            fs.unlinkSync(zipPath);
        }
        throw new Error(`Failed to extract neolink ZIP: ${err instanceof Error ? err.message : err}`);
    }
    // Clean up ZIP
    if (fs.existsSync(zipPath)) {
        fs.unlinkSync(zipPath);
    }
    // Make executable on Unix
    if (platform !== 'win32') {
        fs.chmodSync(binaryPath, 0o755);
    }
    logFn?.(`Neolink v${exports.NEOLINK_VERSION} ready: ${binaryPath}`);
    return { path: binaryPath, platform, arch };
}
/**
 * Get the neolink version string from an already-downloaded binary.
 */
function getNeolinkVersion(binaryPath) {
    return new Promise((resolve, reject) => {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { spawn } = require('child_process');
        const proc = spawn(binaryPath, ['--version']);
        let output = '';
        proc.stdout.on('data', (data) => {
            output += data.toString();
        });
        proc.on('close', (code) => {
            if (code === 0) {
                const match = output.match(/neolink\s+(\S+)/);
                resolve(match ? match[1] : 'unknown');
            }
            else {
                reject(new Error(`Failed to get neolink version (exit code ${code})`));
            }
        });
        proc.on('error', (err) => {
            reject(err);
        });
    });
}
//# sourceMappingURL=neolink-binary.js.map