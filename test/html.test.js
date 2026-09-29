import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { SimpleSandbox } from '../server/sandbox/SimpleSandbox.js';
import express from 'express';
import sandboxRouter from '../server/routes/sandbox.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const run = promisify(execFile);
const html = `<!doctype html><html><head><title>Sample</title><base href="/assets/"></head>
<body><a id="link" class="entry" data-token="abc" href="img.png">hello</a>
<script>window.__inlineRan = true</script></body></html>`;

test('loaded HTML and later DOM mutations are visible to target JavaScript', () => {
    const sandbox = new SimpleSandbox().init();
    sandbox.loadHTML(html, 'https://example.org/page');
    const result = sandbox.execute(`JSON.stringify((() => {
        const link = document.getElementById('link');
        const live = document.getElementsByClassName('entry');
        const snapshot = document.querySelectorAll('.entry');
        let clicks = 0;
        document.body.addEventListener('click', event => { if (event.target === link) clicks++; }, { once: true });
        link.click(); link.click();
        link.dataset.token = 'xyz';
        link.style.backgroundColor = 'red';
        const inlineStyle = link.getAttribute('style');
        document.body.insertAdjacentHTML('beforeend', '<a class="entry" href="next">next</a>');
        document.querySelector('title').textContent = 'Updated';
        return { url: document.URL, base: document.baseURI, href: link.href,
            text: link.innerText, title: document.title, data: link.getAttribute('data-token'),
            inlineStyle,
            live: live.length, snapshot: snapshot.length,
            collectionTag: Object.prototype.toString.call(live),
            listTag: Object.prototype.toString.call(snapshot),
            attached: link.parentNode === document.body && document.documentElement.parentNode === document,
            clicks, inlineRan: !!window.__inlineRan, next: document.querySelectorAll('a')[1].href };
    })())`, { enableLogging: false });
    assert.equal(result.success, true, result.error);
    assert.deepEqual(JSON.parse(result.result), {
        url: 'https://example.org/page', base: 'https://example.org/assets/',
        href: 'https://example.org/assets/img.png', text: 'hello', title: 'Updated', data: 'xyz',
        inlineStyle: 'background-color: red;',
        live: 2, snapshot: 1, collectionTag: '[object HTMLCollection]',
        listTag: '[object NodeList]', attached: true, clicks: 1,
        inlineRan: false, next: 'https://example.org/assets/next'
    });
});

test('Canvas and WebGL read their fingerprint values from the active profile', () => {
    const sandbox = new SimpleSandbox().init({ profile: {
        meta: { name: 'custom' },
        canvas: { toDataURL: 'data:image/png;base64,custom' },
        webgl: { vendor: 'WebKit', renderer: 'WebKit WebGL',
            unmaskedRenderer: 'GPU A', extensions: ['WEBGL_debug_renderer_info'],
            parameters: { 3379: 8192 } }
    } });
    const result = sandbox.execute(`JSON.stringify((() => {
        const canvas = document.createElement('canvas');
        const gl = canvas.getContext('webgl');
        const before = gl.getParameter(37446);
        const info = gl.getExtension('WEBGL_debug_renderer_info');
        return [canvas.toDataURL(), gl.getParameter(gl.VENDOR),
            gl.getParameter(info.UNMASKED_RENDERER_WEBGL), before,
            gl.getParameter(3379), gl.getSupportedExtensions()];
    })())`, { enableLogging: false });
    assert.equal(result.success, true, result.error);
    assert.deepEqual(JSON.parse(result.result), [
        'data:image/png;base64,custom', 'WebKit', 'GPU A', null, 8192,
        ['WEBGL_debug_renderer_info']
    ]);
});

test('Date and Intl use the same configured time zone regardless of the host', () => {
    const sandbox = new SimpleSandbox().init({ profile: {
        meta: { name: 'shanghai' }, timezone: { timezone: 'Asia/Shanghai', offset: -480 }
    } });
    const result = sandbox.execute(`JSON.stringify((() => {
        const date = new Date('2026-09-29T06:00:00Z');
        return [date.getTimezoneOffset(), Intl.DateTimeFormat().resolvedOptions().timeZone,
            Intl.DateTimeFormat('en-US', { timeZone: 'UTC' }).resolvedOptions().timeZone,
            date.toLocaleTimeString('en-GB', { hour12: false })];
    })())`, { enableLogging: false });
    assert.equal(result.success, true, result.error);
    assert.deepEqual(JSON.parse(result.result), [-480, 'Asia/Shanghai', 'UTC', '14:00:00']);
});

test('CLI can load local HTML and fetch HTML for an explicit script', async () => {
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'sandbox-html-'));
    const file = path.join(temp, 'page.html');
    fs.writeFileSync(file, html);
    const code = 'JSON.stringify([document.title,document.getElementById("link").href,document.scripts.length])';
    const server = http.createServer((req, res) => {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(html);
    });
    try {
        const local = await run(process.execPath,
            ['standalone-runner.js', '--quiet', '--html-file', file,
                '--page-url', 'https://example.org/page', '--code', code], { cwd: root });
        assert.match(local.stdout, /Sample/);
        assert.match(local.stdout, /https:\/\/example.org\/assets\/img.png/);
        await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
        const remote = await run(process.execPath,
            ['standalone-runner.js', '--quiet', '--html-url',
                `http://127.0.0.1:${server.address().port}/page`, '--code',
                'JSON.stringify([document.title,location.pathname,document.querySelectorAll("a").length])'],
            { cwd: root });
        assert.match(remote.stdout, /Sample/);
        assert.match(remote.stdout, /\/page/);
    } finally {
        server.close();
        fs.rmSync(temp, { recursive: true, force: true });
    }
});

test('web API keeps each supplied HTML page in a separate execution context', async () => {
    const app = express();
    app.use(express.json());
    app.use('/sandbox', sandboxRouter);
    const server = await new Promise(resolve => {
        const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
    });
    try {
        const url = `http://127.0.0.1:${server.address().port}/sandbox/run`;
        async function execute(html, code) {
            const response = await fetch(url, { method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ html, code, pageURL: 'https://example.org/' }) });
            return { status: response.status, value: await response.json() };
        }
        const first = await execute('<title>first</title>', 'window.temp = 1; document.title');
        const second = await execute('<title>second</title>',
            'JSON.stringify([document.title, typeof window.temp])');
        assert.equal(first.value.result, 'first');
        assert.deepEqual(JSON.parse(second.value.result), ['second', 'undefined']);
        const invalid = await fetch(url, { method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ html: '<title>x</title>', code: '1', pageURL: 'file:///tmp/x' }) });
        assert.equal(invalid.status, 400);
    } finally {
        await new Promise(resolve => server.close(resolve));
    }
});
