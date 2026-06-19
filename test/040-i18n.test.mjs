import assert from 'node:assert/strict';
import test from 'node:test';
import i18n from '../i18n.js';

test('accepts Weblate language codes', () => {
    assert.equal(i18n.isValidWeblateLanguageCode('en'), true);
    assert.equal(i18n.isValidWeblateLanguageCode('nb_NO'), true);
    assert.equal(i18n.isValidWeblateLanguageCode('zh_Hans'), true);
    assert.equal(i18n.isValidWeblateLanguageCode('zh_Hant_TW'), true);
    assert.equal(i18n.isValidWeblateLanguageCode('sr_Latn_RS'), true);
    assert.equal(i18n.isValidWeblateLanguageCode('es_419'), true);
    assert.equal(i18n.isValidWeblateLanguageCode('zh_Hans_419'), true);
    assert.equal(i18n.isValidWeblateLanguageCode('ca_ES_valencia'), true);
    assert.equal(i18n.isValidWeblateLanguageCode('de_1901'), true);
});

test('rejects non-Weblate language codes', () => {
    assert.equal(i18n.isValidWeblateLanguageCode(''), false);
    assert.equal(i18n.isValidWeblateLanguageCode('not a locale'), false);
    assert.equal(i18n.isValidWeblateLanguageCode('nb-NO'), false);
    assert.equal(i18n.isValidWeblateLanguageCode('nb_no'), false);
    assert.equal(i18n.isValidWeblateLanguageCode('zh_hans'), false);
    assert.equal(i18n.isValidWeblateLanguageCode('pt_BR.UTF-8'), false);
    assert.equal(i18n.isValidWeblateLanguageCode('sr_RS@latin'), false);
});

test('requires separators before numeric regions', () => {
    assert.equal(i18n.isValidWeblateLanguageCode('en_419'), true);
    assert.equal(i18n.isValidWeblateLanguageCode('en419'), false);
    assert.equal(i18n.isValidWeblateLanguageCode('zh_Hans_419'), true);
    assert.equal(i18n.isValidWeblateLanguageCode('zh_Hans419'), false);
});
