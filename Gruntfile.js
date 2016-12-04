module.exports = function(grunt) {
    grunt.initConfig({
        pkg: grunt.file.readJSON('package.json'),
        browserify: {
            main: {
                src: 'lib/main.js',
                dest: 'debug/videojs5-hlsjs-source-handler.js',
                options:  {
                    browserifyOptions: {
                        debug: true
                    },
                    watch: true,
                    keepAlive: true
                }
            },
            dist: {
                src: 'lib/videojs5-hlsjs-source-handler.js',
                dest: 'dist/videojs5-hlsjs-source-handler.js',
                options:  {
                    browserifyOptions: {
                        debug: false,
                    },
                    watch: false,
                    keepAlive: false,
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
    grunt.loadNpmTasks('grunt-browserify');
    grunt.registerTask('build', 'build dist scripts',
        ['browserify:dist', 'uglify:dist']);
    grunt.registerTask('default', ['build']);
};
