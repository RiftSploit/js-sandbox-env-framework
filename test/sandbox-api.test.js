import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SimpleSandbox } from '../server/sandbox/SimpleSandbox.js';

test('programmatic sandbox loads browser modules and collected JSON consistently', () => {
    const sandbox = new SimpleSandbox().init();
    const loaded = sandbox.loadAllEnvFiles();
    assert.ok(loaded.length > 10);
    assert.ok(loaded.every(item => item.success), JSON.stringify(loaded));
    assert.equal(sandbox.loadAllEnvFiles().length, loaded.length);

    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'sandbox-api-'));
    try {
        const snapshot = path.join(temp, 'captured.json');
        fs.writeFileSync(snapshot, JSON.stringify({ location: { href: 'https://capture.example/next' },
            navigator: { userAgent: 'Captured UA' } }));
        assert.equal(sandbox.injectEnvironment(snapshot).success, true);
        const executed = sandbox.execute('JSON.stringify([location.href, navigator.userAgent, typeof location.assign, document.URL])',
            { enableLogging: false });
        assert.equal(executed.success, true);
        assert.deepEqual(JSON.parse(executed.result),
            ['https://capture.example/next', 'Captured UA', 'function', 'https://capture.example/next']);
        assert.equal(sandbox.loadEnvFile('../outside.js').success, false);
    } finally {
        fs.rmSync(temp, { recursive: true, force: true });
    }
});

test('programmatic sandbox waits for a returned browser API promise', async () => {
    const sandbox = new SimpleSandbox().init();
    assert.ok(sandbox.loadAllEnvFiles().every(item => item.success));
    const result = await sandbox.execute(
        'navigator.userAgentData.getHighEntropyValues(["architecture"])',
        { enableLogging: false, timeout: 1000 });
    assert.equal(result.success, true, result.error);
    assert.deepEqual(Object.keys(JSON.parse(result.result)), ['brands', 'mobile', 'platform', 'architecture']);
});
