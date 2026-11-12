/* jshint evil: true, strict: true */

'use strict';

import $ from 'jquery'; // for backwards compatibility

import _Framesg from 'framesg';
let Framesg = _Framesg;
if ('default' in Framesg) // this import is handled differently between browserify and vite
    Framesg = Framesg.default;

import Options from './options';
import OptionsView, { IOptionsViewModel } from './optionsview';
import ui from './layoutdef';
import Format from './format';
import { FormatDef, NumberFormat } from './formatdef';
import DefaultControls from './defaultcontrols';
import LayoutUpdateCheck from './layoutupdatecheck';
import View, { utils } from './actions';
import LayoutActionManager from './layoutactionmanager';
import AddonBox from './addonbox';
import AddonHost from './addonhost';
import { applyMagicEvents as ApplyMagicEvents, applyMagicEventsForCtrl as ApplyMagicEventsForCtrl } from './applymagicevents';
import interactionManager from '../common/interactionmanager';
import { h, rich }  from '../common/htmlelementcreator';

import I18ns, { I18n, I18nData } from "../common/i18n";
import HighContrast from '../common/highcontrast';

declare global {
    function s_(key: string, formats?: { [key: string]: (string|number); } | (string|number)[] | string, options?: { prefix: string; postfix: string; }): string;
    interface Window {
        s_: (key: string, formats?: { [key: string]: (string|number); } | (string|number)[] | string, options?: { prefix: string; postfix: string; }) => string;
    }
}

window.s_ = I18ns.get('app')._;

function ready(fn: () => void) {
    if (document.readyState !== 'loading')
        fn();
    else
        document.addEventListener('DOMContentLoaded', fn);
}

const frameCommsApi = {
    setOptionsDefinition: loadAnalysis,

    dataChanged: data => {
        if (analysis !== null && analysis.inError === false) {
            if (data.dataType === 'columns') {
                requestData('columns', null, true).then(columnInfo => {
                    dataResources = { columns: columnInfo.columns };
                    analysis.dataChanged(data);
                });
            }
            else
                analysis.dataChanged(data);
        }
    },

    initialiseOptions: setOptionsValues,

    setTitle: setTitle,

    updateOptions: updateOptions,

    updateSettings: settings => {
        if (analysis !== null && analysis.inError === false) {
            for (let settingName in settings) {
                let value = settings[settingName];
                if (settingName === 'decSymbol') {
                    FormatDef.number.setDecSymbol(value);
                }
            }
        }
    }
};

let parentFrame = new Framesg(window.parent, window.name, frameCommsApi);

let requestData = function(requestType: 'columns' | 'column', requestData, getRemote?: boolean) {
    let data = { requestType: requestType, requestData: requestData };
    if (getRemote)
        return parentFrame.send("requestData", data);
    else if (requestType === "columns") {
        return new Promise((resolve, reject) => {
            resolve(dataResources);
        });
    }
    else if (requestType === "column") {
        if (requestLocalColumnData(data) === false)
            return parentFrame.send("requestData", data);
        else
            return new Promise((resolve, reject) => { resolve(data); });
    }
    else
        return parentFrame.send("requestData", data);
};

let requestAction = function(requestType: 'createColumn' | 'selectFiles', requestData) {
    let data = { requestType: requestType, requestData: requestData };
    return parentFrame.send("requestAction", data);
};

let requestLocalColumnData = function(data) {
    var columns = dataResources.columns.concat(analysis.viewTemplate.customVariables);
    let found = false;
    let foundAll = true;
    for (let i = 0; i < columns.length; i++) {
        if ((data.requestData.columnId !== undefined && columns[i].id === data.requestData.columnId) ||
            (data.requestData.columnName !== undefined && columns[i].name === data.requestData.columnName)) {
            found = true;
            for (let p = 0; p < data.requestData.properties.length; p++) {
                let propertyName = data.requestData.properties[p];
                let value = columns[i][propertyName];
                if (value !== undefined)
                    data[propertyName] = columns[i][propertyName];
                else
                    foundAll = false;
            }
            break;
        }
    }

    data.columnFound = found;

    return found && foundAll;
};

let dataResources = { columns: [] };

document.oncontextmenu = function () { return false; };


// an addon to the analysis, whose options are shown in a collapse box of
// their own at the end of the analysis' options
export type AddonDef = {
    ns: string,
    name: string,
    title: string,
    moduleTitle: string,
    uijs: string,
    i18n: I18nData,
};

