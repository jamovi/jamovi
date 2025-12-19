'use strict';

import Jed from 'jed';

export function s6e(input: string): string {

    // Temporarily protect allowed HTML tags
    const allowedTags = ["i", "em", "b", "strong", "sub", "sup"] as const;

    for (const tag of allowedTags) {
        const openTag = new RegExp(`<${tag}>`, "gi");
        const closeTag = new RegExp(`</${tag}>`, "gi");

        input = input
            .replace(openTag,  `@@@OPEN_${tag.toUpperCase()}@@@`)
            .replace(closeTag, `@@@CLOSE_${tag.toUpperCase()}@@@`);
    }

    // Escape all other HTML brackets
    input = input
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");

    // Restore the allowed tags safely
    for (const tag of allowedTags) {
        input = input
            .replace(new RegExp(`@@@OPEN_${tag.toUpperCase()}@@@`, "g"), `<${tag}>`)
            .replace(new RegExp(`@@@CLOSE_${tag.toUpperCase()}@@@`, "g"), `</${tag}>`);
    }

    return input;
}


// Represents the header entry ("")
interface JedLocaleHeaders {
    domain?: string;
    lang?: string;
    plural_forms?: string;
    [key: string]: string | undefined;
}

// Represents a single translation entry (array of plural forms)
type JedTranslationEntry = string[];

// The full locale_data domain dictionary
interface JedLocaleDomain {
    "": JedLocaleHeaders;
    [msgid: string]: JedTranslationEntry | JedLocaleHeaders;
}

// All domains (usually only "messages", but Jed supports multiple)
interface JedLocaleData {
    [domain: string]: JedLocaleDomain;
}

// The object passed to Jed constructor
export interface I18nData {
    code: string;
    domain?: string; // default domain
    locale_data: JedLocaleData;
}

export const isI18nData = function (obj: unknown): obj is I18nData {
    if (typeof obj !== "object" || obj === null) return false;

    const data = obj as Partial<I18nData>;

    return (
        typeof data.code === "string" &&
        typeof data.domain === "string" &&
        typeof data.locale_data === "object" &&
        data.locale_data !== null &&
        typeof (data.locale_data as any).messages === "object" &&
        (data.locale_data as any).messages !== null &&
        Object.values((data.locale_data as any).messages).every(
            val => Array.isArray(val) && val.every(s => typeof s === "string")
        )
    );
}

export class I18n {
    _availableLanguages: Array<string>;
    language: string;
    jed: Jed;
    localeData: I18nData;

    constructor() {
        this._ = this._.bind(this);
        this._c = this._c.bind(this);
        this._nc = this._nc.bind(this);
        this._n = this._n.bind(this);
        this.findBestMatchingLanguage = this.findBestMatchingLanguage.bind(this);

        this._availableLanguages = ['en'];
        this.language = this.systemLanguage();
    }

    initialise(code: string, localeData: I18nData) {
        this.language = code;
        this.jed = new Jed(localeData);
        this.localeData = localeData;
    }

    setAvailableLanguages(available: string[]) {
        this._availableLanguages = available;
    }

    availableLanguages() {
        return this._availableLanguages;
    }

    // extracts the value if it includes square bracket [context] as well
    extractContext(key: string): { key: string, context: string | null } {
        const m = key.match(/^(.+) \[([a-z]+)\]$/)
        if (m)
            return { key:m[1], context: m[2] };
        return { key: key, context: undefined };
    }

    _(key: string, formats?: { [key: string]: (string|number) } | (string|number)[] | string, options: { prefix: string, postfix: string } = { prefix: '', postfix: '' }): string {
        let value = null;

        const extracted = this.extractContext(key);

        key = extracted.key;

        if ( ! this.jed)
            value = key;
        else
            value = this.jed.dcnpgettext(undefined, extracted.context, key);

        value = s6e(value);

        if (formats)
            value = this.format(value, formats, options);

        return value;
    }

    _c(context: string, key: string, formats?: { [key: string]: (string|number) } | (string|number)[] | string): string {
        let value = null;
        if (!this.jed)
            value = key;
        else
            value = this.jed.dcnpgettext(undefined, context, key);

        if (formats)
            value = this.format(value, formats);

        value = s6e(value);

        return value;
    }

    _nc(context: string, key: string, plural: string, count: number, formats?: { [key: string]: (string|number), n?: (string|number) }): string {
        let value = null;
        if (!this.jed) {
            if (count != 1)
                value = plural;
            else
                value = key;
        }
        else
            value = this.jed.dcnpgettext(undefined, context, key, plural, count);

        if (count > 1) {
            if (!formats)
                formats = {};
            if (formats.n === undefined)
                formats.n = count.toString();
        }
        if (formats)
            value = this.format(value, formats);

        value = s6e(value);

        return value;
    }

    _n(key: string, plural: string, count: number, formats?: { [key: string]: (string|number), n?: (string|number) }): string {
        let value = null;

        const extracted = this.extractContext(key);
        key = extracted.key;

        if (!this.jed) {
            if (count != 1)
                value = plural;
            else
                value = key;
        }
        else
            value = this.jed.dcnpgettext(undefined, extracted.context, key, plural, count);

        if (count > 1) {
            if (!formats)
                formats = {};
            if (formats.n === undefined)
                formats.n = count.toString();
        }
        if (formats)
            value = this.format(value, formats);

        value = s6e(value);

        return value;
    }

    __(compound: string, options = { prefix: '', postfix: '' }): string {
        const parts = compound.split('\u0004');
        if (parts.length < 2 || parts[1] === '') {
            return this._(parts[0]);
        }
        else {
            const key = parts[0];
            const values = JSON.parse(parts[1]);
            return this._(key, values, options);
        }
    }

