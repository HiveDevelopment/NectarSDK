import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac, timingSafeEqual } from 'node:crypto';
import net from 'node:net';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { makeVotePacket } from '../examples/votifier-tester/src/protocol.js';
import { mockCapability, defaultFixtures } from '../bin/preview.mjs';
const folder = await mkdtemp(path.join(tmpdir(),'nectar-vote-'));
await build({ entryPoints:[fileURLToPath(new URL('../examples/votifier-tester/src/vote.ts',import.meta.url))],alias:{'@hivedevelopment/nectar':fileURLToPath(new URL('../dist/index.js',import.meta.url))},outfile:path.join(folder,'vote.mjs'),bundle:true,platform:'node',format:'esm' });
const { sendTestVote } = await import(pathToFileURL(path.join(folder,'vote.mjs')));
await rm(folder,{ recursive:true,force:true });
function verify(packet,token,challenge) {
    assert.equal(packet.readUInt16BE(0),0x733a); assert.equal(packet.readUInt16BE(2),packet.length-4);
    const envelope = JSON.parse(packet.subarray(4).toString()), payload = JSON.parse(envelope.payload);
    const actual = Buffer.from(envelope.signature,'base64'), expected = createHmac('sha256',token).update(envelope.payload).digest();
    assert.equal(actual.length,expected.length); assert.ok(timingSafeEqual(actual,expected)); assert.equal(payload.challenge,challenge);
    assert.equal(typeof payload.timestamp,'number'); return payload;
}
test('protocol framing and HMAC match Node crypto with long UTF-8 keys', () => {
    const token = 'päss'.repeat(40), challenge = 'sample-challenge';
    const packet = Buffer.from(makeVotePacket(`VOTIFIER 2.7.3 ${challenge}\n`,token,{ username:'NectarTest',serviceName:'HivePanelTest',address:'127.0.0.1',timestamp:Date.now() }));
    assert.equal(verify(packet,token,challenge).username,'NectarTest');
    assert.throws(()=>makeVotePacket('VOTIFIER 20 challenge','token',{}),/does not support/);
});
test('SDK vote flow accepts a valid preview vote, reports rejection and closes sessions', async () => {
    const m = JSON.parse(await readFile(new URL('../examples/votifier-tester/nectar.json',import.meta.url)));
    const sessions = new Map();
    const client = { network:{ tcp:async params=>mockCapability(m,defaultFixtures,'network.tcp',params,sessions) } };
    const input = { cellId:'preview-minecraft',allocationId:'preview-votifier',username:'NectarTest',token:'preview-token',serviceName:'HivePanelTest' };
    assert.deepEqual(await sendTestVote(client,input),{ accepted:true }); assert.equal(sessions.size,0);
    await assert.rejects(sendTestVote(client,{ ...input,token:'wrong' }),/Preview vote rejected/); assert.equal(sessions.size,0);
    await assert.rejects(sendTestVote(client,{ ...input,allocationId:'unassigned' }),/not assigned/);
});
test('a real loopback TCP listener validates the packet, rejects bad signatures and receives cleanup', async () => {
    const token = 'local-listener-demo-token', challenge = 'tcp-test-challenge', accepted = [];
    const sockets = new Set();
    const server = net.createServer(socket => {
        sockets.add(socket); socket.on('close',()=>sockets.delete(socket)); socket.on('error',()=>{});
        socket.write(`VOTIFIER 2 ${challenge}\n`); let data = Buffer.alloc(0);
        socket.on('data',chunk=>{
            data = Buffer.concat([data,chunk]); if(data.length<4 || data.length<data.readUInt16BE(2)+4) return;
            let result; try { accepted.push(verify(data,token,challenge)); result={ status:'ok' }; } catch { result={ status:'error',error:'Signature is not valid (invalid token?)' }; }
            const output=JSON.stringify(result); socket.write(output.slice(0,3)); setImmediate(()=>socket.end(output.slice(3)));
        });
    });
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    let connection, closed = 0;
    function receive(socket,done) {
        return new Promise((resolve,reject)=>{
            let buffer=''; const timer=setTimeout(()=>{ cleanup(); reject(Error('Listener timed out')); },3000);
            function cleanup(){clearTimeout(timer); socket.off('data',onData);socket.off('error',onError);}
            function onError(error){cleanup();reject(error);}
            function onData(chunk){buffer+=chunk.toString();if(done(buffer)){cleanup();resolve(Buffer.from(buffer).toString('base64'));}}
            socket.on('data',onData);socket.once('error',onError);
        });
    }
    const client = { network:{ tcp:async params=>{
        if(params.action==='open') { connection=net.createConnection(server.address().port,'127.0.0.1');return { session_id:'a'.repeat(64),data_base64:await receive(connection,value=>value.endsWith('\n')) }; }
        if(params.action==='close') { closed++;connection.destroy();return { closed:true }; }
        const response=receive(connection,value=>{try{JSON.parse(value);return true;}catch{return false;}});
        connection.write(Buffer.from(params.data_base64,'base64'));return { data_base64:await response };
    } } };
    try {
        const input={ cellId:'local',allocationId:'listener',username:'NectarTest',token,serviceName:'HivePanelTest' };
        assert.deepEqual(await sendTestVote(client,input),{ accepted:true });
        await assert.rejects(sendTestVote(client,{ ...input,token:'incorrect-token' }),/Signature is not valid/);
        assert.equal(accepted.length,1);assert.equal(closed,2);
    } finally { for(const socket of sockets) socket.destroy();await new Promise(resolve=>server.close(resolve)); }
});
