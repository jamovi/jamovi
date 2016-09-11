'use strict';

const _ = require('underscore');
const $ = require('jquery');
const Backbone = require('backbone');
Backbone.$ = $;

const createItem = require('./create').createItem;

class Main {  // this is constructed at the bottom

    constructor() {
        this.mainWindow = null;
        this.results = null;
        this.$results = null;
        this.active = null;

        window.addEventListener('message', event => this._messageEvent(event));

        this._notifyResize = _.debounce(() => this._reallyNotifyResize(), 0);
    }

    _reallyNotifyResize() {
        let width  = this.$results.width();
        let height = this.$results.height();

        this.mainWindow.postMessage({
            eventType : 'sizeChanged',
            eventData : { width: width, height: height }}, '*');
    }

    _sendMenuRequest(data) {
        let entries = data.data;
        entries[0].type = 'Analysis';

        this.mainWindow.postMessage({
            eventType : 'menuRequest',
            eventData : entries }, '*');

        let lastEntry = entries[entries.length-1];
        let event = { type: 'activated', address: lastEntry.address };
        this._menuEvent(event);
    }

    _sendClipboardContent(data) {
        this.mainWindow.postMessage({
            eventType : 'clipboardCopy',
            eventData : data }, '*');
    }

    _messageEvent(event) {

        if (event.source === window)
            return;

        this.mainWindow = event.source;
        let hostEvent = event.data;

        if (hostEvent.type === 'results') {
            let content = '';
            let $body = $('body');
            $body.attr('data-mode', hostEvent.mode);
            $body.empty();

            this.$results = $('<div id="results"></div>');
            this.results = createItem(
                hostEvent.results,
                this.$results,
                0,
                { _sendEvent: event => this._sendMenuRequest(event) },
                hostEvent.mode);
            this.$results.appendTo($body);

            this._notifyResize();
        }
        else if (hostEvent.type === 'click') {
            let el = document.elementFromPoint(hostEvent.pageX, hostEvent.pageY);
            if (el !== null)
                $(el).trigger('click', hostEvent);
        }
        else if (hostEvent.type === 'menuEvent') {
            this._menuEvent(hostEvent.data);
        }
    }

    _menuEvent(event) {

        if (this.active !== null) {
            this.active.$el.removeClass('active');
            this.active = null;
        }

        if (event.address === null)
            return;

        let address = event.address;

        if (address.length === 1) {
            this.active = this.results;
        }
        else {
            address = _.clone(address);
            address.shift();
            this.active = this.results.get(address);
        }

        switch (event.type) {
            case 'selected':
                if (event.op === 'copy') {
                    let clipboard = this.active.asClipboard();
                    this._sendClipboardContent(clipboard);
                }
                break;
            case 'activated':
                this.active.$el.addClass('active');
                break;
        }
    }
}

new Main();  // constructed down here!
