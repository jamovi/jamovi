'use strict';

const Jed = require("jed");

class I18n {

    constructor() {
        this._ = this._.bind(this);
        this._c = this._c.bind(this);
        this._nc = this._nc.bind(this);
        this._n = this._n.bind(this);
        this.findBestMatchingLocale = this.findBestMatchingLocale.bind(this);

        this.locale = this.extractLanguages()[0];
    }

    initialise(code, localeData) {
        this.code = code;
        this.jed = new Jed(localeData);
        this.localeData = localeData;
    }

    _(key, formats) {
        let value = null;
        if ( ! this.jed)
            value = key;
        else
            value = this.jed.dcnpgettext(undefined, undefined, key);

        if (formats)
            value = this.format(value, formats);
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

    format(value, formats) {
        let newValue = value;
        for (let name in formats) {
            newValue = newValue.replace(`{${name}}`, formats[name]);
        }
        return newValue;
    }

    isRTL() {
        let rtlLangs = ['ar','arc','dv','fa','ha','he','khw','ks','ku','ps','ur','yi'];

        return rtlLangs.find((item) => {
            return this.code.startsWith(item + '_');
        });
    }

    extractLanguages(languageString) {
        if (languageString === undefined) {
            languageString = navigator.language || navigator.userLanguage ||
                navigator.systemLanguage || navigator.browserLanguage;
        }
        if (!languageString || languageString === "") {
            return ["en"];
        }

        var langs = [];
        var rawLangs = languageString.split(",");
        var buff;

        // extract langs
        var lang;
        for (var i = 0 ; i < rawLangs.length ; i++) {
            lang = this.parseLanguageCode(rawLangs[i]);
            if (lang.lang) {
                langs.push(lang);
            }
        }

        // Empty list
        if (langs.length === 0) {
            return ["en"];
        }

        // Sort languages by priority
        langs = langs.sort(function (a, b) {
            return b.q - a.q;
        });

        // Generates final list
        var result = [];

        for (i = 0 ; i < langs.length ; i++) {
            buff = langs[i].lang;
            if (langs[i].lect) {
                buff += "_";
                buff += langs[i].lect.toUpperCase();
            }
            result.push(buff);
        }

        return result;
    }

    parseLanguageCode(lang) {
        lang = lang.toLowerCase().replace(/-/g, "_");
        var result = {lang: null, lect: null, q: 1};
        var buff = "";

        if (lang.indexOf(";") > -1) {
            buff = lang.split(";");
            if (buff.length == 2 && buff[1].match(/^q=(1|0\.[0-9]+)$/)) {
                result.q = parseFloat(buff[1].split("=")[1]);
            }
            buff = buff[0] || "";
        } else {
            buff = lang;
        }

        if (buff.indexOf("_") > -1) {
            buff = buff.split("_");
            if (buff.length == 2) {
                if (buff[0].length == 2) {
                    result.lang = buff[0];
                    if (buff[1].length == 2) {
                        result.lect = buff[1];
                    }
                }
            } else if (buff[0].length == 2) {
                result = buff[0];
            }
        } else if (buff.length == 2) {
            result.lang = buff;
        }

        return result;
    }

    findBestMatchingLocale(locale, catalogs) {
        if (!Array.isArray(locale)) {
            locale = [locale];
        }

        var buff;

        var refCatalogs = [];
        for (var i = 0 ; i < catalogs.length ; i++) {
            buff = this.parseLanguageCode(catalogs[i]);
            buff.cat = catalogs[i];
            refCatalogs.push(buff);
        }

        var locales = [];
        for (i = 0 ; i < locale.length ; i++) {
            locales.push(this.parseLanguageCode(locale[i]));
        }

        function _match(lang, lect, catalogList) {
            if (lang === null) {
                return null;
            }
            for (var i = 0 ; i < catalogList.length ; i++) {
                if (lect == "*" && catalogList[i].lang === lang) {
                    return catalogList[i];
                } else if (catalogList[i].lang === lang && catalogList[i].lect === lect) {
                    return catalogList[i];
                }
            }
        }

        // 1. Exact matching (with locale+lect > locale)
        var bestMatchingLocale = null;
        var indexMatch = 0;
        for (i = 0 ; i < locales.length ; i++) {
            buff = _match(locales[i].lang, locales[i].lect, refCatalogs);
            if (buff && (!bestMatchingLocale)) {
                bestMatchingLocale = buff;
                indexMatch = i;
            } else if (buff && bestMatchingLocale &&
                       buff.lang === bestMatchingLocale.lang &&
                       bestMatchingLocale.lect === null && buff.lect !== null) {
                bestMatchingLocale = buff;
                indexMatch = i;
            }
            if (bestMatchingLocale && bestMatchingLocale.lang && bestMatchingLocale.lect) {
                break;
            }
        }

        // 2. Fuzzy matching of locales without lect (fr_FR == fr)
        for (i = 0 ; i < locales.length ; i++) {
            buff = _match(locales[i].lang, null, refCatalogs);
            if (buff) {
                if ((!bestMatchingLocale) || bestMatchingLocale && indexMatch >= i &&
                    bestMatchingLocale.lang !== buff.lang) {
                    return buff.cat;
                }
            }
        }

        // 3. Fuzzy matching with ref lect (fr_* == fr_FR)
        for (i = 0 ; i < locales.length ; i++) {
            buff = _match(locales[i].lang, locales[i].lang, refCatalogs);
            if (buff) {
                if ((!bestMatchingLocale) || bestMatchingLocale && indexMatch >= i &&
                    bestMatchingLocale.lang !== buff.lang) {
                    return buff.cat;
                }
            }
        }

        // 1.5 => set the language found at step 1 if there is nothing better
        if (bestMatchingLocale) {
            return bestMatchingLocale.cat;
        }

        // 4. Fuzzy matching of any lect (fr_* == fr_*)
        for (i = 0 ; i < locales.length ; i++) {
            buff = _match(locales[i].lang, "*", refCatalogs);
            if (buff) {
                return buff.cat;
            }
        }

        // 5. Nothing matches... maybe the given locales are invalide... try to match with catalogs
        for (i = 0 ; i < locale.length ; i++) {
            if (catalogs.indexOf(locale[i]) >= 0) {
                return locale[i];
            }
        }

        // 6. Nothing matches... lang = c;
        return null;
    }
}

const _i18n = new I18n();

module.exports = _i18n;
