(function(){
    'use strict';
    var name = 'videojs5-hlsjs-source-handler.js', fs = require('fs');
    var s = 'if(typeof define==="function"&&define.amd){define([],f)}';
    function strip(file){
        fs.writeFileSync(file, fs.readFileSync(file, 'utf-8')
            .replace('else '+s+'else{', 'else{'+s), 'utf-8');
    }
    strip(__dirname+'/dist/'+name);
}());
