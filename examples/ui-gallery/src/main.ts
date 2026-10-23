import { applyTheme, createNectar, createTranslator } from '@hivedevelopment/nectar';
import { button, input, select, switchControl, notice, loading, emptyState, tabs, confirmDialog } from '@hivedevelopment/nectar/ui';
const client = createNectar();
const language = createTranslator({
    en: { heading: 'Nectar UI components', intro: 'Shared controls using the current Panel theme.', forms: 'Form controls', states: 'Feedback states', name: 'Display name', help: 'A local demonstration; nothing is saved.', choice: 'Layout', compact: 'Compact', full: 'Full', enabled: 'Enable notifications', primary: 'Primary action', secondary: 'Secondary action', remove: 'Delete example', title: 'Delete this example?', description: 'This demonstrates a confirmation inside the extension. No server files will be changed.', confirm: 'Delete example', cancel: 'Cancel', ready: 'Ready to use', success: 'Operation completed', warning: 'Review your selection', error: 'Example error message', loading: 'Loading content…', empty: 'No results', emptyHelp: 'Try another search.', tabs: 'Component examples', deleted: 'Example confirmed', cancelled: 'Action cancelled' },
    de: { heading: 'Nectar-UI-Komponenten', intro: 'Gemeinsame Steuerelemente im aktuellen Panel-Design.', forms: 'Formulare', states: 'Rückmeldungen', name: 'Anzeigename', help: 'Lokales Beispiel; es wird nichts gespeichert.', choice: 'Layout', compact: 'Kompakt', full: 'Vollständig', enabled: 'Benachrichtigungen aktivieren', primary: 'Primäre Aktion', secondary: 'Sekundäre Aktion', remove: 'Beispiel löschen', title: 'Dieses Beispiel löschen?', description: 'Bestätigung innerhalb der Erweiterung. Serverdateien werden nicht geändert.', confirm: 'Beispiel löschen', cancel: 'Abbrechen', ready: 'Bereit', success: 'Vorgang abgeschlossen', warning: 'Auswahl prüfen', error: 'Beispielfehler', loading: 'Inhalte werden geladen…', empty: 'Keine Ergebnisse', emptyHelp: 'Versuche eine andere Suche.', tabs: 'Komponentenbeispiele', deleted: 'Beispiel bestätigt', cancelled: 'Aktion abgebrochen' },
});
const app = document.querySelector<HTMLElement>('#app')!;
app.className = 'nectar-page nectar-stack';
let disposeSelect: (() => void) | undefined;
function render() {
    disposeSelect?.();
    const t = language.t;
    const heading = document.createElement('h2'); heading.textContent = t('heading');
    const intro = document.createElement('p'); intro.className = 'nectar-help'; intro.textContent = t('intro');
    const fields = document.createElement('div'); fields.className = 'nectar-stack';
    const name = input({ label: t('name'), description: t('help'), required: true });
    const layout = select({ label: t('choice'), options: [{ value: 'compact', label: t('compact') }, { value: 'full', label: t('full') }] });
    disposeSelect = layout.dispose;
    const response = document.createElement('div');
    const actions = document.createElement('div'); actions.className = 'nectar-demo-actions';
    actions.append(button(t('primary'), { onClick: () => response.replaceChildren(notice(t('success'), 'success')) }), button(t('secondary'), { variant: 'secondary', onClick: () => response.replaceChildren(notice(t('ready'))) }), button(t('remove'), { variant: 'danger', onClick: async () => {
        const confirmed = await confirmDialog({ title: t('title'), description: t('description'), confirmText: t('confirm'), cancelText: t('cancel'), danger: true });
        response.replaceChildren(notice(t(confirmed ? 'deleted' : 'cancelled'), confirmed ? 'success' : 'info'));
    } }));
    fields.append(name.element, layout.element, switchControl({ label: t('enabled') }).element, actions, response);
    const states = document.createElement('div'); states.className = 'nectar-stack';
    states.append(notice(t('ready')), notice(t('success'), 'success'), notice(t('warning'), 'warning'), notice(t('error'), 'danger'), loading(t('loading')), emptyState(t('empty'), t('emptyHelp')));
    app.replaceChildren(heading, intro, tabs([{ id: 'forms', label: t('forms'), content: fields }, { id: 'states', label: t('states'), content: states }], t('tabs')).element);
}
async function start() {
try {
    const context = await client.ready;
    const update = (ui: typeof context.ui) => { applyTheme(ui); language.setLocale(ui.locale); render(); };
    update(context.ui); client.onUI(update);
} catch (error) { app.replaceChildren(notice(error instanceof Error ? error.message : 'Could not initialize.', 'danger')); }
}
void start();
window.addEventListener('pagehide', () => { disposeSelect?.(); client.dispose(); }, { once: true });
