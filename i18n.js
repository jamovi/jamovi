
'use strict';

import path from 'path';
import yaml from 'js-yaml';
import utils from './utils.js';
import gettextParser from 'gettext-parser';
import fs from 'fs';
import { GettextExtractor, JsExtractors } from 'gettext-extractor';

import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import matchAll from "match-all"; // str.matchAll() not available pre node 12

let untranslatableSymbols = [];

const loadUntranslatableSymbols = function () {
    const excludePath = path.join(__dirname, 'untranslatable.txt');
    const contents = fs.readFileSync(excludePath, 'utf8');
    untranslatableSymbols = contents.split(/\r?\n/).map(line => line.trim()).filter(line => line.length > 0);
}

const translations = {};

const getTranslation = function(msg, plural, context, code, source) {

    context = context === null ? '' : context;
    source = source.replaceAll('\\', '/');

    if (translations[code]['translations'][context] === undefined)
        translations[code]['translations'][context] = {};

    let item = translations[code]['translations'][context][msg];
    if (item === undefined) {
        const newItem = {
            "msgctxt": context,
            "msgid": msg,
            "comments": {
                "reference": source
            }
        }
        if (plural !== null) {
            newItem.msgid_plural = plural;
        }
        translations[code]['translations'][context][msg] = newItem;
        return newItem;
    }

    if (source) {
        if (item.comments === undefined)
            item.comments = {};

        if ( ! item.comments.reference)
            item.comments.reference = source;
        else {
            let refs = item.comments.reference.split('\n');
            if (refs.includes(source) === false)
                refs.push(source);
            item.comments.reference = refs.join('\n');
        }
    }

    return item;


    /*let key = msg;
    if (context)
        key = context + '\u0004' + msg;

    let value = translations[code].locale_data.messages[key];
    if (translations[code]._data === undefined)
        translations[code]._data = { };

    if (value === undefined)
        translations[code].locale_data.messages[key] = [''];

    if (translations[code]._data[key] === undefined)
        translations[code]._data[key] = { msg: msg, context: context, source: [ source ], _clash: [] };

    let data = translations[code]._data[key];
    if (data === undefined) {
        data = { };
        translations[code]._data[key] = data;
    }
    if (data.source === undefined)
        data.source = [];
    if (data.source.includes(source) === false)
        data.source.push(source);

    for (let k in translations[code]._data) {
        let d = translations[code]._data[k];
        if (k === key) {
            if (d.source === undefined)
                d.source = [];
            if (d.source.includes(source) === false)
                d.source.push(source);
            return d;
        }
        else if (k.toLowerCase() === key.toLowerCase()) {
            let found = false;
            if (d._clash === undefined)
                d._clash = [];
            else {
                for (let clash of d._clash) {
                    if (clash === key) {
                        found = true;
                        break;
                    }
                }
            }
            if ( ! found)
                d._clash.push(key);
        }
    }


    return data;*/
};

const updateEntry = function(key, plural, context, source) {
    for (let code in translations) {
        let pair = getTranslation(key, plural, context, code, source);
        pair._inUse = true;
    }
};

const finalise = function(verbose) {
    for (let code in translations) {
        for (let context in translations[code]['translations']) {
            for (let k in translations[code]['translations'][context]) {
                let data = translations[code]['translations'][context][k];
                if (data && data._inUse) {
                    //if (verbose && data._clash && data._clash.length > 0)
                    //    console.log(` !! TRANSLATION WARNING: '${data._clash.join(', ')}' and '${ data.msg }' have been added as seperate strings.`)
                    delete data._inUse;
                }
                else {
                    if (k !== '')
                        delete translations[code]['translations'][context][k];
                }
            }
        }
    }
};

const canBeTranslated = function(value) {

    if (Number.isFinite(Number(value)))
        return false;

    if (value === '%')
        // in some languages (i.e. french) has a leading space, i.e. 50 %
        return true;

    if (value.length === 1)
        return false;

    if (value === '$key')
        return false;

    if (/^\([^\)]*\)$/g.test(value))
        return false;

    if (/^\$\{[^\}]*\}$/g.test(value))
        return false;

    if (/^\< 0?.[0-9]+$/.test(value))
        // < .05, etc.
        return false;

    if (untranslatableSymbols.includes(value))
        return false;

    return true;
}