// an addon's options are carried in its parent's options, named so
const addonPrefix = (ns: string, name: string) => `addons/${ ns }/${ name }/`;

// an addon's events see each of its parent's options, read only, as
// ui.parent_<option>, and can handle parent_<option>_changed
const PARENT_PREFIX = 'parent_';

class ParentOptionResource {
    _source: any;
    events?: any[];

    constructor(source: any) {
        this._source = source;
    }

    value(key?: any) {
        return this._source.value(key);
    }

    getTrigger(property: string) {
        return this._source.getTrigger(property);
    }

    on(eventName: string, listener: (...args: any[]) => void) {
        this._source.on(eventName, listener);
        return this;
    }

    off(eventName: string, listener: (...args: any[]) => void) {
        this._source.off(eventName, listener);
        return this;
    }
}

// each addon's options are shown in a collapse box, titled with the addon's
// title, at the end of its parent's options, holding a host that the addon's
// view is rendered into
const addonBox = (addon: Analysis) => ({
    type: AddonBox,
    typeName: 'AddonBox',
    label: addon.addonDef!.title,
    addon: addon.addonDef!.ns,
    addonTitle: addon.addonDef!.moduleTitle,
    collapsed: true,
    stretchFactor: 1,
    controls: [{
        type: AddonHost,
        typeName: 'AddonHost',
        stretchFactor: 1,
        onCreated: (host: AddonHost) => { addon.host = host; },
    }],
});

// an addon may only use the variables its parent uses, so its variable
// suppliers must be populated (from its parent's options) by its events
const checkAddonLayout = function(ctrl: any, errors: string[]) {
    if (ctrl.typeName === 'VariableSupplier' && ctrl.populate !== 'manual')
        errors.push(`The 'VariableSupplier' control of an addon requires the property > populate: 'manual'. Option: ${ ctrl.name === undefined ? ctrl.typeName : ctrl.name }`);
    if (Array.isArray(ctrl.controls)) {
        for (let child of ctrl.controls)
            checkAddonLayout(child, errors);
    }
};

class Analysis {
    View: OptionsView;
    model: IOptionsViewModel;
    i18nData: I18nData;
    id: number;
    viewTemplate: View;
    inError: boolean;
    errors: string[];
    moduleI18n: I18n;
    // addons/<ns>/<name>/ for an addon, '' otherwise
    prefix = '';
    addonDef?: AddonDef;
    // for an addon, its place in its parent's options, see addonBox(). an
    // addon with no controls (only results) has none
    host?: AddonHost;
    hasControls = false;
    addons: Analysis[] = [];

    // an addon is passed its addon, an analysis its addons (already
    // constructed, as each needs a place in its layout)
    constructor(def: string, i18nDef: I18nData, jamoviVersion, id: number, addon?: AddonDef, addons: Analysis[] = [ ]) {

        this.id = id;

        this.i18nData = i18nDef;
        if (addon) {
            this.addonDef = addon;
            this.prefix = addonPrefix(addon.ns, addon.name);
            this.moduleI18n = I18ns.get(`module: ${id} ${this.prefix}`);
            if (i18nDef)
                this.moduleI18n.initialise(i18nDef?.code || 'en', i18nDef);
        }
        else {
            this.moduleI18n = I18ns.get(`module: ${id}`);
        }

        this.translate = this.translate.bind(this);
        window._ = this.translate.bind(this);
        window.n_ = this.translateN.bind(this);

        const createOptionsView = new Function('ui', 'DefaultControls', 'FormatDef', 'Format', 'View', 'utils', `
    return (function() {
        const module = {};
        const exports = {};
        let result = (function () {
            ${def}
            return typeof module.exports !== 'undefined' ? module.exports : window.module;
        })();
        return result;
    })();
    `);

        let optionsViewInfo = createOptionsView(ui, DefaultControls, FormatDef, Format, View, utils);

        let options = optionsViewInfo.options;
        let layoutDef = optionsViewInfo.view.layout;

        this.hasControls = (layoutDef.controls ?? [ ]).length > 0;

        this.addons = addons;
        for (let addon of addons) {
            if (addon.hasControls)
                layoutDef.controls.push(addonBox(addon));
        }

        if (optionsViewInfo.createView)
            this.viewTemplate = new optionsViewInfo.createView();
        else {
            // backwards compatible for v2.0 and v3.0
            this.viewTemplate = new View();
            optionsViewInfo.view.call(this.viewTemplate);
        }

        LayoutUpdateCheck(layoutDef);

        if (this.viewTemplate.handlers)
            ApplyMagicEvents(layoutDef, this.viewTemplate);

        if (addon)
            checkAddonLayout(layoutDef, this.viewTemplate.errors);

        this.getTitle = layoutDef.getTitle.bind(layoutDef);

        if (this.viewTemplate.errors.length > 0) {
            this.errors = this.viewTemplate.errors;
            this.inError = true;
            console.log(this.viewTemplate.errors);
        }
        else {
            this.inError = false;
            this.viewTemplate.setRequestedDataSource(this);

            this.viewTemplate.on("customVariablesChanged", (event) => {
                setTimeout(() => {
                    this.dataChanged(event);
                }, 0);
            });

            let actionManager = new LayoutActionManager(this.viewTemplate);
            let optionsManager = new Options(options, this.translate);
            actionManager.onExecutingStateChanged = function(state) {
                if (state)
                    optionsManager.beginEdit();
                else
                    optionsManager.endEdit();
            };

            this.model = { options: optionsManager, ui: layoutDef, actionManager: actionManager, currentStage: 0 };

            this.View = new OptionsView(this.model);
            this.View.$el = $(this.View.el);  // to maintain backwards compatibility with older modules.

            this.View.setRequestedDataSource(this);
            this.View.setI18nSource(this);
        }
    }

