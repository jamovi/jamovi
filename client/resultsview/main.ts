'use strict';


import ERDM from "element-resize-detector";
import RefTable from './refs';

import { createItem } from './create';
import { exportElem } from '../common/utils/formatio';
import b64 from '../common/utils/b64';
import Annotations, { AnnotationAction } from './annotations';
import Tracker from './itemtracker';
import I18ns, { I18nData } from '../common/i18n';
import focusLoop from '../common/focusloop';
import { contextMenuListener } from '../common/utils';
import { HTMLElementCreator as HTML } from '../common/htmlelementcreator';
import { CollectionView, View } from "./element";
import HighContrast from '../common/highcontrast';

window._ = I18ns.get('app')._;

declare global {
    function s_(key: string, formats?: { [key: string]: (string|number); } | (string|number)[] | string, options?: { prefix: string; postfix: string; }): string;
    interface Window {
        s_: (key: string, formats?: { [key: string]: (string|number); } | (string|number)[] | string, options?: { prefix: string; postfix: string; }) => string;

        setOption: (name: string, value: any) => void;
        setParam: (address: string[], options: any) => void;
        getParam: (address: string[], name: string) => any;
        openUrl: (url: string) => void;
    }
}

interface AnnotationEvent {
    type: 'editFocused' | 'editState' | 'action';
}

interface AnnotationActionEvent extends AnnotationEvent {
    type: 'action';
    action: AnnotationAction;
}

const isActionEvent = function (obj: AnnotationEvent): obj is AnnotationActionEvent {
    return obj && obj.type === 'action';
}

interface AnnotationStateEvent extends AnnotationEvent {
    type: 'editState';
    state: boolean;
}

const isStateEvent = function (obj: AnnotationEvent): obj is AnnotationStateEvent {
    return obj && obj.type === 'editState';
}

interface AnnotationFocusEvent extends AnnotationEvent {
    type: 'editFocused';
    short: boolean;
    state: boolean;
}

const isFocusEvent = function (obj: AnnotationEvent): obj is AnnotationFocusEvent {
    return obj && obj.type === 'editFocused';
}


function ready(fn: () => void) {
    if (document.readyState !== 'loading')
        fn();
    else
        document.addEventListener('DOMContentLoaded', fn);
}

class Main {  // this is constructed at the bottom

    $body: HTMLElement;
    $results: HTMLElement;
    mainWindow: Window = window.parent;
    _annotationFocused: boolean = false;
    _annotationState: boolean = false;
    _annotationSelected: boolean;
    _focus: number = 0;
    layout: Tracker;
    _refTable: RefTable;
    _shortAnnotating: boolean;

    results: View;
    active: View;
    _analysisSelected: any;
    resultsDefn: any;

    moduleI18nDef: I18nData;
    highContrast: HighContrast;

    constructor() {
        /*this.translateUsingModule = (key) => {
            if (key === null || key === undefined|| key.trim() === '' || ! this.moduleI18nDef)
                return key;

            let value = this.moduleI18nDef.locale_data.messages[key.trim()];
            if (value === null || value === undefined || value[0] === '')
                return key;
            else
                return value[0];
        };
        window.mod_ = this.translateUsingModule.bind(this);*/

        this.highContrast = new HighContrast(document.body, document.body, () => {
            return document.body.querySelectorAll('.jmv-results-image-image');
        }, null, false);

        this.onAnnotationEditing = this.onAnnotationEditing.bind(this);

        this.onAnnotationLostFocus = this.onAnnotationLostFocus.bind(this);

        this.onHeadingChanged = this.onHeadingChanged.bind(this);

        this.onAnnotationFormatChanged = this.onAnnotationFormatChanged.bind(this);

        this.onAnnotationChanged = this.onAnnotationChanged.bind(this);

        this.results = null;
        this.$results = null;
        this.resultsDefn = null;
        this.active = null;
        this._focus = 0;
        this._analysisSelected = null;

        this.layout = new Tracker();

        window.addEventListener('message', event => this._messageEvent(event));

        this._reallyNotifyResize = this._reallyNotifyResize.bind(this);

        window.setOption = (name: string, value: any) => {
            this.mainWindow.postMessage({
                type: 'setOption',
                data: { name, value }
            }, '*');
        };

        window.setParam = (address, options) => {
            this.mainWindow.postMessage({
                type: 'setParam',
                data: { address, options }
            }, '*');
        };

        window.getParam = (address: string[], name: string) => {
            let optionName = 'results/' + address.join('/') + '/' + name;
            if (optionName in this.resultsDefn.options)
                return this.resultsDefn.options[optionName];
        };

        window.openUrl = (url: string) => {
            this.mainWindow.postMessage({
                type: 'openUrl',
                data: { url: url }
            }, '*');
        };

        document.oncontextmenu = function () { return false; };

        // the location of the script should be inside the body
        // so we don't need document.ready()
        this.$body = document.body;

        focusLoop.addFocusLoop(document.body);
        focusLoop.on('focus', (event) => {
            focusLoop.enterFocusLoop(document.body, { withMouse: focusLoop._mouseClicked });
        });

        focusLoop.on('blur', (event) => {
            focusLoop.leaveFocusLoop(document.body);
        });

        document.addEventListener('mousedown', (event) => this._mouseDown(event));
        document.addEventListener('mouseup', (event) => this._mouseUp(event));
        document.addEventListener('mousemove', (event) => this._mouseMove(event));

        contextMenuListener(document.body, (event) => {
            const clickEvent = new MouseEvent('contextmenu', {
                view: window,
                bubbles: true,
                cancelable: true,
                clientX: event.clientX,
                clientY: event.clientY,
                screenX: event.screenX,
                screenY: event.screenY
            });
            this.$results.dispatchEvent(clickEvent);
            event.preventDefault();
        });
    }

