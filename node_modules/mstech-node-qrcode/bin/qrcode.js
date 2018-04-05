#!/usr/bin/env node
'use strict';
const path = require('path');

if (require.main === module) {
    let args = process.argv;

    //TODO: Include and validate Linux Binary
    require('../lib/decode')(
        path.normalize(`${__dirname}/zxing.exe`),
        null, null, null, null,
        args.splice(2, args.length)
    )
        .then((result) => {
            console.log(result);
            process.exit(0);
        })
        .catch((error) => {
            console.error(error.message);
            process.exit(1);
        });
} else {
    module.exports.decode = (file, tryHarder, global, hybrid) => {
        //TODO: Include and validate Linux Binary
        return require('../lib/decode')(
            path.normalize(`${__dirname}/zxing.exe`),
            file,
            tryHarder,
            global,
            hybrid
        );
    };
}