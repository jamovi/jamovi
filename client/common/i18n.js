'use strict';

const Jed = require('jed');

class I18n {

    constructor() {
        this._ = this._.bind(this);
        this._c = this._c.bind(this);
        this._nc = this._nc.bind(this);
        this._n = this._n.bind(this);
        this.findBestMatchingLanguage = this.findBestMatchingLanguage.bind(this);

        this._availableLanguages = [ 'en' ];
        this.language = this.systemLanguage();
    }

    initialise(code, localeData) {
        this.language = code;
        this.jed = new Jed(localeData);
        this.localeData = localeData;
    }

    setAvailableLanguages(available) {
        this._availableLanguages = available;
    }

    availableLanguages() {
        return this._availableLanguages;
    }

    _(key, formats, options={ prefix: '', postfix: '' }) {
        let value = null;
        if ( ! this.jed)
            value = key;
        else
            value = this.jed.dcnpgettext(undefined, undefined, key);

        if (formats)
            value = this.format(value, formats, options);
        return value;
    }

    _c(context, key, formats) {
        let value = null;
        if ( ! this.jed)
            value = key;
        else
            value = this.jed.dcnpgettext(undefined, context, key);

        if (formats)
            value = this.format(value, formats);
        return value;
    }

    _nc(context, key, plural, count, formats) {
        let value = null;
        if ( ! this.jed) {
            if (count != 1)
                value = plural;
            else
                value = key;
        }
        else
            value = this.jed.dcnpgettext(undefined, context, key, plural, count);

        if (count > 1) {
            if (! formats)
                formats = { };
            if (formats.n === undefined)
                formats.n = count;
        }
        if (formats)
            value = this.format(value, formats);
        return value;
    }

    _n(key, plural, count, formats) {
        let value = null;
        if ( ! this.jed) {
            if (count != 1)
                value = plural;
            else
                value = key;
        }
        else
            value = this.jed.dcnpgettext(undefined, undefined, key, plural, count);

        if (count > 1) {
            if (! formats)
                formats = { };
            if (formats.n === undefined)
                formats.n = count;
        }
        if (formats)
            value = this.format(value, formats);
        return value;
    }

    __(compound, options={ prefix: '', postfix: '' }) {
        const parts = compound.split('\u0004');
        if (parts.length < 2 || parts[1] === '') {
            return _(parts[0]);
        }
        else {
            const key = parts[0];
            const values = JSON.parse(parts[1]);
            return _(key, values, options);
        }
    }

    format(fstring, values, options={ prefix: '', postfix: '' }) {
        const { prefix, postfix } = options;
        if (typeof values === 'string') {
            return fstring.replace('{}', `${ prefix }${ values }${ postfix }`);
        }
        else {
            let value = fstring;
            for (let name in values)
                value = value.replace(`{${name}}`, `${ prefix }${ values[name] }${ postfix }`);
            return value;
        }
    }

    isRTL() {
        let rtlLangs = ['ar','arc','dv','fa','ha','he','khw','ks','ku','ps','ur','yi'];

        return rtlLangs.find((item) => {
            return this.language === item || this.language.startsWith(item + '-');
        });
    }

    systemLanguage() {

        let languages = navigator.languages;

        if ( ! languages) {
            let lang = navigator.language || navigator.userLanguage || navigator.systemLanguage || navigator.browserLanguage;
            if (lang)
                languages = [ lang ];
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
    parseLangCode(code) {

        let parts = {
            language: null,
            extlang: null,
            script: null,
            region: null,
            variant: null,
            code: null,
            isValid: true
        };

        if ( ! code) {
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

    findBestMatchingLanguage(code, codes, options) {

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

const _i18n = new I18n();

module.exports = _i18n;