    _reallyNotifyResize() {
        let rect = this.$results.getBoundingClientRect();
        let width = rect.width + 40;
        let height = rect.height;// + 25;
        let scrollIntoView = true;
        let $focusedAnnotations = document.querySelectorAll('.jmv-annotation.focused');
        if ($focusedAnnotations.length > 0)
            scrollIntoView = false;

        this.mainWindow.postMessage({
            type: 'sizeChanged',
            data: { width: width, height: height, scrollIntoView: scrollIntoView }
        }, '*');
    }

    _sendMenuRequest(event) {
        let entries = event.data.entries;
        if (entries) {
            if (this.resultsDefn.isEmpty) {
                entries[0].type = 'Note';
                entries[0].name = 'note';
                entries[0].label = _('Note');
            }
            else if (this.resultsDefn.ns === 'scatr') {
                entries[0].type = 'Analysis';
                entries[0].name = 'analysis';
                entries[0].label = _('Plot');
            }
            else {
                entries[0].type = 'Analysis';
                entries[0].name = 'analysis';
                entries[0].label = _('Analysis');
            }
        }

        this.mainWindow.postMessage(event, '*');

        let lastEntryAddress = event.data.address;
        if (entries) {
            let lastEntry = entries[entries.length - 1];
            lastEntryAddress = lastEntry.address;
            this._menuEvent({ type: 'activated', address: lastEntryAddress });
        }

    }

    _sendAnnotationRequest(name, data) {
        let event = {
            type: name,
            data: data
        };

        this.mainWindow.postMessage(event, '*');
    }

