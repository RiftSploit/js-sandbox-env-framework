/** In-memory same-origin session history for the Location mock. */
(function () {
    'use strict';
    const entries = [{ state: null, url: window.location.href }];
    let index = 0;
    let restoration = 'auto';

    function urlFor(input) {
        const parsed = input === undefined || input === null
            ? new URL(window.location.href)
            : new URL(String(input), window.location.href);
        if (parsed.origin !== window.location.origin) {
            throw new DOMException('History state URL must have the same origin', 'SecurityError');
        }
        return parsed.href;
    }
    function traverse(next) {
        if (next < 0 || next >= entries.length || next === index) return;
        index = next;
        window.location.href = entries[index].url;
        if (typeof window.dispatchEvent === 'function') {
            window.dispatchEvent({ type: 'popstate', state: entries[index].state });
        }
    }

    function History() { throw new TypeError('Illegal constructor'); }
    Object.defineProperties(History.prototype, {
        length: { get: () => entries.length, configurable: true },
        state: { get: () => entries[index].state, configurable: true },
        scrollRestoration: {
            get: () => restoration,
            set: value => {
                if (value !== 'auto' && value !== 'manual') throw new TypeError('Invalid scrollRestoration');
                restoration = value;
            }, configurable: true
        },
        back: { value: function back() { traverse(index - 1); }, writable: true, configurable: true },
        forward: { value: function forward() { traverse(index + 1); }, writable: true, configurable: true },
        go: { value: function go(delta = 0) { traverse(index + (Number(delta) | 0)); }, writable: true, configurable: true },
        pushState: {
            value: function pushState(state, title, url) {
                if (arguments.length < 2) throw new TypeError('2 arguments required');
                const href = urlFor(url);
                entries.splice(index + 1);
                entries.push({ state, url: href });
                index = entries.length - 1;
                window.location.href = href;
            }, writable: true, configurable: true
        },
        replaceState: {
            value: function replaceState(state, title, url) {
                if (arguments.length < 2) throw new TypeError('2 arguments required');
                const href = urlFor(url);
                entries[index] = { state, url: href };
                window.location.href = href;
            }, writable: true, configurable: true
        },
        [Symbol.toStringTag]: { value: 'History', configurable: true }
    });
    Object.defineProperty(window, 'History', { value: History, writable: true, configurable: true });
    window.history = Object.create(History.prototype);
})();
