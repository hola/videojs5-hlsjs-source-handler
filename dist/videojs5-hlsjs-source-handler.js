(function(f){if(typeof exports==="object"&&typeof module!=="undefined"){module.exports=f()}else if(typeof define==="function"&&define.amd){define([],f)}else{var g;if(typeof window!=="undefined"){g=window}else if(typeof global!=="undefined"){g=global}else if(typeof self!=="undefined"){g=self}else{g=this}g.HolaProviderHLS = f()}})(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
'use strict';
var E = module.exports;
var hlsjsConfig;
var ls;
try { ls = window.localStorage; } catch(e){}
var attached = false, disabled = false;
E.Hls = window.Hls;
E.videojs = window.videojs;

E.VERSION = '0.0.8-44';
E.name = 'HolaProviderHLS';

var script_conf = (function script_conf_init(){
    var attrs = {register: 'register-percent', manual_init: 'manual-init'};
    var script = document.currentScript||
        document.querySelector('#hola_videojs_hls_provider');
    if (!script)
        return {};
    var rpercent = '{[=it.HOLA_REGISTER_PERCENT]}';
    if (!rpercent.indexOf('{['))
    {
        if (!script.hasAttribute(attrs.register))
            return {};
        rpercent = +script.getAttribute(attrs.register);
    }
    if (isNaN(rpercent)||rpercent<0||rpercent>100)
    {
        console.error(E.name+': invalid '+attrs.register+' attribute, '+
            'expected a value between 0 and 100 but '+
            script.getAttribute(attrs.register)+' found');
        return {disabled: true};
    }
    var embedded = '{[=it.HOLA_EMBEDDED_PROVIDER]}'==1;
    // loader.js takes percent control on its side
    if (embedded)
        rpercent = 100;
    if (window.location.search && window.URLSearchParams)
    {
        var params = new window.URLSearchParams(window.location.search);
        rpercent = +params.get('hola_provider_register_percent')||rpercent;
    }
    if (ls && ls.getItem('hola_provider_register_percent'))
    {
        rpercent = +ls.getItem('hola_provider_register_percent');
        console.info(E.name+': '+attrs.register+' forced to '+rpercent+
            '% by localStorage configuration');
    }
    var autoinit = !embedded && !script.hasAttribute(attrs.manual_init);
    return {autoinit: autoinit,
        disabled: !rpercent||Math.random()*100>rpercent};
})();

E.attach = function(obsolete_param, videojs, Hls, hlsjsConfig_){
    if (Hls)
        E.Hls = Hls;
    if (videojs)
        E.videojs = videojs;
    if (hlsjsConfig_)
        hlsjsConfig = hlsjsConfig_;
    if (attached)
        disabled = false;
    else if (E.Hls.isSupported())
    {
        attached = true;
        disabled = false;
        // XXX volodymyr: originally we register hola provider inside Html5
        // tech, but in specific environment (e.g vjs+dm/hlsjs) hls videos
        // may be handled by a separate tech, so depending on options.techOrder
        // Html5 tech may be ignored == our provider not used. so we register
        // our source handler to all hls-based techs, but ideally we should
        // present our own tech instead
        var registered_techs = ['Hlsjs', 'Html5'].filter(function(tech){
            if (!(tech = E.videojs.getTech(tech)))
                return;
            // XXX yurij hack: some customers register their own provider and
            // prevent other from being registered with 0 index (rge related)
            if (tech.sourceHandlers instanceof Array)
                tech.sourceHandlers.splice(0, 0, E);
            else
                tech.registerSourceHandler(E, 0);
            // XXX yurij: prevent others handlers being registered with 0 index
            var r = tech.registerSourceHandler;
            tech.registerSourceHandler = function(e, i){
                return r.call(tech, e, i===0 ? 1 : i); };
            return true;
        });
        E.videojs.HolaProviderHLS = HolaProviderHLS;
        if (registered_techs.length)
        {
            console.log(E.name+' registered as %s SourceHandler',
                registered_techs.join('/'));
        }
        else
            console.log(E.name+' not registered: no suitable tech found');
    }
    else
        console.error('Hls.js is not supported in this browser!');
};

E.detach = function(){
    // we don't unregister source handler, just set it as disabled so it will
    // return false in canHandleSource()
    disabled = true;
};

E.canPlayType = function(type){
    if (disabled)
        return '';
    if (/^application\/x-mpegURL$/i.test(type))
        return 'probably';
    return '';
};

E.canHandleSource = function(source){
    var _can_play_type;
    if (disabled)
        return '';
    if (_can_play_type = E.canPlayType(source.type))
        return _can_play_type;
    if (/\.m3u8/i.test(source.src))
        return 'maybe';
    return '';
};

E.handleSource = function(source, tech){
    if (tech.hlsProvider)
        tech.hlsProvider.dispose();
    return tech.hlsProvider = new HolaProviderHLS(source, tech);
};

function HolaProviderHLS(source, tech){
    console.log('init hola/hls provider v'+E.VERSION+' hls v'+E.Hls.version);
    tech.name_ = 'holaHLS';
    var _video = tech.el();
    var _hls;
    var _errorCounts = {};
    var _duration = null;
    var _seekableStart = 0;
    var _seekableEnd = 0;
    var _player = _video.player||_video.parentNode.player||
        E.videojs.getPlayers()[_video.playerId];
    var _preload = _player.options().preload!='none';

    _video.addEventListener('error', function(evt){
        var errorTxt, mediaError = evt.currentTarget.error;
        switch(mediaError.code)
        {
        case mediaError.MEDIA_ERR_ABORTED:
            errorTxt = 'You aborted the video playback';
            break;
        case mediaError.MEDIA_ERR_DECODE:
            errorTxt = 'The video playback was aborted due to a corruption problem or because the video used features your browser did not support';
            _handleMediaError(mediaError);
            break;
        case mediaError.MEDIA_ERR_NETWORK:
            errorTxt = 'A network error caused the video download to fail part-way';
            break;
        case mediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
            errorTxt = 'The video could not be loaded, either because the server or network failed or because the format is not supported';
            break;
        }
        console.error('MEDIA_ERROR: ', errorTxt);
    });

    function reset(){
        // XXX volodymyr: Hlsjs tech may have preset dm instance on player init
        if (_player.techName_=='Hlsjs' && tech.hls_)
        {
            tech.hls_.destroy();
            tech.hls_ = null;
        }
        // XXX yurij: byteark uses it's own method to determine duration
        // which relies on tech.hlsHandler.isLive existance for live videos
        if (tech.hlsHandler)
            tech.hlsHandler.dispose();
        tech.hlsHandler = {
            dispose: function(){}, // byteark handleSource expects dispose
            isLive: function(){ return _duration==Infinity; },
        };
    }
    function _log(method, message){
        if (_hls && _hls.holaLog && _hls.holaLog[method])
            _hls.holaLog[method].call(_hls.holaLog, message);
    }
    function initialize(){
        var hola_log, hls_params = {};
        Object.assign(hls_params, hlsjsConfig);
        if (hls_params.debug!==undefined)
            hola_log = hls_params.debug;
        hls_params.debug = {};
        ['debug', 'info', 'log', 'warn','error'].forEach(function(method){
            hls_params.debug[method] = _log.bind(null, method); });
        tech.hls_obj = _hls = new E.Hls(E.videojs.mergeOptions(
            tech.options_.hlsjsConfig, hls_params));
        _hls.holaLog = hola_log;
        _hls.manual_level = -1;
        _hls.on(E.Hls.Events.ERROR, function(event, data){
            _onError(event, data, tech, _errorCounts);
        });
        _hls.on(E.Hls.Events.LEVEL_SWITCH, updateQuality);
        _hls.on(E.Hls.Events.LEVEL_LOADED, function(event, data){
            _duration = data.details.live ? Infinity :
                data.details.totalduration;
        });
        _hls.on(E.Hls.Events.LEVEL_UPDATED, function(event, data){
            _seekableStart = data.details.live ?
                data.details.fragments[0].start : 0;
            _seekableEnd = data.details.live ?
                _hls.streamController.computeLivePosition(_seekableStart,
                data.details) : data.details.totalduration;
        });
        _hls.on(E.Hls.Events.FRAG_PARSING_METADATA, function(event, data){
            tech.trigger('parsedmetadata', data);
        });
        _hls.attachMedia(_video);
        _video.addEventListener('waiting', _onWaitingForData);
    }

    this.duration = function(){
        return _duration || _video.duration || 0;
    };

    this.seekable = function(){
        return E.videojs.createTimeRanges([[_seekableStart, _seekableEnd]]);
    };

    this.dispose = function(){
        _video.removeEventListener('waiting', _onWaitingForData);
        _hls.destroy();
    };

    function load(source){
        _hls.loadSource(source.src);
    }

    function switchQuality(qualityId){
        _hls.manual_level = qualityId;
        if (_hls.hola_adaptive)
            _player.trigger('mediachange');
        else
            _hls.loadLevel = qualityId;
        updateQuality();
    }

    function _handleMediaError(error){
        if (_errorCounts[E.Hls.ErrorTypes.MEDIA_ERROR] === 1)
        {
            console.info('trying to recover media error');
            _hls.recoverMediaError();
        }
        else if (_errorCounts[E.Hls.ErrorTypes.MEDIA_ERROR] === 2)
        {
            console.info('2nd try to recover media error (by swapping audio codec');
            _hls.swapAudioCodec();
            _hls.recoverMediaError();
        }
        else if (_errorCounts[E.Hls.ErrorTypes.MEDIA_ERROR] > 2)
        {
            console.info('bubbling media error up to VIDEOJS');
            error.code = 3;
            tech.error = function(){ return error; };
            tech.trigger('error');
        }
    }

    function _onError(event, data){
        var level = 'error';
        var error = {
            message: ('HLS.js error: ' + data.type + ' - fatal: ' + data.fatal + ' - ' + data.details),
        };
        if (!data.fatal &&
            data.details === E.Hls.ErrorDetails.BUFFER_STALLED_ERROR)
        {
            level = 'warn';
        }
        console[level](error.message);
        // increment/set error count
        _errorCounts[data.type] ?
            _errorCounts[data.type] += 1 : _errorCounts[data.type] = 1;
        // implement simple error handling based on hls.js documentation
        // (https://github.com/dailymotion/hls.js/blob/master/API.md#fifth-step-error-handling)
        if (data.fatal)
        {
            switch (data.type)
            {
            case E.Hls.ErrorTypes.NETWORK_ERROR:
                console.info('bubbling network error up to VIDEOJS');
                error.code = 2;
                tech.error = function() { return error; };
                tech.trigger('error');
                break;
            case E.Hls.ErrorTypes.MEDIA_ERROR:
                _handleMediaError(error);
                break;
            default:
                // cannot recover
                _hls.destroy();
                console.info('bubbling error up to VIDEOJS');
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

    function heightLabel(level){
        var height = level.height || Math.round(level.width * 9 / 16);
        return height ? height + 'p' : '';
    }

    function bitrateLabel(level){
        return level.bitrate ? scaledNumber(level.bitrate) + 'bps' : '';
    }

    function levelLabel(level, levels){
        var label = heightLabel(level);
        if (!label)
            return bitrateLabel(level);
        var duplicated = levels.some(function(l){
            return l!=level && heightLabel(l)==label;
        });
        return  duplicated ? label+' '+bitrateLabel(level) : label;
    }

    function updateQuality(){
        var list = [], levels = _hls.levels;
        if (levels.length > 1)
            list.push({id: -1, label: 'Auto'});
        levels.forEach(function(level, index){
            list.push({id: index, label: levelLabel(level, levels)});
        });
        tech.trigger('loadedqualitydata', {
            quality: {
                list: list,
                selected: _hls.manual_level,
                current: _hls.loadLevel,
            },
            callback: switchQuality,
        });
    }

    function _onWaitingForData() {
        if (!_preload)
            load(source);
        _video.removeEventListener('waiting', _onWaitingForData);
    }

    reset();
    initialize();
    if (_preload)
        load(source);
}

if (script_conf.disabled)
    E.attach = E.detach = function(){};
else if (script_conf.autoinit)
    E.attach();

},{}]},{},[1])(1)
});