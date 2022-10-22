/* jshint evil: true, strict: true */

'use strict';

const $ = require('jquery');
const Backbone = require('backbone');
const Framesg = require('framesg').default;
Backbone.$ = $;

const Options = require('./options');
const OptionsView = require('./optionsview');
const ui = require('./layoutdef');
const Format = require('./format.js');
const FormatDef = require('./formatdef');
const DefaultControls = require('./defaultcontrols');
const LayoutUpdateCheck = require('./layoutupdatecheck');
const View = require('./actions');
const GridTargetControl = require('./gridtargetcontrol');
const GridControl = require('./gridcontrol');
const OptionControl = require('./optioncontrol');
const GridOptionControl = require('./gridoptioncontrol');
const LayoutActionManager = require('./layoutactionmanager');
const RequestDataSupport = require('./requestdatasupport');
const GridOptionListControl = require('./gridoptionlistcontrol');
const ApplyMagicEvents = require('./applymagicevents');
const focusLoop = require('../common/focusloop');

const I18n = require("../common/i18n");

window.s_ = I18n._;

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

    setTitle: setTitle
};

let parentFrame = new Framesg(window.parent, window.name, frameCommsApi);

let requestData = function(requestType, requestData, getRemote) {
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

let requestAction = function(requestType, requestData) {
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

const Analysis = function(def, i18nDef, jamoviVersion, id) {

    this.id = id;

    this.i18n = i18nDef;
    this.translate = (key) => {
        if (key === null || key === undefined || key.trim() === '' || ! this.i18n)
            return key;

        let value = this.i18n.locale_data.messages[key.trim()];
        if (value === null || value === undefined || value[0] === '')
            return key;
        else
            return value[0];
    };
    window._ = this.translate.bind(this);

    eval(def);

    let options = module.exports.options;

    let layoutDef = new module.exports.view.layout();
    this.viewTemplate = new module.exports.view();

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

        this.View.setRequestedDataSource(this);
        this.View.setI18nSource(this);

        this.requestData = function(requestId, data) {
            return requestData(requestId, data);
        };

        this.requestAction = function(requestType, data) {
            return requestAction(requestType, data);
        };

        this.dataChanged = function(data) {
            this.View.dataChanged(data);
            if (this.viewTemplate.onDataChanged)
                this.viewTemplate.onDataChanged(data);
        };


    }
};

let analysis = null;
let _analysisResources = null;
let $header = null;
let $hide = null;



$(document).ready(function() {

    if (navigator.platform === 'Win32')
        $('body').addClass('windows');
    else if (navigator.platform === 'MacIntel')
        $('body').addClass('mac');
    else if (navigator.platform.startsWith('Linux'))
        $('body').addClass('linux');
    else
        $('body').addClass('other');

    if (navigator.userAgent.toLowerCase().indexOf(' electron/') > -1)
        $('body').addClass('electron');

    $(document).mousedown(this, mouseDown);
    $(document).mouseup(this, mouseUp);
    $(document).mousemove(this, mouseMove);

    parentFrame.send('frameDocumentReady', null);
});


function loadAnalysis(def, i18nDef, appI18nDef, jamoviVersion, id, focusMode) {

    if (appI18nDef)
        I18n.initialise(appI18nDef.locale_data.messages[''].lang, appI18nDef);

    window.jamoviVersion = jamoviVersion;

    let $hide = $('.silky-sp-back-button');
    $hide.attr('title', s_('Hide options'));
    $hide.on('click', function(event) {
        closeOptions();
    });

    let focusToken = focusLoop.addFocusLoop(document.body);
    focusToken.on('focusleave', closeOptions);
    focusLoop.on('focus', (event) => {
        if (focusLoop.inAccessibilityMode()) {
            focusLoop.enterFocusLoop(document.body, { withMouse: false });
        }
    });
    focusLoop.setFocusMode(focusMode);
    if (focusLoop.inAccessibilityMode())
        focusLoop.enterFocusLoop(document.body, { withMouse: false });

    let $title = $('.silky-options-title');
    if (def.error) {
        $title.empty();
        $title.append(def.error);
    }
    else {
        return requestData('columns', null, true).then(data => {

            dataResources = { columns: data.columns };

            analysis = new Analysis(def, i18nDef, jamoviVersion, id);

            let title = analysis.getTitle();
            $title.empty();
            $title.append(title);

            if (analysis.errors) {
                let errors = ``;
                for (let error of analysis.errors) {
                    errors += `<div class="error"><div class="error-icon"></div><span>${ error }<span></div>\n`;
                }
                let $errorList = $(`<div class="jmv-options-error-list"'>
                    <div class="title">Option panel errors</div>
                    <div class="list">
                        ${ errors }
                    </div>
                    </div>`);
                $('.jmv-options-block').append($errorList);
            }
            else {
                $('.jmv-options-block').append(analysis.View.$el);
                analysis.View.render();

                analysis.model.options.on('options.valuesForServer', onValuesForServerChanges);
            }
        });
    }
}

function setTitle(title) {
    if (analysis.inError)
        return;

    let $title = $('.silky-options-title');
    $title.empty();

    let original = analysis.getTitle();
    if (title === null || title.trim() === '')
        title = original;

    if (title !== original)
        title = `${ title }<div class="sub-title">${ original }</div>`;
    $title.append(title);
}

function setOptionsValues(data) {
    if (analysis.inError)
        return;

    if (analysis.View.isLoaded() === false) {
        setTimeout(() => {
            setOptionsValues(data);
        }, 0);
        return;
    }

    analysis.id = data.id;
    let titleSet = false;
    let model = analysis.model;
    model.options.beginEdit();
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
        if (titleSet === false)
            setTitle('');
        analysis.View.endDataInitialization(data.id);
    }
    model.options.endEdit();
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
    focusLoop.setFocusMode('default');
    parentFrame.send("hideOptions", null);
}
