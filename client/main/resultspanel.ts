'use strict';

import I18ns from '../common/i18n';
import focusLoop from '../common/focusloop';

import { exportElem } from '../common/utils/formatio';

import ContextMenu from './contextmenu';
import Notify from './notification';
import host from './host';
import selectionLoop from '../common/selectionloop';
import ContextMenuButton from './contextmenu/contextmenubutton';

import { flatten, unflatten } from '../common/utils/addresses';
import { contextMenuListener } from '../common/utils';

import path from 'path';
import { EventDistributor } from '../common/eventmap';
import { HTMLElementCreator as HTML } from '../common/htmlelementcreator';
import Instance from './instance';
import { Analysis } from './analyses';

import { References } from './references';
import { IReference } from './references';
import { R } from './references';
import { jmv } from './references';

import { hydrate } from '../common/hydrate';
import { htmlify } from '../common/htmlify';
import { latexify } from '../common/latexify';
import { createDoc } from '../common/latexify';
import { createBibTex } from '../common/latexify';

interface AnalysisResource {
    id: number,
    analysis : Analysis,
    iframe : HTMLIFrameElement,
    $container : HTMLElement,
    loaded : boolean,
    isEmpty: boolean,
    hasTitle: boolean,
    sized: boolean
}

class ResultsPanel extends EventDistributor {
    model: Instance;
    resources: { [key: number]:AnalysisResource };
    analysisCount: number;
    _focus: number = 0;
    annotationFocus: number = 0;
    resultsLooper: selectionLoop;
    _menuId: number | null;
    _refsTable: References;
    _ready: boolean = false;
    mode: string;
    iframeUrl: string;


    constructor(model: Instance, iframeUrl: string, mode: string) {
        super();

        this.model = model;
        this.classList.add('ResultsPanel');
        this.innerHTML = '';
        this.classList.add('jmv-results-panel');
        this.classList.add('results-loop');
        this.setAttribute('role', 'list');
        this.setAttribute('aria-label', 'Results');
        this.setAttribute('tabindex', '-1');

        this.dataset.mode = mode;

        this.resultsLooper = new selectionLoop('results-loop', this);
        this.analysisCount = 0;

        focusLoop.addFocusLoop(this);

        this._menuId = null;
        ContextMenu.el.addEventListener('menuClicked', (event: CustomEvent<ContextMenuButton>) => {
            if (this._menuId !== null) {
                const menuEvent = event as CustomEvent<ContextMenuButton>;
                const button = menuEvent.detail;
                this._menuEvent(button.eventData);
            }
        });

        ContextMenu.on('menu-hidden', (event) => {
            if (this._menuId !== null) {
                if (this._menuId === 0)
                    this._refsTable.deactivate();
                else
                    this._menuEvent({ type: 'activated', address: null });

                this._menuId = null;

                if (event) {
                    if (event.button === 2) {
                        let resource = this._tryGetResource(event.pageX, event.pageY);
                        if (resource !== null) {
                            const containerRect = resource.$container.getBoundingClientRect();
                            const containerLeft = containerRect.left + window.scrollX;
                            const containerTop = containerRect.top + window.scrollY;
                            this._resultsMouseClicked(event.button, event.offsetX - containerLeft, event.offsetY - containerTop, resource.analysis);
                        }
                    }
                }
            }
        });

        this.resources = { };

        this.iframeUrl = iframeUrl;

        this.mode = mode;

        let analyses = this.model.analyses();
        analyses.on('analysisCreated', this._analysisCreated, this);
        analyses.on('analysisDeleted', this._analysisDeleted, this);
        analyses.on('analysisResultsChanged', this._resultsEvent, this);
        analyses.on('analysisAnnotationChanged', this._annotationEvent, this);
        analyses.on('analysisHeadingChanged', this._analysisNameChanged, this);

        this.model.on('change:selectedAnalysis', this._selectedChanged, this);

        window.addEventListener('message', event => this._messageEvent(event));

        this.addEventListener('click', () => {
            if (this.model.attributes.selectedAnalysis !== null)
                this.model.set('selectedAnalysis', null);
        });

        this._refsTable = document.createElement('jmv-references') as References;
        this._refsTable.setAttribute('role', 'listitem');
        this._refsTable.setAttribute('tabindex', '-1');
        this._refsTable.setAttribute('aria-label', _('References'));
        this._refsTable.classList.add('results-loop-list-item', 'results-loop-auto-select');
        this._refsTable.style.display = 'none';
        this._refsTable.setAnalyses(this.model.analyses());
        contextMenuListener(this._refsTable, (event) => {
            event.preventDefault();
            event.stopPropagation();
            this._refsRightClicked(event);
            return false;
        });
        this._refsTable.addEventListener('keydown', (event) => {
            if ((event.ctrlKey || event.metaKey) && event.code === 'KeyC') {
                this._menuEvent({op: 'refsCopy'})
                event.stopPropagation();
            }
        });
        this._refsTable.addEventListener('click', (event) => this._resultsClicked(event, 'refsTable'));
        this.appendChild(this._refsTable);

        contextMenuListener(this, (event) => {
            if (Object.keys(this.resources).length > 0) {
                this._showMenu(-1, { entries: [ ], pos: { left: event.pageX, top: event.pageY }});
                this.classList.add('all-selected');
            }
            event.preventDefault();
            return false;
        });

        this.model.settings().on('change:format',  () => this._updateAll());
        this.model.settings().on('change:devMode', () => this._updateAll());
        this.model.settings().on('change:syntaxMode', () => this._updateAll());
        this.model.settings().on('change:refsMode', () => this._updateRefsMode());
        this.model.on('change:editState', () => this._updateEditState());
    }

