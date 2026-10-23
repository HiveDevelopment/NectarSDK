import http from 'node:http';
import path from 'node:path';
import { readFile, readdir, lstat, realpath } from 'node:fs/promises';
import { randomBytes, createHmac, timingSafeEqual } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { buildProject } from './build.mjs';

const assets = path.join(path.dirname(fileURLToPath(import.meta.url)), 'preview');
const permitted = new Map([['.html','text/html'],['.js','text/javascript'],['.css','text/css'],['.json','application/json'],['.png','image/png'],['.webp','image/webp'],['.woff2','font/woff2']]);
export const defaultFixtures = {
    cells: [{ id: 'preview-minecraft', name: 'Preview Minecraft', comb: 'paper', game: 'minecraft', installStatus: 'installed', allocations: [{ id: 'preview-votifier', ip: '127.0.0.1', port: 8192 }] }],
    settings: {},
    http: {},
    // This is a demo value, never a production credential. No network traffic is sent.
    votifier: { token: 'preview-token' },
};
class PreviewError extends Error {
    constructor(message, status = 403) { super(message); this.status = status; }
}
export function mockCapability(manifest, fixtures, method, params, sessions) {
    const permissions = manifest.permissions ?? manifest.capabilities ?? [];
    const capability = method === 'cells.list' ? 'cells.read' : method === 'settings.get' ? 'settings.read'
        : method === 'events.subscribe' ? 'cells.read' : method;
    if (!permissions.includes(capability)) throw new PreviewError(`Manifest does not declare ${capability}.`);
    const scopes = manifest.frontend?.combs ?? [];
    const cells = fixtures.cells.filter(cell => !scopes.length || scopes.includes(cell.comb) || scopes.includes(`game:${cell.game ?? ''}`));
    if (method === 'cells.list') return { cells: cells.map(cell => ({ ...cell, allocations: permissions.includes('network.tcp') ? cell.allocations ?? [] : [] })) };
    if (method === 'settings.get') {
        const settings = {};
        for (const setting of manifest.settings ?? []) if (setting.type !== 'password') settings[setting.key] = fixtures.settings[setting.key] ?? setting.default ?? null;
        return { settings };
    }
    if (method === 'events.subscribe') {
        if (!Array.isArray(params.events) || params.events.length > 3 || new Set(params.events).size !== params.events.length
            || params.events.some(name => !(manifest.events?.subscribe ?? []).includes(name))) throw new PreviewError('Event is not declared in the manifest.');
        return { ok: true };
    }
    if (method === 'network.http') {
        let url; try { url = new URL(params.url); } catch { throw new PreviewError('Invalid URL.', 422); }
        if (url.protocol !== 'https:' || (url.port && url.port !== '443') || url.username || url.password || url.hash
            || !manifest.network?.http?.hosts?.includes(url.hostname)) throw new PreviewError('HTTP destination is outside the manifest scope.');
        if (!['GET','POST'].includes(params.method ?? 'GET')) throw new PreviewError('Only GET/POST are supported.', 422);
        const fixture = fixtures.http[`${params.method ?? 'GET'} ${params.url}`];
        if (!fixture) throw new PreviewError('No HTTP fixture for this URL. Preview never sends real network requests.', 422);
        return { status: fixture.status ?? 200, body_base64: Buffer.from(typeof fixture.body === 'string' ? fixture.body : JSON.stringify(fixture.body ?? {})).toString('base64') };
    }
    if (method === 'network.tcp') {
        if (manifest.network?.tcp?.scope !== 'cell-allocations') throw new PreviewError('TCP requires cell-allocations scope.');
        const cell = cells.find(cell => cell.id === params.cell_id);
        if (!cell?.allocations?.some(allocation => allocation.id === params.allocation_id)) throw new PreviewError('Allocation is not assigned to this preview Cell.');
        if (params.action === 'open') {
            if (sessions.size >= 10) throw new PreviewError('Close an existing preview session first.', 429);
            const session_id = randomBytes(32).toString('hex'), challenge = randomBytes(16).toString('base64');
            sessions.set(session_id, { cell: params.cell_id, allocation: params.allocation_id, challenge, expires: Date.now() + 20000 });
            return { session_id, data_base64: Buffer.from(`VOTIFIER 2 ${challenge}\n`).toString('base64') };
        }
        const session = sessions.get(params.session_id);
        if (!session || session.cell !== params.cell_id || session.allocation !== params.allocation_id || session.expires < Date.now()) throw new PreviewError('Preview TCP session expired or is unavailable.', 410);
        if (params.action === 'close') { sessions.delete(params.session_id); return { closed: true }; }
        if (params.action !== 'exchange') throw new PreviewError('Unsupported TCP action.', 422);
        if (session.used) throw new PreviewError('The preview challenge was already used.', 410);
        let result;
        try {
            const packet = Buffer.from(params.data_base64 ?? '', 'base64');
            if (packet.length < 4 || packet.length > 8196 || packet.readUInt16BE(0) !== 0x733a || packet.readUInt16BE(2) !== packet.length - 4) throw Error('Invalid packet framing');
            const envelope = JSON.parse(packet.subarray(4).toString('utf8'));
            const vote = JSON.parse(envelope.payload);
            const expected = createHmac('sha256', fixtures.votifier.token).update(envelope.payload).digest();
            const actual = Buffer.from(envelope.signature, 'base64');
            if (actual.length !== expected.length || !timingSafeEqual(expected, actual)) throw Error('Invalid token');
            if (vote.challenge !== session.challenge) throw Error('Challenge mismatch');
            if (!Number.isSafeInteger(vote.timestamp) || !/^[A-Za-z0-9_]{3,16}$/.test(vote.username) || typeof vote.serviceName !== 'string') throw Error('Invalid vote payload');
            result = { status: 'ok' };
        } catch { result = { status: 'error', errorMessage: 'Preview vote rejected: invalid token or vote packet.' }; }
        session.used = true;
        return { session_id: params.session_id, data_base64: Buffer.from(JSON.stringify(result)).toString('base64') };
    }
    throw new PreviewError('Unsupported preview method.', 422);
}

