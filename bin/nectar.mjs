#!/usr/bin/env node
import { readFile, writeFile, mkdir, cp, rm, access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildProject, readManifest } from './build.mjs';
import { startPreview } from './preview.mjs';
import { validateManifest } from './manifest.mjs';
import { packageFiles, zip } from './archive.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const command = args.shift();
function option(name, fallback) {
    const index = args.indexOf(name);
    if (index < 0) return fallback;
    if (!args[index + 1] || args[index + 1].startsWith('--')) throw new Error(`Missing value for ${name}`);
    return args[index + 1];
}
async function manifest() { return readManifest(process.cwd(), option('--panel-version')); }
async function exists(file) { try { await access(file); return true; } catch { return false; } }
try {
    if (command === '--version' || command === '-v') {
        console.log(JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8')).version);
    } else if (command === 'doctor') {
        if (Number(process.versions.node.split('.')[0]) < 22) throw new Error('Node.js 22 or newer is required.');
        console.log(`Node.js ${process.versions.node}: OK`);
        const m = await manifest();
        console.log(`Manifest ${m.id}: OK (exact Panel target: ${m.panelCompatibility})`);
        await access(path.join(process.cwd(), 'src/main.ts'));
        console.log('TypeScript entry: OK');
        if (args.includes('--built')) {
            const files = await packageFiles(process.cwd(), m);
            console.log(`Built archive contract: OK (${files.length} files)`);
        }
        console.log('Local checks passed. Test permissions and networking on a development Panel before distribution.');
    } else if (command === 'init') {
        const targetName = args[0];
        if (!targetName || targetName.startsWith('--')) throw new Error('Usage: nectar init <directory> --id author.extension --panel-version dev');
        const target = path.resolve(targetName);
        if (await exists(target)) throw new Error('Choose a new directory; existing files will not be overwritten.');
        const id = option('--id', 'example.hello');
        const version = option('--panel-version', 'dev');
        const source = option('--sdk-source', root.split(path.sep).includes('node_modules') ? 'npm' : 'local');
        if (!['local', 'npm'].includes(source)) throw new Error('--sdk-source must be local or npm.');
        await mkdir(target, { recursive: true });
        await cp(path.join(root, 'templates/basic'), target, { recursive: true });
        const m = JSON.parse(await readFile(path.join(target, 'nectar.json'), 'utf8'));
        m.id = id; m.panelCompatibility = version;
        const errors = validateManifest(m);
        if (errors.length) { await rm(target, { recursive: true }); throw new Error(errors.join('\n')); }
        await writeFile(path.join(target, 'nectar.json'), JSON.stringify(m, null, 2) + '\n');
        const pkg = JSON.parse(await readFile(path.join(target, 'package.json'), 'utf8'));
        pkg.name = id;
        const sdkVersion = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8')).version;
        pkg.dependencies['@hivepanel/nectar'] = source === 'npm' ? sdkVersion : `file:${path.relative(target, root).split(path.sep).join('/') || '.'}`;
        await writeFile(path.join(target, 'package.json'), JSON.stringify(pkg, null, 2) + '\n');
        console.log(`Created ${target}\nNext: cd ${targetName}, npm install, npm run build, npm run pack`);
    } else if (command === 'validate') {
        const m = await manifest();
        if (args.includes('--built')) await packageFiles(process.cwd(), m);
        console.log(`Valid: ${m.id} (${m.panelCompatibility}). Panel validation remains authoritative.`);
    } else if (command === 'build') {
        await buildProject(process.cwd(), option('--panel-version'));
        console.log('Built dist/ using sandbox-compatible classic scripts.');
    } else if (command === 'dev') {
        const preview = await startPreview(process.cwd(), { port: Number(option('--port', '5174')), panelVersion: option('--panel-version') });
        console.log(`Nectar mock preview: ${preview.url}\nNo real votes or network requests are sent. Press Ctrl+C to stop.`);
        const close = () => { void preview.close().then(() => process.exit(0)); };
        process.once('SIGINT', close); process.once('SIGTERM', close);
    } else if (command === 'pack') {
        const m = await manifest();
        const files = await packageFiles(process.cwd(), m);
        const output = option('--out', `${m.id}-${m.version}.nectar`);
        if (await exists(output)) throw new Error(`Output exists: ${output}. Remove it or choose --out.`);
        await writeFile(output, zip(files), { flag: 'wx' });
        console.log(`Packaged ${output} (${files.length} files). Install disabled, review permissions, then enable in Admin → Extensions.`);
    } else {
        console.log('Nectar SDK\n  nectar init <directory> [--id author.name] [--panel-version dev] [--sdk-source local|npm]\n  nectar validate [--built] [--panel-version dev]\n  nectar doctor [--built] [--panel-version dev]\n  nectar --version\n  nectar dev [--port 5174] [--panel-version dev]\n  nectar build [--panel-version dev]\n  nectar pack [--out extension.nectar] [--panel-version dev]');
        if (command && !['--help', '-h'].includes(command)) process.exitCode = 1;
    }
} catch (error) {
    console.error(error.message);
    process.exitCode = 1;
}
