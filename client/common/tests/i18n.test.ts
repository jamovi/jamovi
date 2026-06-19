import { describe, expect, it } from 'vitest';

import { I18n } from '../i18n';

describe('I18n language matching', () => {
    it('validates BCP 47 language tags', () => {
        const i18n = new I18n();

        expect(i18n.isValidLocaleOrLanguageTag('en')).toBe(true);
        expect(i18n.isValidLocaleOrLanguageTag('en-US')).toBe(true);
        expect(i18n.isValidLocaleOrLanguageTag('zh-Hans')).toBe(true);
        expect(i18n.isValidLocaleOrLanguageTag('zh-Hant-TW')).toBe(true);
        expect(i18n.isValidLocaleOrLanguageTag('en-US-u-ca-gregory')).toBe(true);
    });

    it('validates BCP 47 tags with underscore separators', () => {
        const i18n = new I18n();

        expect(i18n.isValidLocaleOrLanguageTag('en_US')).toBe(true);
        expect(i18n.isValidLocaleOrLanguageTag('pt_BR')).toBe(true);
        expect(i18n.isValidLocaleOrLanguageTag('sr_Latn_RS')).toBe(true);
        expect(i18n.isValidLocaleOrLanguageTag('ca_ES_valencia')).toBe(true);
        expect(i18n.isValidLocaleOrLanguageTag('zh_Hans')).toBe(true);
        expect(i18n.isValidLocaleOrLanguageTag('zh_Hant_TW')).toBe(true);
        expect(i18n.isValidLocaleOrLanguageTag('nb_no')).toBe(true);
    });

    it('rejects malformed locale and language tags', () => {
        const i18n = new I18n();

        expect(i18n.isValidLocaleOrLanguageTag('')).toBe(false);
        expect(i18n.isValidLocaleOrLanguageTag('not a locale')).toBe(false);
        expect(i18n.isValidLocaleOrLanguageTag('en--US')).toBe(false);
        expect(i18n.isValidLocaleOrLanguageTag('en_US.')).toBe(false);
        expect(i18n.isValidLocaleOrLanguageTag('en_US@')).toBe(false);
        expect(i18n.isValidLocaleOrLanguageTag('pt_BR.UTF-8')).toBe(false);
        expect(i18n.isValidLocaleOrLanguageTag('sr_RS@latin')).toBe(false);
        expect(i18n.isValidLocaleOrLanguageTag('123')).toBe(false);
    });

    it('normalizes accepted locale styles to BCP 47 language tags', () => {
        const i18n = new I18n();

        expect(i18n.toBCP47LanguageTag('pt_BR')).toBe('pt-BR');
        expect(i18n.toBCP47LanguageTag('sr_Latn_RS')).toBe('sr-Latn-RS');
        expect(i18n.toBCP47LanguageTag('ca_ES_valencia')).toBe('ca-ES-valencia');
        expect(i18n.toBCP47LanguageTag('zh_Hant_TW')).toBe('zh-Hant-TW');
        expect(i18n.toBCP47LanguageTag('nb_no')).toBe('nb-NO');
        expect(i18n.toBCP47LanguageTag('en-US-u-ca-gregory')).toBe('en-US-u-ca-gregory');
    });

    it('returns null when locale normalization cannot produce BCP 47', () => {
        const i18n = new I18n();

        expect(i18n.toBCP47LanguageTag('not a locale')).toBeNull();
        expect(i18n.toBCP47LanguageTag('pt_BR.UTF-8')).toBeNull();
        expect(i18n.toBCP47LanguageTag('sr_RS@latin')).toBeNull();
    });

    it('matches Chinese region codes to script-based language packs', () => {
        const i18n = new I18n();

        expect(i18n.findBestMatchingLanguage('zh-CN', ['en', 'zh-Hans'])).toBe('zh-Hans');
        expect(i18n.findBestMatchingLanguage('zh-SG', ['en', 'zh-Hans'])).toBe('zh-Hans');
        expect(i18n.findBestMatchingLanguage('zh-TW', ['en', 'zh-Hant'])).toBe('zh-Hant');
        expect(i18n.findBestMatchingLanguage('zh-HK', ['en', 'zh-Hant'])).toBe('zh-Hant');
    });

    it('matches Chinese script codes to region-based language packs', () => {
        const i18n = new I18n();

        expect(i18n.findBestMatchingLanguage('zh-Hans', ['en', 'zh-CN'])).toBe('zh-CN');
        expect(i18n.findBestMatchingLanguage('zh-Hant', ['en', 'zh-TW'])).toBe('zh-TW');
    });

    it('does not match Chinese language packs with incompatible scripts', () => {
        const i18n = new I18n();

        expect(i18n.findBestMatchingLanguage('zh-Hans', ['zh-Hant'])).toBeNull();
        expect(i18n.findBestMatchingLanguage('zh-Hant', ['zh-CN'])).toBeNull();
    });

    it('prefers a broader script match over a different regional variant', () => {
        const i18n = new I18n();

        expect(i18n.findBestMatchingLanguage('zh-HK', ['zh-Hant-TW', 'zh-Hant'])).toBe('zh-Hant');
    });

    it('normalizes underscores for matching but returns the original language pack code', () => {
        const i18n = new I18n();

        expect(i18n.findBestMatchingLanguage('zh-CN', ['en', 'zh_Hans'])).toBe('zh_Hans');
        expect(i18n.findBestMatchingLanguage('zh_Hant', ['en', 'zh_TW'])).toBe('zh_TW');
        expect(i18n.findBestMatchingLanguage('pt-BR', ['en', 'pt_BR'])).toBe('pt_BR');
    });

    it('matches browser language tags to Weblate language pack codes', () => {
        const i18n = new I18n();

        expect(i18n.findBestMatchingLanguage('nb-NO', ['en', 'nb_NO'])).toBe('nb_NO');
        expect(i18n.findBestMatchingLanguage('zh-Hant', ['en', 'zh_Hant'])).toBe('zh_Hant');
        expect(i18n.findBestMatchingLanguage('zh-Hans', ['en', 'zh_Hans'])).toBe('zh_Hans');
        expect(i18n.findBestMatchingLanguage('zh-TW', ['en', 'zh_Hant'])).toBe('zh_Hant');
        expect(i18n.findBestMatchingLanguage('zh-CN', ['en', 'zh_Hans'])).toBe('zh_Hans');
    });

    it('rejects POSIX-only locale codes for matching', () => {
        const i18n = new I18n();

        expect(i18n.findBestMatchingLanguage('pt-BR', ['en', 'pt_BR.UTF-8'])).toBeNull();
        expect(i18n.findBestMatchingLanguage('pt_BR.UTF-8', ['en', 'pt-BR'])).toBeNull();
    });

    it('matches BCP 47 script subtags with underscore separators', () => {
        const i18n = new I18n();

        expect(i18n.findBestMatchingLanguage('sr-Cyrl-RS', ['en', 'sr_RS'])).toBe('sr_RS');
        expect(i18n.findBestMatchingLanguage('sr-Latn-RS', ['en', 'sr_Latn_RS'])).toBe('sr_Latn_RS');
        expect(i18n.findBestMatchingLanguage('sr_Latn_RS', ['en', 'sr-Latn-RS'])).toBe('sr-Latn-RS');
    });

    it('treats BCP 47 variants with underscore separators as variants', () => {
        const i18n = new I18n();

        expect(i18n.findBestMatchingLanguage('ca-ES-valencia', ['en', 'ca_ES_valencia'])).toBe('ca_ES_valencia');
    });

    it('ignores BCP 47 extensions when matching', () => {
        const i18n = new I18n();

        expect(i18n.findBestMatchingLanguage('en-US-u-ca-gregory', ['en', 'en_US'])).toBe('en_US');
    });

    it('gets display names for BCP 47 locale codes', () => {
        const i18n = new I18n();

        expect(i18n.getDisplayName('pt_BR')).toBe(i18n.getDisplayName('pt-BR'));
        expect(i18n.getDisplayName('sr_Latn_RS')).toBe(i18n.getDisplayName('sr-Latn-RS'));
        expect(i18n.getDisplayName('pt_BR.UTF-8')).toBe('pt_BR.UTF-8');
    });

    it('falls back to the input code when a display name cannot be produced', () => {
        const i18n = new I18n();

        expect(i18n.getDisplayName('not a locale')).toBe('not a locale');
    });

    it('does not return unrelated zero-rank language matches', () => {
        const i18n = new I18n();

        expect(i18n.findBestMatchingLanguage('fr', ['en'])).toBeNull();
    });

    it('breaks equal-rank ties deterministically regardless of code order', () => {
        const i18n = new I18n();

        // same rank and code length: alphabetically first wins, both orders
        expect(i18n.findBestMatchingLanguage('zh', ['zh_Hans', 'zh_Hant'])).toBe('zh_Hans');
        expect(i18n.findBestMatchingLanguage('zh', ['zh_Hant', 'zh_Hans'])).toBe('zh_Hans');
        expect(i18n.findBestMatchingLanguage('de-AT', ['de-CH', 'de-DE'])).toBe('de-CH');
        expect(i18n.findBestMatchingLanguage('de-AT', ['de-DE', 'de-CH'])).toBe('de-CH');

        // a shorter (base) code still wins over a regional sibling
        expect(i18n.findBestMatchingLanguage('de-AT', ['de-CH', 'de'])).toBe('de');
        expect(i18n.findBestMatchingLanguage('de-AT', ['de', 'de-CH'])).toBe('de');
    });
});
