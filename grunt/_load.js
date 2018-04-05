"use strict";
module.exports = {
    /**
     * Setup Configuration
     * @param config
     */
    BuildTasks: function(config) {
        return {
            path: config,
            complexity: require(__dirname + '/complexity')
        }
    }
};