    _messageEvent(event) {

        if (event.source === window)
            return;

        let hostEvent = event.data;
        let eventData = hostEvent.data;

        if (hostEvent.type === 'results') {
            document.body.dir = I18ns.get('app').isRTL(eventData.languageCode) ? 'rtl' : 'ltr';
            this.resultsDefn = eventData;
            this._analysisSelected = eventData.selected;
            this._annotationSelected = eventData.annotationSelected;
            this._annotationState = eventData.editState;
            // ensure empty root results still display
            this.resultsDefn.results.visible = 2;
            this._render();
        }
        else if (hostEvent.type === 'mouseEvent') {
            switch (eventData.type) {
                case 'mouseenter':
                case 'mouseover':
                    this.$results.classList.add('hovering');
                    break;
                case 'mouseleave':
                case 'mouseout':
                    this.$results.classList.remove('hovering');
                    break;
            }
        }
        else if (hostEvent.type === 'reftablechanged') {
            if (this._refTable)
                this._refTable.setup(eventData.refs, eventData.refsMode);
        }
        else if (hostEvent.type === 'selected') {
            this._analysisSelected = eventData.state;
            this._annotationSelected = eventData.annotationSelected;
            if (this.$results) {
                if (this._annotationSelected) {
                    if (this._shortAnnotating) {
                        setTimeout(() => {
                            this.$results.classList.add('annotation-selected');
                        }, 200);
                    }
                    else
                        this.$results.classList.add('annotation-selected');
                }
                else
                    this.$results.classList.remove('annotation-selected');

                if (this._analysisSelected === null) {
                    this.$results.classList.add('no-analysis-selected');
                    this.$results.classList.remove('analysis-selected');
                }
                else {
                    this.$results.classList.remove('no-analysis-selected');
                    if (this._analysisSelected) {
                        if (this._shortAnnotating) {
                            setTimeout(() => {
                                this.$results.classList.add('analysis-selected');
                            }, 200);
                        }
                        else
                            this.$results.classList.add('analysis-selected');
                    }
                    else
                        this.$results.classList.remove('analysis-selected');
                }
            }
        }
        else if (hostEvent.type === 'click') {
            let el = document.elementFromPoint(hostEvent.pageX, hostEvent.pageY);
            if (el === document.body)
                el = this.$results;
            const clickEvent = new MouseEvent('click', {
                view: window,
                bubbles: true,
                cancelable: true,
                clientX: hostEvent.pageX,
                clientY: hostEvent.pageY,
                button: hostEvent.button
            });
            el.dispatchEvent(clickEvent);
            if (hostEvent.button === 2) {
                const clickEvent = new MouseEvent('contextmenu', {
                    view: window,
                    bubbles: true,
                    cancelable: true,
                    clientX: hostEvent.pageX,
                    clientY: hostEvent.pageY,
                    button: hostEvent.button
                });
                el.dispatchEvent(clickEvent);
            }
        }
        else if (hostEvent.type === 'enterannotation') {
            let annotation = Annotations.controls[0];
            if (annotation.suffix === 'heading')
                annotation = Annotations.controls[1];
            //annotation.refocus();
        }
        else if (hostEvent.type === 'addNote') {
            let address = eventData.address;
            let options = eventData.options;

            let annotation = Annotations.getControl(address, 'bottomText');
            if (annotation !== null)
                annotation.focus(options.text);


        }
        else if (hostEvent.type === 'i18nDef') {
            this.moduleI18nDef = eventData.moduleI18n;
            if (eventData.appI18n) {
                I18ns.get('app').initialise(eventData.appI18n.locale_data.messages[""].lang, eventData.appI18n);
            }
            if (this.resultsDefn)
                this._render();
        }
        else if (hostEvent.type === 'getcontent') {

            let address = eventData.address;
            let options = eventData.options;

            let node: HTMLElement = this.results;
            for (let i = 0; i < address.length; i++)
                node = node.querySelector(`[data-name="${b64.enc(address[i])}"]`);

            let incHtml = true;
            let incText = true;
            let incImage = false;

            if (node.classList.contains('jmv-results-syntax'))
                incHtml = false;

            if (node.classList.contains('jmv-results-image')) {
                incText = false;
                incImage = true;
            }

            let content = {};

            Promise.resolve().then(() => {

                if (incText)
                    return exportElem(node, 'text/plain', options);

            }).then((text) => {

                if (text)
                    content.text = text;

                if (incImage)
                    return exportElem(node, 'image/png', options);

            }).then((image) => {

                if (image)
                    content.image = image;

                if (incHtml)
                    return exportElem(node, 'text/html', options);

            }).then((html) => {

                if (html)
                    content.html = html;

                let event = { type: 'getcontent', data: { content, address } };
                this.mainWindow.postMessage(event, '*');
            });
        }
        else if (hostEvent.type === 'menuEvent') {
            this._menuEvent(eventData);
        }
        else if (hostEvent.type === 'annotationEvent') {
            this._annotationEvent(eventData);
        }
    }

    cloneMouseEvent(e: MouseEvent, overrides: MouseEventInit = {}): MouseEvent {
        return new MouseEvent(e.type, {
            bubbles: e.bubbles,
            cancelable: e.cancelable,
            composed: e.composed,
            view: e.view,
            detail: e.detail,
            screenX: e.screenX,
            screenY: e.screenY,
            clientX: e.clientX,
            clientY: e.clientY,
            ctrlKey: e.ctrlKey,
            shiftKey: e.shiftKey,
            altKey: e.altKey,
            metaKey: e.metaKey,
            button: e.button,
            buttons: e.buttons,
            relatedTarget: e.relatedTarget,
            ...overrides, // apply your changes here
        });
    }

    onAnnotationEditing(event) {
        this._focus += 1;
        if (this._focus === 1)
            this._sendAnnotationRequest('annotationFocus', event.annotationData);
    }

    onAnnotationLostFocus(event) {
        this._focus -= 1;
        if (this._focus === 0)
            this._sendAnnotationRequest('annotationLostFocus', event.annotationData);
        else if (this._focus < 0)
            throw "shouldn't get here";
    }

    onHeadingChanged(event) {
        this._sendAnnotationRequest('headingChanged', event.headingData);
    }

