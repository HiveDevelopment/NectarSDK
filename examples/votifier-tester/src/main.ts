import { applyTheme, createNectar, type Cell } from '@hivedevelopment/nectar';
import { sendTestVote } from './vote';
import { enhanceSelect, notice } from '@hivedevelopment/nectar/ui';

const app = document.querySelector<HTMLElement>('#app')!;
// All dynamic values are assigned with textContent, value or Option, never interpolated into markup.
app.innerHTML = `<h2 id="heading"></h2><p id="intro"></p><form id="vote"><div class="grid">
<label id="cell-field"><span id="cell-label"></span><select id="cell" required></select></label>
<label id="allocation-field"><span id="allocation-label"></span><select id="allocation" required></select></label>
<label><span id="username-label"></span><input id="username" class="nectar-input" required pattern="[A-Za-z0-9_]{3,16}" maxlength="16" autocomplete="off"></label>
<label><span id="service-label"></span><input id="service" class="nectar-input" required maxlength="64" value="HivePanelTest" autocomplete="off"></label>
<label class="wide"><span id="token-label"></span><input id="token" class="nectar-input" type="password" required maxlength="512" autocomplete="off"></label>
</div><p id="note"></p><button id="send" class="nectar-button nectar-button--primary" type="button" disabled></button></form><div id="status"></div>`;
app.classList.add('nectar-page');
const get = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const cellSelect = get<HTMLSelectElement>('cell'), allocationSelect = get<HTMLSelectElement>('allocation');
const button = get<HTMLButtonElement>('send'), token = get<HTMLInputElement>('token');
const disposeSelects = [enhanceSelect(cellSelect), enhanceSelect(allocationSelect)];
const client = createNectar();
let contextCellId: string | null = null;
let cells: Cell[] = [], busy = false, language = 'en', statusKey: string | undefined = 'connecting';
const messages: Record<string, Record<string,string>> = {
    en: { heading:'Send a test vote',intro:'Test a NuVotifier v2 listener on an allocation assigned to this Cell.',
        'cell-label':'Cell','allocation-label':'Votifier allocation','username-label':'Minecraft username','service-label':'Service name','token-label':'NuVotifier token',
        note:'Use the token configured for this service name. It is cleared after each attempt and is never saved. A successful response confirms acceptance by the listener; check your reward plugin separately.',
        send:'Send test vote',connecting:'Connecting to HivePanel…',ready:'Choose the allocation used by NuVotifier.',empty:'No permitted Votifier allocations are available.',
        sending:'Connecting and sending the test vote…',accepted:'Test vote accepted by NuVotifier. Check your listener for rewards.' },
    de: { heading:'Testvote senden',intro:'Teste einen NuVotifier-v2-Listener auf einer Zuweisung dieser Cell.',
        'cell-label':'Cell','allocation-label':'Votifier-Zuweisung','username-label':'Minecraft-Spielername','service-label':'Dienstname','token-label':'NuVotifier-Token',
        note:'Verwende das Token für diesen Dienstnamen. Es wird nach jedem Versuch gelöscht und nicht gespeichert. Prüfe Belohnungen separat im Plugin.',
        send:'Testvote senden',connecting:'Verbindung zu HivePanel…',ready:'Wähle die NuVotifier-Zuweisung.',empty:'Keine erlaubten Votifier-Zuweisungen verfügbar.',
        sending:'Verbindung wird hergestellt und Testvote gesendet…',accepted:'NuVotifier hat den Testvote angenommen. Prüfe die Belohnungen im Listener.' },
};
const text = (key: string) => messages[language]?.[key] ?? messages.en[key] ?? key;
function status(key: string) { statusKey = key; get('status').replaceChildren(notice(text(key), key === 'accepted' ? 'success' : 'info')); }
function translate() {
    for (const id of ['heading','intro','cell-label','allocation-label','username-label','service-label','token-label','note']) get(id).textContent = text(id);
    button.textContent = text('send');
    if (statusKey) get('status').replaceChildren(notice(text(statusKey), statusKey === 'accepted' ? 'success' : 'info'));
}
function allocations() {
    const cell = cells.find(cell => cell.id === cellSelect.value);
    allocationSelect.replaceChildren(...(cell?.allocations ?? []).map(value => new Option(`${value.ip}:${value.port}`,value.id)));
    button.disabled = busy || !cell?.allocations.length;
    status(cell?.allocations.length ? 'ready' : 'empty');
}
cellSelect.addEventListener('change',allocations);
const form = get<HTMLFormElement>('vote');
// Native form submission is intentionally disabled by Nectar's sandbox/CSP.
form.addEventListener('submit',event => event.preventDefault());
form.addEventListener('keydown',event => {
    if (event.key === 'Enter' && !event.isComposing && event.target instanceof HTMLInputElement) { event.preventDefault(); button.click(); }
});
button.addEventListener('click',async () => {
    if (busy || !allocationSelect.value || !form.reportValidity()) return;
    busy = true; button.disabled = true; cellSelect.disabled = true; allocationSelect.disabled = true; status('sending');
    try {
        await sendTestVote(client,{ cellId:cellSelect.value,allocationId:allocationSelect.value,
            username:get<HTMLInputElement>('username').value,token:token.value,serviceName:get<HTMLInputElement>('service').value });
        status('accepted');
    } catch (error) {
        statusKey = undefined; get('status').replaceChildren(notice(error instanceof Error ? error.message : 'Vote failed.', 'danger'));
    } finally {
        token.value = ''; busy = false; cellSelect.disabled = !!contextCellId; allocationSelect.disabled = false;
        button.disabled = !allocationSelect.value;
    }
});
async function start() {
    try {
        const context = await client.ready;
        contextCellId = context.cellId;
        get('cell-field').hidden = !!context.cellId;
        get('allocation-field').classList.toggle('wide', !!context.cellId);
        const updateUI = (ui: typeof context.ui) => { language = ui.locale.split('-')[0]; applyTheme(ui); translate(); };
        updateUI(context.ui); client.onUI(updateUI);
        cells = (await client.cells.list()).filter(cell => !context.cellId || cell.id === context.cellId);
        cellSelect.replaceChildren(...cells.map(cell => new Option(cell.name,cell.id)));
        cellSelect.disabled = !!context.cellId; allocations();
    } catch (error) { statusKey = undefined; get('status').replaceChildren(notice(error instanceof Error ? error.message : 'Could not initialize.', 'danger')); }
}
translate(); void start();
window.addEventListener('pagehide',() => { disposeSelects.forEach(control => control.dispose()); client.dispose(); },{ once:true });
