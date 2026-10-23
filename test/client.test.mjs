import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createNectar, NectarError, decodeBody } from '../dist/index.js';

const nonce = 'a'.repeat(48);
const ui = { theme: { '--hp-accent': '255 180 0' }, locale: 'en', messages: {} };
function frame() {
    const listeners = new Set(), sent = [];
    const parent = { postMessage(message) { sent.push(message); } };
    const host = { parent, location: { href: 'https://panel.test/nectar/assets/test.example/dist/index.html' },
        addEventListener(type, fn) { listeners.add(fn); }, removeEventListener(type, fn) { listeners.delete(fn); } };
    globalThis.window = host;
    return { sent, listeners, message(data, source = parent, origin = 'https://panel.test') { for (const fn of listeners) fn({ data: { nectar: 'v1', ...data }, source, origin }); },
        init() { this.message({ type: 'init', nonce, cellId: null, ui }); } };
}
test('handshake checks parent and origin, requests bind to nonce, errors preserve status', async () => {
    const f = frame(), sdk = createNectar();
    try {
        assert.equal(f.sent[0].type, 'ready');
        f.message({ type: 'init', nonce, cellId: 'spoof', ui }, {});
        f.message({ type: 'init', nonce, cellId: 'spoof', ui }, undefined, 'https://evil.test');
        assert.equal(sdk.context, undefined);
        f.init(); await sdk.ready;
        const promise = sdk.cells.list();
        await Promise.resolve();
        const request = f.sent.at(-1);
        assert.equal(request.method, 'cells.list');
        f.message({ type: 'response', requestId: request.requestId, nonce: 'b'.repeat(48), ok: true, data: { cells: ['wrong'] } });
        f.message({ type: 'response', requestId: request.requestId, nonce, ok: true, data: { cells: [{ id: 'one' }] } });
        assert.deepEqual(await promise, [{ id: 'one' }]);
        const denied = sdk.settings.get(); await Promise.resolve();
        f.message({ type: 'response', requestId: f.sent.at(-1).requestId, nonce, ok: false, error: 'Permission denied', status: 403 });
        await assert.rejects(denied, error => error instanceof NectarError && error.status === 403);
    } finally { sdk.dispose(); }
    assert.equal(f.listeners.size, 0);
});
test('UI updates, acknowledged events and listener cleanup', async () => {
    const f = frame(), sdk = createNectar(); f.init(); await sdk.ready;
    try {
        let language, event;
        const off = sdk.onUI(value => { language = value.locale; });
        sdk.events.on(value => { event = value; });
        f.message({ type: 'ui', nonce, ui: { ...ui, locale: 'de' } });
        assert.equal(language, 'de'); assert.equal(sdk.context.ui.locale, 'de');
        off(); f.message({ type: 'ui', nonce, ui }); assert.equal(language, 'de');
        const subscription = sdk.events.subscribe(['cell.updated']); await Promise.resolve();
        const request = f.sent.at(-1);
        assert.equal(request.method, 'events.subscribe');
        f.message({ type: 'response', nonce, requestId: request.requestId, ok: true, data: { ok: true } });
        assert.deepEqual(await subscription, { ok: true });
        f.message({ type: 'event', nonce, event: 'cell.updated', cell: { id: 'cell' } });
        assert.equal(event.cell.id, 'cell');
    } finally { sdk.dispose(); }
});
test('request timeout and disposal reject pending work', async () => {
    const f = frame(), sdk = createNectar({ timeoutMs: 10 }); f.init(); await sdk.ready;
    await assert.rejects(sdk.cells.list(), { code: 'REQUEST_TIMEOUT' });
    const pending = sdk.cells.list(); await Promise.resolve(); sdk.dispose();
    await assert.rejects(pending, { code: 'DISPOSED' });
    await assert.rejects(sdk.cells.list(), { code: 'DISPOSED' });
});
test('handshake timeout and early disposal clean up listeners', async () => {
    let f = frame(), sdk = createNectar({ handshakeTimeoutMs: 10 });
    await assert.rejects(sdk.ready, { code: 'HANDSHAKE_TIMEOUT' }); assert.equal(f.listeners.size, 0); sdk.dispose();
    f = frame(); sdk = createNectar(); sdk.dispose();
    await assert.rejects(sdk.ready, { code: 'DISPOSED' }); assert.equal(f.listeners.size, 0);
});
test('backpressure caps simultaneous requests at the Panel limit', async () => {
    const f = frame(), sdk = createNectar(); f.init(); await sdk.ready;
    const work = Array.from({ length: 10 }, () => sdk.cells.list());
    await Promise.resolve();
    await assert.rejects(sdk.cells.list(), { code: 'TOO_MANY_REQUESTS' });
    sdk.dispose();
    await Promise.all(work.map(promise => assert.rejects(promise, { code: 'DISPOSED' })));
});
test('response decoding preserves UTF-8', () => {
    assert.equal(decodeBody({ body_base64: Buffer.from('Nectar 🐝').toString('base64') }), 'Nectar 🐝');
});
test('client instances use distinct request IDs so old frame responses cannot resolve new calls', async () => {
    const f = frame(), first = createNectar(), second = createNectar();
    f.init(); await Promise.all([first.ready, second.ready]);
    const a = first.cells.list(), b = second.cells.list();
    await Promise.resolve();
    const calls = f.sent.filter(message => message.type === 'request');
    assert.notEqual(calls[0].requestId, calls[1].requestId);
    f.message({ type: 'response', nonce, requestId: calls[0].requestId, ok: true, data: { cells: ['first'] } });
    f.message({ type: 'response', nonce, requestId: calls[1].requestId, ok: true, data: { cells: ['second'] } });
    assert.deepEqual(await a, ['first']); assert.deepEqual(await b, ['second']);
    first.dispose(); second.dispose();
});
test('theme supplies readable foreground for filled accent buttons', async () => {
    const { applyTheme } = await import('../dist/index.js');
    const properties = new Map(); const root = { style: { setProperty: (key, value) => properties.set(key, value) }, lang: '' };
    applyTheme({ ...ui, theme: { '--hp-accent': '234 179 8' } }, root);
    assert.equal(properties.get('--nectar-accent-foreground'), '0 0 0');
    applyTheme({ ...ui, locale: 'de', theme: { '--hp-accent': '20 30 60' } }, root);
    assert.equal(properties.get('--nectar-accent-foreground'), '255 255 255');
    assert.equal(root.lang, 'de');
});