async function snapshot(root) {
    const entries = [];
    async function walk(file) {
        let stat; try { stat = await lstat(file); } catch { return; }
        if (stat.isSymbolicLink()) return;
        if (stat.isDirectory()) { for (const name of (await readdir(file)).sort()) await walk(path.join(file, name)); }
        else entries.push(`${file}:${stat.mtimeMs}:${stat.size}`);
    }
    for (const name of ['src','public','nectar.json','nectar.preview.json']) await walk(path.join(root, name));
    return entries.join('|');
}
export async function startPreview(root, { port = 5174, watch = true, panelVersion } = {}) {
    if (!Number.isInteger(port) || port < 0 || port > 65535) throw Error('Port must be between 0 and 65535.');
    let manifest = await buildProject(root, panelVersion), revision = 1, error = null, rebuilding = false, closing = false;
    let previous = await snapshot(root);
    const sessions = new Map(), token = randomBytes(24).toString('hex');
    async function fixtures() {
        let value = {};
        try { value = JSON.parse(await readFile(path.join(root,'nectar.preview.json'),'utf8')); }
        catch (error) { if (error.code !== 'ENOENT') throw error; }
        const result = { ...defaultFixtures, ...value, settings: value.settings ?? {}, http: value.http ?? {}, votifier: { ...defaultFixtures.votifier, ...value.votifier } };
        if (!Array.isArray(result.cells) || !result.settings || !result.http || typeof result.votifier.token !== 'string') throw Error('Invalid preview fixtures.');
        return result;
    }
    await fixtures();
    const server = http.createServer(async (request, response) => {
        const origin = `http://127.0.0.1:${server.address().port}`;
        const json = (value, status = 200) => { response.writeHead(status, { 'Content-Type':'application/json', 'Cache-Control':'no-store' }); response.end(JSON.stringify(value)); };
        try {
            if (request.headers.host !== new URL(origin).host) return json({ message:'Use the loopback preview URL.' }, 403);
            const url = new URL(request.url, origin);
            if (request.method === 'POST' && url.pathname === '/__nectar/capability') {
                const sameOrigin = request.headers.origin === origin || (!request.headers.origin && request.headers['sec-fetch-site'] === 'same-origin');
                if (!sameOrigin || request.headers['x-nectar-preview'] !== token || request.headers['content-type'] !== 'application/json') return json({ message:'Preview origin check failed.' }, 403);
                let body = '';
                for await (const chunk of request) { body += chunk; if (Buffer.byteLength(body) > 65536) return json({ message:'Request too large.' }, 413); }
                const input = JSON.parse(body);
                if (input.failed) return json({ message:'Network failure simulated by preview. No request was sent.' }, 502);
                if (input.denied) return json({ message:'Permission denied by preview scenario.' }, 403);
                if (!input.params || typeof input.params !== 'object' || Array.isArray(input.params)) return json({ message:'Invalid parameters.' }, 422);
                return json(mockCapability(manifest, await fixtures(), input.method, input.params, sessions));
            }
            if (request.method !== 'GET') return json({ message:'Method not allowed.' }, 405);
            if (url.pathname === '/__nectar/state') return json({ revision, error, manifest, fixtures: await fixtures(), token });
            if (url.pathname === '/') {
                response.setHeader('Content-Type','text/html'); response.setHeader('Cache-Control','no-store');
                response.end(await readFile(path.join(assets,'index.html'))); return;
            }
            if (url.pathname === '/__nectar/host.js' || url.pathname === '/__nectar/style.css') {
                response.setHeader('Content-Type',url.pathname.endsWith('.js') ? 'text/javascript' : 'text/css');
                response.end(await readFile(path.join(assets,path.basename(url.pathname)))); return;
            }
            if (!url.pathname.startsWith('/dist/')) return json({ message:'Not found.' }, 404);
            const relative = decodeURIComponent(url.pathname.slice(1));
            if (!/^dist\/[a-zA-Z0-9_./-]+$/.test(relative) || relative.includes('..')) return json({ message:'Not found.' }, 404);
            const file = await realpath(path.join(root, relative)), dist = await realpath(path.join(root,'dist'));
            if (!file.startsWith(dist + path.sep) || !permitted.has(path.extname(file))) return json({ message:'Not found.' }, 404);
            response.setHeader('Content-Type', permitted.get(path.extname(file)));
            response.setHeader('Cache-Control','no-store'); response.setHeader('X-Content-Type-Options','nosniff');
            if (file.endsWith('.html')) response.setHeader('Content-Security-Policy', ["default-src 'none'",'sandbox allow-scripts',`script-src ${origin}`,`style-src ${origin} 'unsafe-inline'`,`img-src ${origin} data:`,`font-src ${origin}`,"connect-src 'none'","object-src 'none'","frame-src 'none'","form-action 'none'","base-uri 'none'","worker-src 'none'","manifest-src 'none'"].join('; '));
            response.end(await readFile(file));
        } catch (exception) { if (!response.headersSent) json({ message:exception.message }, exception.status ?? (exception.code === 'ENOENT' ? 404 : 422)); else response.end(); }
    });
    await new Promise((resolve,reject) => { server.once('error',reject); server.listen(port,'127.0.0.1',resolve); });
    const timer = watch ? setInterval(async () => {
        if (rebuilding || closing) return;
        rebuilding = true;
        try {
            const next = await snapshot(root);
            if (next !== previous) {
                previous = next;
                try { manifest = await buildProject(root,panelVersion); await fixtures(); error = null; revision++; sessions.clear(); }
                catch (exception) { error = exception.message; }
            }
            for (const [id,session] of sessions) if (session.expires < Date.now()) sessions.delete(id);
        } catch (exception) { error = exception.message; }
        finally { rebuilding = false; }
    },500) : null;
    return { url:`http://127.0.0.1:${server.address().port}`, async close() { closing = true; if (timer) clearInterval(timer); sessions.clear(); await new Promise(resolve => server.close(resolve)); } };
}
