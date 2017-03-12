'use strict';
var E = module.exports;
var hlsjsConfig;
var attached = false, disabled = false;
E.Hls = window.Hls;
E.videojs = window.videojs;

E.VERSION = '__VERSION__';
E.name = 'HolaProviderHLS';

var force_disabled = (function filter_out(){
    var reg_attr = 'register-percent';
    var script = document.currentScript||
        document.querySelector('#hola_vjs_hls_provider');
    if (!script||!script.hasAttribute(reg_attr))
        return false;
    var conf = +script.getAttribute(reg_attr);
    if (isNaN(conf)||conf<0||conf>100)
    {
        console.error(E.name+': invalid '+reg_attr+' attribute, '
            +'expected a value between 0 and 100 but '+
            script.getAttribute(reg_attr)+' found');
        return false;
    }
    return Math.random()*100>conf;
})();

E.attach = function(obsolete_param, videojs, Hls, hlsjsConfig_){
    if (force_disabled)
        return;
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
        var tech = E.videojs.getTech('Html5');
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
        E.videojs.HolaProviderHLS = HolaProviderHLS;
        console.log('HolaProviderHLS registered as Html5 SourceHandler');
    }
    else
        console.error('Hls.js is not supported in this browser!');
};

E.detach = function(){
    if (force_disabled)
        return;
    // we don't unregister source handler, just set it as disabled so it will
    // return false in canHandleSource()
    disabled = true;
};

E.canHandleSource = function(source){
    if (disabled)
        return '';
    if (/^application\/x-mpegURL$/i.test(source.type))
        return 'probably';
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
    tech.name_ = 'holaHLS';
    var _video = tech.el();
    var _hls;
    var _errorCounts = {};
    var _duration = null;
    var _seekableStart = 0;
    var _seekableEnd = 0;

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

    function initialize(){
        tech.hls_obj = _hls = new E.Hls(E.videojs.mergeOptions(
            tech.options_.hlsjsConfig, hlsjsConfig));
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
    }

    this.duration = function(){
        return _duration || _video.duration || 0;
    };

    this.seekable = function(){
        return E.videojs.createTimeRanges([[_seekableStart, _seekableEnd]]);
    };

    this.dispose = function(){
        _hls.destroy();
    };

    function load(source){
        _hls.loadSource(source.src);
    }

    function switchQuality(qualityId){
        _hls.manual_level = qualityId;
        if (_hls.hola_adaptive)
        {
            (_video.player||E.videojs.getPlayers()[_video.playerId])
            .trigger('mediachange');
        }
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

    function _levelLabel(level){
        if (level.height)
            return level.height + 'p';
        if (level.width)
            return Math.round(level.width * 9 / 16) + 'p';
        if (level.bitrate)
            return scaledNumber(level.bitrate) + 'bps';
        return 0;
    }

    function levelData(id, label){ return {id: id, label: label}; }

    function updateQuality(){
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

