'use strict';
module.exports = function (grunt) {

    require('load-grunt-tasks')(grunt);

    var BuildTasks  = require(__dirname + '/grunt/_load').BuildTasks({
        src: __dirname + '/src',
        dest: __dirname + '/build',
        docs: __dirname + '/docs'
    });

    grunt.initConfig(BuildTasks);

    grunt.registerTask('complexity-optimal', 'complexity:optimal');
    grunt.registerTask('complexity-regular', 'complexity:regular');

};