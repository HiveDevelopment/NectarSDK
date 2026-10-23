import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const cli = fileURLToPath(new URL('../bin/nectar.mjs', import.meta.url));
const run = (args, cwd) => execFileSync(process.execPath, [cli, ...args], { cwd, encoding: 'utf8' });
test('generated projects diagnose cleanly and an existing directory is never overwritten', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'nectar-cli-'));
    try {
        const target = path.join(root, 'extension');
        run(['init', target, '--id', 'test.example', '--panel-version', 'test-panel'], root);
        assert.match(run(['doctor', '--panel-version', 'test-panel'], target), /Local checks passed/);
        const before = await readFile(path.join(target, 'nectar.json'), 'utf8');
        const duplicate = spawnSync(process.execPath, [cli, 'init', target], { cwd: root, encoding: 'utf8' });
        assert.equal(duplicate.status, 1);
        assert.equal(await readFile(path.join(target, 'nectar.json'), 'utf8'), before);
        assert.equal(spawnSync(process.execPath, [cli, 'doctor', '--built'], { cwd: target }).status, 1);
        assert.equal(spawnSync(process.execPath, [cli, 'doctor', '--panel-version', 'wrong'], { cwd: target }).status, 1);
        assert.match(run(['--version'], target), /^0\.3\.0/);
    } finally { await rm(root, { recursive: true, force: true }); }
});

test('npm scaffolding pins the release instead of retaining an npx cache path', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'nectar-npm-'));
    try {
        const target = path.join(root, 'extension');
        run(['init', target, '--id', 'test.registry', '--sdk-source', 'npm'], root);
        const pkg = JSON.parse(await readFile(path.join(target, 'package.json'), 'utf8'));
        assert.equal(pkg.dependencies['@hivepanel/nectar'], '0.3.0');
    } finally { await rm(root, { recursive: true, force: true }); }
});
