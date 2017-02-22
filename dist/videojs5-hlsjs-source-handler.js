(function(f){if(typeof exports==="object"&&typeof module!=="undefined"){module.exports=f()}else if(typeof define==="function"&&define.amd){define([],f)}else{var g;if(typeof window!=="undefined"){g=window}else if(typeof global!=="undefined"){g=global}else if(typeof self!=="undefined"){g=self}else{g=this}g.HolaProviderHLS = f()}})(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
var Hls;

var sourceHandler = {
    canHandleSource: function (source) {
        var hlsTypeRE = /^application\/x-mpegURL$/i;
        var hlsExtRE = /\.m3u8/i;
        var result;
        if (this.disabled) {
            result = '';
        } else if (hlsTypeRE.test(source.type)) {
            result = 'probably';
        } else if (hlsExtRE.test(source.src)) {
            result = 'maybe';
        } else {
            result = '';
        }
        return result;
    },
    handleSource: function (source, tech) {
        if (tech.hlsProvider) {
            tech.hlsProvider.dispose();
        }
        tech.hlsProvider = new HolaProviderHLS(source, tech, this.hlsjsConfig);
        return tech.hlsProvider;
    },
    name: 'HolaProviderHLS',
    attached: false,
    disabled: false,
};

function HolaProviderHLS(source, tech, hlsjsConfig) {
    tech.name_ = 'holaHLS';
    var _video = tech.el();
    var _hls;
    var _errorCounts = {};
    var _duration = null;
    _video.addEventListener('error', function(evt) {
        var errorTxt,mediaError=evt.currentTarget.error;
        switch(mediaError.code) {
        case mediaError.MEDIA_ERR_ABORTED:
            errorTxt = "You aborted the video playback";
            break;
        case mediaError.MEDIA_ERR_DECODE:
            errorTxt = "The video playback was aborted due to a corruption problem or because the video used features your browser did not support";
            _handleMediaError();
            break;
        case mediaError.MEDIA_ERR_NETWORK:
            errorTxt = "A network error caused the video download to fail part-way";
            break;
        case mediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
            errorTxt = "The video could not be loaded, either because the server or network failed or because the format is not supported";
            break;
        }
        console.error("MEDIA_ERROR: ", errorTxt);
    });

    function initialize() {
        tech.hls_obj = _hls = new Hls(videojs.mergeOptions(
            tech.options_.hlsjsConfig, hlsjsConfig));
        _hls.manual_level = -1;
        _hls.on(Hls.Events.ERROR, function(event, data) {
            _onError(event, data, tech, _errorCounts);
        });
        _hls.on(Hls.Events.LEVEL_SWITCH, updateQuality);
        _hls.on(Hls.Events.LEVEL_LOADED, function(event, data) {
            _duration = data.details.live ? Infinity : data.details.totalduration;
        });
        _hls.attachMedia(_video);
    }

    this.duration = function () {
        return _duration || _video.duration || 0;
    };

    this.dispose = function () {
        _hls.destroy();
    };

    function load(source) {
        _hls.loadSource(source.src);
    }

    function switchQuality(qualityId) {
        _hls.manual_level = qualityId;
        if (_hls.hola_adaptive)
        {
            (_video.player||videojs.getPlayers()[_video.playerId])
            .trigger('mediachange');
        }
        else
            _hls.loadLevel = qualityId;
        updateQuality();
    }

    function _handleMediaError() {
        if (_errorCounts[Hls.ErrorTypes.MEDIA_ERROR] === 1) {
            console.info("trying to recover media error");
            _hls.recoverMediaError();
        } else if (_errorCounts[Hls.ErrorTypes.MEDIA_ERROR] === 2) {
            console.info("2nd try to recover media error (by swapping audio codec");
            _hls.swapAudioCodec();
            _hls.recoverMediaError();
        } else if (_errorCounts[Hls.ErrorTypes.MEDIA_ERROR] > 2) {
            console.info("bubbling media error up to VIDEOJS");
            error.code = 3;
            tech.error = function() { return error; };
            tech.trigger('error');
        }
    }

    function _onError(event, data) {
        var level = 'error';
        var error = {
            message: ('HLS.js error: ' + data.type + ' - fatal: ' + data.fatal + ' - ' + data.details),
        };
        if (!data.fatal && data.details === Hls.ErrorDetails.BUFFER_STALLED_ERROR) {
            level = 'warn';
        }
        console[level](error.message);
        // increment/set error count
        _errorCounts[data.type] ? _errorCounts[data.type] += 1 : _errorCounts[data.type] = 1;
        // implement simple error handling based on hls.js documentation (https://github.com/dailymotion/hls.js/blob/master/API.md#fifth-step-error-handling)
        if (data.fatal) {
            switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
                console.info("bubbling network error up to VIDEOJS");
                error.code = 2;
                tech.error = function() { return error; };
                tech.trigger('error');
                break;
            case Hls.ErrorTypes.MEDIA_ERROR:
                _handleMediaError();
                break;
            default:
                // cannot recover
                _hls.destroy();
                console.info("bubbling error up to VIDEOJS");
                tech.error = function() { return error; };
                tech.trigger('error');
                break;
            }
        }
    }

    function scaledNumber(num){
        if (num===undefined)
            return '';
        if (!num)
            return '0';
        var k = 1024;
        var sizes = ['', 'K', 'M', 'G', 'T', 'P'];
        var i = Math.floor(Math.log(num)/Math.log(k));
        num /= Math.pow(k, i);
        if (num<0.001)
            return '0';
        if (num>=k-1)
            num = Math.trunc(num);
        var str = num.toFixed(num<1 ? 3 : num<10 ? 2 : num<100 ? 1 : 0);
        return str.replace(/\.0*$/, '')+sizes[i];
    }

    function _levelLabel(level) {
        if (level.height) return level.height + "p";
        else if (level.width) return Math.round(level.width * 9 / 16) + "p";
        else if (level.bitrate) return scaledNumber(level.bitrate) + "bps";
        else return 0;
    }

    function levelData(id, label){ return {id: id, label: label}; }

    function updateQuality() {
        var list = [], levels = _hls.levels;
        if (levels.length > 1)
            list.push(levelData(-1, 'auto'));
        levels.forEach(function(level, index){
            list.push(levelData(index, _levelLabel(level))); });
        tech.trigger('loadedqualitydata', {
            quality: {
                list: list,
                selected: _hls.manual_level,
                current: _hls.loadLevel,
            },
            callback: switchQuality,
        });
    }

    initialize();
    load(source);
}

function attachHolaProviderHLS(window, videojs, Hls_, hlsjsConfig) {
    Hls = Hls_;
    if (hlsjsConfig)
        sourceHandler.hlsjsConfig = hlsjsConfig;
    if (sourceHandler.attached) {
        sourceHandler.disabled = false;
    } else if (Hls.isSupported()) {
        sourceHandler.attached = true;
        sourceHandler.disabled = false;
        videojs.getComponent('Html5').registerSourceHandler(sourceHandler, 0);
        videojs.HolaProviderHLS = HolaProviderHLS;
        console.log("HolaProviderHLS registerd as Html5 SourceHandler");
    } else {
        console.error("Hls.js is not supported in this browser!");
    }
}

function detachHolaProviderHLS() {
    // we don't unregister source handler, just set it as disabled so it will
    // return false in canHandleSource()
    sourceHandler.disabled = true;
}

exports.attach = attachHolaProviderHLS;
exports.detach = detachHolaProviderHLS;
exports.VERSION = '0.0.8-19';

},{}]},{},[1])(1)
});