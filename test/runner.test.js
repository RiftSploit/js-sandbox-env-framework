import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function run(args) {
    return spawnSync(process.execPath, ['standalone-runner.js', '--quiet', ...args], {
        cwd: root, encoding: 'utf8'
    });
}

test('website JSON snapshot loads with proxy and keeps browser methods', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sandbox-env-'));
    try {
        const file = path.join(dir, 'env.json');
        fs.writeFileSync(file, JSON.stringify({
            location: { href: 'https://example.org/path', host: 'example.org' },
            navigator: { userAgent: 'Collected UA', plugins: [{ name: 'Example' }] },
            window: { innerWidth: 1234 }, document: { title: 'Collected title' }
        }));
        const result = run(['--profile', 'default', '--proxy', '--env', file, '--code',
            'JSON.stringify([location.href, typeof location.assign, navigator.userAgent, navigator.plugins.item(0).name, window.innerWidth, document.title, typeof document.createElement])']);
        assert.equal(result.status, 0, result.stderr);
        assert.match(result.stdout, /https:\/\/example\.org\/path.*function.*Collected UA.*Example.*1234.*Collected title.*function/);
        const withoutProfile = run(['--env', file, '--code',
            'JSON.stringify([location.href, typeof location.assign, typeof document.createElement])']);
        assert.equal(withoutProfile.status, 0, withoutProfile.stderr);
        assert.match(withoutProfile.stdout, /https:\/\/example\.org\/path.*function.*function/);
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

test('generated JS shape and legacy Object.assign both load in proxy mode', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sandbox-env-'));
    try {
        const modern = path.join(dir, 'modern.js');
        fs.writeFileSync(modern, 'window.__applyCollectedEnvironment__({location:{href:"https://example.org/"},document:{title:"New"}})');
        const newer = run(['--proxy', '--env', modern, '--code', 'JSON.stringify([location.href,document.title])']);
        assert.equal(newer.status, 0, newer.stderr);
        assert.match(newer.stdout, /https:\/\/example\.org\/.*New/);

        const legacy = path.join(dir, 'legacy.js');
        fs.writeFileSync(legacy, '(function(){Object.assign(window,{location:{href:"https://legacy.example/"},navigator:{userAgent:"Legacy"},screen:{width:800}})})();');
        const older = run(['--proxy', '--env', legacy, '--code', 'JSON.stringify([location.href,navigator.userAgent,screen.width])']);
        assert.equal(older.status, 0, older.stderr);
        assert.match(older.stdout, /https:\/\/legacy\.example\/.*Legacy.*800/);
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

test('modeled functions look native and user code remains inspectable', () => {
    for (const flags of [['--profile', 'default'], ['--profile', 'default', '--proxy']]) {
        const result = run([...flags, '--code',
            'JSON.stringify([Function.prototype.toString.call(location.assign), Function.prototype.toString.call(document.createElement), Function.prototype.toString.call(Function.prototype.toString), (function mine(){return 1}).toString()])']);
        assert.equal(result.status, 0, result.stderr);
        assert.match(result.stdout, /function assign\(\) \{ \[native code\] \}/);
        assert.match(result.stdout, /function createElement\(\) \{ \[native code\] \}/);
        assert.match(result.stdout, /function toString\(\) \{ \[native code\] \}/);
        assert.match(result.stdout, /function mine\(\)\{return 1\}/);
    }
});