    onAnnotationFormatChanged(event: CustomEvent) {
        this._sendAnnotationRequest('activeFormatChanged', { formats: event.detail.annotationData, type: event.detail.annotationType });
    }

    onAnnotationChanged(event) {
        this._sendAnnotationRequest('annotationChanged', event.annotationData);
    }

    _render() {
        this.layout.begin();

        let current = this.layout.include('root', () => {
            this.$body.removeEventListener('annotation-editing', this.onAnnotationEditing);
            this.$body.removeEventListener('annotation-lost-focus', this.onAnnotationLostFocus);
            this.$body.removeEventListener('annotation-format-changed', this.onAnnotationFormatChanged);
            this.$body.removeEventListener('annotation-changed', this.onAnnotationChanged);

            this._refTable = new RefTable();
            this._refTable.setup(this.resultsDefn.refs, this.resultsDefn.refsMode);

            /*if (this.resultsDefn.ns === 'jmv' && this.resultsDefn.name === 'weights') {
                document.body.setAttribute('aria-roledescription', `Analyses wieghts`);

                this.resultsDefn.results.title = '';
                this.resultsDefn.hasTitle = false;
                this.resultsDefn.allowAnnotations = false;
                this.$results = HTML.parse(`<div id="results" class="weights"><div class="title-box"><div class="icon"></div><div class="title">${_('Weights')}</div></div></div>`);
            }
            else {
                this.$results = HTML.parse('<div id="results"></div>');
                if (this.resultsDefn.isEmpty) {
                    this.$results.classList.add('annotation');
                    document.body.setAttribute('aria-roledescription', `Annotation`);
                    document.body.setAttribute('tabindex', '');
                }
                else {
                    document.body.setAttribute('aria-roledescription', `${this.resultsDefn.results.title} Analysis`);
                }
            }

            focusLoop.addFocusLoop(this.$results);*/

            this.results = createItem(
                this.resultsDefn.results,
                this.resultsDefn.options,
                0,
                { _sendEvent: event => this._sendMenuRequest(event), isEmptyAnalysis: this.resultsDefn.isEmpty, hasTitle: this.resultsDefn.hasTitle },
                this.resultsDefn.mode,
                this.resultsDefn.devMode,
                this.resultsDefn.format,
                this._refTable);

            if (!this.results)
                return null;

            this.results.id = 'results';
            this.$results = this.results;

            if (this.resultsDefn.ns === 'jmv' && this.resultsDefn.name === 'weights') {
                document.body.setAttribute('aria-roledescription', `Analyses wieghts`);

                this.resultsDefn.results.title = '';
                this.resultsDefn.hasTitle = false;
                this.resultsDefn.allowAnnotations = false;

                this.$results.classList.add('weights');
                const ff = HTML.parse(`<div class="title-box"><div class="icon"></div><div class="title">${_('Weights')}</div></div>`);
                this.$results.prepend(ff);
                //this.$results = HTML.parse(`<div id="results" class="weights"><div class="title-box"><div class="icon"></div><div class="title">${_('Weights')}</div></div></div>`);
            }
            else {
                //this.$results = HTML.parse('<div id="results"></div>');
                if (this.resultsDefn.isEmpty) {
                    this.$results.classList.add('annotation');
                    document.body.setAttribute('aria-roledescription', `Annotation`);
                    document.body.setAttribute('tabindex', '');
                }
                else {
                    document.body.setAttribute('aria-roledescription', `${this.resultsDefn.results.title} Analysis`);
                }
            }

            focusLoop.addFocusLoop(this.$results);

            this._updateAnnotationStates();
            this.$body.append(this.$results);

            this.$body.append(HTML.parse('<div id="selector"></div>'));

            this.$body.addEventListener('annotation-editing', this.onAnnotationEditing);
            this.$body.addEventListener('annotation-lost-focus', this.onAnnotationLostFocus);

            this.$body.addEventListener('heading-changed', this.onHeadingChanged);

            this.$body.addEventListener('annotation-format-changed', this.onAnnotationFormatChanged);

            this.$body.addEventListener('annotation-changed', this.onAnnotationChanged);

            ready(() => {
                if (navigator.platform === 'Win32')
                    this.$body.classList.add('windows');
                else if (navigator.platform === 'MacIntel')
                    this.$body.classList.add('mac');
                else if (navigator.platform.startsWith('Linux'))
                    this.$body.classList.add('linux');
                else
                    this.$body.classList.add('other');

                let erd = ERDM({ strategy: 'scroll' });
                erd.listenTo(this.$results, (element) => {
                    this._reallyNotifyResize();
                });

                window.addEventListener('keydown', (event) => {
                    if (event.key === 'Escape') {
                        if (this._focus === 0)
                            this.mainWindow.postMessage({ type: 'analysisLostFocus' }, '*');
                    }
                });
            });

            return this.results;
        });

        if (current && current.updated() === false) {
            this._updateAnnotationStates();
            this._refTable.setup(this.resultsDefn.refs, this.resultsDefn.refsMode);

            current.update({
                mode: this.resultsDefn.mode,
                devMode: this.resultsDefn.devMode,
                fmt: this.resultsDefn.format,
                level: 0,
                element: this.resultsDefn.results,
                options: this.resultsDefn.options,
                refTable: this._refTable
            });
        }

        this.layout.end();
    }