    format(fstring: string, values: { [key: string]: (string|number) } | (string|number)[] | string, options: { prefix: string, postfix: string } = { prefix: '', postfix: '' }): string {
        const { prefix, postfix } = options;
        if (typeof values === 'string') {
            return fstring.replace('{}', `${prefix}${values}${postfix}`);
        }
        else {
            let value = fstring;
            for (let name in values)
                value = value.replace(`{${name}}`, `${prefix}${values[name]}${postfix}`);
            return value;
        }
    }

    isRTL(code?: string) {
        if (code === undefined)
            code = this.language;

        let rtlLangs = ['ar', 'arc', 'dv', 'fa', 'ha', 'he', 'khw', 'ks', 'ku', 'ps', 'ur', 'yi'];

        return rtlLangs.find((item) => {
            return code === item || code.startsWith(item + '-');
        });
    }

    systemLanguage() {

        let languages = navigator.languages;

        if (!languages) {
            let lang = navigator.language || navigator.userLanguage || navigator.systemLanguage || navigator.browserLanguage;
            if (lang)
                languages = [lang];
        }

        if (languages) {
            for (let lang of languages) {
                if (this.parseLangCode(lang).isValid)
                    return lang.toLowerCase();
            }
        }

        return 'en';
    }

    // for information about language codes
    // https://www.w3.org/International/articles/language-tags/
    parseLangCode(code: string) {

        let parts = {
            language: null,
            extlang: null,
            script: null,
            region: null,
            variant: null,
            code: null,
            isValid: true
        };

        if (!code) {
            parts.isValid = false;
            parts.code = code;
        }
        else {
            parts.code = code.toLowerCase();

            let sections = code.split('-');
            let partIndex = 0;
            for (let i = 0; i < sections.length && partIndex < 5 && parts.isValid; i++) {
                let value = sections[i];
                if (partIndex === 0 && /^[a-zA-Z]{2,3}$/g.test(value)) {  // language code of length 2 or 3 characters
                    parts.language = value.toLowerCase();
                    partIndex = 1;
                }
                else if (partIndex > 0 && partIndex <= 1 && /^[a-zA-Z]{3}$/g.test(value)) {  // language extension code of length 3 characters
                    parts.extlang = value.toLowerCase();
                    partIndex = 2;
                }
                else if (partIndex > 0 && partIndex <= 2 && /^[a-zA-Z]{4}$/g.test(value)) {  // language script code of length 4 characters
                    parts.script = value.toLowerCase();
                    partIndex = 3;
                }
                else if (partIndex > 0 && partIndex <= 3 && /\d{3}$|^[a-zA-Z]{2}$/g.test(value)) {  // region code of length 2 characters or 3 digits
                    parts.region = value.toLowerCase();
                    partIndex = 4;
                }
                else if (partIndex > 0 && partIndex <= 4 && /^\d{4}$|^[a-zA-Z]{5}$/g.test(value)) {  // variant code of length 5 characters or 4 digits
                    parts.variant = value.toLowerCase();
                    partIndex = 5;
                }
                else
                    parts.isValid = false;
            }
        }

        return parts;
    }

    findBestMatchingLanguage(code: string, codes: string[], options?: { excludeDev?: boolean }) {

        options = options || {};

        if (options.excludeDev) {
            let inDevSeparatorIndex = codes.indexOf('---');
            if (inDevSeparatorIndex !== -1)
                codes = codes.slice(0, inDevSeparatorIndex);
        }
        else {
            codes = codes.filter(code => code !== '---');
        }

        if (codes.includes(code))
            return code;

        let desiredLanguage = this.parseLangCode(code);
        if (desiredLanguage.isValid === false)
            return null;

        let languages = codes.map(code => this.parseLangCode(code));

        // compares the tags of the two languages. Every matching tag increases the ranking.
        // Mismatched tags disqualify the compare, except if the target tag being compared is null
        let compare = (desired, target) => {
            if (target.isValid === false)
                return 0;

            let rank = 0;
            if (desired.language === target.language)
                rank += 5;
            else if (target.language !== null)
                return 0;

            if (desired.extlang === target.extlang)
                rank += 4;
            else if (target.extlang !== null)
                return 0;

            if (desired.script === target.script)
                rank += 3;
            else if (target.script !== null)
                return 0;

            if (desired.region === target.region)
                rank += 2;
            else if (target.region !== null)
                return 0;

            if (desired.variant === target.variant)
                rank += 1;
            else if (target.variant !== null)
                return 0;

            return rank;
        };

        let bestLanguage = null;
        let currentRank = 0;
        for (let language of languages) {
            let rank = compare(desiredLanguage, language);

            // If two languages have the same best rank then the shortest code is used.
            if (rank > currentRank || (rank === currentRank && (bestLanguage === null || bestLanguage.code.Length > language.code.length))) {
                currentRank = rank;
                bestLanguage = language;
            }
        }

        return bestLanguage ? bestLanguage.code : null;
    }
}



class I18ns {
    _i18ns: Map<string, I18n> = new Map<string, I18n>();

    get(name: string) {
        let i18n = this._i18ns.get(name);
        if (i18n === undefined) {
            i18n = new I18n();
            this._i18ns.set(name, i18n);
        }
        return i18n;
    }

    create(name: string, code: string, data: I18nData) {
        if (this._i18ns.has(name))
            throw 'Translations already exist.';

        let i18n = new I18n();
        i18n.initialise(code, data);
        this._i18ns.set(name, i18n);
        return i18n;
    }
}

const _i18ns: I18ns = new I18ns();

export default _i18ns;
