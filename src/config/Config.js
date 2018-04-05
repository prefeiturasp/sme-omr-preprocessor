'use strict';
let ConfigBase = require('../lib/omr-base/config/Config');

class Config extends ConfigBase {

    /**
     * @returns {{X: number, Y: number, WIDTH: number, HEIGHT: number}}
     */
    static get CropRate() {
        return {
            X: Config.resource.CROPRATE_X || .75,
            Y: Config.resource.CROPRATE_Y || 0,
            WIDTH: Config.resource.CROPRATE_C1_WIDTH || 1,
            HEIGHT: Config.resource.CROPRATE_C1_HEIGHT || .15
        }
    }

    /**
     * @returns {{LEFT: number, RIGHT: number, TOP: number, BOTTOM: number}}
     */
    static get TemplateOffset() {
        return {
            LEFT: Config.resource.TEMPLATE_OFFSET_LEFT || 1,
            RIGHT: Config.resource.TEMPLATE_OFFSET_RIGHT || 1,
            TOP: Config.resource.TEMPLATE_OFFSET_TOP || 2,
            BOTTOM: Config.resource.TEMPLATE_OFFSET_BOTTOM || 1
        }
    }


    /**
     * Process Execution Chain
     * If set, before Pré-processor ends Processor will be called in a row
     * @return {String}
     */
    static get processChan() {
        return Config.resource.PROCESS_CHAIN_PROCESSOR || '';
    }

    /**
     * Max Processing Flag for QRCode Filters
     * @return {Number}
     */
    static get MaxProcessFlag() {
        return Config.resource.PROCESS_FLAG || 3;
    }

    static get ImageMagickPath() {
        return Config.resource.IMAGE_MAGICK_PATH || ''
    }
}

module.exports = Config;