'use strict';

const $ = require('jquery');
const _ = require('underscore');
const Backbone = require('backbone');
Backbone.$ = $;

const formatIO = require('../common/utils/formatio');

const Menu = require('./menu');
const ContextMenus = require('./contextmenu/contextmenus');
const ContextMenu = require('./contextmenu');
const Notify = require('./notification');
const host = require('./host');

const { flatten, unflatten } = require('../common/utils/addresses');

require('./references');

const ResultsPanel = Backbone.View.extend({
    className: 'ResultsPanel',
    initialize(args) {

        this.el.innerHTML = '';
        this.el.classList.add('jmv-results-panel');
        this.el.dataset.mode = args.mode;

        this._menuId = null;
        ContextMenu.$el.on('menuClicked', (event, button) => {
            if (this._menuId !== null)
                this._menuEvent(button.eventData);
        });

        ContextMenu.on('menu-closed', (event) => {
            if (this._menuId !== null) {
                if (this._menuId === 0)
                    this._refsTable.deactivate();
                else
                    this._menuEvent({ type: 'activated', address: null });

                this._menuId = null;

                if (event !== undefined) {
                    if (event.button === 2) {
                        let resource = this._tryGetResource(event.pageX, event.pageY);
                        if (resource !== null)
                            this._resultsRightClicked(event.offsetX - resource.$container.offset().left, event.offsetY - resource.$container.offset().top, resource.analysis);
                    }
                }
            }
        });

        this.resources = { };

        if ('iframeUrl' in args)
            this.iframeUrl = args.iframeUrl;

        if ('mode' in args)
            this.mode = args.mode;

        this.model.analyses().on('analysisResultsChanged', this._resultsEvent, this);
        this.model.on('change:selectedAnalysis', this._selectedChanged, this);

        window.addEventListener('message', event => this._messageEvent(event));

        this.$el.on('click', () => {
            if (this.model.attributes.selectedAnalysis !== null)
                this.model.set('selectedAnalysis', null);
        });

        this._ready = false;

        this._refsTable = document.createElement('jmv-references');
        this._refsTable.style.display = 'none';
        this._refsTable.setAnalyses(this.model.analyses());
        this._refsTable.addEventListener('contextmenu', (event) => {
            event.preventDefault();
            event.stopPropagation();
            this._refsRightClicked(event);
            return false;
        });
        this._refsTable.addEventListener('click', (event) => this._resultsClicked(event, 'refsTable'));
        this.el.appendChild(this._refsTable);

        this.el.addEventListener('contextmenu', (event) => {
            let thereAreSomeAnalyses = false;
            for (let id in this.resources) {
                let analysis = this.resources[id].analysis;
                if ( ! analysis.deleted) {
                    thereAreSomeAnalyses = true;
                    break;
                }
            }
            if (thereAreSomeAnalyses) {
                this._showMenu(-1, { entries: [ ], pos: { left: event.pageX, top: event.pageY }});
                this.el.classList.add('all-selected');
            }
            event.preventDefault();
            return false;
        });

        this.model.settings().on('change:format',  () => this._updateAll());
        this.model.settings().on('change:devMode', () => this._updateAll());
        this.model.settings().on('change:refsMode', () => this._updateRefsMode());
    },
    _updateRefsMode() {
        if ( ! this._ready)
            return;
        this._updateAllRefNumbers();
        let refsMode = this.model.settings().getSetting('refsMode', 'bottom');
        if (refsMode === 'bottom')
            this._refsTable.style.display = '';
        else
            this._refsTable.style.display = 'none';
    },
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
    },
    _resultsEvent(analysis) {

        if (this._ready)
            this._refsTable.update();

        let refNums = this._refsTable.getNumbers();
        let modulesAffected = [ ];

        for (let name in this._oldNums) {
            if ( ! _.isEqual(refNums[name], this._oldNums[name])) {
                modulesAffected.push(name);
            }
        }
        this._oldNums = refNums;

        let resources = this.resources[analysis.id];

        if (resources === undefined) {

            let element = `
                <iframe
                    data-id="${ analysis.id }"
                    src="${ this.iframeUrl }${ this.model.instanceId() }/${ analysis.id }/"
                    class="analysis"
                    sandbox="allow-scripts allow-same-origin"
                    scrolling="no"
                    style="border: 0 ; height : 0 ;"
                ></iframe>`;

            let $container = $('<div class="jmv-results-container"></div>');

            let $after = $(this._refsTable);
            if (analysis.results.index > 0) {
                let $siblings = this.$el.children('.jmv-results-container');
                let index = analysis.results.index - 1;
                if (index < $siblings.length)
                    $after = $siblings[index];
            }

            $container.insertBefore($after);

            let $cover = $('<div class="jmv-results-cover"></div>').appendTo($container);
            let $iframe = $(element).appendTo($container);
            let iframe = $iframe[0];

            let selected = this.model.get('selectedAnalysis');
            if (selected !== null && analysis.id === selected.id)
                $container.attr('data-selected', '');

            resources = {
                id : analysis.id,
                analysis : analysis,
                iframe : iframe,
                $iframe : $iframe,
                $container : $container,
                loaded : false,
            };

            this.resources[analysis.id] = resources;

            $iframe.on('load', () => {
                this._sendResults(resources);
                resources.loaded = true;
            });

            $cover.on('click', event => this._resultsClicked(event, analysis));
            $cover.on('contextmenu', event => {
                this._resultsRightClicked(event.offsetX, event.offsetY, analysis);
                event.stopPropagation();
            });
        }
        else if (analysis.deleted) {
            let $container = resources.$container;
            $container.css('height', '0');
            $container.one('transitionend', () => $container.hide());
        }
        else {

            resources.analysis = analysis;
            if (resources.loaded)
                this._sendResults(resources);
        }

        for (let ana of this.model.analyses()) {
            if (ana !== analysis && modulesAffected.includes(ana.ns)) {
                let res = this.resources[ana.id];
                if (res.loaded)
                    this._sendRefNumbers(res);
            }
        }
    },
    _updateAllRefNumbers() {
        for (let id in this.resources) {
            let res = this.resources[id];
            if (res.loaded)
                this._sendRefNumbers(res);
        }
    },
    _sendRefNumbers(resources) {
        let analysis = resources.analysis;
        let event = {
            type: 'reftablechanged',
            data: {
                refs: this._refsTable.getNumbers(analysis.ns),
                refsMode: this.model.settings().getSetting('refsMode'),
            }
        };
        resources.iframe.contentWindow.postMessage(event, this.iframeUrl);
    },
    _sendResults(resources) {

        if (this.mode === 'rich' || resources.analysis.incAsText) {

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

            let event = {
                type: 'results',
                data: {
                    results: analysis.results,
                    options: analysis.options.getValues(),
                    mode: this.mode,
                    devMode: this.model.settings().get('devMode'),
                    format: format,
                    refs: this._refsTable.getNumbers(analysis.ns),
                    refsMode: this.model.settings().getSetting('refsMode'),
                }
            };
            resources.iframe.contentWindow.postMessage(event, this.iframeUrl);
        }
    },
    _updateAll() {

        for (let id in this.resources) {
            let resources = this.resources[id];
            if (resources === undefined)
                continue;
            if (resources.analysis.deleted)
                continue;
            if (resources.loaded === false)
                continue;
            this._sendResults(resources);
        }

    },
    _tryGetResource(xpos, ypos) {
        for (let id in this.resources) {
            let $container = this.resources[id].$container;
            let offset = $container.offset();
            if (xpos >= offset.left && xpos <= offset.left + $container.width() && ypos >= offset.top && ypos <= offset.top + $container.height())
                return this.resources[id];
        }
        return null;
    },
    _resultsClicked(event, analysis) {
        event.stopPropagation();
        let current = this.model.get('selectedAnalysis');
        if (analysis === 'refsTable')
            this.model.set('selectedAnalysis', 'refsTable');
        else if (current === null || current !== analysis)
            this.model.set('selectedAnalysis', analysis);
        else
            this.model.set('selectedAnalysis', null);
    },
    _resultsRightClicked(offsetX, offsetY, analysis) {
        let selected = this.model.attributes.selectedAnalysis;
        if ((selected === null && analysis !== null) || selected === analysis) {
            let resources = this.resources[analysis.id];
            let iframe = resources.iframe;
            let clickEvent = $.Event('click', { button: 2, pageX: offsetX, pageY: offsetY, bubbles: true });
            iframe.contentWindow.postMessage(clickEvent, this.iframeUrl);
        }
        else {
            this.model.set('selectedAnalysis', null);
        }
    },
    _refsRightClicked(event) {

        event.stopPropagation();

        let rect = this._refsTable.getBoundingClientRect();
        let left = rect.left + event.offsetX;
        let top = rect.top + event.offsetY;

        let nRefsSelected = this._refsTable.nSelected();
        if (nRefsSelected === 0)
            this._refsTable.activate();

        let entries = [
            {
                label: 'References',
                type: 'copyRef',
                title: 'References',
                options: [
                    {
                        label: 'Copy',
                        op: 'refsCopy',
                        enabled: nRefsSelected > 0,
                    },
                    {
                        label: 'Select all',
                        op: 'refsSelectAll',
                    },
                    {
                        label: 'Clear selection',
                        enabled: nRefsSelected > 0,
                        op: 'refsClearSelection',
                    },
                ]
            },
        ];

        this._menuId = 0;
        ContextMenu.showResultsMenu(entries, left, top);
    },
    _messageEvent(event) {

        for (let id in this.resources) {

            let resources = this.resources[id];
            if (event.source !== resources.iframe.contentWindow)
                continue;

            if (resources.analysis.deleted)
                return;

            let payload = event.data;
            let eventType = payload.type;
            let eventData = payload.data;
            let $iframe = resources.$iframe;
            let $container = resources.$container;
            let analysis = resources.analysis;

            let options = { };

            switch (eventType) {
                case 'sizeChanged':
                    let height = eventData.height;
                    let width = eventData.width;
                    if (height < 100)
                        height = 100;
                    if (width < 620)
                        width = 620;

                    if ($iframe.height() === 0)
                        $iframe.width(width);

                    let selected = this.model.get('selectedAnalysis');
                    if (selected !== null && selected.id.toString() === id)
                        this._scrollIntoView($container, height);
                    $iframe.width(width);
                    $iframe.height(height);
                    $container.width(width);
                    $container.height(height);

                    resources.sized = true;
                    this._checkIfEverythingReady();

                    break;
                case 'menu':
                    let offset = $iframe.offset();
                    eventData.pos.left += offset.left;
                    eventData.pos.top  += offset.top;
                    this._showMenu(id, eventData);
                    break;
                case 'setOption':
                    options[eventData.name] = eventData.value;
                    analysis.setOptions(options);
                    break;
                case 'setParam':
                    let address = flatten(eventData.address);
                    let root = `results/${ address }`;
                    for (let optionName in eventData.options) {
                        let value = eventData.options[optionName];
                        let path = root + '/' + optionName;
                        options[path] = value;
                    }
                    analysis.setOptions(options);
                    break;
                case 'openUrl':
                    host.openUrl(eventData.url);
                    break;
                case 'mouseEvent':
                    let newEvent = $.Event( eventData.eventName, eventData);

                    let pos = $iframe.offset();

                    newEvent.pageX += pos.left;
                    newEvent.pageY += pos.top;

                    $(document).trigger(newEvent);
                    break;
            }
        }
    },
    _showMenu(id, data) {

        this._menuId = id;

        let entries = [ ];
        for (let entry of data.entries) {
            let address = entry.address.slice();
            let options = entry.options.slice();
            if (address.length === 0)
                options.push({ label: 'Remove', splitter: true });
            address.unshift(id);
            let e = {
                label: entry.type,
                type: entry.type,
                address: address,
                options: options,
                title: entry.title,
            };
            entries.push(e);
        }

        // Add root
        entries.unshift({
            label: 'All',
            type: 'All',
            address: [ ],
            options: [
                { label: 'Copy' },
                { label: 'Export' },
                { label: 'Remove', splitter: true },
            ],
            title: 'All',
        });

        ContextMenu.showResultsMenu(entries, data.pos.left, data.pos.top);
    },
    getAsHTML(options, part) {
        if ( ! part) {

            options.fragment = true;

            let promises = Array.from(this.model.analyses())
                .filter(analysis => ! analysis.deleted)
                .map(analysis => analysis.id)
                .map(id => this._getContent([ id ], options));

            let refs = formatIO.exportElem(this._refsTable, 'text/html', options)
                .then((html) => { return { html }; });
            promises.push(refs);

            return Promise.all(promises).then((chunks) => {
                chunks = chunks.map((chunk) => chunk.html);
                let content = chunks.join('');
                let html = formatIO.exportElem(content);
                return html;
            });
        }

        if ( ! options.exclude)
            options.exclude = [ ];
        options.exclude.push('.jmvrefs', 'jmv-reference-numbers');

        let address = unflatten(part);
        return this._getContent(address, options)
            .then((content) => content.html);
    },
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
    },
    _menuEvent(event) {

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
                    title: 'Copied',
                    message: 'The content has been copied to the clipboard',
                    duration: 2000,
                    type: 'success'
                });

                this.model.trigger('notification', note);
            });
        }
        else if (event.op === 'export') {

            let part = flatten(event.address);

            if (event.target.type === 'Image') {
                let options = {
                    title: 'Export image',
                    filters: [
                        { name: 'PDF', extensions: [ 'pdf' ] },
                        { name: 'PNG', extensions: [ 'png' ] },
                        { name: 'SVG', extensions: [ 'svg' ] },
                        { name: 'EPS', extensions: [ 'eps' ] }, ]
                };

                host.showSaveDialog(options).then((result) => {
                    if (result.canceled)
                        return;
                    let filePath = result.filePath.replace(/\\/g, '/');
                    return this.model.save(
                        filePath,
                        {
                            name: 'Image',
                            export: true,
                            part: part,
                            partType: 'image',
                        },
                        true);
                });
            }
            else {

                let options = {
                    title: 'Export results',
                    filters: [
                        { name: 'PDF', extensions:  [ 'pdf' ] },
                        { name: 'HTML', extensions: [ 'html', 'htm' ] },
                    ]
                };

                host.showSaveDialog(options).then((result) => {
                    if (result.canceled)
                        return;
                    let filePath = result.filePath.replace(/\\/g, '/');
                    return this.model.save(
                        filePath,
                        {
                            name: 'Image',
                            export: true,
                            part: part,
                        },
                        true);
                });
            }
        }
        else if (event.op === 'duplicate') {
            let parentId = this.resources[this._menuId].id;
            let analysis = this.model.duplicateAnalysis(parentId);
            this.model.set('selectedAnalysis', analysis);
        }
        else if (event.op === 'remove') {
            this.model.set('selectedAnalysis', null);
            if (event.address.length === 0) {
                this.model.analyses().deleteAll();
            }
            else {
                let analysisId = this.resources[this._menuId].id;
                this.model.analyses().deleteAnalysis(analysisId);
            }
        }
        else if (event.op === 'refsCopy') {
            host.copyToClipboard({
                html: this._refsTable.asHTML(),
                text: this._refsTable.asText(),
            }).then(() => {
                let note = new Notify({
                    title: 'Copied',
                    message: 'The content has been copied to the clipboard',
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
        else {

            event = Object.assign({}, event); // clone
            let address = event.address;

            if (address === null) {
                this.el.classList.remove('all-selected');
            } else if (event.address.length === 0) {
                this.el.classList.add('all-selected');
                event.address = null;
            } else {
                this.el.classList.remove('all-selected');
                address = address.slice(); // clone
                let id = address.shift();
                event.address = address;
            }

            if (this._menuId > 0) {
                let message = { type: 'menuEvent', data: event };
                this.resources[this._menuId].iframe.contentWindow.postMessage(message, this.iframeUrl);
            }
        }
    },
    _scrollIntoView($item, itemHeight) {

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
    },
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
                if (oldSelectedResults)
                    oldSelectedResults.$container.removeAttr('data-selected');
            }
        }

        if (newSelected !== null) {
            this.$el.attr('data-analysis-selected', '');
            if (newSelected === 'refsTable') {
                this._refsTable.select();
                this._refsTable.dataset.selected = '';
            }
            else {
                let newSelectedResults = this.resources[newSelected.id];
                if (newSelectedResults)
                    newSelectedResults.$container.attr('data-selected', '');
                this._refsTable.deselect();
                delete this._refsTable.dataset.selected;
            }
        }
        else {
            this.$el.removeAttr('data-analysis-selected');
        }
    }
});

module.exports = ResultsPanel;