    requestData(requestId, data) {
        return requestData(requestId, data);
    }

    requestAction(requestType, data) {
        return requestAction(requestType, data);
    }

    dataChanged(data) {
        this.View.dataChanged(data);
        if (this.viewTemplate.onDataChanged)
            this.viewTemplate.onDataChanged(data);
        for (let addon of this.addons)
            addon.dataChanged(data);
    }

    renderIn(parent: Analysis) {
        // renders this addon into its place in its parent's options. the
        // parent must be rendered, so its options all have resources (see
        // attachParent()), and this addon's host exists. an addon with no
        // controls has no place, but is still rendered (so it's loaded)
        this.attachParent(parent);
        this.View.el.classList.add('addon-options-content');
        if (this.host)
            this.host.el!.append(this.View.el);
        this.View.render();
    }

    attachParent(parent: Analysis) {
        // makes the parent's options available to this addon's events, see
        // ParentOptionResource. this addon mustn't be rendered yet, so these
        // resources are connected to its events
        const actionManager = this.model.actionManager;
        for (let option of parent.model.options._list) {
            const source = parent.model.actionManager._resources[option.name];
            if (source === undefined)
                continue;
            const name = PARENT_PREFIX + option.name;
            const ctrlDef: any = { name: name, typeName: '_hiddenOption' };
            ApplyMagicEventsForCtrl(ctrlDef, this.viewTemplate);
            const resource = new ParentOptionResource(source);
            resource.events = ctrlDef.events;
            actionManager.addResource(name, resource as any);
        }
    }

    withAddons(): Analysis[] {
        return [ this, ...this.addons ];
    }

    isLoaded() {
        for (let analysis of this.withAddons()) {
            if (analysis.View.isLoaded() === false)
                return false;
        }
        return true;
    }

    // the analysis or addon an option belongs to, and its name there
    optionTarget(name: string): [ Analysis, string ] | null {
        if (name.startsWith('addons/')) {
            for (let addon of this.addons) {
                if (name.startsWith(addon.prefix))
                    return [ addon, name.substring(addon.prefix.length) ];
            }
            return null;
        }
        return [ this, name ];
    }

    runInEditScope(fn: () => void) {
        for (let analysis of this.withAddons())
            analysis.model.options.beginEdit();
        try {
            fn();
        }
        finally {
            for (let analysis of this.withAddons())
                analysis.model.options.endEdit();
        }
    }

    getTitle?(): string;

    translate(key: string, formats?: string | (string | number)[] | { [key: string]: string | number }, options?: { prefix: string, postfix: string }): string {
        if (key === null || key === undefined || key.trim() === '')
            return key;

        return this.moduleI18n._(key, formats, options);
    }

    translateN(key: string, plural: string, count: number, formats?: { [key: string]: (string|number), n?: (string|number) }): string {
        if (key === null || key === undefined || key.trim() === '')
            return key;

        return this.moduleI18n._n(key, plural, count, formats);
    }
};

let analysis: Analysis = null;

