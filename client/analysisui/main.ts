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
import { applyMagicEvents as ApplyMagicEvents } from './applymagicevents';
import Keyboard from '../common/focusloop';
import { HTMLElementCreator as HTML }  from '../common/htmlelementcreator';

import I18ns, { I18n, I18nData } from "../common/i18n";
import HighContrast from '../common/highcontrast';

declare global {
    function s_(key: string, formats?: { [key: string]: (string|number); } | (string|number)[], options?: { prefix: string; postfix: string; }): string;
    interface Window {
        s_: (key: string, formats?: { [key: string]: (string|number); } | (string|number)[], options?: { prefix: string; postfix: string; }) => string;
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

let requestAction = function(requestType: 'createColumn', requestData) {
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


class Analysis {
    View: OptionsView;
    model: IOptionsViewModel;
    i18nData: I18nData;
    id: number;
    viewTemplate: View;
    inError: boolean;
    errors: string[];
    moduleI18n: I18n;

    constructor(def: string, i18nDef: I18nData, jamoviVersion, id: number) {

        this.id = id;

        this.i18nData = i18nDef;
        this.moduleI18n = I18ns.get(`module: ${id}`)

        this.translate = this.translate.bind(this);
        window._ = this.translate.bind(this);

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
    }

    getTitle?(): string;

    translate(key: string, formats?: (string | number)[] | { [key: string]: string | number; }, options?: { prefix: string; postfix: string; }): string {
        if (key === null || key === undefined || key.trim() === '')
            return key;

        return this.moduleI18n._(key, formats, options);
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


function loadAnalysis(def, i18nDef: I18nData, appI18nDef: I18nData, jamoviVersion, id, focusMode) {

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
    let focusToken = Keyboard.addFocusLoop(optionsBlock);
    //focusToken.on('focusleave', closeOptions);
    Keyboard.on('focus', (event) => {
        Keyboard.enterFocusLoop(optionsBlock);
    });
    Keyboard.on('blur', (event) => {
        Keyboard.leaveFocusLoop(optionsBlock);
    });
    optionsBlock.addEventListener('focus', (event) => {
        Keyboard.enterFocusLoop(optionsBlock);
    });
    Keyboard.setFocusMode(focusMode);
    
    Keyboard.enterFocusLoop(optionsBlock);

    let $optionsBlock = document.querySelector('.jmv-options-block');
    let $title = document.querySelector('.silky-options-title');
    if (def.error) {
        $title.innerHTML = '';
        $title.append(def.error);
    }
    else {
        return requestData('columns', null, true).then(data => {

            dataResources = { columns: data.columns };

            analysis = new Analysis(def, i18nDef, jamoviVersion, id);

            let title = analysis.getTitle();
            $title.innerHTML = '';
            $title.append(title);

            if (analysis.errors) {
                let errors = ``;
                for (let error of analysis.errors) {
                    errors += `<div class="error"><div class="error-icon"></div><span>${ error }<span></div>\n`;
                }
                let $errorList = HTML.parse(`<div class="jmv-options-error-list"'>
                    <div class="title">Option panel errors</div>
                    <div class="list">
                        ${ errors }
                    </div>
                    </div>`);
                $optionsBlock.querySelectorAll('.placeholder-options')?.forEach(el => el.remove());
                $optionsBlock.append($errorList);
            }
            else {
                $optionsBlock.append(analysis.View.el);
                analysis.View.render();

                if (analysis.View.runActionButton)
                    $hide.before(analysis.View.runActionButton.el);
                
                $optionsBlock.querySelectorAll('.placeholder-options')?.forEach(el => el.remove());

                analysis.model.options.on('options.valuesForServer', onValuesForServerChanges);
            }
        });
    }
}

function setTitle(title) {
    if (analysis.inError)
        return;

    let $title = document.querySelector('.silky-options-title');
    $title.innerHTML = '';

    let original = analysis.getTitle();
    if (title === null || title.trim() === '')
        title = original;


    $title.append(title);
    if (title !== original)
        $title.append(HTML.parse(`<div class="sub-title">${ original }</div>`));
}

function updateOptions(values) {
    if (! analysis || analysis.inError)
        return;
    
    if (analysis.View.isLoaded() === false) {
        setTimeout(() => {
            updateOptions(values);
        }, 0);
        return;
    }

    let model = analysis.model;
    model.options.runInEditScope(() => {
        let params = Options.getDefaultEventParams("changed");
        params.externalEvent = true;
        for (let key in values) {
            let value = values[key];
            if (key === 'results//heading')
                setTitle(value);
            else
                model.options.setOptionValue(key, value, params);
        }
    });
}

function setOptionsValues(data, editType) {
    editType = editType || 'absolute';

    if (analysis.inError)
        return;
    
    if (analysis.View.isLoaded() === false) {
        setTimeout(() => {
            setOptionsValues(data, editType);
        }, 0);
        return;
    }

    analysis.id = data.id;
    let titleSet = false;
    let model = analysis.model;
    model.options.runInEditScope(() => {
        if (analysis.View.beginDataInitialization(data.id)) {
            let params = Options.getDefaultEventParams("changed");
            params.silent = true;
            for (let key in data.options) {
                let value = data.options[key];
                if (key === 'results//heading') {
                    setTitle(value);
                    titleSet = true;
                }
                else
                    model.options.setOptionValue(key, value, params);
            }
            if (editType === 'absolute') {
                for (let op of model.options._list) {
                    if (data.options === null || (op.name in data.options) === false)
                        model.options.setOptionValue(op.name, null, params);
                }
            }
            if (titleSet === false)
                setTitle('');
            analysis.View.endDataInitialization(data.id);
        }
    });

    parentFrame.send("optionsViewReady", true);
}

function onValuesForServerChanges(e) {

    let compiledList = { values: { }, properties: { } };

    for (let key in e.map) {
        let value = e.map[key];
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
    Keyboard.setFocusMode('default');
    parentFrame.send("hideOptions", null);
}
