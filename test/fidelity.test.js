import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function evaluate(code) {
    const result = spawnSync(process.execPath,
        ['standalone-runner.js', '--quiet', '--profile', 'default', '--code',
            `Promise.resolve((async () => { ${code} })()).then(value => JSON.stringify(value))`],
        { cwd: root, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    const match = result.stdout.match(/📤 返回值:\n([^\n]+)/);
    assert.ok(match, result.stdout);
    return JSON.parse(match[1]);
}

test('Location keeps identity and parses relative URLs consistently', () => {
    const actual = evaluate(`
        const same = location === window.location && location instanceof Location;
        location.assign('/a/b?x=1');
        location.href = '../c#part';
        const afterRelative = [location.href, location.origin, document.URL];
        window.location = '?q=2';
        return { same, afterRelative, final: [location.href, location.search, location.hash],
            descriptor: Object.getOwnPropertyDescriptor(window, 'location').configurable,
            internal: Object.getOwnPropertyNames(location).some(key => key.startsWith('_')),
            tag: Object.prototype.toString.call(location) };
    `);
    assert.deepEqual(actual, {
        same: true,
        afterRelative: ['https://www.example.com/c#part', 'https://www.example.com', 'https://www.example.com/c#part'],
        final: ['https://www.example.com/c?q=2', '?q=2', ''],
        descriptor: false, internal: false, tag: '[object Location]'
    });
});

test('Window and Document have stable browser identities', () => {
    const actual = evaluate(`return {
        windowTag: Object.prototype.toString.call(window),
        windowInstance: window instanceof Window,
        documentTag: Object.prototype.toString.call(document),
        documentInstance: document instanceof HTMLDocument && document instanceof Document && document instanceof Node,
        documentDescriptor: Object.getOwnPropertyDescriptor(window, 'document').configurable,
        documentURL: document.URL === location.href,
        navigatorTag: Object.prototype.toString.call(navigator),
        screenTag: Object.prototype.toString.call(screen)
    };`);
    assert.deepEqual(actual, {
        windowTag: '[object Window]', windowInstance: true,
        documentTag: '[object HTMLDocument]', documentInstance: true,
        documentDescriptor: false, documentURL: true,
        navigatorTag: '[object Navigator]', screenTag: '[object Screen]'
    });
});

test('Storage named properties and methods share one ordered data set', () => {
    const actual = evaluate(`
        localStorage.setItem('alpha', '');
        localStorage.beta = 2;
        localStorage.setItem('gamma', 'three');
        delete localStorage.beta;
        return { keys: Object.keys(localStorage), first: localStorage.key(0),
            stored: localStorage.getItem('alpha'), absent: localStorage.getItem('beta'),
            length: localStorage.length, other: sessionStorage.length,
            tag: Object.prototype.toString.call(localStorage),
            instance: localStorage instanceof Storage,
            native: Function.prototype.toString.call(Storage.prototype.getItem),
            illegal: (() => { try { Storage.prototype.getItem.call({ }, 'alpha'); return false; } catch (e) { return e instanceof TypeError; } })() };
    `);
    assert.deepEqual(actual, {
        keys: ['alpha', 'gamma'], first: 'alpha', stored: '', absent: null,
        length: 2, other: 0, tag: '[object Storage]', instance: true,
        native: 'function getItem() { [native code] }', illegal: true
    });
});

test('History updates URL without exposing internal helpers and rejects cross-origin state', () => {
    const actual = evaluate(`
        history.pushState({ page: 2 }, '', '/next?x=1');
        const current = [history.length, history.state.page, location.href];
        let securityError = false;
        try { history.pushState({}, '', 'https://other.example/'); }
        catch (error) { securityError = error.name === 'SecurityError'; }
        history.back();
        return { current, securityError, previous: location.href,
            privateHelper: '_resolveUrl' in history,
            documentTag: Object.prototype.toString.call(document),
            documentURL: document.URL };
    `);
    assert.deepEqual(actual, {
        current: [2, 2, 'https://www.example.com/next?x=1'], securityError: true,
        previous: 'https://www.example.com/', privateHelper: false,
        documentTag: '[object HTMLDocument]', documentURL: 'https://www.example.com/'
    });
});

test('UA client hints return only requested high entropy keys', () => {
    const actual = evaluate(`
        const low = await navigator.userAgentData.getHighEntropyValues([]);
        const selected = await navigator.userAgentData.getHighEntropyValues(['architecture']);
        return { low: Object.keys(low), selected: Object.keys(selected),
            architecture: selected.architecture,
            json: Object.keys(JSON.parse(JSON.stringify(navigator.userAgentData))),
            tag: Object.prototype.toString.call(navigator.userAgentData),
            native: Function.prototype.toString.call(navigator.userAgentData.getHighEntropyValues) };
    `);
    assert.deepEqual(actual, {
        low: ['brands', 'mobile', 'platform'],
        selected: ['brands', 'mobile', 'platform', 'architecture'], architecture: 'x86',
        json: ['brands', 'mobile', 'platform'], tag: '[object NavigatorUAData]',
        native: 'function getHighEntropyValues() { [native code] }'
    });
});
