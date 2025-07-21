'use strict';

import $ from 'jquery';

import host from './host';

import * as auth from './auth/auth';

import Coms from './coms';
let coms = new Coms();

import Selection from './selection';
import ViewController from './viewcontroller';
import TableView from './tableview';
import VariablesView from './variablesview';
import ResultsView from './results';
import SplitPanel from './splitpanel';
import { BackstageModel, BackstageView as Backstage} from './backstage';
import { RibbonModel, RibbonView as Ribbon, TabTypes } from './ribbon';
import Notifications from './notifications';
import SplitPanelSection from './splitpanelsection';
import OptionsPanel from './optionspanel';
import VariableEditor from './variableeditor';
import ActionHub from './actionhub';
import I18n from '../common/i18n';

import Instance from './instance';
import Notify from './notification';
import _focusLoop from '../common/focusloop';
import { UserFacingError } from './errors';
import Keyboard from '../common/focusloop';

import './utils/headeralert';

import lobby, { hasLobby } from './extras/lobby';
import { InstanceOpenStream } from './instance';
import { IInstanceOpenOptions } from './instance';
import { IInstanceOpenResult } from './instance';
import { IShowDialogOptions } from './host';

import './infobox';

import keyboardJS  from 'keyboardjs';


window._ = I18n._;
window.n_ = I18n._n;
window.A11y = Keyboard;