    _updateRefsMode() {
        if ( ! this._ready)
            return;
        this._updateAllRefNumbers();
        let refsMode = this.model.settings().getSetting('refsMode', 'bottom');
        if (refsMode === 'bottom')
            this._refsTable.style.display = '';
        else
            this._refsTable.style.display = 'none';
    }

    _checkIfEverythingReady() {
        if (this._ready)
            return;

        for (let id in this.resources) {
            if ( ! this.resources[id].sized)
                return;
        }

        this._ready = true;
        this._refsTable.update();
        this._updateRefsMode();
    }

    _analysisCreated(analysis) {

        this._updateRefs(analysis);

        let element = `
            <iframe
                data-id="${ analysis.id }"
                src="${ this.iframeUrl }${ this.model.instanceId() }/${ analysis.id }/"
                class="analysis"
                sandbox="allow-scripts allow-same-origin"
                scrolling="no"
                style="border: 0 ; height : 0 ;"
            ></iframe>`;

        let isEmptyAnalysis = analysis.name === 'empty';
        let classes = '';
        if (isEmptyAnalysis)
            classes = 'empty-analysis';


        let $container = HTML.parse(`<div class="jmv-results-container results-loop-list-item results-loop-auto-select  ${ classes }" tabindex="-1" role="listitem" aria-label="${ isEmptyAnalysis ? 'Annotation Field' : (analysis.results.title + '- Results')}"></div>`);

        $container.addEventListener('keydown', (event) => {
            if ((event.ctrlKey || event.metaKey) && event.code === 'KeyC') {
                this._menuEvent({ op: 'copy', address: [ analysis.id] });
                event.stopPropagation();
            }
        });

        let after: Element = this._refsTable;

        if (analysis.results.index > 0) {
            let siblings = Array.from(this.children).filter(el => el.classList.contains('jmv-results-container'));

            let index = analysis.results.index - 1;
            if (index < siblings.length)
                after = siblings[index];
        }

        after.parentNode.insertBefore($container, after);

        $container.setAttribute('data-analysis-name', analysis.name);

        if ( ! isEmptyAnalysis || analysis.index === 0)
            this.resultsLooper.highlightElement($container[0], true, false);

        let $cover = HTML.parse('<div class="jmv-results-cover"></div>');
        $container.append($cover);
        let iframe = HTML.parse<HTMLIFrameElement>(element);
        $container.append(iframe);

        $container.addEventListener('keydown', (event) => {
            if (event.keyCode === 13) { //enter
                this.model.set('selectedAnalysis', analysis);
            }
            if (event.altKey && event.code === 'ArrowLeft') { //enter
                if (this.model.get('selectedAnalysis') !== analysis) {
                    this.model.set('selectedAnalysis', analysis);
                    event.stopPropagation();
                    event.preventDefault();
                }
            }
        });

        let selected = this.model.get('selectedAnalysis');
        if (selected !== null && selected instanceof Analysis && analysis.id === selected.id) {
            $container.setAttribute('data-selected', '');
            $container.setAttribute('aria-current', 'true');
        }

        let resources: AnalysisResource = {
            id: analysis.id,
            analysis : analysis,
            iframe : iframe,
            $container : $container,
            loaded : false,
            isEmpty: isEmptyAnalysis,
            hasTitle: ! isEmptyAnalysis || analysis.isFirst(),
            sized: false
        };

        this.resources[analysis.id] = resources;

        iframe.addEventListener('load', () => {
            this._sendI18nDef(resources);
            this._sendResults(resources);
            resources.loaded = true;
        });

        iframe.addEventListener('mouseover mouseout', (event) => {
            this._sendMouseEvent(resources, event);
        });

        if (isEmptyAnalysis === false) {
            $cover.addEventListener('click', event => this._resultsClicked(event, analysis));
            this.analysisCount += 1;
            if (this.analysisCount === 1)
                $container.setAttribute('tabindex', '0');
        }
        else {
            $cover.addEventListener('click', event =>  {
                this._resultsClicked(event, analysis);
                let iframe = resources.iframe;
                let clickEvent = {
                    type: 'click',
                    button: event.button,
                    pageX: event.offsetX,
                    pageY: event.offsetY,
                    bubbles: event.bubbles
                };
                //let clickEvent = new CustomEvent('enterannotation', { detail: {} });
                iframe.contentWindow.postMessage(clickEvent, this.iframeUrl);
            });
        }

        contextMenuListener($cover, event => {
            this._resultsMouseClicked(2, event.offsetX, event.offsetY, analysis);
            event.stopPropagation();
            event.preventDefault();
            return false;
        });

        $cover.addEventListener('mouseenter', event => {
            this._sendMouseEvent(resources, event);
            iframe.classList.add('hover');
        });

        $cover.addEventListener('mouseleave', event => {
            this._sendMouseEvent(resources, event);
            iframe.classList.remove('hover');
        });
    }

