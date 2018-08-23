'use strict';

const $ = require('jquery');
const Backbone = require('backbone');
Backbone.$ = $;

const clipboard = require('clipboard-js');
const formatIO = require('./utils/formatio');

const Menu = require('./menu');
const ContextMenus = require('./contextmenu/contextmenus');
const ContextMenu = require('./contextmenu');
const Notify = require('./notification');
const host = require('./host');

const b64 = require('../common/utils/b64');

const ResultsPanel = Backbone.View.extend({
    className: 'ResultsPanel',
    initialize(args) {

        this.$el.empty();
        this.$el.addClass('silky-results-panel');

        this._menuId = null;
        ContextMenu.$el.on('menuClicked', (event, button) => {
            if (this._menuId !== null)
                this._menuEvent(button.eventData);
        });

        ContextMenu.on('menu-closed', (event) => {
            if (this._menuId !== null) {
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

        this.model.settings().on('change:format',  () => this._updateAll());
        this.model.settings().on('change:devMode', () => this._updateAll());
    },
    _resultsEvent(analysis) {

        let resources = this.resources[analysis.id];

        if (resources === undefined) {

            let element = '<iframe \
                scrolling="no" \
                class="id' + analysis.id + '" \
                src="' + this.iframeUrl + this.model.instanceId() + '/' + analysis.id + '/" \
                sandbox="allow-scripts allow-same-origin" \
                style="border: 0 ; height : 0 ;" \
                ></iframe>';

            let $container = $('<div class="silky-results-container"></div>').appendTo(this.$el);
            let $cover = $('<div class="silky-results-cover"></div>').appendTo($container);
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
                loaded : false };

            this.resources[analysis.id] = resources;

            $iframe.on('load', () => {
                this._sendResults(resources);
                resources.loaded = true;
            });

            $cover.on('click', event => this._resultsClicked(event, analysis));
            $cover.on('mousedown', event => {
                if (event.button === 2)
                    this._resultsRightClicked(event.offsetX, event.offsetY, analysis);
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
    },
    _sendResults(resources) {

        if (this.mode === 'rich' || resources.analysis.incAsText) {

            let format;
            try {
                format = JSON.parse(this.model.settings().get('format'));
            }
            catch (e) {
                format = {t:'sf',n:3,p:3};
            }

            let event = {
                type: 'results',
                data: {
                    results: resources.analysis.results,
                    options: resources.analysis.options.getValues(),
                    mode: this.mode,
                    devMode: this.model.settings().get('devMode'),
                    format: format,
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
        if (current === null || current.id !== analysis.id)
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
                    if (width < 300)
                        width = 300;

                    if ($iframe.height() === 0)
                        $iframe.width(width);

                    let selected = this.model.get('selectedAnalysis');
                    if (selected !== null && selected.id.toString() === id)
                        this._scrollIntoView($container, height);
                    $iframe.width(width);
                    $iframe.height(height);
                    $container.width(width);
                    $container.height(height);
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
                    let root = 'results/' + eventData.address.join('/');
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
            let e = {
                label: entry.type,
                type: entry.type,
                address: entry.address,
                options: entry.options,
                title: entry.title,
            };
            entries.push(e);
        }

        ContextMenu.showResultsMenu(entries, data.pos.left, data.pos.top);
    },
    _getElement(address, id) {
        if (id === undefined)
            id = this._menuId;
        let $results = $(this.resources[id].iframe.contentWindow.document).find('#results');
        for (let i = 0; i < address.length; i++)
            $results = $results.find('[data-name="' + b64.enc(address[i]) + '"]').first();
        return $results;
    },
    getAsHTML(options, part) {
        if ( ! part)
            return formatIO.exportElem(this.$el, 'text/html', options);

        let address = part.split('/');
        let id = address.shift();
        let $element = this._getElement(address, id);

        return formatIO.exportElem($element, 'text/html', options);
    },
    _menuEvent(event) {

        let type = (this.mode === 'rich' ? 'text/html' : 'text/plain');

        if (event.op === 'copy') {

            let $results = this._getElement(event.address);

            formatIO.exportElem($results, type).then((content) => {

                return clipboard.copy({ [ type ]: content });

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
        else if (event.op === 'save') {

            let part = '' + this._menuId;
            if (event.address.length > 0)
                part += '/' + event.address.join('/');

            if (event.target.type === 'Image') {
                let options = {
                    title: 'Save image',
                    filters: [
                        { name: 'PDF', extensions: [ 'pdf' ] },
                        { name: 'PNG', extensions: [ 'png' ] },
                        { name: 'SVG', extensions: [ 'svg' ] },
                        { name: 'EPS', extensions: [ 'eps' ] }, ]
                };

                let path = host.showSaveDialog(options);
                if (path) {
                    path = path.replace(/\\/g, '/');  // convert to non-windows path
                    this.model.save(path, { name: 'Image', export: true, part: part, partType: 'image' }, true);
                }
            }
            else {

                let options = {
                    title: 'Save results',
                    filters: [
                        { name: 'PDF', extensions:  [ 'pdf' ] },
                        { name: 'HTML', extensions: [ 'html', 'htm' ] },
                    ]
                };

                let path = host.showSaveDialog(options);
                if (path) {
                    path = path.replace(/\\/g, '/');  // convert to non-windows path
                    this.model.save(path, { name: 'Image', export: true, part: part }, true);
                }
            }
        }
        else if (event.op === 'remove') {
            this.model.set('selectedAnalysis', null);
            let analysisId = this.resources[this._menuId].id;
            this.model.analyses().deleteAnalysis(analysisId);
        }
        else {
            let message = { type: 'menuEvent', data: event };
            this.resources[this._menuId].iframe.contentWindow.postMessage(message, this.iframeUrl);
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
            let oldSelectedResults = this.resources[oldSelected.id];
            if (oldSelectedResults)
                oldSelectedResults.$container.removeAttr('data-selected');
        }

        if (newSelected) {
            this.$el.attr('data-analysis-selected', '');
            let newSelectedResults = this.resources[newSelected.id];
            if (newSelectedResults)
                newSelectedResults.$container.attr('data-selected', '');
        }
        else {
            this.$el.removeAttr('data-analysis-selected');
        }
    }
});

module.exports = ResultsPanel;