    _updateAnnotationStates() {
        if (this.$results) {
            if (this._annotationFocused)
                this.$results.classList.add('edit-focus');
            else
                this.$results.classList.remove('edit-focus');

            if (this._annotationState)
                this.$results.classList.add('edit-state');
            else
                this.$results.classList.remove('edit-state');

            if (this._shortAnnotating)
                this.$results.classList.add('short-annotating');
            else
                this.$results.classList.remove('short-annotating');

            if (this._annotationSelected) {
                if (this._shortAnnotating) {
                    setTimeout(() => {
                        this.$results.classList.add('annotation-selected');
                    }, 200);
                }
                else
                    this.$results.classList.add('annotation-selected');
            }
            else
                this.$results.classList.remove('annotation-selected');

            if (this._analysisSelected === null) {
                this.$results.classList.add('no-analysis-selected');
                this.$results.classList.remove('analysis-selected');
            }
            else {
                this.$results.classList.remove('no-analysis-selected');
                if (this._analysisSelected) {
                    if (this._shortAnnotating) {
                        setTimeout(() => {
                            this.$results.classList.add('analysis-selected');
                        }, 200);
                    }
                    else
                        this.$results.classList.add('analysis-selected');
                }
                else
                    this.$results.classList.remove('analysis-selected');
            }
        }
    }

    _annotationEvent(event: AnnotationEvent) {
        if (isActionEvent(event)) {
            for (let annotation of Annotations.controls) {
                if (annotation.classList.contains('had-focus')) {
                    if (annotation.processToolbarAction)
                        annotation.processToolbarAction(event.action);
                    break;
                }
            }
        }
        else if (isStateEvent(event)) {
            this._annotationState = event.state;
            if (this.$results) {
                if (this._annotationState)
                    this.$results.classList.add('edit-state');
                else
                    this.$results.classList.remove('edit-state');
            }
        }
        else if (isFocusEvent(event)) {
            this._annotationFocused = event.state;
            this._shortAnnotating = event.short;
            if (this.$results) {
                if (this._shortAnnotating)
                    this.$results.classList.add('short-annotating');
                else
                    this.$results.classList.remove('short-annotating');

                if (this._annotationFocused)
                    this.$results.classList.add('edit-focus');
                else
                    this.$results.classList.remove('edit-focus');
            }
        }
    }

    _menuEvent(event) {

        if (this.active !== null) {
            this.active.classList.remove('focus-activated');
            //this.$selector.css('opacity', '0');
            this.active = null;
        }

        if (event.address === null)
            return;

        let address = event.address;

        if (address.length === 0)
            this.active = this.results;
        else if (this.results instanceof CollectionView)
            this.active = this.results.get(address);

        switch (event.type) {
            case 'activated':
                this.active.classList.add('focus-activated');
                break;
        }
    }

    _mouseUp(event: MouseEvent) {
        let data = {
            eventName: "mouseup",
            which: event.which,
            pageX: event.pageX,
            pageY: event.pageY
        };

        if (this.mainWindow) {
            this.mainWindow.postMessage({
                type: 'mouseEvent',
                data: data
            }, '*');
        }
    }

    _mouseMove(event: MouseEvent) {
        let data = {
            eventName: "mousemove",
            which: event.which,
            pageX: event.pageX,
            pageY: event.pageY
        };

        if (this.mainWindow) {
            this.mainWindow.postMessage({
                type: 'mouseEvent',
                data: data
            }, '*');
        }
    }

    _mouseDown(event: MouseEvent) {
        let data = {
            eventName: "mousedown",
            which: event.which,
            pageX: event.pageX,
            pageY: event.pageY
        };

        if (this.mainWindow) {
            this.mainWindow.postMessage({
                type: 'mouseEvent',
                data: data
            }, '*');
        }
    }
}

new Main();  // constructed down here!