    _analysisDeleted(analysis) {
        this._updateRefs();
        let resources = this.resources[analysis.id];
        let $container = resources.$container;
        $container.style.height = '0px';
        if (analysis.name === 'empty')
            $container.remove();
        else {
            this.analysisCount -= 1;
            let removed = false;
            $container.addEventListener('transitionend', () => {
                $container.remove();
                removed = true;
            }, { once: true });
            setTimeout(() => {
                if (removed === false)
                    $container.remove();
            }, 400);
        }
        delete this.resources[analysis.id];
    }

    deepEqual(a, b) {
        if (a === b) return true;

        if (typeof a !== typeof b) return false;

        if (typeof a !== 'object' || a === null || b === null) return false;

        const aKeys = Object.keys(a);
        const bKeys = Object.keys(b);
        if (aKeys.length !== bKeys.length) return false;

        return aKeys.every(key => this.deepEqual(a[key], b[key]));
    }

    _updateRefs(exclude?: Analysis) {
        if ( ! this._ready)
            return;

        let modulesWithRefChanges = [ ];

        let oldNums = this._refsTable.getAllNumbers();
        this._refsTable.update();
        let refNums = this._refsTable.getAllNumbers();
        for (let name in oldNums) {
            if ( ! this.deepEqual(refNums[name], oldNums[name]))
                modulesWithRefChanges.push(name);
        }

        for (let analysis of this.model.analyses()) {
            if (analysis !== exclude && modulesWithRefChanges.includes(analysis.ns)) {
                let res = this.resources[analysis.id];
                if (res.loaded)
                    this._sendRefNumbers(res);
            }
        }
    }

    _annotationEvent(sender, analysis: Analysis, address) {
        if (sender !== this) {
            let resources = this.resources[analysis.id];
            resources.analysis = analysis;
            if (resources.loaded)
                this._sendResults(resources);
        }
    }

    _analysisNameChanged(analysis: Analysis){
        let resources = this.resources[analysis.id];
        if (resources) {
            let heading = analysis.getHeading();
            if (heading === null)
                heading = analysis.results.title
            resources.$container.setAttribute('aria-label', `${ heading } - Results`);
        }
    }

    _resultsEvent(analysis: Analysis) {
        this._updateRefs(analysis);
        let resources = this.resources[analysis.id];
        resources.analysis = analysis;
        if (resources.loaded)
            this._sendResults(resources);
    }

    _updateAllRefNumbers() {
        for (let id in this.resources) {
            let res = this.resources[id];
            if (res.loaded)
                this._sendRefNumbers(res);
        }
    }

    _sendRefNumbers(resources: AnalysisResource) {
        let analysis = resources.analysis;
        let event = {
            type: 'reftablechanged',
            data: {
                refs: this._refsTable.getNumbers(analysis.ns),
                refsMode: this.model.settings().getSetting('refsMode', 'bottom'),
            }
        };
        resources.iframe.contentWindow.postMessage(event, this.iframeUrl);
    }

    _sendMouseEvent(resources: AnalysisResource, eventData) {
        let event = {
            type: 'mouseEvent',
            data: {
                type: eventData.type
            }
        };
        resources.iframe.contentWindow.postMessage(event, this.iframeUrl);
    }

    async _sendI18nDef(resources: AnalysisResource) {
        let analysis = resources.analysis;

        await analysis.ready;

        let event = {
            type: 'i18nDef',
            data: {
                moduleI18n: analysis.i18n,
                appI18n: I18ns.get('app').localeData
            }
        };
        resources.iframe.contentWindow.postMessage(event, this.iframeUrl);
    }