const highContrast = new HighContrast(document.body, document.body, () => {
    return document.body.querySelectorAll('.silky-variable-type-img, .jmv-toolbar-button-icon, .search > .image');
}, null, false);

ready(() => {

    if (navigator.platform === 'Win32')
        document.body.classList.add('windows');
    else if (navigator.platform === 'MacIntel')
        document.body.classList.add('mac');
    else if (navigator.platform.startsWith('Linux'))
        document.body.classList.add('linux');
    else
        document.body.classList.add('other');

    if (navigator.userAgent.toLowerCase().indexOf(' electron/') > -1)
        document.body.classList.add('electron');

    document.addEventListener('mousedown', mouseDown);
    document.addEventListener('mouseup', mouseUp);
    document.addEventListener('mousemove', mouseMove);

    parentFrame.send('frameDocumentReady', null);
});


function loadAnalysis(def, i18nDef: I18nData, appI18nDef: I18nData, jamoviVersion, id, focusMode, addonDefs?: AddonDef[]) {

    const header = document.querySelector<HTMLElement>('.silky-options-header');
    if (appI18nDef) {
        const appI18n = I18ns.get('app');
        appI18n.initialise(appI18nDef.locale_data.messages[''].lang, appI18nDef);

        const moduleI18n = I18ns.get(`module: ${id}`);
        if (i18nDef)
            moduleI18n.initialise(i18nDef?.code || 'en', i18nDef);

        //const moduleCode = i18nDef?.code || 'en';
        document.body.dir = moduleI18n.isRTL() ? 'rtl' : 'ltr';

        header.dir = appI18n.isRTL() ? 'rtl' : 'ltr';
    }

    window.jamoviVersion = jamoviVersion;

    let $hide = document.querySelector('.silky-sp-back-button');
    if (header.dir === 'rtl') {
        $hide.querySelector('span').classList.remove('mif-arrow-right');
        $hide.querySelector('span').classList.add('mif-arrow-left');
    }

    $hide.setAttribute('title', s_('Hide options'));
    $hide.addEventListener('click', () => {
        closeOptions();
    });

    let optionsBlock = document.getElementById('options-block');
    let loop = interactionManager.registerLoop(optionsBlock);
    interactionManager.on('focus', (event) => {
        loop.activate();
    });
    interactionManager.on('blur', (event) => {
        loop.deactivate({ source: 'programmatic' });
    });
    optionsBlock.addEventListener('focus', (event) => {
        loop.activate();
    });
    interactionManager.setMode(focusMode);
    
    loop.activate();

    let $optionsBlock = document.querySelector('.jmv-options-block');
    let $title = document.querySelector('.silky-options-title');
    if (def.error) {
        $title.replaceChildren(def.error);

        $optionsBlock.querySelectorAll('.placeholder-options')?.forEach(el => el.remove());
        let $moduleDetails = h('div', { class: 'module-error-details' },
            h('div', { class: 'top' },
                h('div', { class: 'image' }),
                h('h2', {}, `Module: ${def.data.moduleName} ${def.data.version}`)),
            h('div', { class: 'msg' }, rich(s_('This module is either <em>missing or incompatible</em> with this version of jamovi.'))),
            h('div', { class: 'msg' }, rich(s_('Please <em>install or update</em> this module from the jamovi library.'))),
            h('div', { class: 'list' },
                h('button', { class: 'find-module' }, s_('Find module in jamovi library'))));

        const $findButton = $moduleDetails.querySelector('.find-module');
        $findButton.addEventListener('click', (event) => {
            parentFrame.send('action', { type: 'findModule' });
        });
        $optionsBlock.append($moduleDetails);
    }
    else {
        return requestData('columns', null, true).then(data => {

            dataResources = { columns: data.columns };

            // the addons come first, so the analysis' translations are
            // left as the global ones
            let addons = [ ];
            for (let addonDef of addonDefs ?? [ ]) {
                let addon = loadAddon(addonDef, jamoviVersion, id);
                if (addon !== null)
                    addons.push(addon);
            }

            analysis = new Analysis(def, i18nDef, jamoviVersion, id, undefined, addons);

            let title = analysis.getTitle();
            $title.replaceChildren(title);

            if (analysis.errors) {
                let $list = h('div', { class: 'list' });
                for (let error of analysis.errors)
                    $list.append(h('div', { class: 'error' }, h('div', { class: 'error-icon' }), h('span', {}, error)));

                let $errorList = h('div', { class: 'jmv-options-error-list' },
                    h('div', { class: 'title' }, 'Option panel errors'),
                    $list);
                $optionsBlock.querySelectorAll('.placeholder-options')?.forEach(el => el.remove());
                $optionsBlock.append($errorList);
            }
            else {
                $optionsBlock.append(analysis.View.el);
                analysis.View.render();

                for (let addon of analysis.addons)
                    addon.renderIn(analysis);
                addAddonsTag(analysis);

                $optionsBlock.querySelectorAll('.placeholder-options')?.forEach(el => el.remove());

                for (let target of analysis.withAddons())
                    target.model.options.on('options.valuesForServer', e => onValuesForServerChanges(e, target.prefix));
            }
        });
    }
}