(async function() {

try {
    let baseUrl = '../i18n/';

    let response = await fetch(baseUrl);
    if ( ! response.ok)
        throw new Error('Unable to fetch i18n manifest');

    let languages = await response.json();
    I18n.setAvailableLanguages(languages.available);
    let current = languages.current;
    if ( ! current) {
        let options = {};
        if (host.isElectron)
            // prevent the use of in-dev languages as 'system default' in electron
            options.excludeDev = true;
        current = I18n.findBestMatchingLanguage(I18n.systemLanguage(), languages.available, options);
    }
    if ( ! current)
        current = 'en';

    response = await fetch(`${ baseUrl }${ current }.json`);
    if ( ! response.ok)
        throw new Error(`Unable to fetch json for language '${ current }'`);

    try {
        let def = await response.json();
        I18n.initialise(current, def);
        document.documentElement.setAttribute('lang', current);
        host.setLanguage(current);
    }
    catch (e) {
        throw new Error(`Unable to load json for language '${ current }'`);
    }
}
catch (e) {
    console.log(e);
}




keyboardJS.Keyboard.prototype.pause = function(key) {
    if (this._pausedCounts === undefined)
        this._pausedCounts = { };

    this._pausedCounts[key] = true;

    let count = false;
    for (let name in this._pausedCounts) {
        count = this._pausedCounts[name];
        if (count)
            break;
    }

    if (count === true && this._paused === false) {
        if (this._paused) { return; }
        if (this._locale) { this.releaseAllKeys(); }
        this._paused = true;
    }
};

keyboardJS.Keyboard.prototype.resume = function(key) {
    if (this._pausedCounts === undefined)
        this._pausedCounts = { };

    this._pausedCounts[key] = false;

    let count = false;
    for (let name in this._pausedCounts) {
        count = this._pausedCounts[name];
        if (count)
            break;
    }

    if (count === false && this._paused === true) {
        this._paused = false;
        if (keyboardJS.onUnpaused) {
            keyboardJS.onUnpaused();
        }
    }
};

const instance = new Instance(coms);

let dataSetModel = instance.dataSetModel();
let analyses = instance.analyses();

let backstageModel = new BackstageModel(instance);
let ribbonModel = new RibbonModel(instance.modules(), instance.settings());

// this is passing over a context boundary, so can't pass complex objects
host.setDialogProvider({ showDialog: (op:string, options: IShowDialogOptions) => backstageModel.showDialog(op, options) });

let infoBox = document.createElement('jmv-infobox');
    infoBox.style.display = 'none';
    infoBox.setAttribute('id', 'infobox');

coms.on('failure', (event) => {
    if (host.isElectron) {
        infoBox.setup({
            title: _('Connection lost'),
            message: _('An unexpected error has occured, and jamovi must now close.'),
            status: 'terminated',
        });
    }
    else {
        infoBox.setup({
            title: _('Connection lost'),
            message: _('Your connection has been lost. Please refresh the page to continue.'),
            status: 'disconnected',
        });
    }
    infoBox.style.display = null;
});

coms.on('broadcast', (message) => {

    if (message.instanceId === '' &&
        message.payloadType === '' &&
        message.status === coms.Messages.Status.ERROR) {

        let error = message.error;
        infoBox.setup({
            title: 'Server message',
            message: `${ error.message }\n\n${ error.cause }\n\nSee www.jamovi.org/troubleshooting.html for more information.`,
            status: 'terminated',
        });
        infoBox.style.display = null;
    }
});

if (window.navigator.platform === 'MacIntel') {
    host.constructMenu([
        {
            label: 'jamovi',
            submenu: [
                { role: 'about' },
                { type: 'separator' },
                { role: 'quit' },
            ]
        },
        {
            label: _('File'),
            submenu: [
                { role: 'close' },
            ]
        },
        {
            label: _('Edit'),
            submenu: [
                { role: 'cut' },
                { role: 'copy' },
                { role: 'paste' },
                { role: 'selectAll' },
            ]
        },
    ]);
}

// prevent back navigation
history.pushState(null, null, document.URL);
window.addEventListener('popstate', function () {
    history.pushState(null, null, document.URL);
});


$(document).ready(async() => {
    //window.$body = $('body');
    if (navigator.platform === 'Win32')
        document.body.classList.add('windows');
    else if (navigator.platform == 'MacIntel')
        document.body.classList.add('mac');
    else
        document.body.classList.add('other');

    if (host.isElectron)
        document.body.classList.add('electron');


    Keyboard.addKeyboardListener('F10', () => host.toggleDevTools(), 'Toggle Developer Tools', false);
    Keyboard.addKeyboardListener('F9',  () => instance.restartEngines(), 'Restart jamovi engines', false);
    Keyboard.addKeyboardListener('Ctrl+KeyS', () => ActionHub.get('save').do(), _('Save project'));
    Keyboard.addKeyboardListener('Ctrl+KeyO', () => ActionHub.get('open').do(), _('Open data file'));
    Keyboard.addKeyboardListener('Escape', () => {
        if (splitPanel.getSection(0).width < 100 && Keyboard.focusMode === 'default')
            optionspanel.hideOptions();
    }, _('Hide analysis options'));
    Keyboard.addKeyboardListener('Alt+KeyS', () => { // navigate to spreadsheet
        optionspanel.hideOptions();
        ribbonModel.set('selectedTab', 'data');
        Keyboard.setFocusMode('default');
    }, _('Focus on spreadsheet'));
    Keyboard.addKeyboardListener('Alt+KeyD', () => { // navigate to variables view
        optionspanel.hideOptions();
        ribbonModel.set('selectedTab', 'variables');
        Keyboard.setFocusMode('default');
    }, _('Focus on variable list'));
    Keyboard.addKeyboardListener('Alt+KeyF', () => { // navigate to file menu
        Keyboard.setFocusMode('keyboard');
        optionspanel.hideOptions();
        ribbon.openFileMenu(false);
    }, _('Open the main menu'));
    Keyboard.addKeyboardListener('F3', () => { // toggle variable setup
        viewController._toggleVariableEditor();
    }, _('Toggle variable setup'));
    Keyboard.addKeyboardListener('Alt+KeyE', () => { // navigate to variable setup
        Keyboard.setFocusMode('keyboard');
        optionspanel.hideOptions();
        viewController.showVariableEditor();
        editor.setFocus();
    }, _('Focus on the variable setup'));
    Keyboard.addKeyboardListener('Alt+KeyM', () => { // navigate to Application menu
        Keyboard.setFocusMode('keyboard');
        ribbon.appMenu.toggleMenu(false);
    }, _('Open application menu'));
    Keyboard.addKeyboardListener('Alt+KeyL', () => { // navigate to Modules library
        Keyboard.setFocusMode('keyboard');
        ribbonModel.getTab('analyses').store.show(1);
    }, _('Open the jamovi module library'));
    Keyboard.addKeyboardListener('Alt+ArrowLeft', () => { // navigate to Options panel
        let iframe = document.querySelector(`.results-loop-highlighted-item > iframe`);
        if (iframe) {
            let id = parseInt(iframe.getAttribute('data-id'));
            let analysis = instance.analyses().get(id);
            if (analysis) {
                Keyboard.setFocusMode('keyboard');
                resultsView.hideWelcome();
                instance.set('selectedAnalysis', analysis);
                if (analysis.hasUserOptions())
                    optionspanel.setFocus();
                else
                    resultsView.selectedView.setFocus();
            }
        }
    }, _('Returns to the previously selected analysis and opens the options panel, with focus set in the options panel.'));
    Keyboard.addKeyboardListener('Alt+ArrowRight', () => { // navigate to results panel
        resultsView.hideWelcome();
        Keyboard.setFocusMode('keyboard');
        resultsView.selectedView.setFocus();
    }, _('Returns to the previously selected analysis and shifts focus to the results output.'));
    Keyboard.addKeyboardListener('Alt+ArrowDown', () => { // navigate to analysis content
        let iframe = document.querySelector<HTMLIFrameElement>(`.results-loop-highlighted-item > iframe`);
        if (iframe) {
            resultsView.hideWelcome();
            Keyboard.setFocusMode('keyboard');
            iframe.focus();
            setTimeout(() => { // needed for firefox cross iframe focus
                iframe.contentWindow.focus();
            }, 100);
        }
    }, _('Returns to the previously selected analysis and shifts focus into the results output.'));
    Keyboard.addKeyboardListener('Alt+ArrowUp', () => { // navigate to results panel
            resultsView.hideWelcome();
            Keyboard.setFocusMode('keyboard');
            resultsView.selectedView.setFocus();
    }, _('Returns to the previously selected analysis and shifts focus to the results output.'));


    if (host.isElectron)
        Keyboard.addKeyboardListener('Ctrl+F4', () => host.closeWindow(), _('Close jamovi window'));

    Keyboard.on('focus', (event) => {
        setTimeout(() => {
            if (document.activeElement === null || document.activeElement === document.body || document.activeElement === document.documentElement) { // has no focus
                if (Keyboard.inAccessibilityMode())
                    ribbonModel.getSelectedTab().el.focus();
                else 
                    Keyboard.setFocusMode('default');
            }
        }, 0);
    });

    Keyboard.on('focusModeChanged', (options) => {
        if (Keyboard.inAccessibilityMode()) {
            keyboardJS.pause('accessibility');
            if (Keyboard.focusMode === 'shortcuts') {
                if (backstageModel.get('activated')) {
                    Keyboard.updateShortcuts({ shortcutPath: 'F' });
                    setTimeout(() => {
                        Keyboard.enterFocusLoop(backstage, { withMouse: true });
                    }, 100);
                }
                else
                    ribbonModel.getSelectedTab().el.focus();
            }
        }
        else if (Keyboard.focusMode === 'default') {

            if (backstageModel.get('activated')) {
                setTimeout(() => {
                    Keyboard.enterFocusLoop(backstage);
                }, 100);

            }
            else {
                keyboardJS.resume('accessibility');
                let element = document.querySelector<HTMLElement>('temp-focus-cell');
                if (element)
                    element.focus();
            }
        }
        else if (Keyboard.focusMode === 'keyboard' || Keyboard.focusMode === 'hover')
            keyboardJS.pause('accessibility');

    });


    if (host.isElectron && navigator.platform === 'Win32') {

        $('#close-button').on('click', event => host.closeWindow());
        $('#min-button').on('click', event => host.minimizeWindow());
        $('#max-button').on('click', event => host.maximizeWindow());
    }

    document.oncontextmenu = function() { return false; };

    // note: in linux, as of electron 1.7.9, the drop event is never fired,
    // so we handle the navigate event in the electron app
    document.ondragover = (event) => {
        event.dataTransfer.dropEffect = 'copy';
        event.preventDefault();
    };
    document.ondrop = (event) => {
        for (let file of event.dataTransfer.files)
            backstageModel.requestOpen({ path: file.path, title: file.name });
        event.preventDefault();
    };

    let ribbon = new Ribbon(ribbonModel);
    document.querySelector<HTMLElement>('.silky-ribbon').append(ribbon);
    //const backstageElement = document.querySelector('#backstage');
    let backstage = new Backstage(backstageModel);
    backstage.setAttribute('id', 'backstage');
    backstage.setAttribute('role', "menu");
    backstage.setAttribute('aria-label', "File");
    backstage.setAttribute('aria-orientation', "vertical");
    document.body.prepend(backstage);

    ribbon.model.on('analysisSelected', async function(analysis) {
        const translate = await instance.modules().getTranslator(analysis.ns);
        const defn = {
            name: analysis.name,
            ns: analysis.ns,
            title: translate(analysis.title),
            index: analysis.index,
            onlyOne: analysis.onlyOne,
        };
        instance.createAnalysis(defn);
    });

    let mainTableMode = 'spreadsheet';

    let setMainTableMode = function(mode) {
        document.body.setAttribute('data-table-mode', mode);
        mainTableMode = mode;
        viewController.focusView(mode);
    };

    ribbon.addEventListener('tabSelected', function(event: CustomEvent<{tabName: keyof TabTypes, withMouse: boolean}>) {
        let {tabName, withMouse} = event.detail
        if (tabName === 'file')
            backstage.activate(withMouse);
        else if (tabName === 'data') {
            setMainTableMode('spreadsheet');
            if (splitPanel.mode === 'results')
                splitPanel.setMode('data', true);
            optionspanel.hideOptions();
        }
        else if (tabName === 'variables') {
            setMainTableMode('variables');
            if (splitPanel.mode === 'results')
                splitPanel.setMode('data', true);
            optionspanel.hideOptions();
        }
        else if (tabName === 'analyses') {
            dataSetModel.set('editingVar', null);
            if (splitPanel.mode === 'data')
                splitPanel.setMode('results', true);
        }
        else if (tabName === 'plots') {
            dataSetModel.set('editingVar', null);
            if (splitPanel.mode === 'data')
                splitPanel.setMode('results', true);
        }
        else if (tabName === 'annotation') {
            resultsView.hideWelcome();
            if (splitPanel.mode === 'data')
                splitPanel.setMode('results', true);
        }
        if (instance.get('editState') && tabName !== 'annotation')
            _annotationReturnTab = null;

        instance.set('editState', tabName === 'annotation');
    });

    let halfWindowWidth = 585 + SplitPanelSection.sepWidth;
    let optionsFixedWidth = 585;
    let splitPanel  = new SplitPanel({el : '#main-view'});

    splitPanel.$el.on('mode-changed', () => {
        document.body.setAttribute('data-splitpanel-mode', splitPanel.mode);
        switch (splitPanel.mode) {
            case 'results':
                //TODO: Needs to accomodate plots
                let tab = ribbonModel.get('selectedTab');
                if (tab !== 'annotation')
                    ribbonModel.set('selectedTab', 'analyses');
                break;
            case 'data':
                if (mainTableMode === 'spreadsheet')
                    ribbonModel.set('selectedTab', 'data');
                else
                    ribbonModel.set('selectedTab', 'variables');
                break;
        }
    });

    ribbon.addEventListener('toggle-screen-state', () => {
        if (forcedFullScreen)
            return;

        let tab = ribbonModel.get('selectedTab');
        if (splitPanel.mode === 'mixed') {
            switch (tab) {
                case 'variables':
                case 'data':
                    splitPanel.setMode('data');
                    break;
                case 'plots':
                case 'analyses':
                case 'annotation':
                    splitPanel.setMode('results');
                    break;

            }
        }
        else
            splitPanel.setMode('mixed');
    });

    splitPanel.addPanel('main-table', { adjustable: true, fixed: false, anchor: 'left' });
    splitPanel.addPanel('main-options', { adjustable: false, fixed: true, anchor: 'right', visible: false });
    splitPanel.addPanel('results', { adjustable: true, fixed: true, anchor: 'right' });


    let $mainTable = $('#main-table');
    $mainTable.attr('role', 'region');
    $mainTable.attr('aria-label', 'Spreadsheet');

    let $results = $('#results');
    $results.attr('role', 'region');
    $results.attr('aria-label', 'Analyses Results');
    $results.attr('aria-live', 'polite');

    instance.on('change:selectedAnalysis', function(event) {
        if ('selectedAnalysis' in event.changed) {
            let analysis = event.changed.selectedAnalysis;
            if (analysis !== null && typeof(analysis) !== 'string') {
                dataSetModel.set('editingVar', null);
                if (analysis.hasUserOptions()) {
                    //TODO: Needs to accomodate plots
                    _annotationReturnTab = 'analyses';
                    splitPanel.setVisibility('main-options', true);
                    optionspanel.setAnalysis(analysis);
                    if (ribbonModel.get('selectedTab') === 'data' || ribbonModel.get('selectedTab') === 'variables')
                        ribbonModel.set('selectedTab', 'analyses');

                    optionspanel.setFocus();
                }
                else
                    optionspanel.hideOptions(false);
            }
            else
                optionspanel.hideOptions();
        }
    });

    instance.on('change:arbitraryCodePresent', (event) => {
        if ( ! instance.attributes.arbitraryCodePresent)
            return;
        let notif = ribbon.notify({
            text:  _(`One or more analyses in this data set have been disabled
                    because they allow the execution of arbitrary code. You
                    should only enable them if you trust this data set's
                    source.`),
            options: [
                { name: 'more-info', text: _('More info ...'), dismiss: false },
                { name: 'dismiss',   text: _("Don't enable") },
                { name: 'enable-code', text: _('Enable') } ]
        });

        notif.on('click', (event) => {
            if (event.name === 'enable-code')
                instance.trustArbitraryCode();
            else if (event.name === 'more-info')
                host.openUrl('https://www.jamovi.org/about-arbitrary-code.html');
        });
    });

    if (host.os === 'ios') {
        let headerAlert = document.createElement('jmv-headeralert');
        document.body.prepend(headerAlert);
        host.on('window-open-failed', (event) => {
            headerAlert.notify(event);
        });
    }

    instance.on('moduleInstalled', (event) => {
        optionspanel.reloadAnalyses(event.name);
    });

    let currentSplitMode = null;
    let forcedFullScreen = false;
    window.onresize = function(event) {
        splitPanel.onWindowResize();

        if (window.innerWidth < 850 && currentSplitMode === null) {
            forcedFullScreen = true;
            currentSplitMode = splitPanel.mode;
            if (splitPanel.mode === 'mixed') {
                let tab = ribbonModel.get('selectedTab');
                switch (tab) {
                    case 'variables':
                    case 'data':
                        splitPanel.setMode('data');
                        break;
                    case 'plots':
                    case 'analyses':
                    case 'annotation':
                        splitPanel.setMode('results');
                        break;
                }
            }
        }
        else if (window.innerWidth > 880) {
             if (currentSplitMode !== null && splitPanel.mode !== currentSplitMode) {
                splitPanel.setMode(currentSplitMode);
            }

            currentSplitMode = null;
            forcedFullScreen = false;
        }
    };

    let $fileName = $('.header-file-name');
    instance.on('change:title', function(event) {
        if ('title' in event.changed) {
            let title = event.changed.title;
            $fileName.text(title);
            document.title = title;
        }
    });

    let section = splitPanel.getSection('main-options');

    splitPanel.render();

    let $spreadsheet = $('<div id="spreadsheet"></div>');
    let $variablesList = $('<div id="variablelist"></div>');
    $mainTable.append($spreadsheet);
    $mainTable.append($variablesList);

    let selection = new Selection(dataSetModel);
    let viewController = new ViewController(dataSetModel, selection);
    let mainTable   = new TableView({el : '#spreadsheet', model : dataSetModel, controller: viewController });

    viewController.focusView('spreadsheet');

    let variablesTable = new VariablesView({ el: '#variablelist', model: dataSetModel, controller: viewController });

    backstageModel.on('change:activated', function(event) {
        if ('activated' in event.changed) {
            mainTable.setActive( ! event.changed.activated);
            if (! event.changed.activated) {
                if (Keyboard.inAccessibilityMode())
                    ribbonModel.getSelectedTab().el.focus();
            }
        }
    });

    splitPanel.on('form-changed', () => {
        mainTable.$el.trigger('resized');
    });

    let resultsView = new ResultsView({ el : '#results', iframeUrl : host.resultsViewUrl, model : instance });

    resultsView.on('hideOptions', () => {
        optionspanel.hideOptions();
    });

    let _annotationReturnTab = null;
    resultsView.$el.on('annotationFocus', (event) => {
        if (_annotationReturnTab === undefined)
            _annotationReturnTab = null;

        if (_annotationReturnTab === null) {
            let tab = ribbonModel.get('selectedTab');
            if (tab !== 'annotation')
                _annotationReturnTab = tab;
        }
        ribbonModel.set('selectedTab', 'annotation');
    });

    resultsView.$el.on('annotationLostFocus', (event) => {
        setTimeout(() => {
            if (_annotationReturnTab !== null) {
                ribbonModel.set('selectedTab', _annotationReturnTab);
                _annotationReturnTab = null;
            }
        }, 10);
    });

    resultsView.$el.on('analysisLostFocus', (event) => {
        $(window).focus();
    });

    resultsView.$el.on('activeFormatChanged', (event, data) => {
        let annotationsTab = ribbonModel.getTab('annotation');
        annotationsTab.clearValues();

        let alignmentSet = false;

        let formats = data.formats;

        if (data.type === 'heading') {
            ActionHub.get('textBold').set('enabled', false);
            ActionHub.get('textUnderline').set('enabled', false);
            ActionHub.get('textItalic').set('enabled', false);
            ActionHub.get('textStrike').set('enabled', false);
            ActionHub.get('textSubScript').set('enabled', false);
            ActionHub.get('textSuperScript').set('enabled', false);
            ActionHub.get('textCodeBlock').set('enabled', false);
            ActionHub.get('textH2').set('enabled', false);
            ActionHub.get('textListOrdered').set('enabled', false);
            ActionHub.get('textListBullet').set('enabled', false);
            ActionHub.get('textAlignCenter').set('enabled', false);
            ActionHub.get('textAlignJustify').set('enabled', false);
            ActionHub.get('textAlignRight').set('enabled', false);
            ActionHub.get('textAlignLeft').set('enabled', false);
            ActionHub.get('textLink').set('enabled', false);
            ActionHub.get('textFormula').set('enabled', false);
            ActionHub.get('textIndentLeft').set('enabled', false);
            ActionHub.get('textIndentRight').set('enabled', false);
            ActionHub.get('textColor').set('enabled', false);
            ActionHub.get('textBackColor').set('enabled', false);

            return;
        }
        else {
            ActionHub.get('textBold').set('enabled', true);
            ActionHub.get('textUnderline').set('enabled', true);
            ActionHub.get('textItalic').set('enabled', true);
            ActionHub.get('textStrike').set('enabled', true);
            ActionHub.get('textSubScript').set('enabled', true);
            ActionHub.get('textSuperScript').set('enabled', true);
            ActionHub.get('textCodeBlock').set('enabled', true);
            ActionHub.get('textH2').set('enabled', true);
            ActionHub.get('textListOrdered').set('enabled', true);
            ActionHub.get('textListBullet').set('enabled', true);
            ActionHub.get('textAlignCenter').set('enabled', true);
            ActionHub.get('textAlignJustify').set('enabled', true);
            ActionHub.get('textAlignRight').set('enabled', true);
            ActionHub.get('textAlignLeft').set('enabled', true);
            ActionHub.get('textLink').set('enabled', true);
            ActionHub.get('textFormula').set('enabled', true);
            ActionHub.get('textIndentLeft').set('enabled', true);
            ActionHub.get('textIndentRight').set('enabled', true);
            ActionHub.get('textColor').set('enabled', true);
            ActionHub.get('textBackColor').set('enabled', true);
        }

        let button = null;
        for (let name in formats) {
            switch (name) {
                case 'bold':
                    button = annotationsTab.getItem('textBold');
                    button.setValue(formats[name]);
                    break;
                case 'underline':
                    button = annotationsTab.getItem('textUnderline');
                    button.setValue(formats[name]);
                    break;
                case 'italic':
                    button = annotationsTab.getItem('textItalic');
                    button.setValue(formats[name]);
                    break;
                case 'strike':
                    button = annotationsTab.getItem('textStrike');
                    button.setValue(formats[name]);
                    break;
                case 'script':
                    if (formats[name] === 'sub') {
                        button = annotationsTab.getItem('textSubScript');
                        button.setValue(true);
                    }
                    else if (formats[name] === 'super') {
                        button = annotationsTab.getItem('textSuperScript');
                        button.setValue(true);
                    }
                    break;
                case 'code-block':
                    button = annotationsTab.getItem('textCodeBlock');
                    button.setValue(formats[name]);
                    break;
                case 'header':
                    if (formats[name] === 2) {
                        button = annotationsTab.getItem('textH2');
                        button.setValue(true);
                    }
                    break;
                case 'list':
                    if (formats[name] === 'ordered') {
                        button = annotationsTab.getItem('textListOrdered');
                        button.setValue(true);
                    }
                    else if (formats[name] === 'bullet') {
                        button = annotationsTab.getItem('textListBullet');
                        button.setValue(true);
                    }
                    break;
                case 'align':
                    alignmentSet = true;
                    if (formats[name] === 'center') {
                        button = annotationsTab.getItem('textAlignCenter');
                        button.setValue(true);
                    }
                    else if (formats[name] === 'right') {
                        button = annotationsTab.getItem('textAlignRight');
                        button.setValue(true);
                    }
                    else if (formats[name] === 'justify') {
                        button = annotationsTab.getItem('textAlignJustify');
                        button.setValue(true);
                    }
                    break;
            }

        }

        if (alignmentSet === false) {
            button = annotationsTab.getItem('textAlignLeft');
            button.setValue(true);
        }
    });

    let optionspanel = new OptionsPanel({ el : document.querySelector('#main-options'), iframeUrl : host.analysisUIUrl, model : instance });
    optionspanel.setDataSetModel(dataSetModel);
    optionspanel.el.addEventListener('splitpanel-hide', () =>  window.focus() );

    let editor = new VariableEditor({ el : '#variable-editor', model : dataSetModel, controller: viewController });

    let notifications = new Notifications($('#notifications'));
    instance.on( 'notification', note => notifications.notify(note));
    viewController.on('notification', note => notifications.notify(note));
    mainTable.on('notification', note => notifications.notify(note));
    ribbon.addEventListener('notification', (event: CustomEvent) => notifications.notify(event.detail));
    editor.on('notification', note => notifications.notify(note));
    backstageModel.on('notification', note => notifications.notify(note));

    dataSetModel.on('change:edited', event => {
        host.setEdited(dataSetModel.attributes.edited);
    });

    dataSetModel.on('change:editingVar', event => {
        if (dataSetModel.get('editingVar') === null) {
            setTimeout(() => {
                splitPanel.onTransitioning();
            }, 200);
        }
        else
            optionspanel.hideOptions();
    });

    host.on('close', async (event) => {

        if (dataSetModel.attributes.edited) {
            const response = await host.showMessageBox({
                type: 'question',
                buttons: [ _('Save'), _('Cancel'), _("Don't Save") ],
                defaultId: 0,
                cancelId: 1,
                message: _("Save changes to '{title}'?", {title: instance.attributes.title}),
            });
            if (response === 1) {  // Cancel
                return false;
            }
            else if (response === 0) {  // Save
                try {
                    await backstageModel.externalRequestSave();
                }
                catch (e) {
                    return false;
                }
            }
        }
    });

    auth.init();

    document.body.appendChild(infoBox);

    let progNotif = new Notify({
        title: _('Opening'),
        duration: 0
    });

    try {

        await coms.ready;

        let instanceId;
        const iidMatch = /\/([a-z0-9-]+)\/$/.exec(window.location.pathname);
        if (iidMatch)
            instanceId = iidMatch[1];

        const notify = (progress) => {
            if (progress.p !== undefined) {
                progNotif.set({
                    title: progress.title,
                    progress: [ progress.p, progress.n ],
                });
                notifications.notify(progNotif);
            }

            if (progress['message-src'])
                infoBox.setup(progress);
        };

        let options: IInstanceOpenOptions = { };
        let result: IInstanceOpenResult;
        let location: string | undefined;
        let params: { [name: string]: any } | undefined;

        const match = window.location.hash.match(/^#([^?]+)(.*)$/);
        if (match) {
            location = match[1];
            params = {}
            for (const [name, value] of new URLSearchParams(match[2]))
                params[name] = decodeURIComponent(value)

            if (location === 'embed') {
                const embedOptions = { channelId: parseInt(params.channelId) };
                options = Object.assign(options, await auth.embed(embedOptions));
            }
            else if (location === 'open') {
                options = params;
            }
        }

        while (true) {

            const embeddedAndReady = (location === 'embed' && options.authToken);

            if ( ! instanceId && hasLobby && ! embeddedAndReady) {
                const response = await lobby.show(location, params);
                if (response.action === 'open')
                    options = response.data;

                await auth.waitForSignIn();
                options.authToken = await auth.getAuthToken();
                // notify any background shared workers that the account has changed
                new BroadcastChannel('account-events').postMessage({ type: 'reset' });
            }

            try {
                const stream: InstanceOpenStream = instance.open(options);
                for await (let progress of stream)
                    notify(progress);
                result = await stream;

                if (result.status === 'OK')
                    break;

                if (result.status === 'requires-auth' && result.event === 'full') {
                    location = 'full';
                    params = {};
                    continue;
                }
            }
            catch (e) {
                if (hasLobby && location === 'open') {
                    throw new UserFacingError(_('This data set could not be opened'), { cause: e.cause, status: 'disconnected' });
                }
                else if (host.isElectron && options.path) {
                    // if opening fails, open a blank data set
                    result = await instance.open({ path: '' });
                    let notif;
                    if (e instanceof UserFacingError)
                        notif = { title: e.message, message: e.cause, type: 'error', duration: 3000 };
                    else
                        notif = { title: _('Unable to open'), message: e.message, type: 'error', duration: 3000 };
                    notifications.notify(new Notify(notif));
                    break;
                }
                else {
                    throw e;
                }
            }
        }

        infoBox.hide();

        if ('url' in result)
            history.replaceState({}, '', `${host.baseUrl}${result.url}`);

        instanceId = /\/([a-z0-9-]+)\/$/.exec(window.location.pathname)[1];
        await instance.connect(instanceId);

        progNotif.dismiss();
    }
    catch (e) {

        progNotif.dismiss();

        if (e instanceof UserFacingError) {
            infoBox.setup({
                title: e.message,
                message: e.cause,
                status: e.status,
            });
        }
        else {
            console.log(e);

            infoBox.setup({
                title: _('Connection failed'),
                message: _('Unable to connect to the server'),
                status: 'disconnected',
            });
        }

        infoBox.style.display = null;
        await new Promise((resolve, reject) => { /* never */ });
    }

    // if it's just the results heading ...
    let welcomeShown = false;
    if (instance.analyses().count() === 1) {
        for (let analysis of instance.analyses()) {
            // ... and it's not edited
            if (analysis.getHeading() || analysis.options.getAnnotation('topText'))
                break;
            // ... then show the welcome screen
            resultsView.showWelcome();
        }
    }
    if ( ! welcomeShown)
        resultsView.hidePlaceHolder();

});

})();
