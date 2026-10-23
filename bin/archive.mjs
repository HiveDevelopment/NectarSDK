import { lstat, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
const allowed = new Set(['.json', '.html', '.js', '.css', '.png', '.webp', '.woff2']);
export async function packageFiles(root, manifest) {
    const files = [{ name: 'nectar.json', data: Buffer.from(JSON.stringify(manifest, null, 2) + '\n') }];
    let total = files[0].data.length;
    const names = new Set(['nectar.json']);
    async function walk(relative) {
        const location = path.join(root, relative);
        const stat = await lstat(location);
        if (stat.isSymbolicLink()) throw new Error(`Symlinks are forbidden: ${relative}`);
        if (stat.isDirectory()) {
            for (const name of (await readdir(location)).sort()) await walk(`${relative}/${name}`);
            return;
        }
        if (!stat.isFile() || !/^dist\/[a-zA-Z0-9_./-]+$/.test(relative) || relative.includes('..') || !allowed.has(path.extname(relative).toLowerCase())) throw new Error(`Unsupported package file: ${relative}`);
        if (names.has(relative.toLowerCase())) throw new Error(`Case-insensitive filename collision: ${relative}`);
        if (files.length >= 150 || stat.size + total > 60 * 1024 * 1024) throw new Error('Package exceeds Panel file-count or unpacked-size limit.');
        names.add(relative.toLowerCase());
        const data = await readFile(location);
        total += data.length;
        files.push({ name: relative, data });
    }
    await walk('dist');
    for (const entry of [manifest.frontend.entry, ...(manifest.frontend.pages ?? []).map(page => page.entry)]) {
        if (!files.some(file => file.name === entry)) throw new Error(`Missing entry: ${entry}`);
    }
    return files;
}
function crc32(data) {
    let crc = 0xffffffff;
    for (const byte of data) {
        crc ^= byte;
        for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
    }
    return (crc ^ 0xffffffff) >>> 0;
}
/** Standard ZIP with stored entries. Deterministic, no system zip binary required. */
export function zip(files) {
    const entries = [], directory = [];
    let offset = 0, directorySize = 0;
    for (const { name, data } of files) {
        const filename = Buffer.from(name);
        const crc = crc32(data);
        const local = Buffer.alloc(30);
        local.writeUInt32LE(0x04034b50); local.writeUInt16LE(20, 4); local.writeUInt16LE(33, 12);
        local.writeUInt32LE(crc, 14); local.writeUInt32LE(data.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(filename.length, 26);
        entries.push(local, filename, data);
        const central = Buffer.alloc(46);
        central.writeUInt32LE(0x02014b50); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(33, 14);
        central.writeUInt32LE(crc, 16); central.writeUInt32LE(data.length, 20); central.writeUInt32LE(data.length, 24); central.writeUInt16LE(filename.length, 28); central.writeUInt32LE(offset, 42);
        directory.push(central, filename);
        directorySize += central.length + filename.length;
        offset += local.length + filename.length + data.length;
    }
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10); end.writeUInt32LE(directorySize, 12); end.writeUInt32LE(offset, 16);
    const result = Buffer.concat([...entries, ...directory, end]);
    if (result.length > 20 * 1024 * 1024) throw new Error('Archive exceeds the Panel 20 MB limit.');
    return result;
}
