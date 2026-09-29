/** Location mock backed by the runner's WHATWG URL implementation. */
(function () {
    'use strict';

    const profile = (window.__profile__ && window.__profile__.location) || {};
    const URLConstructor = window.URL;
    if (typeof URLConstructor !== 'function') throw new Error('Location 需要 URL 构造函数');

    let current = new URLConstructor(profile.href || 'https://example.com/');
    function navigate(value) {
        current = new URLConstructor(String(value), current.href);
        // Navigation is in-memory only. Keep the mock Document URL coherent.
        if (window.document) {
            try { window.document.URL = current.href; } catch (_) {}
            try { window.document.documentURI = current.href; } catch (_) {}
            try { window.document.baseURI = current.href; } catch (_) {}
        }
    }

    function Location() { throw new TypeError('Illegal constructor'); }
    Object.defineProperty(Location.prototype, Symbol.toStringTag, {
        value: 'Location', configurable: true
    });
    const location = Object.create(Location.prototype);
    const ancestorOrigins = {
        length: 0,
        item: function item() { return null; },
        contains: function contains() { return false; },
        [Symbol.toStringTag]: 'DOMStringList'
    };
    const fields = {
        href: { get: () => current.href, set: navigate },
        origin: { get: () => current.origin },
        protocol: { get: () => current.protocol, set: value => { current.protocol = String(value); } },
        host: { get: () => current.host, set: value => { current.host = String(value); } },
        hostname: { get: () => current.hostname, set: value => { current.hostname = String(value); } },
        port: { get: () => current.port, set: value => { current.port = String(value); } },
        pathname: { get: () => current.pathname, set: value => { current.pathname = String(value); } },
        search: { get: () => current.search, set: value => { current.search = String(value); } },
        hash: { get: () => current.hash, set: value => { current.hash = String(value); } },
        ancestorOrigins: { get: () => ancestorOrigins },
        assign: { value: function assign(url) { navigate(url); } },
        replace: { value: function replace(url) { navigate(url); } },
        reload: { value: function reload() {} },
        toString: { value: function toString() { return current.href; } }
    };
    for (const descriptor of Object.values(fields)) {
        descriptor.enumerable = true;
        descriptor.configurable = false;
        if ('value' in descriptor) descriptor.writable = false;
    }
    Object.defineProperties(location, fields);

    Object.defineProperty(window, 'Location', {
        value: Location, configurable: true, writable: true
    });
    Object.defineProperty(window, 'location', {
        enumerable: true,
        configurable: false,
        get: () => location,
        set: value => {
            // Support older collector output that assigns a plain snapshot.
            if (value && typeof value === 'object' && value !== location) {
                if ('href' in value) navigate(value.href);
                for (const key of ['protocol', 'host', 'hostname', 'port', 'pathname', 'search', 'hash']) {
                    if (key in value) location[key] = value[key];
                }
            } else {
                navigate(value);
            }
        }
    });
    Object.defineProperty(window, 'origin', {
        configurable: true, enumerable: true, get: () => current.origin
    });
})();
