const element = id => document.getElementById(id);
let state, frame, nonce, generation = 0, polling = false;
const subscriptions = new Set(), pending = new Set();
const palettes = {
    dark: { surfaceDark:'9 11 13',surface:'17 19 21',surfaceLight:'26 29 33',surfaceHover:'39 43 48',foreground:'244 244 245',muted:'161 161 170',border:'63 63 70',accent:'234 179 8',danger:'239 68 68',success:'34 197 94',warning:'245 158 11' },
    light: { surfaceDark:'244 246 249',surface:'255 255 255',surfaceLight:'237 240 244',surfaceHover:'225 229 235',foreground:'24 28 35',muted:'85 95 110',border:'198 205 215',accent:'161 98 7',danger:'185 28 28',success:'21 128 61',warning:'180 83 9' },
};
function ui() {
    const theme = Object.fromEntries(Object.entries(palettes[element('theme').value]).map(([key,value]) => [`--hp-${key}`,value]));
    return { theme:{ ...theme,'--hp-panelRadius':'16px','--hp-buttonRadius':'8px' },locale:element('locale').value,messages:{} };
}
function send(message) { frame?.contentWindow?.postMessage({ nectar:'v1',nonce,...message },'*'); }
function log(method, outcome) {
    const item = document.createElement('li'); item.textContent = `${method}: ${outcome}`; element('activity').prepend(item);
    while (element('activity').children.length > 30) element('activity').lastChild.remove();
}
function loadFrame() {
    generation++; subscriptions.clear(); pending.clear();
    nonce = Array.from(crypto.getRandomValues(new Uint8Array(24)),value => value.toString(16).padStart(2,'0')).join('');
    frame = document.createElement('iframe'); frame.title = 'Extension preview'; frame.sandbox = 'allow-scripts'; frame.referrerPolicy = 'no-referrer';
    frame.src = '/' + element('page').value; element('frame').replaceChildren(frame);
}
function controls(previousPage = element('page').value) {
    const pages = state.manifest.frontend.pages ?? [];
    const entries = [...pages.map(page => [page.entry,`${page.title} (${page.context ?? 'dashboard'})`]),['dist/index.html','Widget / default entry']];
    element('page').replaceChildren(...entries.map(([value,label]) => new Option(label,value)));
    if (entries.some(([entry]) => entry === previousPage)) element('page').value = previousPage;
    const oldCell = element('cell').value;
    element('cell').replaceChildren(new Option('No Cell', ''),...state.fixtures.cells.map(cell => new Option(cell.name,cell.id)));
    if (state.fixtures.cells.some(cell => cell.id === oldCell)) element('cell').value = oldCell;
    else if (pages.find(page => page.entry === element('page').value)?.context === 'cell') element('cell').value = state.fixtures.cells[0]?.id ?? '';
}
async function capability(message) {
    const response = await fetch('/__nectar/capability', {
        method:'POST',headers:{ 'Content-Type':'application/json','X-Nectar-Preview':state.token },
        body:JSON.stringify({ method:message.method,params:message.params ?? {},denied:element('scenario').value === 'denied',failed:element('scenario').value === 'network-failure' && message.method.startsWith('network.') }),
    });
    const data = await response.json();
    if (!response.ok) throw Object.assign(new Error(data.message ?? 'Mock capability failed.'),{ status:response.status });
    return data;
}
window.addEventListener('message',async event => {
    if (event.source !== frame?.contentWindow || event.origin !== 'null' || event.data?.nectar !== 'v1') return;
    const message = event.data;
    if (message.type === 'ready') { send({ type:'init',cellId:element('cell').value || null,ui:ui() }); return; }
    if (message.nonce !== nonce) return;
    if (message.type === 'resize' && Number.isFinite(message.height)) { frame.style.height = `${Math.min(12000,Math.max(80,Math.ceil(message.height)))}px`; return; }
    const legacy = message.type === 'subscribe';
    if (!legacy && (message.type !== 'request' || typeof message.requestId !== 'string' || !/^[\w-]{1,80}$/.test(message.requestId))) return;
    const requestId = legacy ? 'legacy-subscribe' : message.requestId;
    if (pending.has(requestId) || pending.size >= 10) return;
    pending.add(requestId); const current = generation;
    try {
        const input = legacy ? { method:'events.subscribe',params:{ events:message.events ?? [] } } : message;
        const data = await capability(input);
        if (current !== generation) return;
        if (input.method === 'events.subscribe') { subscriptions.clear(); input.params.events.forEach(name => subscriptions.add(name)); }
        if (!legacy) send({ type:'response',requestId,ok:true,data });
        log(input.method,'success (mock)');
    } catch (error) {
        if (current !== generation) return;
        if (!legacy) send({ type:'response',requestId,ok:false,error:error.message,status:error.status });
        log(legacy ? 'events.subscribe' : message.method,`failed (${error.status ?? 'connection'})`);
    } finally { if (current === generation) pending.delete(requestId); }
});
for (const id of ['theme','locale']) element(id).addEventListener('change',() => send({ type:'ui',ui:ui() }));
for (const id of ['page','cell','scenario']) element(id).addEventListener('change',() => { if (id === 'page') controls(); loadFrame(); });
element('reload').addEventListener('click',loadFrame);
element('emit').addEventListener('click',() => {
    const event = element('event').value, cell = state.fixtures.cells.find(cell => cell.id === element('cell').value) ?? state.fixtures.cells[0];
    if (!subscriptions.has(event) || !cell) { element('status').textContent = 'This frame is not subscribed to that event, or no mock Cell exists.'; return; }
    send({ type:'event',event,cell:event === 'cell.deleted' ? { id:cell.id } : cell });
    log(event,'manual mock event');
});
async function refresh() {
    if (polling) return; polling = true;
    try {
        const response = await fetch('/__nectar/state',{ cache:'no-store' });
        if (!response.ok) throw Error('Preview server is unavailable.');
        const next = await response.json(), changed = !state || next.revision !== state.revision;
        state = next;
        element('status').textContent = state.error ? `Build failed: ${state.error}` : `${state.manifest.name} · mock mode · edit source, public assets or nectar.preview.json to rebuild`;
        if (changed) { controls(); loadFrame(); }
    } catch (error) { element('status').textContent = error.message; }
    finally { polling = false; }
}
void refresh(); setInterval(() => void refresh(),1000);
