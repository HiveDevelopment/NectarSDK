import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { validateManifest } from '../bin/manifest.mjs';
import { packageFiles, zip } from '../bin/archive.mjs';
const base = JSON.parse(await readFile(new URL('../templates/basic/nectar.json', import.meta.url)));
test('starter matches exact target and supported manifest capabilities', () => {
    assert.deepEqual(validateManifest(base, 'dev'), []);
    assert.ok(validateManifest(base, 'other-version').length);
    assert.ok(validateManifest({ ...base, permissions: ['cells.delete'] }).length);
    assert.ok(validateManifest({ ...base, backend: 'code.php' }).length);
    assert.ok(validateManifest({ ...base, permissions: [] }).some(value => value.includes('events')));
    const invalid = structuredClone(base); invalid.frontend.pages[0].entry = 'dist/pages/wrong.html';
    assert.ok(validateManifest(invalid).length);
});
test('network declarations require matching scope and password defaults are forbidden', () => {
    assert.ok(validateManifest({ ...base, permissions: ['network.http'] }).length);
    assert.ok(validateManifest({ ...base, settings: [{ key: 'token', label: 'Token', type: 'password', default: 'secret' }] }).length);
    assert.deepEqual(validateManifest({ ...base, permissions: [...base.permissions, 'network.http'], network: { http: { hosts: ['api.example.com'] } } }), []);
});
test('package enforces entries, rejects source files and symlinks, writes valid ZIP structure', async (t) => {
    const root = await mkdtemp(path.join(tmpdir(), 'nectar-'));
    try {
        await mkdir(path.join(root, 'dist/pages'), { recursive: true });
        await writeFile(path.join(root, 'dist/index.html'), '<!doctype html>');
        await assert.rejects(packageFiles(root, base), /Missing entry/);
        await writeFile(path.join(root, 'dist/pages/hello.html'), '<!doctype html>');
        const files = await packageFiles(root, base);
        const archive = zip(files);
        assert.equal(archive.readUInt32LE(0), 0x04034b50);
        assert.equal(archive.readUInt32LE(archive.length - 22), 0x06054b50);
        assert.equal(archive.readUInt16LE(archive.length - 12), 3);
        assert.deepEqual(zip(files), archive);
        await writeFile(path.join(root, 'dist/source.ts'), 'secret');
        await assert.rejects(packageFiles(root, base), /Unsupported/);
        await rm(path.join(root, 'dist/source.ts'));
        try {
            await symlink(path.join(root, 'dist/index.html'), path.join(root, 'dist/link.html'));
            await assert.rejects(packageFiles(root, base), /Symlinks/);
        } catch (error) {
            if (process.platform !== 'win32' || error.code !== 'EPERM') throw error;
            t.diagnostic('Symlink creation needs Windows Developer Mode or administrator permission; other archive checks passed.');
        }
    } finally { await rm(root, { recursive: true, force: true }); }
});

test('malformed select defaults return validation errors instead of crashing', () => {
    for (const options of [{}, 42, null, 'value']) {
        assert.ok(validateManifest({ ...base, settings: [{ key: 'choice', label: 'Choice', type: 'select', options, default: 'value' }] }).length);
    }
});
