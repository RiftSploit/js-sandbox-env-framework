/** Apply serializable collector snapshots without replacing browser objects or their methods. */
(function () {
    'use strict';

    const blocked = new Set(['__proto__', 'prototype', 'constructor']);
    const browserObjects = new Set([
        'location', 'navigator', 'screen', 'document', 'history', 'performance',
        'localStorage', 'sessionStorage'
    ]);

    function merge(target, source) {
        if (!target || typeof target !== 'object' || !source ||
            typeof source !== 'object' || Array.isArray(source)) return;

        for (const [key, value] of Object.entries(source)) {
            if (blocked.has(key) || key.startsWith('__') || value === undefined) continue;
            // A snapshot contains data, never executable replacements for browser APIs.
            if (typeof target[key] === 'function') continue;
            try {
                if (Array.isArray(value) && Array.isArray(target[key])) {
                    // Keep array helpers such as navigator.plugins.item/namedItem.
                    target[key].splice(0, target[key].length, ...value);
                } else if (value && typeof value === 'object' && !Array.isArray(value) &&
                    target[key] && typeof target[key] === 'object' && !Array.isArray(target[key])) {
                    merge(target[key], value);
                } else {
                    target[key] = value;
                }
            } catch (_) {
                // Browser properties such as location.origin may be read-only.
            }
        }
    }

    Object.defineProperty(window, '__applyCollectedEnvironment__', {
        value(data) {
            if (!data || typeof data !== 'object' || Array.isArray(data)) {
                throw new TypeError('环境快照必须是 JSON 对象');
            }
            const snapshot = data.objects && typeof data.objects === 'object'
                ? data.objects : data;
            for (const [key, value] of Object.entries(snapshot)) {
                if (blocked.has(key) || key.startsWith('__') || key === 'window') continue;
                if (browserObjects.has(key)) {
                    merge(window[key], value);
                } else if (!['timezone', 'webgl', 'canvas', 'audio', 'features', 'cookies'].includes(key)) {
                    // Flat snapshots may also contain extra, serializable globals.
                    if (window[key] === undefined) window[key] = value;
                }
            }
            if (snapshot.window) merge(window, snapshot.window);
            return window;
        },
        configurable: true
    });
})();