function loadAddon(addonDef: AddonDef, jamoviVersion: string, id: number): Analysis | null {
    // an addon which can't be loaded is left out, rather than taking its
    // parent with it
    let addon: Analysis;
    try {
        addon = new Analysis(addonDef.uijs, addonDef.i18n, jamoviVersion, id, addonDef);
    }
    catch (e) {
        console.log(`Could not load addon ${ addonDef.ns }::${ addonDef.name }`, e);
        return null;
    }

    if (addon.inError) {
        console.log(`Could not load addon ${ addonDef.ns }::${ addonDef.name }`, addon.errors);
        return null;
    }

    return addon;
}

// an analysis with addons has an 'addons' tag under its title, which lists
// them; choosing one opens its box, and scrolls to it
let $addonsTag: HTMLElement | null = null;

function addAddonsTag(analysis: Analysis) {
    if (analysis.addons.length === 0)
        return;

    let $tag = h('button', { class: 'jmv-options-addons-tag', 'aria-haspopup': 'menu', 'aria-expanded': 'false' },
        h('span', { class: 'jmv-options-addons-tag-tick', 'aria-hidden': 'true' }),
        s_('Addons'),
        h('span', { class: 'jmv-options-addons-tag-arrow', 'aria-hidden': 'true' }));
    let $list = h('div', { class: 'jmv-options-addons-list', role: 'menu', hidden: 'true' });

    const close = () => {
        $list.hidden = true;
        $tag.setAttribute('aria-expanded', 'false');
        document.removeEventListener('pointerdown', closeOutside, true);
    };
    const closeOutside = (event: PointerEvent) => {
        if ( ! $tag.contains(event.target as Node) && ! $list.contains(event.target as Node))
            close();
    };

    for (let addon of analysis.addons) {
        let $item = h('button', { class: 'jmv-options-addons-item', role: 'menuitem' },
            h('span', { class: 'jmv-options-addons-item-title' }, addon.addonDef!.title),
            h('span', { class: 'jmv-options-addons-item-module' }, addon.addonDef!.ns));
        $list.append($item);
        // an addon with no options (only results) has no box to go to
        if ( ! addon.host) {
            $item.setAttribute('aria-disabled', 'true');
            $item.title = s_('This addon has no options');
            continue;
        }
        $item.addEventListener('click', () => {
            close();
            let $box = addon.host?.el?.closest('.jmv-addon-collapse-view');
            let $boxHeader = $box?.querySelector<HTMLElement>('.silky-options-collapse-button');
            if ( ! $box || ! $boxHeader)
                return;
            if ($boxHeader.getAttribute('aria-expanded') === 'false')
                $boxHeader.click();
            $box.scrollIntoView({ behavior: 'smooth', block: 'start' });
            $boxHeader.focus({ preventScroll: true });
        });
    }

    $tag.addEventListener('click', () => {
        if ( ! $list.hidden) {
            close();
            return;
        }
        $list.hidden = false;
        $tag.setAttribute('aria-expanded', 'true');
        document.addEventListener('pointerdown', closeOutside, true);
        $list.querySelector<HTMLElement>('button')?.focus();
    });
    $list.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
            event.stopPropagation();
            close();
            $tag.focus();
        }
    });

    $addonsTag = h('div', { class: 'jmv-options-addons' }, $tag, $list);
    placeAddonsTag();
}

function placeAddonsTag() {
    // under the title, after the analysis' name when the title's been edited
    if ($addonsTag === null)
        return;
    let $title = document.querySelector('.silky-options-title')!;
    let $subTitle = $title.querySelector('.sub-title');
    if ($subTitle)
        $subTitle.append($addonsTag);
    else
        $title.append($addonsTag);
}