    _sendResults(resources: AnalysisResource) {

        let format;
        try {
            format = JSON.parse(this.model.settings().get('format'));
            // we added .pt later
            if ( ! ('pt' in format))
                format.pt = 'dp';
        }
        catch (e) {
            format = {t:'sf',n:3,pt:'dp',p:3};
        }

        let analysis = resources.analysis;

        let newSelected = this.model.get('selectedAnalysis');

        let event = {
            type: 'results',
            data: {
                name: analysis.name,
                languageCode: this.model.get('resultsLanguage'),
                ns: analysis.ns,
                results: analysis.results,
                options: analysis.options ? analysis.options.getValues() : {},
                mode: this.model.settings().get('syntaxMode') ? 'text' : 'rich',
                devMode: this.model.settings().get('devMode'),
                format: format,
                refs: this._refsTable.getNumbers(analysis.ns),
                refsMode: this.model.settings().getSetting('refsMode', 'bottom'),
                isEmpty: resources.isEmpty,
                hasTitle: resources.hasTitle,
                selected: newSelected === null ? null : newSelected === analysis,
                annotationSelected: newSelected instanceof Analysis ? newSelected.name === 'empty' : false,
                editState: this.model.get('editState')
            }
        };
        resources.iframe.contentWindow.postMessage(event, this.iframeUrl);
    }

    _updateAll() {

        for (let id in this.resources) {
            let resources = this.resources[id];
            if (resources === undefined)
                continue;
            if (resources.loaded === false)
                continue;
            this._sendResults(resources);
        }

    }

    _tryGetResource(xpos, ypos) {
        for (let id in this.resources) {
            let $container = this.resources[id].$container;

            let rect = $container.getBoundingClientRect();
            let left = rect.left + window.scrollX;
            let top = rect.top + window.scrollY;
            let width = $container.offsetWidth;
            let height = $container.offsetHeight;

            if (xpos >= left && xpos <= left + width && ypos >= top && ypos <= top + height)
                return this.resources[id];
        }

        return null;
    }

    _resultsClicked(event, analysis) {
        event.stopPropagation();
        let current = this.model.get('selectedAnalysis');
        if (analysis === 'refsTable')
            this.model.set('selectedAnalysis', 'refsTable');
        else if (current === null || current !== analysis)
            this.model.set('selectedAnalysis', analysis);
        else
            this.model.set('selectedAnalysis', null);
    }

    _resultsMouseClicked(button, offsetX, offsetY, analysis: Analysis) {
        let selected = this.model.attributes.selectedAnalysis;
        if ((selected === null && analysis !== null) || selected === analysis) {
            let resources = this.resources[analysis.id];
            let iframe = resources.iframe;
            let clickEvent = {
                type: 'click',
                button: button,
                pageX: offsetX,
                pageY: offsetY,
                bubbles: true
            };
            iframe.contentWindow.postMessage(clickEvent, this.iframeUrl);
        }
        else {
            this.model.set('selectedAnalysis', null);
        }
    }

    _refsRightClicked(event) {

        let rect = this._refsTable.getBoundingClientRect();
        let left = rect.left + event.offsetX;
        let top = rect.top + event.offsetY;

        let nRefsSelected = this._refsTable.nSelected();
        if (nRefsSelected === 0)
            this._refsTable.activate();

        let entries = [
            {
                name: 'references',
                label: _('References'),
                type: 'copyRef',
                title: _('References'),
                options: [
                    {
                        name: 'copy',
                        label: _('Copy'),
                        op: 'refsCopy',
                        enabled: nRefsSelected > 0,
                    },
                    {
                        name: 'selectAll',
                        label: _('Select all'),
                        op: 'refsSelectAll',
                    },
                    {
                        name: 'clearSelection',
                        label: _('Clear selection'),
                        enabled: nRefsSelected > 0,
                        op: 'refsClearSelection',
                    },
                ]
            },
        ];

        this._menuId = 0;
        ContextMenu.showResultsMenu(entries, left, top);
    }

