export type CellEventName = 'cell.created' | 'cell.updated' | 'cell.deleted';
export interface Allocation { id: string; ip: string; port: number }
export interface Cell { id: string; name: string; comb: string; allocations: Allocation[]; installStatus: string }
export interface UIContext { theme: Record<string, string>; locale: string; messages: Record<string, string> }
export interface Context { cellId: string | null; ui: UIContext }
export interface CellEvent { event: CellEventName; cell: Cell | { id: string } }
export interface HttpResult { status: number; body_base64: string }
export interface TcpParams {
    cell_id: string; allocation_id: string; action: 'open' | 'exchange' | 'close';
    session_id?: string; data_base64?: string; read_line?: boolean; read_json?: boolean;
}
export interface TcpResult { session_id?: string; data_base64?: string; [key: string]: unknown }
export class NectarError extends Error {
    constructor(message: string, public readonly code: string, public readonly status?: number) {
        super(message);
        this.name = 'NectarError';
    }
}

/** One client per iframe. No Panel tokens, cookies or direct fetch requests are needed. */
export function createNectar(options: { timeoutMs?: number; handshakeTimeoutMs?: number; autoResize?: boolean } = {}) {
    const host = window;
    if (host.parent === host) throw new NectarError('Open this extension inside HivePanel.', 'NOT_EMBEDDED');
    const origin = new URL(host.location.href).origin;
    const timeout = options.timeoutMs ?? 15000;
    const handshakeTimeout = options.handshakeTimeoutMs ?? 10000;
    if (![timeout, handshakeTimeout].every(value => Number.isFinite(value) && value > 0)) throw new TypeError('Timeouts must be positive.');
    let nonce: string | undefined;
    let context: Context | undefined;
    let disposed = false;
    let sequence = 0;
    const requestPrefix = Array.from(crypto.getRandomValues(new Uint8Array(8)), value => value.toString(16).padStart(2, '0')).join('');
    let readySettled = false;
    let resizeObserver: ResizeObserver | undefined;
    let resizeFrame: number | undefined;
    let lastHeight = 0;
    function measure() {
        if (disposed || !nonce || typeof document === 'undefined' || !document.body) return;
        if (resizeFrame !== undefined) cancelAnimationFrame(resizeFrame);
        resizeFrame = requestAnimationFrame(() => {
            resizeFrame = undefined;
            const body = document.body, style = getComputedStyle(body);
            const height = Math.ceil(Math.max(body.offsetHeight, body.scrollHeight) + (parseFloat(style.marginTop) || 0) + (parseFloat(style.marginBottom) || 0));
            if (height !== lastHeight) { lastHeight = height; send({ type: 'resize', nonce, height }); }
        });
    }
    const pending = new Map<string, { resolve: (data: unknown) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>();
    const uiListeners = new Set<(ui: UIContext) => void>();
    const eventListeners = new Set<(event: CellEvent) => void>();
    let resolveReady!: (value: Context) => void;
    let rejectReady!: (error: Error) => void;
    const ready = new Promise<Context>((resolve, reject) => { resolveReady = resolve; rejectReady = reject; });
    // Avoid an unhandled rejection when a client is disposed before consumers await readiness.
    void ready.catch(() => {});
    const send = (payload: Record<string, unknown>) => host.parent.postMessage({ nectar: 'v1', ...payload }, '*');
    function notify<T>(listeners: Set<(value: T) => void>, value: T) {
        for (const listener of listeners) {
            try { listener(value); } catch (error) { console.error('Nectar listener failed', error); }
        }
    }
    function validUI(value: unknown): value is UIContext {
        const ui = value as UIContext | null;
        return !!ui && typeof ui.locale === 'string' && !!ui.theme && typeof ui.theme === 'object'
            && !!ui.messages && typeof ui.messages === 'object';
    }
    function receive(event: MessageEvent) {
        if (disposed || event.source !== host.parent || event.origin !== origin) return;
        const message = event.data;
        if (!message || message.nectar !== 'v1') return;
        if (message.type === 'init' && !readySettled && typeof message.nonce === 'string'
            && /^[a-f0-9]{48}$/.test(message.nonce) && validUI(message.ui)
            && (message.cellId === null || typeof message.cellId === 'string')) {
            nonce = message.nonce;
            context = { cellId: message.cellId, ui: message.ui };
            readySettled = true;
            clearInterval(retry);
            clearTimeout(handshakeTimer);
            resolveReady(context);
            if (options.autoResize !== false && typeof ResizeObserver !== 'undefined' && typeof document !== 'undefined' && document.body) {
                resizeObserver = new ResizeObserver(measure);
                resizeObserver.observe(document.body);
                host.addEventListener('resize', measure);
                measure();
            }
            return;
        }
        if (!nonce || message.nonce !== nonce) return;
        if (message.type === 'ui' && validUI(message.ui) && context) {
            context = { ...context, ui: message.ui };
            notify(uiListeners, message.ui);
        } else if (message.type === 'event' && ['cell.created', 'cell.updated', 'cell.deleted'].includes(message.event)
            && message.cell && typeof message.cell.id === 'string') {
            notify(eventListeners, { event: message.event, cell: message.cell });
        } else if (message.type === 'response' && typeof message.requestId === 'string') {
            const item = pending.get(message.requestId);
            if (!item) return;
            clearTimeout(item.timer);
            pending.delete(message.requestId);
            if (message.ok === true) item.resolve(message.data);
            else item.reject(new NectarError(typeof message.error === 'string' ? message.error : 'Capability request failed.',
                'CAPABILITY_FAILED', typeof message.status === 'number' ? message.status : undefined));
        }
    }
    host.addEventListener('message', receive);
    const retry = setInterval(() => send({ type: 'ready' }), 250);
    const handshakeTimer = setTimeout(() => {
        readySettled = true;
        clearInterval(retry);
        host.removeEventListener('message', receive);
        rejectReady(new NectarError('Nectar handshake timed out. Open the extension in a compatible Panel.', 'HANDSHAKE_TIMEOUT'));
    }, handshakeTimeout);
    send({ type: 'ready' });

    async function request<T>(method: string, params: Record<string, unknown> = {}): Promise<T> {
        if (disposed) throw new NectarError('Nectar client was disposed.', 'DISPOSED');
        await ready;
        if (disposed) throw new NectarError('Nectar client was disposed.', 'DISPOSED');
        if (pending.size >= 10) throw new NectarError('Wait for an existing request to finish.', 'TOO_MANY_REQUESTS');
        const requestId = `sdk-${requestPrefix}-${++sequence}`;
        return new Promise<T>((resolve, reject) => {
            const timer = setTimeout(() => {
                pending.delete(requestId);
                reject(new NectarError('Nectar request timed out.', 'REQUEST_TIMEOUT'));
            }, timeout);
            pending.set(requestId, { resolve: data => resolve(data as T), reject, timer });
            try { send({ type: 'request', nonce, requestId, method, params }); }
            catch (error) { clearTimeout(timer); pending.delete(requestId); reject(error); }
        });
    }
    return {
        ready,
        get context() { return context; },
        cells: { list: () => request<{ cells: Cell[] }>('cells.list').then(result => result.cells) },
        settings: { get: <T extends Record<string, unknown> = Record<string, unknown>>() => request<{ settings: T }>('settings.get').then(result => result.settings) },
        network: {
            http: (params: { url: string; method?: 'GET' | 'POST'; body?: string }) => request<HttpResult>('network.http', params),
            tcp: (params: TcpParams) => request<TcpResult>('network.tcp', { ...params }),
        },
        events: {
            // Replaces the event set for this frame. An empty set stops polling.
            subscribe: (events: CellEventName[]) => request<{ ok: boolean }>('events.subscribe', { events }),
            on: (listener: (event: CellEvent) => void) => { eventListeners.add(listener); return () => { eventListeners.delete(listener); }; },
        },
        onUI: (listener: (ui: UIContext) => void) => { uiListeners.add(listener); return () => { uiListeners.delete(listener); }; },
        dispose() {
            if (disposed) return;
            if (nonce) {
                try { send({ type: 'request', nonce, requestId: `sdk-${requestPrefix}-${++sequence}`, method: 'events.subscribe', params: { events: [] } }); } catch { /* Parent may already be gone. */ }
            }
            disposed = true;
            clearInterval(retry);
            clearTimeout(handshakeTimer);
            host.removeEventListener('message', receive);
            if (!readySettled) { readySettled = true; rejectReady(new NectarError('Nectar client was disposed.', 'DISPOSED')); }
            for (const item of pending.values()) { clearTimeout(item.timer); item.reject(new NectarError('Nectar client was disposed.', 'DISPOSED')); }
            resizeObserver?.disconnect();
            if (resizeFrame !== undefined) cancelAnimationFrame(resizeFrame);
            host.removeEventListener('resize', measure);
            pending.clear(); uiListeners.clear(); eventListeners.clear();
        },
    };
}

export type NectarClient = ReturnType<typeof createNectar>;
export function applyTheme(ui: UIContext, root: HTMLElement = document.documentElement) {
    for (const [name, value] of Object.entries(ui.theme)) {
        if (/^--hp-[a-zA-Z]+$/.test(name) && typeof value === 'string') root.style.setProperty(name, value);
    }
    const accent = ui.theme['--hp-accent']?.split(/\s+/).map(Number);
    if (accent?.length === 3 && accent.every(value => Number.isFinite(value) && value >= 0 && value <= 255)) {
        const channels = accent.map(value => { const c = value / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
        const luminance = channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
        root.style.setProperty('--nectar-accent-foreground', luminance > 0.179 ? '0 0 0' : '255 255 255');
    }
    root.lang = ui.locale;
}
export function decodeBody(result: { body_base64: string }): string {
    return new TextDecoder().decode(Uint8Array.from(atob(result.body_base64), character => character.charCodeAt(0)));
}

export { createTranslator, type MessageCatalogues } from './language.js';
export type { NectarManifest, Permission, SidebarGroup, SidebarIcon, WidgetSlot, ExtensionPage, ExtensionSetting } from './manifest.js';
