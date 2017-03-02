'use strict';
module.exports = function(grunt) {
    grunt.initConfig({
        pkg: grunt.file.readJSON('package.json'),
        jshint: {
            options: {jshintrc: '.jshintrc'},
            all: ['lib/*.js', './*.js'],
        },
        browserify: {
            dist: {
                src: 'lib/videojs5-hlsjs-source-handler.js',
                dest: 'dist/videojs5-hlsjs-source-handler.js',
                options:  {
                    browserifyOptions: {
                        debug: false,
                        standalone: 'HolaProviderHLS'
                    },
                }
            }
        },
        uglify: {
            options: {
                mangle: true,
                compress: {
                    drop_console: true
                },
                beautify: false
            },
            dist: {
                files: {
                    'dist/videojs5-hlsjs-source-handler.min.js':
                        'dist/videojs5-hlsjs-source-handler.js'
                }
            }
        }
    });
    grunt.loadNpmTasks('grunt-contrib-uglify');
    grunt.loadNpmTasks('grunt-contrib-jshint');
    grunt.loadNpmTasks('grunt-browserify');
    grunt.registerTask('build', 'build dist scripts',
        ['jshint', 'browserify:dist', 'uglify:dist']);
    grunt.registerTask('default', ['build']);
};