    _messageEvent(event) {

        for (let id in this.resources) {

            let resources = this.resources[id];
            if (event.source !== resources.iframe.contentWindow)
                continue;

            let payload = event.data;
            let eventType = payload.type;
            let eventData = payload.data;
            let iframe = resources.iframe;
            let $container = resources.$container;
            let analysis = resources.analysis;

            let options = { };
            switch (eventType) {
                case 'annotationChanged':
                    this.model.set('edited', true);
                    this.dispatchEvent(new CustomEvent('annotationChanged', { bubbles:true }));
                    break;
                case 'annotationFocus':
                    this._focus += 1;
                    if (this._focus === 1) {
                        this.annotationGotFocus();
                        this.dispatchEvent(new CustomEvent('annotationFocus', { bubbles:true }));
                    }
                    break;
                case 'analysisLostFocus':
                    this.dispatchEvent(new CustomEvent('analysisLostFocus', { bubbles:true }));
                    break;
                case 'annotationLostFocus':
                    this._focus -= 1;
                    if (this._focus === 0) {
                        this.annotationLostFocus();
                        this.dispatchEvent(new CustomEvent('annotationLostFocus', { bubbles:true }));
                    }
                    else if (this._focus < 0)
                        throw "shouldn't get here";
                    break;
                case 'activeFormatChanged':
                    this.dispatchEvent(new CustomEvent('activeFormatChanged', { detail: eventData, bubbles:true }));
                    break;
                case 'headingChanged':
                    this.dispatchEvent(new CustomEvent('headingChanged', { detail: eventData, bubbles: true }));
                    analysis.updateHeading();
                    break;
                case 'sizeChanged':
                    let height = eventData.height;
                    let width = eventData.width;
                    if (height < 20)
                        height = 20;
                    if (width < 620)
                        width = 620;

                    if (iframe.offsetHeight === 0)
                        iframe.style.width = `${width}px`;

                    let selected = this.model.get('selectedAnalysis');
                    if (selected instanceof Analysis && eventData.scrollIntoView && selected !== null && selected.id !== undefined && selected.id.toString() === id)
                        this._scrollIntoView($container, height);
                    iframe.style.width = `${width}px`;
                    iframe.style.height = `${height}px`;
                    $container.style.width = `${width}px`;
                    $container.style.height = `${height}px`;

                    resources.sized = true;
                    this._checkIfEverythingReady();

                    break;
                case 'copy':
                    this.copyItem(id, eventData);
                    break;
                case 'menu':
                    const rect = iframe.getBoundingClientRect();
                    const scrollLeft = window.scrollX || document.documentElement.scrollLeft;
                    const scrollTop = window.scrollY || document.documentElement.scrollTop;

                    eventData.pos.left += rect.left + scrollLeft;
                    eventData.pos.top  += rect.top + scrollTop;
                    this._showMenu(id, eventData);
                    break;
                case 'setOption':
                    options[eventData.name] = eventData.value;
                    analysis.setOptions(options);
                    break;
                case 'setParam':
                    let address = flatten(eventData.address);
                    let root = `results/${ address }`;
                    let annotationName = null;
                    for (let optionName in eventData.options) {
                        if (optionName === 'topText' || optionName === 'bottomText' || optionName === 'heading')
                            annotationName = root + '/' + optionName;
                        let value = eventData.options[optionName];
                        let path = root + '/' + optionName;
                        options[path] = value;
                    }
                    analysis.setOptions(options);

                    if (annotationName !== null)
                        analysis.annotationChanged(this, annotationName);
                    break;
                case 'openUrl':
                    host.openUrl(eventData.url);
                    break;
                case 'mouseEvent':
                    /*let newEvent = $.Event( eventData.eventName, eventData);

                    let pos = $iframe.offset();

                    newEvent.pageX += pos.left;
                    newEvent.pageY += pos.top;

                    $(document).trigger(newEvent);*/


                    // Get iframe offset relative to document
                    const rect2 = iframe.getBoundingClientRect();
                    const offsetLeft = rect2.left + window.scrollX;
                    const offsetTop = rect2.top + window.scrollY;

                    // Adjust the mouse coordinates
                    const adjustedPageX = (eventData.pageX || 0) + offsetLeft;
                    const adjustedPageY = (eventData.pageY || 0) + offsetTop;

                    // Create a new MouseEvent
                    const newEvent = new MouseEvent(eventData.eventName, {
                        bubbles: true,
                        cancelable: true,
                        view: window,
                        pageX: adjustedPageX,
                        pageY: adjustedPageY,
                        clientX: adjustedPageX - window.scrollX,  // Optional: emulate original viewport position
                        clientY: adjustedPageY - window.scrollY,
                        button: eventData.button || 0,
                        buttons: eventData.buttons || 0,
                        ctrlKey: eventData.ctrlKey || false,
                        shiftKey: eventData.shiftKey || false,
                        altKey: eventData.altKey || false,
                        metaKey: eventData.metaKey || false
                    });

                    // Dispatch it on the document
                    document.dispatchEvent(newEvent);


                    break;
            }
        }
    }

    copyItem(id, data) {
        let address = data.address.slice();
        address.unshift(id);
        this._menuEvent({ op: 'copy', address });
    }

    _showMenu(id, data) {

        this._menuId = id;

        let entries = [ ];
        for (let entry of data.entries) {
            let address = entry.address.slice();
            let options = entry.options.slice();
            if (address.length === 0)
                options.push({ name: 'remove', label: _('Remove'), splitter: true });
            address.unshift(id);
            let e = {
                name: entry.name,
                label: entry.label,
                type: entry.type,
                address: address,
                options: options,
                title: entry.title,
            };
            entries.push(e);
        }

        // Add root
        entries.unshift({
            name: 'all',
            label: _('All'),
            type: 'All',
            address: [ ],
            options: [
                { name:'copy', label: _('Copy') },
                { name: 'export', label: _('Export') },
                { name: 'remove', label: _('Remove'), splitter: true },
            ],
            title: 'All',
        });

        ContextMenu.showResultsMenu(entries, data.pos.left, data.pos.top);
    }

