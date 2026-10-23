import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { button, input, select, enhanceSelect, switchControl, notice, loading, emptyState, tabs, confirmDialog } from '../dist/ui.js';
let win;
beforeEach(() => {
    win = new Window();
    for (const name of ['window', 'document', 'HTMLElement', 'HTMLButtonElement', 'HTMLOptGroupElement', 'MutationObserver', 'Option', 'Event']) globalThis[name] = name === 'window' ? win : win[name];
});
afterEach(async () => { win.dispatchEvent(new win.Event('pagehide')); await win.happyDOM.close(); });

test('controls render untrusted strings as text and preserve validation/disabled state', () => {
    const malicious = '<img src=x onerror=alert(1)>';
    const action = button(malicious, { disabled: true });
    assert.equal(action.type, 'button'); assert.equal(action.disabled, true); assert.equal(action.querySelector('img'), null);
    const field = input({ label: malicious, description: 'Help', required: true });
    document.body.append(field.element);
    assert.equal(field.control.checkValidity(), false);
    field.control.value = 'Text'; assert.equal(field.control.checkValidity(), true);
    assert.equal(field.element.querySelector('label').htmlFor, field.control.id);
    assert.ok(field.control.getAttribute('aria-describedby'));
    assert.equal(notice(malicious, 'danger').getAttribute('role'), 'alert');
    assert.equal(loading('Loading').getAttribute('role'), 'status');
    assert.equal(emptyState(malicious).querySelector('img'), null);
});

test('switch supports native changes and disabled state', () => {
    let seen;
    const item = switchControl({ label: 'Enabled', checked: true, onChange: value => { seen = value; } });
    document.body.append(item.element);
    assert.equal(item.control.getAttribute('role'), 'switch');
    item.control.click(); assert.equal(seen, false);
    item.control.disabled = true; item.control.click(); assert.equal(seen, false);
});

test('select has its label, skips disabled options, commits with change and restores native control', () => {
    let value;
    const item = select({ label: 'Allocation', options: [{ value: 'one', label: 'First' }, { value: 'no', label: 'Disabled', disabled: true }, { value: 'two', label: 'Second' }], onChange: next => { value = next; } });
    document.body.append(item.element);
    assert.ok(item.element.querySelector('label'));
    assert.equal(item.trigger.textContent, 'First');
    item.trigger.click(); assert.equal(item.trigger.getAttribute('aria-expanded'), 'true');
    document.activeElement.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    assert.equal(document.activeElement.textContent, 'Second');
    document.activeElement.click(); assert.equal(value, 'two'); assert.equal(item.control.value, 'two');
    assert.equal(item.trigger.getAttribute('aria-expanded'), 'false');
    item.control.disabled = true; item.refresh(); assert.equal(item.trigger.disabled, true);
    assert.throws(() => enhanceSelect(item.control), /already/);
    item.dispose(); assert.equal(item.control.getAttribute('aria-hidden'), null); assert.equal(item.control.classList.contains('nectar-select-native'), false);
});

test('tabs use unique panel IDs and support arrow/Home/End selection', () => {
    const first = document.createElement('p'), second = document.createElement('p');
    const item = tabs([{ id: 'a', label: 'First', content: first }, { id: 'b', label: 'Second', content: second }], 'Sections');
    document.body.append(item.element);
    const controls = item.element.querySelectorAll('[role=tab]');
    controls[0].focus(); controls[0].dispatchEvent(new win.KeyboardEvent('keydown', { key: 'End', bubbles: true }));
    assert.equal(document.activeElement, controls[1]); assert.equal(first.hidden, true); assert.equal(second.hidden, false);
    assert.equal(controls[1].getAttribute('aria-controls'), second.id);
    assert.throws(() => item.select('unknown'), /Unknown/);
});

test('confirmation cancels without mutation, restores focus and only approves once', async () => {
    const opener = button('Open'); document.body.append(opener); opener.focus();
    let calls = 0;
    const options = { title: 'Delete?', description: 'Remove it', confirmText: 'Delete', cancelText: 'Cancel', onConfirm: async () => { calls++; } };
    const pending = confirmDialog(options);
    document.querySelector('dialog button').click();
    assert.equal(await pending, false); assert.equal(document.body.classList.contains('nectar-confirming'), false); assert.equal(calls, 0); assert.equal(document.activeElement, opener);
    const accepted = confirmDialog(options);
    const accept = document.querySelector('dialog button:last-child'); accept.click(); accept.click();
    assert.equal(await accepted, true); assert.equal(calls, 1); assert.equal(document.querySelector('dialog'), null);
});

test('confirmation errors retain the dialog for retry and escape is blocked during work', async () => {
    let fail;
    const work = new Promise((resolve, reject) => { fail = reject; });
    const result = confirmDialog({ title: 'Confirm', description: 'Action', confirmText: 'Run', cancelText: 'Cancel', onConfirm: () => work });
    const dialog = document.querySelector('dialog'); dialog.querySelector('button:last-child').click();
    assert.equal(dialog.getAttribute('aria-busy'), 'true');
    dialog.dispatchEvent(new win.Event('cancel', { cancelable: true })); assert.equal(dialog.open, true);
    fail(new Error('Try again')); await Promise.resolve(); await Promise.resolve();
    assert.equal(dialog.querySelector('[role=alert]').textContent, 'Try again');
    assert.equal(dialog.querySelector('button').disabled, false);
    dialog.dispatchEvent(new win.Event('cancel', { cancelable: true })); assert.equal(await result, false);
});
