'use strict';
const spawn = require('child_process').spawn;

module.exports = (bin, file, tryHarder, global, hybrid, args) => {
    return new Promise((resolve, reject) => {
        var params = [];
        var zxing;
        var stdout = "";
        var stderr = "";

        if (!bin) reject(new Error('Bin is required'));
        else if (Array.isArray(args)) params = args;
        else {
            if (tryHarder) params.push('--try-harder');

            if (global && !hybrid) params.push('-g');
            else if (!global && hybrid) params.push('-h');

            if (!file) reject(new Error('File is required'))
            else params.push(file)
        }

        zxing = spawn(bin, params);
        zxing.stdin.once('error', reject);
        zxing.stdout.on('data', (data) => {
            stdout += data;
        });
        zxing.stderr.on('data', (data) => {
            stderr += data;
        });
        zxing.on('close', (code, signal) => {
            if (code !== 0 || signal !== null) {
                let err = new Error(`Command failed: ${stderr || stdout}`);
                err.code = code;
                err.signal = signal;

                reject(err);
            } else {
                stdout = stdout.replace('\r\n', '');
                if (stdout.match(/decoding failed/i)) {
                    let err = new Error('Failed to detect QRCode');
                    reject(err);
                } else resolve(stdout);
            }
        });
        zxing.on('error', reject);
    });
};