    getAsLatex() {
        const analyses = [ ...this.model.analyses() ];
        const fragments: Array<string> = [];
        let references: Array<IReference> = [ R, jmv ];
        let first = true;

        for (let analysis of analyses) {
            const results = analysis.results;
            const values = analysis.options.getValues();
            const hydrated = hydrate(results, [], values, first, analysis.id);
            first = false;
            if (hydrated === null)
                continue;
            const latex = latexify(hydrated);
            if (latex !== null && latex !== '')
                fragments.push(latex);
            // get references from results
            references.push(...analysis.references);
        }

        // remove duplicate references
        const nameRefPairs = references.map(ref => [ref.name, ref]);
        const refsByName = Object.fromEntries(nameRefPairs);
        references = Object.values(refsByName);
        const refNames = Object.keys(refsByName);

        const doc = createDoc(fragments, refNames);
        const bibtex = createBibTex(references);

        return `${ doc }[--BIBTEX_FROM_HERE--]\n${ bibtex }`;
    }

    getAsHTML(options, part?) {
        if ( ! part) {

            options.fragment = true;

            let promises = Array.from(this.model.analyses())
                .map(analysis => analysis.id)
                .map(id => this._getContent([ id ], options));

            let refs = exportElem(this._refsTable, 'text/html', options)
                .then((html) => { return { html }; });
            promises.push(refs);

            return Promise.all(promises).then((chunks) => {
                chunks = chunks.map((chunk) => chunk.html);
                let content = chunks.join('');
                let html = exportElem(content);
                return html;
            });
        }

        if ( ! options.exclude)
            options.exclude = [ ];
        options.exclude.push('.jmvrefs', 'jmv-reference-numbers');

        let address = unflatten(part);
        return this._getContent(address, options)
            .then((content) => content.html);
    }

    _getContent(address, options) {

        if (address.length === 0) {
            return this.getAsHTML(options).then((html) => {
                return { html };
            });
        }

        address = address.slice(); // clone
        options = Object.assign({}, options); // clone

        let id = address.shift();
        options.id = id;
        let iframeWindow = this.resources[id].iframe.contentWindow;
        iframeWindow.postMessage({ type: 'getcontent', data: { address, options } }, '*');

        return new Promise((resolve, reject) => {
            let responseHandler = (event) => {
                if (event.source === iframeWindow
                        && event.data.type === 'getcontent'
                        && flatten(event.data.data.address) === flatten(address)) {
                    window.removeEventListener('message', responseHandler);
                    resolve(event.data.data.content);
                }
            };
            window.addEventListener('message', responseHandler);
        });
    }

