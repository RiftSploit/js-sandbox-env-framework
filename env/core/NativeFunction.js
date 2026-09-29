/** Mark modeled browser functions while leaving user script functions inspectable. */
(function () {
    'use strict';
    const original = Function.prototype.toString;
    const nativeSources = new WeakMap();

    function safefunction(fn, name = fn.name) {
        if (typeof fn !== 'function') return fn;
        nativeSources.set(fn, `function ${name || ''}() { [native code] }`);
        return fn;
    }

    const toString = function toString() {
        if (typeof this !== 'function') return original.call(this);
        return nativeSources.get(this) || original.call(this);
    };
    Object.defineProperty(Function.prototype, 'toString', {
        value: toString, writable: true, configurable: true
    });
    safefunction(toString, 'toString');

    function markOwnMethods(object) {
        if (!object || (typeof object !== 'object' && typeof object !== 'function')) return;
        for (const key of Object.getOwnPropertyNames(object)) {
            if (key === 'constructor' || key === 'caller' || key === 'arguments') continue;
            const descriptor = Object.getOwnPropertyDescriptor(object, key);
            if (!descriptor) continue;
            if (typeof descriptor.value === 'function') safefunction(descriptor.value, key);
            if (descriptor.get) safefunction(descriptor.get, `get ${key}`);
            if (descriptor.set) safefunction(descriptor.set, `set ${key}`);
        }
    }

    Object.defineProperty(globalThis, 'safefunction', { value: safefunction, configurable: true });
    Object.defineProperty(globalThis, '__markBrowserFunctions__', {
        value() {
            const names = [
                'navigator', 'location', 'history', 'screen', 'document', 'localStorage',
                'sessionStorage', 'performance', 'crypto', 'XMLHttpRequest', 'Document',
                'Element', 'HTMLElement', 'HTMLCanvasElement', 'CanvasRenderingContext2D',
                'WebGLRenderingContext', 'AudioContext', 'OfflineAudioContext',
                'TextEncoder', 'TextDecoder', 'URL', 'Blob'
            ];
            for (const name of names) {
                const object = globalThis[name];
                markOwnMethods(object);
                if (typeof object === 'function') {
                    safefunction(object, name);
                    markOwnMethods(object.prototype);
                }
            }
            // The window mock has many methods; only mark those already present now.
            markOwnMethods(globalThis);
        },
        configurable: true
    });
})();
