import { applyTheme, createNectar, createTranslator } from '@hivedevelopment/nectar';

const language = createTranslator({
    en: { title: 'Hello Nectar', refresh: 'Refresh Cells', loading: 'Loading…', empty: 'No Cells are available to your account.', count: '{count} visible Cell(s)', locale: 'Language: {locale}', error: 'Could not load Cells.' },
    de: { title: 'Hallo Nectar', refresh: 'Cells aktualisieren', loading: 'Wird geladen…', empty: 'Für dein Konto sind keine Cells verfügbar.', count: '{count} sichtbare Cell(s)', locale: 'Sprache: {locale}', error: 'Cells konnten nicht geladen werden.' },
});
import { button, notice, loading as loadingState, emptyState } from '@hivedevelopment/nectar/ui';

const app = document.querySelector<HTMLElement>('#app')!;
const nectar = createNectar();
const title = document.createElement('h1');
const context = document.createElement('p');
const status = document.createElement('div');
const refresh = button('');
app.classList.add('nectar-page');
const list = document.createElement('ul');
app.replaceChildren(title, context, refresh, status, list);
let greeting = '', loading = false, count = 0, failed = false;
function render() {
    title.textContent = greeting || language.t('title');
    refresh.textContent = language.t('refresh');
    context.textContent = language.t('locale', { locale: language.locale });
    const message = language.t(loading ? 'loading' : failed ? 'error' : count ? 'count' : 'empty', { count });
    status.replaceChildren(loading ? loadingState(message) : failed ? notice(message, 'danger') : count ? notice(message, 'success') : emptyState(message));
}
async function load() {
    if (loading) return;
    loading = true; failed = false; refresh.disabled = true; render();
    try {
        const cells = await nectar.cells.list();
        count = cells.length;
        list.replaceChildren(...cells.map(cell => {
            const item = document.createElement('li');
            item.textContent = `${cell.name} · ${cell.installStatus}`;
            return item;
        }));
    } catch { failed = true; }
    finally { loading = false; refresh.disabled = false; render(); }
}
async function start() {
    try {
        const initial = await nectar.ready;
        const update = (ui: typeof initial.ui) => { applyTheme(ui); language.setLocale(ui.locale); render(); };
        update(initial.ui);
        nectar.onUI(update);
        const settings = await nectar.settings.get<{ greeting: string }>();
        greeting = settings.greeting || '';
        await load();
        nectar.events.on(() => { void load(); });
        await nectar.events.subscribe(['cell.created', 'cell.updated', 'cell.deleted']);
    } catch (error) { status.textContent = error instanceof Error ? error.message : language.t('error'); }
}
refresh.addEventListener('click', () => void load());
window.addEventListener('pagehide', () => nectar.dispose(), { once: true });
render(); void start();