const parseContext = function(value) {
    let data = { key: value, context: null };

    let match = value.match(/(.+) \[([^\[\]]+)\]$/);

    if (match !== null) {
        data.key = match[1];
        data.context = match[2];
    }

    return data;
}

const extract = function(obj, address, filter, exclude = []) {

    for (let property in obj) {
        let include = ( ! filter || filter.includes(property)) && ! exclude.includes(property);
        if (include) {
            let value = obj[property];
            if (typeof value === 'string') {
                value = value.trim();
                if (canBeTranslated(value)) {
                    value = parseContext(value);
                    if (Array.isArray(obj))
                        updateEntry(value.key, null, value.context, `${address}[${property}]`);
                    else
                        updateEntry(value.key, null, value.context, `${address}.${property}`);
                }
            }
            else if (Array.isArray(value) || typeof value === 'object') {
                extract(value, `${address}.${property}`, undefined, exclude);
            }
        }
    }
}

const extractDefaultValueStrings = function(item, itemAddress, defaultValue, basePath) {
    if ( ! defaultValue)
        return;

    switch (item.type) {
        case 'String':
            let dValue = defaultValue.trim();
            if (canBeTranslated(dValue)) {
                let value = parseContext(dValue);
                updateEntry(value.key, null, value.context, `${itemAddress}.${basePath}`);
            }
            break;
        case 'Group':
            for (let element of item.elements)
                extractDefaultValueStrings(element, itemAddress, defaultValue[element.name], `${basePath}.${element.name}`);
            break;
        case 'Array':
            for (let i = 0; i < defaultValue.length; i++)
                extractDefaultValueStrings(item.template, itemAddress, defaultValue[i], `${basePath}[${i}]`);
            break;
    }
}

const checkItem = function(item, address, customFilter, exclude = ['usage']) {

    if (customFilter === undefined)
        customFilter = [];

    if (Array.isArray(item)) {
        for (let i = 0; i < item.length; i++) {
            let child = item[i];
            let childAddress = '';
            if (child.name)
                childAddress = `${address}/${child.name.replaceAll(' ', '')}`;
            else
                childAddress = `${address}[${i}]`;

            checkItem(child, childAddress, customFilter, exclude);
        }
    }
    else if (typeof item === 'object') {
        let filter = ['label', 'title', 'description', 'addButton',
            'ghostText', 'suffix', 'menuTitle', 'menuGroup',
            'menuSubgroup', 'menuSubtitle', 'superTitle', 'content', 'notes', ...customFilter];

        extract(item, address, filter, exclude);

        extractDefaultValueStrings(item, address, item.default, 'default');

        if (item.template)
            checkItem(item.template, `${address}.template`);

        if (item.columns) {
            for (let column of item.columns)
                checkItem(column, `${address}.columns`);
        }

        if (item.children)
            checkItem(item.children, address);

        if (item.items)
            checkItem(item.items, address);

        if (item.elements)
            checkItem(item.elements, address);

        if (item.options)
            checkItem(item.options, address, undefined, ['R']);

        if (item.analyses)
            checkItem(item.analyses, `${address}/analyses`);

        if (item.datasets)
            checkItem(item.datasets, `${address}/datasets`, ['name']);
    }

}

