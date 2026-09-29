/** Web Storage mock with method and named-property access to the same data. */
(function () {
    'use strict';

    const dataFor = new WeakMap();
    function dataOf(receiver) {
        const data = dataFor.get(receiver);
        if (!data) throw new TypeError('Illegal invocation');
        return data;
    }

    function Storage() { throw new TypeError('Illegal constructor'); }
    Object.defineProperties(Storage.prototype, {
        length: {
            get: function length() { return dataOf(this).size; }, configurable: true
        },
        key: {
            value: function key(index) {
                if (arguments.length < 1) throw new TypeError('1 argument required');
                return Array.from(dataOf(this).keys())[Number(index) >>> 0] ?? null;
            }, writable: true, configurable: true
        },
        getItem: {
            value: function getItem(key) {
                if (arguments.length < 1) throw new TypeError('1 argument required');
                const data = dataOf(this);
                const name = String(key);
                return data.has(name) ? data.get(name) : null;
            }, writable: true, configurable: true
        },
        setItem: {
            value: function setItem(key, value) {
                if (arguments.length < 2) throw new TypeError('2 arguments required');
                dataOf(this).set(String(key), String(value));
            }, writable: true, configurable: true
        },
        removeItem: {
            value: function removeItem(key) {
                if (arguments.length < 1) throw new TypeError('1 argument required');
                dataOf(this).delete(String(key));
            }, writable: true, configurable: true
        },
        clear: {
            value: function clear() { dataOf(this).clear(); }, writable: true, configurable: true
        },
        [Symbol.toStringTag]: { value: 'Storage', configurable: true }
    });

    function createStorage() {
        const target = Object.create(Storage.prototype);
        const data = new Map();
        const proxy = new Proxy(target, {
            get(object, key, receiver) {
                if (Reflect.has(object, key)) return Reflect.get(object, key, receiver);
                return typeof key === 'string' && data.has(key) ? data.get(key) : undefined;
            },
            set(object, key, value, receiver) {
                if (key === 'length') return true;
                if (typeof key === 'string' && !Reflect.has(object, key)) {
                    data.set(key, String(value));
                    return true;
                }
                return Reflect.set(object, key, value, receiver);
            },
            deleteProperty(object, key) {
                if (typeof key === 'string' && !Reflect.has(object, key)) {
                    data.delete(key);
                    return true;
                }
                return Reflect.deleteProperty(object, key);
            },
            has(object, key) {
                return Reflect.has(object, key) || (typeof key === 'string' && data.has(key));
            },
            ownKeys(object) {
                return [...Reflect.ownKeys(object), ...Array.from(data.keys()).filter(k => !Reflect.has(object, k))];
            },
            getOwnPropertyDescriptor(object, key) {
                const own = Reflect.getOwnPropertyDescriptor(object, key);
                if (own) return own;
                if (typeof key === 'string' && !Reflect.has(object, key) && data.has(key)) {
                    return { value: data.get(key), writable: true, enumerable: true, configurable: true };
                }
                return undefined;
            }
        });
        dataFor.set(proxy, data);
        return proxy;
    }

    Object.defineProperty(window, 'Storage', {
        value: Storage, configurable: true, writable: true
    });
    window.localStorage = createStorage();
    window.sessionStorage = createStorage();

    window.StorageEvent = function StorageEvent(type, options = {}) {
        this.type = String(type);
        this.key = options.key ?? null;
        this.oldValue = options.oldValue ?? null;
        this.newValue = options.newValue ?? null;
        this.url = options.url ?? '';
        this.storageArea = options.storageArea ?? null;
        this.bubbles = false;
        this.cancelable = false;
    };
})();
