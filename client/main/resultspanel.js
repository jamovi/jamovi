'use strict';

const $ = require('jquery');
const Backbone = require('backbone');
Backbone.$ = $;

const clipboard = require('clipboard-js');
const formatIO = require('./utils/formatio');

const Menu = require('./menu');
const Notify = require('./notification');

const ResultsPanel = Backbone.View.extend({
    className: 'ResultsPanel',
    initialize(args) {

        this.$el.empty();
        this.$el.addClass('silky-results-panel');

        this.$menu = $('<div></div>');
        this.menu = new Menu(this.$menu);
        $('body').append(this.$menu);

        this.menu.onMenuEvent(entry => this._menuEvent(entry));

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
                results : analysis.results,
                incAsText : analysis.incAsText,
                loaded : false };

            this.resources[analysis.id] = resources;

            $iframe.on('load', () => {
                this._sendResults(resources);
                resources.loaded = true;
            });

            $cover.on('click', event => this._resultsClicked(event, analysis));
            $cover.on('mousedown', event => {
                if (event.button === 2)
                    this._resultsRightClicked(event, analysis);
            });
        }
        else if (analysis.deleted) {
            resources.$container.css('height', '0');
        }
        else {

            resources.results = analysis.results;
            resources.incAsText = analysis.incAsText;
            if (resources.loaded)
                this._sendResults(resources);
        }
    },
    _sendResults(resources) {

        if (this.mode === 'rich' || resources.incAsText) {
            let event = {
                type: 'results',
                data: {
                    results: resources.results,
                    mode: this.mode
                }
            };
            resources.iframe.contentWindow.postMessage(event, this.iframeUrl);
        }
    },
    _resultsClicked(event, analysis) {
        event.stopPropagation();
        let current = this.model.get('selectedAnalysis');
        if (current === null || current.id !== analysis.id)
            this.model.set('selectedAnalysis', analysis);
        else
            this.model.set('selectedAnalysis', null);
    },
    _resultsRightClicked(event, analysis) {
        let selected = this.model.attributes.selectedAnalysis;
        if (selected === null || selected === analysis) {
            let resources = this.resources[analysis.id];
            let iframe = resources.iframe;
            let clickEvent = $.Event('click', { button: 2, pageX: event.offsetX, pageY: event.offsetY, bubbles: true });
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
                case 'clipboardCopy':
                    this._copyToClipboard(eventData);
                    break;
                case 'setOption':
                    let options = { };
                    options[eventData.name] = eventData.value;
                    analysis.setOptions(options);
            }
        }
    },
    _showMenu(id, data) {

        this._menuId = id;

        let entries = [ ];
        for (let entry of data.entries)
            entries.push({ label: entry.type, address: entry.address, options: entry.options });

        if (entries.length > 0) {
            let lastEntry = entries[entries.length-1];
            lastEntry.active = true;
        }

        this.menu.setup(entries);
        this.menu.show({ clickPos : { top: data.pos.top, left: data.pos.left } });
    },
    _menuEvent(event) {

        if (event.op === 'copy') {
            let $results = $(this.resources[this._menuId].iframe.contentWindow.document).find('#results');
            for (let i = 1; i < event.address.length; i++)
                $results = $results.find('[data-name="' + btoa(event.address[i]) + '"]').first();

            let type = (this.mode === 'rich' ? 'text/html' : 'text/plain');
            let content = formatIO.exportElem($results, type);

            clipboard.copy({ [ type ]: content }).then(() => {
                let note = new Notify({
                    title: 'Copied',
                    message: 'The content has been copied to the clipboard',
                    duration: 2000 });

                this.model.trigger('notification', note);
            });
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