    async _menuEvent(event) {

        if (event.op === 'copy') {

            let options = {
                margin: '24',
                docType: true,
                exclude: [ '.jmvrefs', 'jmv-reference-numbers' ],
            };

            if (host.isElectron) {
                // this is necessary for compatibility with Office 2010
                // and possibly for other versions, but we haven't explored
                // exhaustively.
                options.images = 'absolute';
            }

            this._getContent(event.address, options).then((content) => {

                return host.copyToClipboard(content);

            }).then(() => {

                let note = new Notify({
                    title: _('Copied'),
                    message: _('The content has been copied to the clipboard'),
                    duration: 2000,
                    type: 'success'
                });

                this.model.trigger('notification', note);
            });
        }
        else if (event.op === 'addNote') {
            let address = event.address.slice(); // clone
            let id = address.shift();
            let iframeWindow = this.resources[id].iframe.contentWindow;
            let options = {
                text: '^ '
            };
            iframeWindow.postMessage({ type: 'addNote', data: { address, options } }, '*');
        }
        else if (event.op === 'export') {

            let part = flatten(event.address);

            let saveOptions = {
                path: undefined, // TBD
                name: 'Image',
                export: true,
                part: part,
                partType: 'image',
                overwrite: host.isElectron === false,
            };

            if (event.target.type === 'Image') {
                let options = {
                    title: _('Export image'),
                    filters: [
                        { name: 'PDF', description: _('PDF Document {ext}', { ext: '(.pdf)' }), extensions: [ 'pdf' ] },
                        { name: 'PNG', description: _('PNG Image {ext}', { ext: '(.png)' }), extensions: [ 'png' ] },
                        { name: 'SVG', description: _('SVG Image {ext}', { ext: '(.svg)' }), extensions: [ 'svg' ] },
                        { name: 'EPS', description: _('EPS Image {ext}', { ext: '(.eps)' }), extensions: [ 'eps' ] },
                        { name: 'PPTX', description: _('PowerPoint Slide {ext}', { ext: '(.pptx)' }), extensions: [ 'pptx' ] },
                    ]
                };
                let result = await host.showSaveDialog(options);
                if (result.cancelled)
                    return;
                saveOptions.path = result.file;
                let status = await this.model.save(saveOptions);
                if (host.isElectron === false && status.path) {
                    let source = path.basename(status.path);
                    let url = `dl/${ source }?filename=${ path.basename(result.file) }`;
                    await host.triggerDownload(url);
                }
            }
            else {

                let saveOptions = {
                    path: undefined, // TBD
                    name: 'Image',
                    export: true,
                    part: part,
                    overwrite: host.isElectron === false,
                };

                let options = {
                    title: _('Export results'),
                    filters: [
                        { name: 'PDF',  description: _('PDF Document {ext}', { ext: '(.pdf)' }),    extensions: [ 'pdf' ] },
                        { name: 'HTML', description: _('Web Page {ext}', { ext: '(.html, .htm)' }), extensions: ['html', 'htm'] },
                    ]
                };

                if (part === '')
                    options.filters.push({ name: 'LaTeX', description: _('LaTeX bundle {ext}', { ext: '(.zip)' }), extensions:  [ 'zip' ] });

                let result = await host.showSaveDialog(options);
                if (result.cancelled)
                    return;
                saveOptions.path = result.file;
                let status = await this.model.save(saveOptions);
                if (host.isElectron === false && status.path) {
                    let source = path.basename(status.path);
                    let url = `dl/${ source }?filename=${ path.basename(result.file) }`;
                    await host.triggerDownload(url);
                }
            }
        }
        else if (event.op === 'duplicate') {
            let parentId = this.resources[this._menuId].id;
            let analysis = await this.model.duplicateAnalysis(parentId);
            this.model.set('selectedAnalysis', analysis);
        }
        else if (event.op === 'remove') {
            this.model.set('selectedAnalysis', null);
            if (event.address.length === 0) {
                this.model.deleteAll();
            }
            else {
                let analysisId = this.resources[this._menuId].id;
                let analysis = this.model.analyses().get(analysisId);
                this.model.deleteAnalysis(analysis);
            }
        }
        else if (event.op === 'refsCopy') {
            host.copyToClipboard({
                html: this._refsTable.asHTML(),
                text: this._refsTable.asText(),
            }).then(() => {
                let note = new Notify({
                    title: _('Copied'),
                    message: _('The content has been copied to the clipboard'),
                    duration: 2000,
                    type: 'success'
                });
                this.model.trigger('notification', note);
            });
        }
        else if (event.op === 'refsSelectAll') {
            this._refsTable.selectAll();
        }
        else if (event.op === 'refsClearSelection') {
            this._refsTable.clearSelection();
        }
        else if (['copy2', 'copyLatex'].includes(event.op)) {
            const address = event.address;
            const analysisId = parseInt(address.shift());
            const analysis = this.model.analyses().get(analysisId);
            const results = analysis.results;
            const values = analysis.options.getValues();
            const hydrated = hydrate(results, address, values);

            let content;
            if (event.op === 'copy2') {
                const html = htmlify(hydrated);
                content = { html, text: html };
            }
            else {
                const text = latexify(hydrated);
                content = { text };
            }

            await host.copyToClipboard(content);

            const note = new Notify({
                title: _('Copied'),
                message: _('The content has been copied to the clipboard'),
                duration: 2000,
                type: 'success'
            });
            this.model.trigger('notification', note);

        }
        else {

            event = Object.assign({}, event); // clone
            let address = event.address;

            if (address === null) {
                this.classList.remove('all-selected');
            } else if (event.address.length === 0) {
                this.classList.add('all-selected');
                event.address = null;
            } else {
                this.classList.remove('all-selected');
                address = address.slice(); // clone
                let id = address.shift();
                event.address = address;
            }

            if (this._menuId > 0 && this._menuId in this.resources) {
                let message = { type: 'menuEvent', data: event };
                this.resources[this._menuId].iframe.contentWindow.postMessage(message, this.iframeUrl);
            }
        }
    }

    /*_scrollIntoView($item: HTMLElement, itemHeight: number) {

        itemHeight = itemHeight || $item.height();

        let viewPad = parseInt(this.$el.css('padding-top'));
        let viewTop = this.$el.scrollTop();
        let viewHeight = this.$el.parent().height();
        let viewBottom = viewTop + viewHeight;
        let itemTop = viewTop + $item.position().top;
        let itemBottom = itemTop + itemHeight + 24;

        viewTop += viewPad;

        if (itemHeight < viewHeight) {

            if (itemTop < viewTop)
                this.$el.stop().animate({ scrollTop: itemTop }, { duration: 'slow', easing: 'swing' });
            else if (itemBottom > viewBottom)
                this.$el.stop().animate({ scrollTop: itemBottom - viewHeight }, { duration: 'slow', easing: 'swing' });
        }
        else {
            if (itemTop > viewTop)
                this.$el.stop().animate({ scrollTop: itemTop }, { duration: 'slow', easing: 'swing' });
            else if (itemBottom < viewBottom)
                this.$el.stop().animate({ scrollTop: itemBottom - viewHeight }, { duration: 'slow', easing: 'swing' });
        }
    }*/

