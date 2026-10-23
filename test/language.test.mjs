import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTranslator } from '../dist/index.js';

test('translations resolve exact and regional languages, fallback and live locale changes', () => {
    const language = createTranslator({ en: { hello: 'Hello {name}', count: '{count} Cells', only: 'Fallback' }, de: { hello: 'Hallo {name}' }, 'de-AT': { hello: 'Servus {name}' } }, 'de-AT');
    assert.equal(language.t('hello', { name: 'Jordan' }), 'Servus Jordan');
    language.setLocale('de_DE');
    assert.equal(language.t('hello', { name: 'Jordan' }), 'Hallo Jordan');
    assert.equal(language.t('only'), 'Fallback');
    language.setLocale('fr');
    assert.equal(language.t('count', { count: 0 }), '0 Cells');
    assert.equal(language.t('missing'), 'missing');
    assert.equal(language.t('hello'), 'Hello {name}');
});

test('interpolation is single pass and ignores inherited catalogue properties', () => {
    const language = createTranslator({ en: { text: '{value} {other} {value}' } });
    assert.equal(language.t('text', { value: '{other}', other: '$&' }), '{other} $& {other}');
    assert.equal(language.t('toString'), 'toString');
});
