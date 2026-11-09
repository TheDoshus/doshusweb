(function() {
    'use strict';

    var videoJsLoadPromise = null;
    var isFullyReady = false;

    // Video.js vendor assets loader. The stylesheet is inserted right before meme-video.css
    // if present so the cascade order is preserved. Both JS and CSS must settle successfully
    // before resolution. In-flight requests are prioritized and shared; failures reset cleanly
    // so subsequent calls retry safely.
    function loadVideoJs() {
        if (isFullyReady && window.videojs) return Promise.resolve(window.videojs);
        if (videoJsLoadPromise) return videoJsLoadPromise;

        var sheet = Object.assign(document.createElement('link'), {
            rel: 'stylesheet',
            href: '/assets/vendor/videojs/video-js.min.css'
        });
        var sheetPromise = new Promise(function(resolve, reject) {
            sheet.onload = function() { resolve(); };
            sheet.onerror = function() {
                reject(new Error('Video.js stylesheet failed to load'));
            };
        });

        var ours = document.querySelector('link[href$="meme-video.css"]');
        if (ours && typeof ours.before === 'function') {
            ours.before(sheet);
        } else if (document.head) {
            document.head.appendChild(sheet);
        }

        var script = null;
        var scriptPromise;
        if (window.videojs) {
            scriptPromise = Promise.resolve(window.videojs);
        } else {
            script = document.createElement('script');
            script.src = '/assets/vendor/videojs/video.min.js';
            script.async = true;
            scriptPromise = new Promise(function(resolve, reject) {
                script.onload = function() {
                    if (window.videojs) {
                        resolve(window.videojs);
                    } else {
                        reject(new Error('Video.js loaded without exposing videojs'));
                    }
                };
                script.onerror = function() {
                    reject(new Error('Video.js failed to load'));
                };
            });
            if (document.head) document.head.appendChild(script);
        }

        videoJsLoadPromise = Promise.all([scriptPromise, sheetPromise]).then(function(results) {
            isFullyReady = true;
            return results[0] || window.videojs;
        }).catch(function(err) {
            isFullyReady = false;
            videoJsLoadPromise = null;
            if (script && script.parentNode) script.remove();
            if (sheet && sheet.parentNode) sheet.remove();
            throw err;
        });

        return videoJsLoadPromise;
    }

    // Canonical Video.js attacher for all site HTML video entrypoints
    function attachVideoJsPlayer(videoEl, options) {
        if (!videoEl) return Promise.reject(new Error('No video element provided'));
        if (videoEl._vjsPlayer && typeof videoEl._vjsPlayer.isDisposed === 'function' && !videoEl._vjsPlayer.isDisposed()) {
            return Promise.resolve(videoEl._vjsPlayer);
        }
        videoEl.classList.add('video-js');
        videoEl.controls = false;

        return loadVideoJs().then(function(vjs) {
            if (!videoEl.isConnected) return null;
            if (videoEl._vjsPlayer && typeof videoEl._vjsPlayer.isDisposed === 'function' && !videoEl._vjsPlayer.isDisposed()) {
                return videoEl._vjsPlayer;
            }
            var playerOpts = Object.assign({
                autoplay: false,
                preload: 'metadata',
                playsinline: true,
                responsive: true,
                fluid: true,
                controls: true
            }, options || {}, { autoplay: false });
            var player = vjs(videoEl, playerOpts);
            videoEl._vjsPlayer = player;
            if (typeof player.one === 'function') {
                player.one('dispose', function() {
                    if (videoEl._vjsPlayer === player) videoEl._vjsPlayer = null;
                });
            }
            return player;
        }).catch(function(err) {
            if (videoEl.isConnected) {
                videoEl.controls = true;
                videoEl.classList.remove('video-js');
            }
            throw err;
        });
    }

    loadVideoJs._isStub = false;
    attachVideoJsPlayer._isStub = false;
    window.loadVideoJs = loadVideoJs;
    window.attachVideoJsPlayer = attachVideoJsPlayer;
})();
