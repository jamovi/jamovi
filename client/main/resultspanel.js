'use strict';

const $ = require('jquery');
const underscore = require('underscore');
const Backbone = require('backbone');
Backbone.$ = $;
const I18n = require('../common/i18n');
const focusLoop = require('../common/focusloop');

const formatIO = require('../common/utils/formatio');

const Menu = require('./menu');
const ContextMenus = require('./contextmenu/contextmenus');
const ContextMenu = require('./contextmenu');
const Notify = require('./notification');
const host = require('./host');

const { flatten, unflatten } = require('../common/utils/addresses');
const { contextMenuListener } = require('../common/utils');

require('./references');

const path = require('path');

const ResultsPanel = Backbone.View.extend({
    className: 'ResultsPanel',
    initialize(args) {

        this._focus = 0;
        this.el.innerHTML = '';
        this.el.classList.add('jmv-results-panel');
        this.el.dataset.mode = args.mode;
        this.annotationFocus = 0;

        focusLoop.addFocusLoop(this.el);

        this._menuId = null;
        ContextMenu.$el.on('menuClicked', (event, button) => {
            if (this._menuId !== null)
                this._menuEvent(button.eventData);
        });

        ContextMenu.on('menu-hidden', (event) => {
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
                            this._resultsMouseClicked(event.button, event.offsetX - resource.$container.offset().left, event.offsetY - resource.$container.offset().top, resource.analysis);
                    }
                }
            }
        });

        this.resources = { };

        if ('iframeUrl' in args)
            this.iframeUrl = args.iframeUrl;

        if ('mode' in args)
            this.mode = args.mode;

        let analyses = this.model.analyses();
        analyses.on('analysisCreated', this._analysisCreated, this);
        analyses.on('analysisDeleted', this._analysisDeleted, this);
        analyses.on('analysisResultsChanged', this._resultsEvent, this);
        analyses.on('analysisAnnotationChanged', this._annotationEvent, this);

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
        contextMenuListener(this._refsTable, (event) => {
            event.preventDefault();
            event.stopPropagation();
            this._refsRightClicked(event);
            return false;
        });
        this._refsTable.addEventListener('click', (event) => this._resultsClicked(event, 'refsTable'));
        this.el.appendChild(this._refsTable);

        contextMenuListener(this.el, (event) => {
            if (Object.keys(this.resources).length > 0) {
                this._showMenu(-1, { entries: [ ], pos: { left: event.pageX, top: event.pageY }});
                this.el.classList.add('all-selected');
            }
            event.preventDefault();
            return false;
        });

        this.model.settings().on('change:format',  () => this._updateAll());
        this.model.settings().on('change:devMode', () => this._updateAll());
        this.model.settings().on('change:syntaxMode', () => this._updateAll());
        this.model.settings().on('change:refsMode', () => this._updateRefsMode());
        this.model.on('change:editState', () => this._updateEditState());
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

        let $container = $('<div class="jmv-results-container ' + classes + '" tabindex="0"></div>');
        $container.on('keydown', (event) => {
            if (event.keyCode === 13) { //enter
                this.model.set('selectedAnalysis', analysis);
            }
        });

        let $after = $(this._refsTable);
        if (analysis.results.index > 0) {
            let $siblings = this.$el.children('.jmv-results-container');
            let index = analysis.results.index - 1;
            if (index < $siblings.length)
                $after = $siblings[index];
        }

        $container.insertBefore($after);

        $container.attr('data-analysis-name', analysis.name);


        let $cover = $('<div class="jmv-results-cover"></div>').appendTo($container);
        let $iframe = $(element).appendTo($container);
        let iframe = $iframe[0];

        let selected = this.model.get('selectedAnalysis');
        if (selected !== null && analysis.id === selected.id)
            $container.attr('data-selected', '');

        let resources = {
            id: analysis.id,
            analysis : analysis,
            iframe : iframe,
            $iframe : $iframe,
            $container : $container,
            loaded : false,
            isEmpty: isEmptyAnalysis,
            hasTitle: ! isEmptyAnalysis || analysis.isFirst()
        };

        this.resources[analysis.id] = resources;

        $iframe.on('load', () => {
            this._sendI18nDef(resources);
            this._sendResults(resources);
            resources.loaded = true;
        });

        $iframe.on('mouseover mouseout', (event) => {
            this._sendMouseEvent(resources, event);
        });

        if (isEmptyAnalysis === false) {
            $cover.on('click', event => this._resultsClicked(event, analysis));
        }
        else {
            $cover.on('click', event =>  {
                this._resultsClicked(event, analysis);
                let iframe = resources.iframe;
                let clickEvent = $.Event('enterannotation', { });
                iframe.contentWindow.postMessage(clickEvent, this.iframeUrl);
            });
        }

        contextMenuListener($cover[0], event => {
            this._resultsMouseClicked(2, event.offsetX, event.offsetY, analysis);
            event.stopPropagation();
            return false;
        });

        $cover.on('mouseenter', event => {
            this._sendMouseEvent(resources, event);
            $iframe.addClass('hover');
        });

        $cover.on('mouseleave', event => {
            this._sendMouseEvent(resources, event);
            $iframe.removeClass('hover');
        });
    },
    _analysisDeleted(analysis) {
        this._updateRefs();
        let resources = this.resources[analysis.id];
        let $container = resources.$container;
        $container.css('height', '0');
        if (analysis.name === 'empty')
            $container.remove();
        else {
            let removed = false;
            $container.one('transitionend', () => {
                $container.remove();
                removed = true;
            });
            setTimeout(() => {
                if (removed === false)
                    $container.remove();
            }, 400);
        }
        delete this.resources[analysis.id];
    },
    _updateRefs(exclude) {
        if ( ! this._ready)
            return;

        let modulesWithRefChanges = [ ];

        let oldNums = this._refsTable.getNumbers();
        this._refsTable.update();
        let refNums = this._refsTable.getNumbers();
        for (let name in oldNums) {
            if ( ! underscore.isEqual(refNums[name], oldNums[name]))
                modulesWithRefChanges.push(name);
        }

        for (let analysis of this.model.analyses()) {
            if (analysis !== exclude && modulesWithRefChanges.includes(analysis.ns)) {
                let res = this.resources[analysis.id];
                if (res.loaded)
                    this._sendRefNumbers(res);
            }
        }
    },
    _annotationEvent(sender, analysis, address) {
        if (sender !== this) {
            let resources = this.resources[analysis.id];
            resources.analysis = analysis;
            if (resources.loaded)
                this._sendResults(resources);
        }
    },
    _resultsEvent(analysis) {
        this._updateRefs(analysis);
        let resources = this.resources[analysis.id];
        resources.analysis = analysis;
        if (resources.loaded)
            this._sendResults(resources);
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
    _sendMouseEvent(resources, eventData) {
        let analysis = resources.analysis;

        let event = {
            type: 'mouseEvent',
            data: {
                type: eventData.type
            }
        };
        resources.iframe.contentWindow.postMessage(event, this.iframeUrl);
    },
    async _sendI18nDef(resources) {
        let analysis = resources.analysis;

        await analysis.ready;

        let event = {
            type: 'i18nDef',
            data: {
                moduleI18n: analysis.i18n,
                appI18n: I18n.localeData
            }
        };
        resources.iframe.contentWindow.postMessage(event, this.iframeUrl);
    },
    _sendResults(resources) {

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
                results: analysis.results,
                options: analysis.options ? analysis.options.getValues() : {},
                mode: this.model.settings().get('syntaxMode') ? 'text' : 'rich',
                devMode: this.model.settings().get('devMode'),
                format: format,
                refs: this._refsTable.getNumbers(analysis.ns),
                refsMode: this.model.settings().getSetting('refsMode'),
                isEmpty: resources.isEmpty,
                hasTitle: resources.hasTitle,
                selected: newSelected === null ? null : newSelected === analysis,
                annotationSelected: newSelected === null ? false : newSelected.name === 'empty',
                editState: this.model.get('editState')
            }
        };
        resources.iframe.contentWindow.postMessage(event, this.iframeUrl);
    },
    _updateAll() {

        for (let id in this.resources) {
            let resources = this.resources[id];
            if (resources === undefined)
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
    _resultsMouseClicked(button, offsetX, offsetY, analysis) {
        let selected = this.model.attributes.selectedAnalysis;
        if ((selected === null && analysis !== null) || selected === analysis) {
            let resources = this.resources[analysis.id];
            let iframe = resources.iframe;
            let clickEvent = $.Event('click', { button: button, pageX: offsetX, pageY: offsetY, bubbles: true });
            iframe.contentWindow.postMessage(clickEvent, this.iframeUrl);
        }
        else {
            this.model.set('selectedAnalysis', null);
        }
    },
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
    },
    _messageEvent(event) {

        for (let id in this.resources) {

            let resources = this.resources[id];
            if (event.source !== resources.iframe.contentWindow)
                continue;

            let payload = event.data;
            let eventType = payload.type;
            let eventData = payload.data;
            let $iframe = resources.$iframe;
            let $container = resources.$container;
            let analysis = resources.analysis;

            let options = { };

            switch (eventType) {
                case 'annotationChanged':
                    this.model.set('edited', true);
                    this.$el.trigger('annotationChanged');
                    break;
                case 'annotationFocus':
                    this._focus += 1;
                    if (this._focus === 1) {
                        this.annotationGotFocus();
                        this.$el.trigger('annotationFocus');
                    }
                    break;
                case 'analysisLostFocus':
                    this.$el.trigger('analysisLostFocus');
                    break;
                case 'annotationLostFocus':
                    this._focus -= 1;
                    if (this._focus === 0) {
                        this.annotationLostFocus();
                        this.$el.trigger('annotationLostFocus');
                    }
                    else if (this._focus < 0)
                        throw "shouldn't get here";
                    break;
                case 'activeFormatChanged':
                    this.$el.trigger('activeFormatChanged', eventData);
                    break;
                case 'headingChanged':
                    this.$el.trigger('headingChanged', eventData);
                    analysis.updateHeading();
                    break;
                case 'sizeChanged':
                    let height = eventData.height;
                    let width = eventData.width;
                    if (height < 20)
                        height = 20;
                    if (width < 620)
                        width = 620;

                    if ($iframe.height() === 0)
                        $iframe.width(width);

                    let selected = this.model.get('selectedAnalysis');
                    if (eventData.scrollIntoView && selected !== null && selected.id !== undefined && selected.id.toString() === id)
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
    },
    getAsHTML(options, part) {
        if ( ! part) {

            options.fragment = true;

            let promises = Array.from(this.model.analyses())
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
                        { name: 'EPS', description: _('EPS Image {ext}', { ext: '(.eps)' }), extensions: [ 'eps' ] }, ]
                };
                let result = await host.showSaveDialog(options);
                if (result.cancelled)
                    return;
                let status = await this.model.save(result.file, saveOptions);
                if (host.isElectron === false && status.path) {
                    let source = path.basename(status.path);
                    let url = `dl/${ source }?filename=${ path.basename(result.file) }`;
                    await host.triggerDownload(url);
                }
            }
            else {

                let saveOptions = {
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
                    options.filters.push({ name: _('LaTeX bundle {ext}', { ext: '(.zip)' }), extensions:  [ 'zip' ] });

                let result = await host.showSaveDialog(options);
                if (result.cancelled)
                    return;
                let status = await this.model.save(result.file, saveOptions);
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

            if (this._menuId > 0 && this._menuId in this.resources) {
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
            this._sendSelected(newSelected.id);
        }
        else {
            this._sendSelected(null);
            this.$el.removeAttr('data-analysis-selected');
        }
    },
    _sendSelected(resourceId) {
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
    },
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

    },
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
    },
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
    },
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

            let attr = resources.$container.attr('data-selected');
            if (attr !== undefined && attr !== false) {
                resources.iframe.contentWindow.postMessage(event, this.iframeUrl);
                break;
            }
        }
    },
});

module.exports = ResultsPanel;
