'use strict';

const $ = require('jquery');
const Backbone = require('backbone');
Backbone.$ = $;

const ERDM = require("element-resize-detector");
const RefTable = require('./refs');

const createItem = require('./create').createItem;
const formatIO = require('../common/utils/formatio');
const b64 = require('../common/utils/b64');
const Annotations = require('./annotations');
const Tracker = require('./itemtracker');
const I18n = require("../common/i18n");
const focusLoop = require('../common/focusloop');
const { contextMenuListener } = require('../common/utils');

window._ = I18n._;

class Main {  // this is constructed at the bottom

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

        this.mainWindow = null;
        this.results = null;
        this.$results = null;
        this.resultsDefn = null;
        this.active = null;
        this._focus = 0;
        this._annotationFocused = false;
        this._annotationState = false;
        this._analysisSelected = null;

        this.layout = new Tracker();

        window.addEventListener('message', event => this._messageEvent(event));

        this._notifyResize = () => this._reallyNotifyResize();

        window.setOption = (name, value) => {
            this.mainWindow.postMessage({
                type : 'setOption',
                data : { name, value }}, '*');
        };

        window.setParam = (address, options) => {
            this.mainWindow.postMessage({
                type : 'setParam',
                data : { address, options }}, '*');
        };

        window.getParam = (address, name) => {
            let optionName = 'results/' + address.join('/') + '/' + name;
            if (optionName in this.resultsDefn.options)
                return this.resultsDefn.options[optionName];
        };

        window.openUrl = (url) => {
            this.mainWindow.postMessage({
                type : 'openUrl',
                data : { url: url }}, '*');
        };

        // the location of the script should be inside the body
        // so we don't need document.ready()
        this.$body = $('body');

        focusLoop.addFocusLoop(document.body);
        focusLoop.on('focus', (event) => {
            if (focusLoop.inAccessibilityMode()) {
                focusLoop.enterFocusLoop(document.body, { withMouse: false });
            }
        });
        document.body.setAttribute('tabindex', '-1');