const load = function(defDir, code, create) {
    let transDir = path.join(defDir, 'i18n');
    if (defDir.endsWith('i18n'))
        transDir = defDir;

    if ( ! utils.exists(transDir)) {
        if (create)
            fs.mkdirSync(transDir);
        else
            throw 'No translation files found.';
    }

    //if (code && create)
    //    translations[code] = { code: code, name: '', label: '', pluralForms: 'nplurals=2; plural=(n != 1)', _list: [], list: [] };

    if (code && create) {
        translations[code] = {
            "headers": {
                "MIME-Version": "1.0",
                "Content-Type": "text/plain; charset=utf-8",
                "Content-Transfer-Encoding": "8bit",
                "POT-Creation-Date": "2021-07-26 12:08:06+01000",
                "Plural-Forms": "nplurals=2; plural=(n!=1);",
                "Language": code
            },

            "translations": {
            }
        }
    }

    let transfiles = fs.readdirSync(transDir);
    if (create === false && transfiles.length === 0)
        throw 'No translation files found.';

    let translationLoaded = false;
    for (let file of transfiles) {

        if (file.endsWith('.po') === false && file.endsWith('.pot') === false)
            continue;

        if (code) {
            if (translationLoaded)
                break;
            if (code.toLowerCase() === 'c' && file !== 'catalog.pot')
                continue;
            else if (file.startsWith(code.toLowerCase()) === false)
                continue;
            else if (create) {
                throw `Translation for language code ${code} already exists.`;
            }
        }

        let langPath = path.join(transDir, file);

        const po = gettextParser.po.parse(fs.readFileSync(langPath));

        const lang = po.headers.Language || po.headers.language || po.headers.lang;

        translations[lang.toLowerCase()] = po;
        translationLoaded = true;
    }

    if (create === false && code && translationLoaded === false)
        throw `No translation for language code ${code} found.
Try using:    jmc --i18n path  --create ${code}`;

    return transDir;
}

const createTranslationJSON = function(code, domain = 'messages') {

    const parsed = this.translations[code];
    const locale_data = {};
    const jed = {
        domain,
        locale_data: {
            [domain]: locale_data
        }
    };

    const headers = parsed.headers || {};

    locale_data[""] = {
        domain,
        lang: headers.Language || headers.language || headers.lang || '',
        plural_forms: headers['plural-forms'] || headers['Plural-Forms'] || ''
    };

    const translations = parsed.translations || {};

    for (const [context, entries] of Object.entries(translations)) {
        for (const [msgid, entry] of Object.entries(entries)) {

            if (msgid === '')
                continue;

            if (entry.comments?.flag?.includes('fuzzy'))
                continue;

            const ctx = entry.msgctxt || context || '';
            const key = ctx ? `${ctx}\u0004${msgid}` : msgid;

            const isPlural = !!entry.msgid_plural;

            let value;

            if (isPlural)
                value = [entry.msgid_plural, ...(entry.msgstr || [])];
            else
                value = entry.msgstr;

            locale_data[key] = value;
        }
    }

    return jed;
}

