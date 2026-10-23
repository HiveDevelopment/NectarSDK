/** Framework-independent controls. User-provided text is never interpreted as HTML. */
export type Tone = 'info' | 'success' | 'warning' | 'danger';
let sequence = 0;
const id = () => `nectar-ui-${++sequence}`;
function node<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string) {
    const element = document.createElement(tag);
    element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
}
export function button(text: string, options: { variant?: 'primary' | 'secondary' | 'danger'; disabled?: boolean; onClick?: () => void } = {}) {
    const element = node('button', `nectar-button nectar-button--${options.variant ?? 'primary'}`, text);
    element.type = 'button';
    element.disabled = options.disabled ?? false;
    if (options.onClick) element.addEventListener('click', options.onClick);
    return element;
}
export function input(options: { label: string; description?: string; type?: 'text' | 'password' | 'number' | 'email'; value?: string; required?: boolean; placeholder?: string; onInput?: (value: string) => void }) {
    const control = node('input', 'nectar-input');
    control.id = id(); control.type = options.type ?? 'text'; control.value = options.value ?? '';
    control.required = options.required ?? false;
    if (options.placeholder) control.placeholder = options.placeholder;
    const element = field(control, options.label, options.description);
    if (options.onInput) control.addEventListener('input', () => options.onInput!(control.value));
    return { element, control };
}
export function field(control: HTMLElement, label: string, description?: string) {
    control.id ||= id();
    const element = node('div', 'nectar-field');
    const heading = node('label', 'nectar-label', label); heading.htmlFor = control.id;
    element.append(heading, control);
    if (description) {
        const help = node('p', 'nectar-help', description); help.id = id();
        control.setAttribute('aria-describedby', help.id); element.append(help);
    }
    return element;
}
export function notice(text: string, tone: Tone = 'info') {
    const element = node('div', `nectar-notice nectar-notice--${tone}`, text);
    element.setAttribute('role', tone === 'danger' ? 'alert' : 'status');
    return element;
}
export function loading(text: string) {
    const element = node('div', 'nectar-loading');
    element.setAttribute('role', 'status');
    const spinner = node('span', 'nectar-spinner'); spinner.setAttribute('aria-hidden', 'true');
    element.append(spinner, node('span', '', text));
    return element;
}
export function emptyState(title: string, description?: string, action?: HTMLButtonElement) {
    const element = node('section', 'nectar-empty');
    element.setAttribute('role', 'status');
    element.append(node('h3', 'nectar-title', title));
    if (description) element.append(node('p', 'nectar-help', description));
    if (action) element.append(action);
    return element;
}
export function switchControl(options: { label: string; description?: string; checked?: boolean; disabled?: boolean; onChange?: (checked: boolean) => void }) {
    const control = node('input', 'nectar-switch');
    control.type = 'checkbox'; control.setAttribute('role', 'switch');
    control.checked = options.checked ?? false; control.disabled = options.disabled ?? false;
    if (options.onChange) control.addEventListener('change', () => options.onChange!(control.checked));
    return { element: field(control, options.label, options.description), control };
}
export function tabs(items: { id: string; label: string; content: HTMLElement }[], label: string) {
    if (!items.length || new Set(items.map(item => item.id)).size !== items.length) throw new TypeError('Tabs need nonempty, unique IDs.');
    const element = node('div', 'nectar-tabs'), bar = node('div', 'nectar-tablist');
    bar.setAttribute('role', 'tablist'); bar.setAttribute('aria-label', label);
    const prefix = id();
    const controls = items.map((item, index) => {
        const tab = button(item.label, { variant: 'secondary' });
        tab.className = 'nectar-tab'; tab.id = `${prefix}-tab-${index}`;
        tab.setAttribute('role', 'tab'); tab.setAttribute('aria-controls', `${prefix}-panel-${index}`);
        item.content.id = `${prefix}-panel-${index}`;
        item.content.classList.add('nectar-tabpanel'); item.content.setAttribute('role', 'tabpanel');
        item.content.setAttribute('aria-labelledby', tab.id); item.content.tabIndex = 0;
        tab.addEventListener('click', () => select(item.id));
        bar.append(tab); return tab;
    });
    function select(value: string, focus = false) {
        const selected = items.findIndex(item => item.id === value);
        if (selected < 0) throw new TypeError(`Unknown tab: ${value}`);
        items.forEach((item, index) => {
            const active = index === selected;
            controls[index].setAttribute('aria-selected', String(active));
            controls[index].tabIndex = active ? 0 : -1; item.content.hidden = !active;
        });
        if (focus) controls[selected].focus();
    }
    bar.addEventListener('keydown', event => {
        const current = controls.indexOf(document.activeElement as HTMLButtonElement);
        if (current < 0 || !['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (current + (event.key === 'ArrowRight' ? 1 : -1) + items.length) % items.length;
        select(items[next].id, true);
    });
    element.append(bar, ...items.map(item => item.content)); select(items[0].id);
    return { element, select };
}

/** Enhance a single select while preserving value, options, change and validation APIs.
 * Menus use normal flow so a sandboxed iframe cannot clip an overlay. Call refresh()
 * after programmatic selectedIndex/value changes and dispose() before removing it.
 */
export function enhanceSelect(select: HTMLSelectElement) {
    if (select.multiple || select.size > 1) throw new TypeError('Only single-value selects are supported.');
    if (select.dataset.nectarEnhanced) throw new TypeError('Select is already enhanced.');
    const original = { tabIndex: select.getAttribute('tabindex'), ariaHidden: select.getAttribute('aria-hidden') };
    select.dataset.nectarEnhanced = 'true'; select.id ||= id();
    const element = node('div', 'nectar-select'); select.before(element); element.append(select);
    select.classList.add('nectar-select-native'); select.tabIndex = -1; select.setAttribute('aria-hidden', 'true');
    const trigger = button('', { variant: 'secondary' }); trigger.className = 'nectar-select-trigger';
    const value = node('span', ''); value.id = id(); trigger.append(value);
    const labelIds = Array.from(select.labels ?? [], label => {
        const textLabel = label.querySelector<HTMLElement>(':scope > span') ?? label;
        textLabel.id ||= id(); return textLabel.id;
    });
    const explicitLabel = select.getAttribute('aria-labelledby');
    const labels = explicitLabel || labelIds.join(' ');
    trigger.setAttribute('aria-labelledby', `${labels} ${value.id}`.trim());
    if (!labels && select.getAttribute('aria-label')) trigger.setAttribute('aria-label', select.getAttribute('aria-label')!);
    const description = select.getAttribute('aria-describedby'); if (description) trigger.setAttribute('aria-describedby', description);
    const list = node('div', 'nectar-select-options'); list.id = id(); list.hidden = true;
    list.setAttribute('role', 'listbox');
    if (labels) list.setAttribute('aria-labelledby', labels);
    else list.setAttribute('aria-label', select.getAttribute('aria-label') ?? '');
    trigger.setAttribute('aria-haspopup', 'listbox'); trigger.setAttribute('aria-controls', list.id);
    element.append(trigger, list);
    let disposed = false;
    function close(focus = false) {
        list.hidden = true; trigger.setAttribute('aria-expanded', 'false');
        if (focus) trigger.focus();
    }
    function refresh() {
        if (disposed) return;
        value.textContent = select.selectedOptions[0]?.textContent ?? '—';
        trigger.disabled = select.disabled || !select.options.length;
        trigger.setAttribute('aria-required', String(select.required));
        if (select.validity.valid) trigger.removeAttribute('aria-invalid');
        if (trigger.disabled) close();
        list.replaceChildren(...Array.from(select.options, (option, index) => {
            const item = button(option.textContent ?? '', { variant: 'secondary' });
            item.className = 'nectar-select-option'; item.setAttribute('role', 'option'); item.tabIndex = -1;
            item.setAttribute('aria-selected', String(option.selected));
            item.disabled = option.disabled || (option.parentElement instanceof HTMLOptGroupElement && option.parentElement.disabled);
            item.addEventListener('click', () => {
                if (select.disabled || item.disabled) return;
                select.selectedIndex = index; select.dispatchEvent(new Event('input', { bubbles: true }));
                select.dispatchEvent(new Event('change', { bubbles: true })); refresh(); close(true);
            }); return item;
        }));
    }
    function open() {
        if (trigger.disabled) return;
        list.hidden = false; trigger.setAttribute('aria-expanded', 'true');
        const chosen = list.querySelector<HTMLButtonElement>('[aria-selected=true]:not(:disabled)') ?? list.querySelector<HTMLButtonElement>('button:not(:disabled)');
        chosen?.focus();
    }
    trigger.addEventListener('click', () => list.hidden ? open() : close());
    element.addEventListener('keydown', event => {
        if (event.key === 'Escape' && !list.hidden) { event.preventDefault(); close(true); }
        if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        const wasClosed = list.hidden;
        if (wasClosed) open();
        const items = Array.from(list.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));
        const current = items.indexOf(document.activeElement as HTMLButtonElement);
        if (!items.length || (wasClosed && !['Home', 'End'].includes(event.key))) return;
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (current + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
        items[next]?.focus();
    });
    element.addEventListener('focusout', event => { if (!element.contains(event.relatedTarget as Node | null)) close(); });
    const invalid = () => { trigger.setAttribute('aria-invalid', 'true'); trigger.focus(); };
    const focus = () => trigger.focus();
    select.addEventListener('invalid', invalid); select.addEventListener('focus', focus); select.addEventListener('change', refresh);
    const reset = () => queueMicrotask(refresh);
    const form = select.form; form?.addEventListener('reset', reset);
    const observer = new MutationObserver(refresh); observer.observe(select, { childList: true, subtree: true, attributes: true });
    close(); refresh();
    return { element, trigger, refresh, dispose() {
        if (disposed) return;
        disposed = true; observer.disconnect(); form?.removeEventListener('reset', reset);
        select.removeEventListener('invalid', invalid); select.removeEventListener('focus', focus); select.removeEventListener('change', refresh);
        select.classList.remove('nectar-select-native'); delete select.dataset.nectarEnhanced;
        for (const [name, saved] of [['tabindex', original.tabIndex], ['aria-hidden', original.ariaHidden]] as const) {
            if (saved === null) select.removeAttribute(name); else select.setAttribute(name, saved);
        }
        element.replaceWith(select);
    } };
}
export function select(options: { label: string; options: { value: string; label: string; disabled?: boolean }[]; required?: boolean; onChange?: (value: string) => void }) {
    const control = node('select', ''); control.required = options.required ?? false;
    control.append(...options.options.map(item => { const option = node('option', '', item.label); option.value = item.value; option.disabled = item.disabled ?? false; return option; }));
    const element = field(control, options.label);
    if (options.onChange) control.addEventListener('change', () => options.onChange!(control.value));
    return { ...enhanceSelect(control), element, control };
}

export interface ConfirmationOptions {
    title: string; description: string; confirmText: string; cancelText: string;
    danger?: boolean; onConfirm?: () => Promise<void>; errorMessage?: string;
}
let activeDialog: HTMLDialogElement | undefined;
/** Frame-local native dialog: traps focus and makes the rest of this iframe inert. */
export function confirmDialog(options: ConfirmationOptions): Promise<boolean> {
    if (activeDialog) return Promise.reject(new Error('A Nectar confirmation is already open.'));
    const previous = document.activeElement as HTMLElement | null;
    const dialog = node('dialog', 'nectar-dialog'); activeDialog = dialog;
    const hadDialogClass = document.body.classList.contains('nectar-confirming');
    document.body.classList.add('nectar-confirming');
    const title = node('h2', 'nectar-title', options.title); title.id = id();
    const description = node('p', 'nectar-help', options.description); description.id = id();
    dialog.setAttribute('aria-labelledby', title.id); dialog.setAttribute('aria-describedby', description.id);
    const error = notice('', 'danger'); error.hidden = true;
    const actions = node('div', 'nectar-actions');
    const cancel = button(options.cancelText, { variant: 'secondary' });
    const accept = button(options.confirmText, { variant: options.danger ? 'danger' : 'primary' });
    actions.append(cancel, accept); dialog.append(title, description, error, actions); document.body.append(dialog);
    return new Promise((resolve, reject) => {
        let busy = false, settled = false;
        function finish(value: boolean) {
            if (settled) return; settled = true;
            window.removeEventListener('pagehide', unload);
            dialog.close(); dialog.remove(); activeDialog = undefined;
            if (!hadDialogClass) document.body.classList.remove('nectar-confirming');
            if (previous?.isConnected) previous.focus(); resolve(value);
        }
        const unload = () => finish(false);
        window.addEventListener('pagehide', unload, { once: true });
        cancel.addEventListener('click', () => { if (!busy) finish(false); });
        dialog.addEventListener('cancel', event => { event.preventDefault(); if (!busy) finish(false); });
        dialog.addEventListener('close', () => { if (!settled) finish(false); });
        dialog.addEventListener('keydown', event => {
            if (event.key !== 'Tab') return;
            const enabled = Array.from(dialog.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));
            if (!enabled.length) { event.preventDefault(); return; }
            const first = enabled[0], last = enabled[enabled.length - 1];
            if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
            else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
        });
        accept.addEventListener('click', async () => {
            if (busy || settled) return;
            busy = true; accept.disabled = true; cancel.disabled = true; dialog.setAttribute('aria-busy', 'true'); error.hidden = true;
            try { await options.onConfirm?.(); finish(true); }
            catch (reason) {
                if (settled) return;
                error.textContent = options.errorMessage ?? (reason instanceof Error ? reason.message : options.description); error.hidden = false;
            } finally {
                busy = false; accept.disabled = false; cancel.disabled = false; dialog.removeAttribute('aria-busy');
            }
        });
        try { dialog.showModal(); cancel.focus(); }
        catch (reason) { window.removeEventListener('pagehide', unload); dialog.remove(); activeDialog = undefined; if (!hadDialogClass) document.body.classList.remove('nectar-confirming'); reject(reason); }
    });
}
