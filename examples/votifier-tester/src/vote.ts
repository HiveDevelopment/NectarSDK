import { decodeBody, type NectarClient } from '@hivedevelopment/nectar';
import { makeVotePacket } from './protocol.js';

export async function sendTestVote(client: Pick<NectarClient, 'network'>, input: {
    cellId: string; allocationId: string; username: string; token: string; serviceName: string; timestamp?: number;
}) {
    if (!/^[A-Za-z0-9_]{3,16}$/.test(input.username)) throw new Error('Enter a valid Minecraft username.');
    if (!input.token || input.token.length > 512) throw new Error('Enter your NuVotifier token.');
    if (!input.serviceName.trim() || input.serviceName.length > 64) throw new Error('Enter a service name of up to 64 characters.');
    const params = { cell_id: input.cellId, allocation_id: input.allocationId };
    let session: string | undefined;
    try {
        const opened = await client.network.tcp({ ...params, action: 'open', read_line: true });
        if (typeof opened.session_id !== 'string' || !/^[a-f0-9]{64}$/.test(opened.session_id)) throw new Error('The listener did not return a valid TCP session.');
        session = opened.session_id;
        if (typeof opened.data_base64 !== 'string') throw new Error('The listener did not return a greeting.');
        const greeting = decodeBody({ body_base64: opened.data_base64 });
        const packet = makeVotePacket(greeting, input.token, {
            username: input.username, address: '127.0.0.1', serviceName: input.serviceName,
            timestamp: input.timestamp ?? Date.now(),
        });
        const response = await client.network.tcp({ ...params, action: 'exchange', session_id: session,
            data_base64: btoa(String.fromCharCode(...packet)), read_json: true });
        if (typeof response.data_base64 !== 'string') throw new Error('The listener did not return a response.');
        const result = JSON.parse(decodeBody({ body_base64: response.data_base64 }));
        if (result?.status !== 'ok') throw new Error(
            [result?.errorMessage, result?.error, result?.cause].find(value => typeof value === 'string')
            ?? 'The listener rejected the test vote.',
        );
        return { accepted: true };
    } finally {
        if (session) await client.network.tcp({ ...params, action: 'close', session_id: session }).catch(() => {});
    }
}
