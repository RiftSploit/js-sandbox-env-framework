/** Keep Date and Intl in the same configured time zone inside this VM context. */
(function () {
    'use strict';
    const zone = window.__profile__?.timezone?.timezone;
    if (!zone) return;
    const NativeDateTimeFormat = Intl.DateTimeFormat;
    let partsFormatter;
    try {
        partsFormatter = new NativeDateTimeFormat('en-US', {
            timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
        });
    } catch (error) {
        throw new RangeError(`Invalid profile time zone: ${zone}`);
    }

    function offsetMinutes(date) {
        const fields = Object.fromEntries(partsFormatter.formatToParts(date)
            .filter(part => part.type !== 'literal').map(part => [part.type, Number(part.value)]));
        const localUTC = Date.UTC(fields.year, fields.month - 1, fields.day,
            fields.hour, fields.minute, fields.second);
        const actualUTC = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(),
            date.getUTCHours(), date.getUTCMinutes(), date.getUTCSeconds());
        return (actualUTC - localUTC) / 60000;
    }
    Date.prototype.getTimezoneOffset = function getTimezoneOffset() {
        if (!(this instanceof Date)) throw new TypeError('Method Date.prototype.getTimezoneOffset called on incompatible receiver');
        return Number.isNaN(this.getTime()) ? NaN : offsetMinutes(this);
    };

    const displayFormatter = new NativeDateTimeFormat('en-US', {
        timeZone: zone, weekday: 'short', month: 'short', day: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
        timeZoneName: 'long'
    });
    function displayParts(date) {
        if (!(date instanceof Date)) throw new TypeError('Incompatible Date receiver');
        if (Number.isNaN(date.getTime())) return null;
        const parts = Object.fromEntries(displayFormatter.formatToParts(date)
            .filter(part => part.type !== 'literal').map(part => [part.type, part.value]));
        const offset = -offsetMinutes(date);
        const sign = offset >= 0 ? '+' : '-';
        const hours = String(Math.floor(Math.abs(offset) / 60)).padStart(2, '0');
        const minutes = String(Math.abs(offset) % 60).padStart(2, '0');
        return {
            date: `${parts.weekday} ${parts.month} ${parts.day} ${parts.year}`,
            time: `${parts.hour}:${parts.minute}:${parts.second} GMT${sign}${hours}${minutes} (${parts.timeZoneName})`
        };
    }
    Date.prototype.toDateString = function toDateString() {
        return displayParts(this)?.date || 'Invalid Date';
    };
    Date.prototype.toTimeString = function toTimeString() {
        return displayParts(this)?.time || 'Invalid Date';
    };
    Date.prototype.toString = function toString() {
        const parts = displayParts(this);
        return parts ? `${parts.date} ${parts.time}` : 'Invalid Date';
    };

    function DateTimeFormat(locales, options) {
        return new NativeDateTimeFormat(locales, { ...options, timeZone: options?.timeZone || zone });
    }
    Object.setPrototypeOf(DateTimeFormat, NativeDateTimeFormat);
    DateTimeFormat.prototype = NativeDateTimeFormat.prototype;
    Intl.DateTimeFormat = DateTimeFormat;

    for (const method of ['toLocaleString', 'toLocaleDateString', 'toLocaleTimeString']) {
        const native = Date.prototype[method];
        Date.prototype[method] = function (locales, options) {
            return native.call(this, locales, { ...options, timeZone: options?.timeZone || zone });
        };
    }
})();
