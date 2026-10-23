import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { startPreview, mockCapability, defaultFixtures } from '../bin/preview.mjs';
const manifest = JSON.parse(await readFile(new URL('../templates/basic/nectar.json',import.meta.url)));
test('mock calls enforce declarations and omit password settings', () => {
    const m = structuredClone(manifest); m.settings.push({ key:'secret',label:'Secret',type:'password' });
    const fixtures = { ...defaultFixtures,settings:{ secret:'demo-secret',greeting:'Example' } };
    assert.deepEqual(mockCapability(m,fixtures,'settings.get',{},new Map()),{ settings:{ greeting:'Example' } });
    assert.throws(() => mockCapability(m,fixtures,'network.http',{ url:'https://example.com' },new Map()),/does not declare/);
    assert.throws(() => mockCapability(m,fixtures,'events.subscribe',{ events:['cell.unknown'] },new Map()),/not declared/);
    assert.deepEqual(mockCapability(m,fixtures,'events.subscribe',{ events:[] },new Map()),{ ok:true });
});
test('HTTP mock requires explicit scoped fixtures and never falls back to network', () => {
    const m = { ...manifest,permissions:['network.http'],network:{ http:{ hosts:['api.example.com'] } } };
    const f = { ...defaultFixtures,http:{ 'GET https://api.example.com/test':{ status:201,body:{ ok:true } } } };
    const result = mockCapability(m,f,'network.http',{ url:'https://api.example.com/test' },new Map());
    assert.equal(result.status,201); assert.equal(Buffer.from(result.body_base64,'base64').toString(),'{"ok":true}');
    assert.throws(() => mockCapability(m,f,'network.http',{ url:'https://api.example.com/missing' },new Map()),/No HTTP fixture/);
    assert.throws(() => mockCapability(m,f,'network.http',{ url:'https://private.example.com/test' },new Map()),/outside/);
});
test('preview serves production sandbox headers, guards mock calls and rebuilds on source edits', async () => {
    const root = await mkdtemp(path.join(tmpdir(),'nectar-preview-')); let server;
    try {
        await mkdir(path.join(root,'src')); await writeFile(path.join(root,'nectar.json'),JSON.stringify(manifest));
        await writeFile(path.join(root,'src/main.ts'),"document.getElementById('app').textContent='first';");
        server = await startPreview(root,{ port:0 });
        const origin = server.url, state = await (await fetch(origin + '/__nectar/state')).json();
        const entry = await fetch(origin + '/dist/index.html');
        assert.match(entry.headers.get('content-security-policy'),/sandbox allow-scripts/);
        assert.match(entry.headers.get('content-security-policy'),/connect-src 'none'/);
        assert.equal((await fetch(origin + '/nectar.json')).status,404);
        const invoke = headers => fetch(origin + '/__nectar/capability',{ method:'POST',headers,body:JSON.stringify({ method:'cells.list',params:{} }) });
        assert.equal((await invoke({ 'Content-Type':'application/json','Origin':'https://evil.test','X-Nectar-Preview':state.token })).status,403);
        assert.equal((await invoke({ 'Content-Type':'application/json','Origin':origin })).status,403);
        assert.equal((await invoke({ 'Content-Type':'application/json','Sec-Fetch-Site':'same-origin','X-Nectar-Preview':state.token })).status,200);
        const result = await invoke({ 'Content-Type':'application/json','Origin':origin,'X-Nectar-Preview':state.token });
        assert.equal(result.status,200); assert.equal((await result.json()).cells[0].id,'preview-minecraft');
        await writeFile(path.join(root,'src/main.ts'),"document.getElementById('app').textContent='second';");
        let next = state;
        for (let i=0;i<30 && next.revision===state.revision;i++) { await new Promise(resolve=>setTimeout(resolve,100)); next = await (await fetch(origin+'/__nectar/state')).json(); }
        assert.ok(next.revision>state.revision);
        assert.match(await (await fetch(origin+'/dist/index.js')).text(),/second/);
        await writeFile(path.join(root,'src/main.ts'),'const broken = ;');
        let failure;
        for(let i=0;i<30;i++){await new Promise(resolve=>setTimeout(resolve,100));failure=await(await fetch(origin+'/__nectar/state')).json();if(failure.error)break;}
        assert.match(failure.error,/Build failed/);
        await writeFile(path.join(root,'src/main.ts'),"document.getElementById('app').textContent='recovered';");
        let recovered=failure;
        for(let i=0;i<30&&recovered.error;i++){await new Promise(resolve=>setTimeout(resolve,100));recovered=await(await fetch(origin+'/__nectar/state')).json();}
        assert.equal(recovered.error,null);assert.ok(recovered.revision>failure.revision);
    } finally { if(server) await server.close(); await rm(root,{ recursive:true,force:true }); }
});
