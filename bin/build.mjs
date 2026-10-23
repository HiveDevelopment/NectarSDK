import { readFile, writeFile, mkdir, cp, rm, access } from 'node:fs/promises';
import path from 'node:path';
import { build } from 'esbuild';
import { validateManifest } from './manifest.mjs';
import { packageFiles } from './archive.mjs';

export async function readManifest(root, panelVersion) {
    const manifest = JSON.parse(await readFile(path.join(root, 'nectar.json'), 'utf8'));
    const errors = validateManifest(manifest, panelVersion);
    if (errors.length) throw new Error(errors.join('\n'));
    return manifest;
}
export async function buildProject(root, panelVersion) {
    const manifest = await readManifest(root, panelVersion);
    const dist = path.join(root, 'dist');
    await rm(dist, { recursive: true, force: true });
    await mkdir(path.join(dist, 'pages'), { recursive: true });
    try { await access(path.join(root, 'public')); await cp(path.join(root, 'public'), dist, { recursive: true }); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    await build({ entryPoints: [path.join(root, 'src/main.ts')], outfile: path.join(dist, 'index.js'), bundle: true, format: 'iife', platform: 'browser', target: 'es2022', sourcemap: false, logLevel: 'silent' });
    const html = depth => `<!doctype html>\n<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Nectar extension</title><link rel="stylesheet" href="${depth}style.css"></head><body><main id="app" aria-live="polite">Connecting to HivePanel…</main><script src="${depth}index.js" defer></script></body></html>\n`;
    await writeFile(path.join(dist, 'index.html'), html('./'));
    for (const page of manifest.frontend.pages ?? []) await writeFile(path.join(root, page.entry), html('../'));
    try { await access(path.join(dist, 'style.css')); }
    catch { await writeFile(path.join(dist, 'style.css'), ''); }
    await packageFiles(root, manifest);
    return manifest;
}
