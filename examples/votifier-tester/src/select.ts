/** Enhance a select without changing its value/change API or form validation. */
export function enhanceSelect(select: HTMLSelectElement) {
    const wrapper = document.createElement('div');
    wrapper.className = 'select-control';
    select.before(wrapper);
    wrapper.append(select);
    select.classList.add('native-select');
    select.tabIndex = -1;
    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'select-trigger';
    trigger.setAttribute('aria-haspopup', 'listbox');
    trigger.setAttribute('aria-expanded', 'false');
    trigger.setAttribute('aria-labelledby', `${select.id}-label ${select.id}-value`);
    const value = document.createElement('span');
    value.id = `${select.id}-value`;
    trigger.append(value);
    const list = document.createElement('div');
    list.id = `${select.id}-options`;
    list.className = 'select-options';
    list.setAttribute('role', 'listbox');
    list.setAttribute('aria-labelledby', `${select.id}-label`);
    list.hidden = true;
    trigger.setAttribute('aria-controls', list.id);
    wrapper.append(trigger, list);
    function close(focus = false) {
        list.hidden = true;
        trigger.setAttribute('aria-expanded', 'false');
        if (focus) trigger.focus();
    }
    function sync() {
        value.textContent = select.selectedOptions[0]?.textContent ?? '—';
        trigger.disabled = select.disabled || !select.options.length;
        if (trigger.disabled) close();
        list.replaceChildren(...Array.from(select.options, (option, index) => {
            const item = document.createElement('button');
            item.type = 'button';
            item.className = 'select-option';
            item.setAttribute('role', 'option');
            item.setAttribute('aria-selected', String(option.selected));
            item.disabled = option.disabled;
            item.textContent = option.textContent;
            item.addEventListener('click', () => {
                select.selectedIndex = index;
                select.dispatchEvent(new Event('change', { bubbles: true }));
                sync();
                close(true);
            });
            return item;
        }));
    }
    trigger.addEventListener('click', () => {
        if (!list.hidden) { close(); return; }
        list.hidden = false;
        trigger.setAttribute('aria-expanded', 'true');
        (list.querySelector('[aria-selected="true"]') as HTMLElement | null)?.focus();
    });
    wrapper.addEventListener('keydown', event => {
        if (event.key === 'Escape') { event.preventDefault(); close(true); }
        if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp' && event.key !== 'Home' && event.key !== 'End') return;
        event.preventDefault();
        list.hidden = false;
        trigger.setAttribute('aria-expanded', 'true');
        const items = Array.from(list.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));
        const current = items.indexOf(document.activeElement as HTMLButtonElement);
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (current + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
        items[next]?.focus();
    });
    wrapper.addEventListener('focusout', event => {
        if (!wrapper.contains(event.relatedTarget as Node | null)) close();
    });
    select.addEventListener('change', sync);
    select.addEventListener('invalid', () => trigger.focus());
    const observer = new MutationObserver(sync);
    observer.observe(select, { childList: true, subtree: true, attributes: true });
    sync();
    return () => observer.disconnect();
}
