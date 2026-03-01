"use strict";
/**
 * Neolink Binary Manager
 *
 * Selects and manages the appropriate neolink binary for the current platform.
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.getNeolinkBinary = getNeolinkBinary;
exports.getNeolinkVersion = getNeolinkVersion;
const os = __importStar(require("os"));
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
/**
 * Get the appropriate neolink binary for the current platform
 */
function getNeolinkBinary() {
    const platform = os.platform();
    const arch = os.arch();
    let binaryName;
    if (platform === 'linux' && arch === 'x64') {
        binaryName = 'neolink-linux-x64';
    }
    else if (platform === 'darwin' && (arch === 'x64' || arch === 'arm64')) {
        // macOS universal binary works for both Intel and Apple Silicon
        binaryName = 'neolink-macos-x64';
    }
    else if (platform === 'win32' && (arch === 'x64' || arch === 'ia32')) {
        binaryName = 'neolink-win-x64.exe';
    }
    else {
        throw new Error(`Unsupported platform: ${platform} ${arch}. ` +
            `Battery camera support requires Linux x64, macOS x64/arm64, or Windows x64.`);
    }
    const binaryPath = path.join(__dirname, '..', 'lib', binaryName);
    // Verify binary exists
    if (!fs.existsSync(binaryPath)) {
        throw new Error(`Neolink binary not found: ${binaryPath}. ` +
            `Please reinstall the adapter or report this issue.`);
    }
    // Verify binary is executable (Unix only)
    if (platform !== 'win32') {
        try {
            fs.accessSync(binaryPath, fs.constants.X_OK);
        }
        catch (err) {
            throw new Error(`Neolink binary is not executable: ${binaryPath}. ` +
                `Try running: chmod +x ${binaryPath}`);
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
function getNeolinkVersion(binaryPath) {
    return new Promise((resolve, reject) => {
        const { spawn } = require('child_process');
        const proc = spawn(binaryPath, ['--version']);
        let output = '';
        proc.stdout.on('data', (data) => {
            output += data.toString();
        });
        proc.on('close', (code) => {
            if (code === 0) {
                // Extract version from "neolink 0.6.2" format
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