function setTitle(title) {
    if (analysis.inError)
        return;

    let $title = document.querySelector('.silky-options-title');
    $title.replaceChildren();

    let original = analysis.getTitle();
    if (title === null || title.trim() === '')
        title = original;


    $title.append(title);
    if (title !== original)
        $title.append(h('div', { class: 'sub-title' }, original));
    placeAddonsTag();
}

function updateOptions(values) {
    if (! analysis || analysis.inError)
        return;
    
    if (analysis.isLoaded() === false) {
        setTimeout(() => {
            updateOptions(values);
        }, 0);
        return;
    }

    analysis.runInEditScope(() => {
        let params = Options.getDefaultEventParams("changed");
        params.externalEvent = true;
        for (let key in values) {
            let value = values[key];
            if (key === 'results//heading') {
                setTitle(value);
                continue;
            }
            let target = analysis.optionTarget(key);
            if (target !== null) {
                let [ owner, name ] = target;
                owner.model.options.setOptionValue(name, value, params);
            }
        }
    });
}

function setOptionsValues(data, editType) {
    editType = editType || 'absolute';

    if (analysis.inError)
        return;
    
    if (analysis.isLoaded() === false) {
        setTimeout(() => {
            setOptionsValues(data, editType);
        }, 0);
        return;
    }

    analysis.id = data.id;
    let titleSet = false;
    analysis.runInEditScope(() => {
        if (analysis.View.beginDataInitialization(data.id)) {
            for (let addon of analysis.addons)
                addon.View.beginDataInitialization(data.id);

            let params = Options.getDefaultEventParams("changed");
            params.silent = true;
            for (let key in data.options) {
                let value = data.options[key];
                if (key === 'results//heading') {
                    setTitle(value);
                    titleSet = true;
                    continue;
                }
                let target = analysis.optionTarget(key);
                if (target !== null) {
                    let [ owner, name ] = target;
                    owner.model.options.setOptionValue(name, value, params);
                }
            }
            if (editType === 'absolute') {
                for (let owner of analysis.withAddons()) {
                    for (let op of owner.model.options._list) {
                        if (data.options === null || (owner.prefix + op.name in data.options) === false)
                            owner.model.options.setOptionValue(op.name, null, params);
                    }
                }
            }
            if (titleSet === false)
                setTitle('');

            // the analysis first, so its addons are updated from its values
            analysis.View.endDataInitialization(data.id);
            for (let addon of analysis.addons)
                addon.View.endDataInitialization(data.id);
        }
    });

    parentFrame.send("optionsViewReady", true);
}

function onValuesForServerChanges(e, prefix: string) {

    let compiledList = { values: { }, properties: { } };

    for (let name in e.map) {
        let value = e.map[name];
        let key = prefix + name;
        if (value.events.length > 0) {
            compiledList.values[key] = value.option.getValue();
            let props = value.option.getOverriddenProperties();
            if (props !== null) {
                let properties = [ ];
                for (let name in props) {
                    let pData = props[name];
                    properties.push( { name: pData.key[pData.key.length - 1], key: pData.key.slice(0, pData.key.length - 1), value: pData.value } );
                }
                compiledList.properties[key] = properties;
            }
        }
        else if (value.properties.length > 0) {
            let properties = [ ];
            for (let pData of value.properties)
                properties.push( { name: pData.keys[pData.keys.length - 1], key: pData.keys.slice(0, pData.keys.length - 1), value: pData.value[0] } );
            compiledList.properties[key] = properties;
        }
    }

    parentFrame.send("onOptionsChanged", compiledList);
}


function mouseUp(event) {
    var data = {
        eventName: "mouseup",
        which: event.which,
        pageX: event.pageX,
        pageY: event.pageY,
        detail: event.detail
    };

    parentFrame.send("onFrameMouseEvent", data);
}

function mouseMove(event) {
    var data = {
        eventName: "mousemove",
        which: event.which,
        pageX: event.pageX,
        pageY: event.pageY,
        detail: event.detail
    };

    parentFrame.send("onFrameMouseEvent", data);
}

function mouseDown(event) {
    var data = {
        eventName: "mousedown",
        which: event.which,
        pageX: event.pageX,
        pageY: event.pageY,
        detail: event.detail
    };

    parentFrame.send("onFrameMouseEvent", data);
}

function closeOptions() {
    interactionManager.setMode('default');
    parentFrame.send("hideOptions", null);
}