const scanAnalyses = function(defDir, srcDir) {

    console.log('Extracting strings from js files...');

    ////////////////////////////////////
    // clear file references so they are clear and will be added back when updated
    ////////////////////////////////////

    for (let code in translations) {
        for (const context of Object.values(translations[code].translations))
            for (const entry of Object.values(context))
                if (entry.comments)
                    delete entry.comments.reference;
    }


    ////////////////////////////////////
    // Extract strings from files
    ////////////////////////////////////

    let extractor = new GettextExtractor();

    extractor.createJsParser([
        JsExtractors.callExpression('_', {
            arguments: {
                text: 0
            }
        }),
        JsExtractors.callExpression('n_', {
            arguments: {
                text: 0,
                textPlural: 1
            }
        }),
        JsExtractors.callExpression('_p', {
            arguments: {
                context: 0,
                text: 1
            }
        })
    ])
        .parseFilesGlob(`${defDir}/js/**/*.@(ts|js|tsx|jsx)`);

    let items = extractor.getPofileItems();

    for (let item of items) {
        if (item.obsolete === false) {
            for (let ref of item.references) {
                ref = path.relative(srcDir, ref);
                updateEntry(item.msgid, item.msgid_plural, item.msgctxt, ref);
            }
        }
    }
    extractor.printStats();

    console.log('Extracting strings from R files...');
    let rDir = path.join(srcDir, 'R')
    let rFiles = fs.readdirSync(rDir);
    let re = /[^a-zA-Z._]\.\('([^'\\]*(\\.[^'\\]*)*)'|[^a-zA-Z._]\.\("([^"\\]*(\\.[^"\\]*)*)"/g;

    for (let fileName of rFiles) {
        if ( ! fileName.endsWith('.R') || fileName.endsWith('.h.R'))
            continue;
        let filePath = path.join(rDir, fileName);
        let content = fs.readFileSync(filePath, 'UTF-8').replace(/\\u[0-9A-Fa-f]{4}/g, (x) => JSON.parse(`"${x}"`));

        // to support node < 12, we're using matchAll() rather than
        // str.matchAll()
        //
        // for (let match of content.matchAll(re)) {
        //     let value = parseContext(match.slice(1).join(''));
        //     let rel = path.relative(srcDir, filePath);
        //     updateEntry(value.key, value.context, rel);
        // }

        for (let match of matchAll(content, re).toArray()) {
            let value = parseContext(match);
            let rel = path.relative(srcDir, filePath);
            updateEntry(value.key, null, value.context, rel);
        }
    }

    console.log('Extracting strings from yaml files...');

    loadUntranslatableSymbols();

    let files = fs.readdirSync(defDir);
    for (let file of files) {
        if (file === '0000.yaml') {
            let packageInfoPath = path.join(defDir, '0000.yaml');
            //let refsPath = path.join(defDir, '00refs.yaml');

            let content = fs.readFileSync(packageInfoPath);
            let packageInfo = yaml.load(content);
            checkItem(packageInfo, `package`);

        }
        else if (file.endsWith('.a.yaml')) {
            let analysisPath = path.join(defDir, file);
            let basename = path.basename(analysisPath, '.a.yaml');
            let resultsPath = path.join(defDir, basename + '.r.yaml');
            let uiPath = path.join(defDir, basename + '.u.yaml');

            let content = fs.readFileSync(analysisPath, 'utf-8');
            let analysis = yaml.load(content);

            checkItem(analysis, `${analysis.name}/options`);

            if (utils.exists(uiPath)) {
                let uiData = yaml.load(fs.readFileSync(uiPath));
                checkItem(uiData, `${analysis.name}/ui`);
            }

            if (utils.exists(resultsPath)) {
                let results = yaml.load(fs.readFileSync(resultsPath));
                checkItem(results, `${analysis.name}/results`);
            }
        }
    }
}


const saveAsPO = function(transDir) {
    finalise(false);
    for (let code in translations) {

        let filename = code;
        if (filename === 'c')
            filename = 'catalog';

        let transOutPath = null;
        if (filename === 'catalog')
            transOutPath = path.join(transDir, `${filename}.pot`);
        else
            transOutPath = path.join(transDir, `${filename}.po`);


        const output = gettextParser.po.compile(translations[code], {
            foldLength: 77, sort: (a, b) => {
                let aa = a.msgid.toLowerCase();
                if (a.msgctxt)
                    aa = `${a.msgctxt.toLowerCase()} ${aa}`;
                let bb = b.msgid.toLowerCase();
                if (b.msgctxt)
                    bb = `${b.msgctxt.toLowerCase()} ${bb}`;
                return aa.localeCompare(bb);
            }
        });
        fs.writeFileSync(transOutPath, output);
        console.log('wrote: ' + path.basename(transOutPath));
    }
}

const create = function(code, defDir, srcDir, verbose) {
    let transDir = load(defDir, code, true);
    scanAnalyses(defDir, srcDir);
    saveAsPO(transDir, verbose);
}

const update = function(code, defDir, srcDir, verbose) {
    let transDir = load(defDir, code, false);
    scanAnalyses(defDir, srcDir);
    saveAsPO(transDir, verbose);
};

const list = function(defDir) {
    let transDir = path.join(defDir, 'i18n');
    if ( ! utils.exists(transDir)) {
        console.log('No translation files found.');
        return;
    }

    let transfiles = fs.readdirSync(transDir);
    if (transfiles.length === 0) {
        console.log('No translation files found.');
        return;
    }

    if (transfiles.length === 1)
        console.log(`    ${transfiles.length} language code file was found:`);
    else
        console.log(`    ${transfiles.length} language code files were found:`);
    console.log('');

    for (let file of transfiles)
        console.log(`      ${file}`);
    console.log('');
    console.log('');

    console.log(`To update a specific language code file use:
     jmc --i18n path  --update code

To update all language code files use:
     jmc --i18n path  --update

To create a new language code file use:
    jmc --i18n path  --create code`);
}

export default { create, update, load, finalise, list, translations, createTranslationJSON };