        $(document).mousedown(this, (event) => this._mouseDown(event));
        $(document).mouseup(this, (event) => this._mouseUp(event));
        $(document).mousemove(this, (event) => this._mouseMove(event));

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
            this.$results[0].dispatchEvent(clickEvent);
        });
    }

    _reallyNotifyResize() {
        let width  = this.$results.width()  + 40;
        let height = this.$results.height();// + 25;
        let scrollIntoView = true;
        let $focusedAnnotations = $('.jmv-annotation.focused');
        if ($focusedAnnotations.length > 0)
            scrollIntoView = false;

        this.mainWindow.postMessage({
            type : 'sizeChanged',
            data : { width: width, height: height, scrollIntoView: scrollIntoView }}, '*');
    }

    _sendMenuRequest(event) {
        let entries = event.data.entries;
        if (this.resultsDefn.isEmpty) {
            entries[0].type = 'Note';
            entries[0].name = 'note';
            entries[0].label = _('Note');
        }
        else {
            entries[0].type = 'Analysis';
            entries[0].name = 'analysis';
            entries[0].label = _('Analysis');
        }

        this.mainWindow.postMessage(event, '*');

        let lastEntry = entries[entries.length-1];
        this._menuEvent({ type: 'activated', address: lastEntry.address });
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

        this.mainWindow = event.source;
        let hostEvent = event.data;
        let eventData = hostEvent.data;

        if (hostEvent.type === 'results') {
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
                    this.$results.addClass('hovering');
                    break;
                case 'mouseleave':
                case 'mouseout':
                    this.$results.removeClass('hovering');
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
                if (this._annotationSelected){
                    if (this._shortAnnotating) {
                        setTimeout(() => {
                            this.$results.addClass('annotation-selected');
                        }, 200);
                    }
                    else
                        this.$results.addClass('annotation-selected');
                }
                else
                    this.$results.removeClass('annotation-selected');

                if (this._analysisSelected === null) {
                    this.$results.addClass('no-analysis-selected');
                    this.$results.removeClass('analysis-selected');
                }
                else {
                    this.$results.removeClass('no-analysis-selected');
                    if (this._analysisSelected) {
                        if (this._shortAnnotating) {
                            setTimeout(() => {
                                this.$results.addClass('analysis-selected');
                            }, 200);
                        }
                        else
                            this.$results.addClass('analysis-selected');
                    }
                    else
                        this.$results.removeClass('analysis-selected');
                }
            }
        }
        else if (hostEvent.type === 'click') {
            let el = document.elementFromPoint(hostEvent.pageX, hostEvent.pageY);
            if (el === document.body)
                el = this.$results[0];
            const clickEvent = new MouseEvent('contextmenu', {
                view: window,
                bubbles: true,
                cancelable: true,
                clientX: hostEvent.pageX,
                clientY: hostEvent.pageY,
            });
            el.dispatchEvent(clickEvent);
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
            if (eventData.appI18n)
                I18n.initialise(eventData.appI18n.locale_data.messages[""].lang, eventData.appI18n);
            if (this.resultsDefn)
                this._render();
        }
        else if (hostEvent.type === 'getcontent') {

            let address = eventData.address;
            let options = eventData.options;

            let node = this.results.el;
            for (let i = 0; i < address.length; i++)
                node = node.querySelectorAll(`[data-name="${ b64.enc(address[i]) }"]`)[0];

            let incHtml = true;
            let incText = true;
            let incImage = false;

            if (node.classList.contains('jmv-results-syntax'))
                incHtml = false;

            if (node.classList.contains('jmv-results-image')) {
                incText = false;
                incImage = true;
            }

            let content = { };

            Promise.resolve().then(() => {

                if (incText)
                    return formatIO.exportElem(node, 'text/plain', options);

            }).then((text) => {

                if (text)
                    content.text = text;

                if (incImage)
                    return formatIO.exportElem(node, 'image/png', options);

            }).then((image) => {

                if (image)
                    content.image = image;

                if (incHtml)
                    return formatIO.exportElem(node, 'text/html', options);

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

    _render() {
        this.layout.begin();

        let current = this.layout.include('root', () => {
            this.$body.off('annotation-editing');
            this.$body.off('annotation-lost-focus');
            this.$body.off('annotation-format-changed');
            this.$body.off('annotation-changed');

            this._refTable = new RefTable();
            this._refTable.setup(this.resultsDefn.refs, this.resultsDefn.refsMode);

            this.$results = $('<div id="results"></div>');
            if (this.resultsDefn.isEmpty)
                this.$results.addClass('annotation');
            this.results = createItem(
                this.resultsDefn.results,
                this.resultsDefn.options,
                this.$results,
                0,
                { _sendEvent: event => this._sendMenuRequest(event), isEmptyAnalysis: this.resultsDefn.isEmpty, hasTitle: this.resultsDefn.hasTitle },
                this.resultsDefn.mode,
                this.resultsDefn.devMode,
                this.resultsDefn.format,
                this._refTable);

            if ( ! this.results)
                return null;



            this._updateAnnotationStates();
            this.$results.appendTo(this.$body);

            this.$selector = $('<div id="selector"></div>').appendTo(this.$body);

            this.$body.on('annotation-editing', (event) => {
                this._focus += 1;
                if (this._focus === 1)
                    this._sendAnnotationRequest('annotationFocus', event.annotationData);
            });

            this.$body.on('annotation-lost-focus', (event) => {
                this._focus -= 1;
                if (this._focus === 0)
                    this._sendAnnotationRequest('annotationLostFocus', event.annotationData);
                else if (this._focus < 0)
                    throw "shouldn't get here";
            });

            this.$body.on('heading-changed', (event) => {
                this._sendAnnotationRequest('headingChanged', event.headingData);
            });

            this.$body.on('annotation-format-changed', (event, data) => {
                this._sendAnnotationRequest('activeFormatChanged', { formats: event.detail.annotationData, type: event.detail.annotationType });
            });

            this.$body.on('annotation-changed', (event) => {
                this._sendAnnotationRequest('annotationChanged', event.annotationData);
            });

            $(document).ready(() => {
                let erd = ERDM({ strategy: 'scroll' });
                erd.listenTo(this.$results[0], (element) => {
                    this._notifyResize();
                });

                $(window).on('keydown', (event) => {
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
                this.$results.addClass('edit-focus');
            else
                this.$results.removeClass('edit-focus');

            if (this._annotationState)
                this.$results.addClass('edit-state');
            else
                this.$results.removeClass('edit-state');

            if (this._shortAnnotating)
                this.$results.addClass('short-annotating');
            else
                this.$results.removeClass('short-annotating');

            if (this._annotationSelected) {
                if (this._shortAnnotating) {
                    setTimeout(() => {
                        this.$results.addClass('annotation-selected');
                    }, 200);
                }
                else
                    this.$results.addClass('annotation-selected');
            }
            else
                this.$results.removeClass('annotation-selected');

            if (this._analysisSelected === null) {
                this.$results.addClass('no-analysis-selected');
                this.$results.removeClass('analysis-selected');
            }
            else {
                this.$results.removeClass('no-analysis-selected');
                if (this._analysisSelected) {
                    if (this._shortAnnotating) {
                        setTimeout(() => {
                            this.$results.addClass('analysis-selected');
                        }, 200);
                    }
                    else
                        this.$results.addClass('analysis-selected');
                }
                else
                    this.$results.removeClass('analysis-selected');
            }
        }
    }

    _annotationEvent(event) {
        switch (event.type) {
            case 'editState':
                this._annotationState = event.state;
                if (this.$results) {
                    if (this._annotationState)
                        this.$results.addClass('edit-state');
                    else
                        this.$results.removeClass('edit-state');
                }
                break;
            case 'editFocused':
                this._annotationFocused = event.state;
                this._shortAnnotating = event.short;
                if (this.$results) {
                    if (this._shortAnnotating)
                        this.$results.addClass('short-annotating');
                    else
                        this.$results.removeClass('short-annotating');

                    if (this._annotationFocused)
                        this.$results.addClass('edit-focus');
                    else
                        this.$results.removeClass('edit-focus');
                }
                break;
            case 'action':
                for (let annotation of Annotations.controls) {
                    if (annotation.$el.hasClass('had-focus')) {
                        if (annotation.processToolbarAction)
                            annotation.processToolbarAction(event.action);
                        break;
                    }
                }
                break;
        }
    }

    _menuEvent(event) {

        if (this.active !== null) {
            this.$selector.css('opacity', '0');
            this.active = null;
        }

        if (event.address === null)
            return;

        let address = event.address;

        if (address.length === 0) {
            this.active = this.results;
        }
        else {
            this.active = this.results.get(address);
        }

        switch (event.type) {
            case 'activated':
                let pos = this.active.$el.offset();
                let width = this.active.$el.outerWidth();
                let height = this.active.$el.outerHeight();
                let padTB = 0;
                let padLR = 12;

                if (this.active.$el.is(this.$results))
                    padTB = padLR = 0;

                this.$selector.css({
                    left:   pos.left - padLR,
                    top:    pos.top  - padTB,
                    width:  width  + 2 * padLR,
                    height: height + 2 * padTB,
                    opacity: 1 });
                break;
        }
    }

    _mouseUp(event) {
        let data = {
            eventName: "mouseup",
            which: event.which,
            pageX: event.pageX,
            pageY: event.pageY
        };

        if (this.mainWindow) {
            this.mainWindow.postMessage({
                type : 'mouseEvent',
                data : data}, '*');
        }
    }

    _mouseMove(event) {
        let data = {
            eventName: "mousemove",
            which: event.which,
            pageX: event.pageX,
            pageY: event.pageY
        };

        if (this.mainWindow) {
            this.mainWindow.postMessage({
                type : 'mouseEvent',
                data : data}, '*');
        }
    }

    _mouseDown(event) {
        let data = {
            eventName: "mousedown",
            which: event.which,
            pageX: event.pageX,
            pageY: event.pageY
        };

        if (this.mainWindow) {
            this.mainWindow.postMessage({
                type : 'mouseEvent',
                data : data}, '*');
        }
    }
}

new Main();  // constructed down here!