    _scrollIntoView(item: HTMLElement, itemHeight: number) {
        const containerStyle = getComputedStyle(this);

        // Fallback to actual offsetHeight if itemHeight is not provided
        itemHeight = itemHeight || item.offsetHeight;

        const viewPad = parseInt(containerStyle.paddingTop || "0", 10);
        const viewTop = this.scrollTop;
        const viewHeight = this.parentElement?.clientHeight || this.clientHeight;
        const viewBottom = viewTop + viewHeight;

        // Position of item relative to container
        const itemTop = item.offsetTop;
        const itemBottom = itemTop + itemHeight + 24;

        const targetScrollTop = (() => {
            if (itemHeight < viewHeight) {
                if (itemTop < viewTop + viewPad)
                    return itemTop;
                else if (itemBottom > viewBottom)
                    return itemBottom - viewHeight;
            } else {
                if (itemTop > viewTop + viewPad)
                    return itemTop;
                else if (itemBottom < viewBottom)
                    return itemBottom - viewHeight;
            }
            return null;
        })();

        // Smooth scroll if needed
        if (targetScrollTop !== null) {
            this.scrollTo({
                top: targetScrollTop,
                behavior: 'smooth'
            });
        }
    }

    setFocus() {
        focusLoop.enterFocusLoop(this);
    }

    _selectedChanged(event) {
        let oldSelected = this.model.previous('selectedAnalysis');
        let newSelected = this.model.get('selectedAnalysis');

        if (oldSelected) {
            if (oldSelected === 'refsTable') {
                this._refsTable.deselect();
                delete this._refsTable.dataset.selected;
            }
            else {
                let oldSelectedResults = this.resources[oldSelected.id];
                if (oldSelectedResults) {
                    oldSelectedResults.$container.removeAttribute('data-selected');
                    oldSelectedResults.$container.setAttribute('aria-current', 'false');
                }
            }
        }

        if (newSelected !== null) {
            this.setAttribute('data-analysis-selected', '');
            if (newSelected === 'refsTable') {
                this._refsTable.select();
                this._refsTable.dataset.selected = '';
            }
            else {
                let newSelectedResults = this.resources[newSelected.id];
                if (newSelectedResults) {
                    newSelectedResults.$container.setAttribute('data-selected', '');
                    newSelectedResults.$container.setAttribute('aria-current', 'true');
                }
                this._refsTable.deselect();
                delete this._refsTable.dataset.selected;
            }
            this._sendSelected(newSelected.id);
        }
        else {
            this._sendSelected(null);
            this.removeAttribute('data-analysis-selected');
        }
    }

    _sendSelected(resourceId: number) {
        let selectedResource = this.resources[resourceId];
        for (let id in this.resources) {
            let resource = this.resources[id];
            if (resource === undefined)
                continue;
            if (resource.loaded === false)
                continue;

            let event = {
                type: 'selected',
                data: {
                    state: resourceId === null ? null : resource.id === resourceId,
                    annotationSelected: false
                }
            };

            if (selectedResource)
                event.data.annotationSelected = selectedResource.analysis.name === 'empty';

            resource.iframe.contentWindow.postMessage(event, this.iframeUrl);
        }
    }

    annotationGotFocus() {
        // Added debounce to minimize focus events flying around due
        // to the disconnect between the toolbar and the editors in the iframes
        this.annotationFocus += 1;
        if (this.annotationFocus === 1) {

            let event = {
                type: 'annotationEvent',
                data: {
                    type: 'editFocused',
                    state: true,
                    short: this.model.get('editState') === false
                }
            };

            for (let id in this.resources) {
                let resources = this.resources[id];
                if (resources === undefined)
                    continue;
                if (resources.loaded === false)
                    continue;

                resources.iframe.contentWindow.postMessage(event, this.iframeUrl);
            }
        }

    }

    annotationLostFocus() {
        this.annotationFocus -= 1;
        if (this.annotationFocus === 0) {

            let event = {
                type: 'annotationEvent',
                data: {
                    type: 'editFocused',
                    state: false,
                    short: false
                }
            };

            for (let id in this.resources) {
                let resources = this.resources[id];
                if (resources === undefined)
                    continue;
                if (resources.loaded === false)
                    continue;

                resources.iframe.contentWindow.postMessage(event, this.iframeUrl);
            }
        }
        else if (this.annotationFocus < 0)
            throw "shouldn't get here";
    }

    _updateEditState() {
        let event = {
            type: 'annotationEvent',
            data: {
                type: 'editState',
                state: this.model.get('editState')
            }
        };
        for (let id in this.resources) {
            let resources = this.resources[id];
            if (resources === undefined)
                continue;
            if (resources.loaded === false)
                continue;

            resources.iframe.contentWindow.postMessage(event, this.iframeUrl);
        }
    }

    annotationAction(action) {
        let event = {
            type: 'annotationEvent',
            data: {
                type: 'action',
                action: action
            }
        };

        for (let id in this.resources) {
            let resources = this.resources[id];
            if (resources === undefined)
                continue;
            if (resources.loaded === false)
                continue;

            let attr = resources.$container.getAttribute('data-selected');
            if (attr !== undefined && attr !== null && attr !== 'false') {
                resources.iframe.contentWindow.postMessage(event, this.iframeUrl);
                break;
            }
        }
    }
}

customElements.define('jmv-resultspanel', ResultsPanel);

export default ResultsPanel;
