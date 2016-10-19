'use strict';

const _ = require('underscore');
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

        if (_.has(args, 'iframeUrl'))
            this.iframeUrl = args.iframeUrl;

        if (_.has(args, 'mode'))
            this.mode = args.mode;

        this.model.analyses().on('analysisResultsChanged', this._resultsEvent, this);
        this.model.on('change:selectedAnalysis', this._selectedChanged, this);

        window.addEventListener('message', event => this._messageEvent(event));

        this.clickPos = null;
    },
    _resultsEvent(analysis) {

        let resources = this.resources[analysis.id];

        if (_.isUndefined(resources)) {

            let element = '<iframe \
                scrolling="no" \
                class="id' + analysis.id + '" \
                src="' + this.iframeUrl + this.model.instanceId() + '/" \
                sandbox="allow-scripts allow-same-origin" \
                style="border: 0 ; height : 0 ;" \
                ></iframe>';

            let $container = $('<div class="silky-results-container"></div>').appendTo(this.$el);
            let $cover = $('<div class="silky-results-cover"></div>').appendTo($container);
            let $iframe = $(element).appendTo($container);
            let iframe = $iframe[0];

            let selected = this.model.get('selectedAnalysis');
            if (selected !== null && analysis.id === selected.id)
                $iframe.attr('data-selected', '');

            resources = {
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
                results: resources.results,
                mode: this.mode };
            resources.iframe.contentWindow.postMessage(event, this.iframeUrl);
        }
    },
    _resultsClicked(event, analysis) {
        let current = this.model.get('selectedAnalysis');
        if (current === null || current.id !== analysis.id)
            this.model.set('selectedAnalysis', analysis);
        else
            this.model.set('selectedAnalysis', null);
    },
    _resultsRightClicked(event, analysis) {
        let resources = this.resources[analysis.id];
        let iframe = resources.iframe;
        this.clickPos = { left: event.clientX, top: event.clientY };
        let clickEvent = $.Event('click', { button: 2, pageX: event.offsetX, pageY: event.offsetY, bubbles: true });
        iframe.contentWindow.postMessage(clickEvent, this.iframeUrl);
    },
    _messageEvent(event) {

        let ids = _.keys(this.resources);

        for (let i = 0; i < ids.length; i++) {

            let id = ids[i];
            let resources = this.resources[id];

            if (event.source !== resources.iframe.contentWindow)
                continue;

            let eventType = event.data.eventType;
            let eventData = event.data.eventData;
            let $iframe = resources.$iframe;
            let $container = resources.$container;

            switch (eventType) {
                case "sizeChanged":
                    if ($iframe.height() === 0)
                        $iframe.width(eventData.width);

                    let selected = this.model.get('selectedAnalysis');
                    if (selected !== null && selected.id.toString() === id)
                        this._scrollIntoView($container, eventData.height);
                    $iframe.width(eventData.width);
                    $iframe.height(eventData.height + 12);
                    $container.width(eventData.width);
                    $container.height(eventData.height + 12);
                    break;
                case "menuRequest":
                    this._showMenu(id, eventData);
                    break;
                case "clipboardCopy":
                    this._copyToClipboard(eventData);
                    break;
            }
        }
    },
    _showMenu(id, data) {

        this._menuId = id;

        let entries = [ ];
        for (let i = 0; i < data.length; i++) {
            let entry = data[i];
            entries.push({ label: entry.type, address: entry.address, options: entry.options });
        }

        if (entries.length > 0) {
            let lastEntry = entries[entries.length-1];
            lastEntry.active = true;
        }

        this.menu.setup(entries);
        this.menu.show({ clickPos: this.clickPos });
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
        let itemBottom = itemTop + itemHeight;

        viewTop += viewPad;

        if (itemHeight < viewHeight) {

            if (itemTop < viewTop)
                this.$el.stop().animate({ scrollTop: itemTop }, { duration: 'slow', easing: 'swing' });
            else if (itemBottom > viewBottom)
                this.$el.stop().animate({ scrollTop: itemBottom - viewHeight + 10 }, { duration: 'slow', easing: 'swing' });
        }
        else {
            if (itemTop > viewTop)
                this.$el.stop().animate({ scrollTop: itemTop }, { duration: 'slow', easing: 'swing' });
            else if (itemBottom < viewBottom)
                this.$el.stop().animate({ scrollTop: itemBottom - viewHeight + 10 }, { duration: 'slow', easing: 'swing' });
        }
    },
    _selectedChanged(event) {

        let oldSelected = this.model.previous('selectedAnalysis');
        let newSelected = this.model.get('selectedAnalysis');

        if (oldSelected) {
            let oldSelectedResults = this.resources[oldSelected.id];
            if (oldSelectedResults)
                oldSelectedResults.$iframe.removeAttr('data-selected');
        }

        if (newSelected) {
            this.$el.attr('data-analysis-selected', '');
            let newSelectedResults = this.resources[newSelected.id];
            if (newSelectedResults)
                newSelectedResults.$iframe.attr('data-selected', '');
        }
        else {
            this.$el.removeAttr('data-analysis-selected');
        }
    }
});

module.exports = ResultsPanel;
