'use strict';

const $ = require('jquery');
const Backbone = require('backbone');
Backbone.$ = $;

const Elem = require('./element');

var HtmlModel = Elem.Model.extend({
    defaults : {
        name: 'name',
        title: '(no title)',
        element: '(no syntax)',
        error: null,
        status: 'complete',
        stale: false,
        options: { },
    }
});

var HtmlView = Elem.View.extend({
    initialize: function(data) {

        Elem.View.prototype.initialize.call(this, data);

        this.$el.addClass('jmv-results-html');

        if (this.model === null)
            this.model = new HtmlModel();

        this.$head = $('head');

        this.promises = [ ];

        let doc = this.model.attributes.element;

        for (let ss of doc.stylesheets) {
            let url = 'module/' + ss;
            let promise = this._insertSS(url);
            this.promises.push(promise);
        }

        for (let script of doc.scripts)
            this.$head.append('<script src="module/' + script + '" class="module-asset"></script>');


        this.render();
    },
    type: function() {
        return 'Html';
    },
    render: function() {

        this.$head.find('.module-asset').remove();

        let doc = this.model.attributes.element;
        if (doc.content === '')
            return;

        this.ready = Promise.all(this.promises).then(() => {
            let $content = this.$el.find('.content');
            if ($content.length > 0) {
                this.$el.find('a[href]').off('click');
                $content.html(doc.content);
            }
            else {
                $content = $(`<div class="content">${ doc.content }</div>`);
                this.addContent($content);
            }
            this.$el.find('a[href]').on('click', (event) => this._handleLinkClick(event));
        });
    },
    _handleLinkClick(event) {
        let href = $(event.target).attr('href');
        window.openUrl(href);
    },
    _insertSS(url) {
        return new Promise((resolve) => {
            $.get(url, (data) => {
                this.$head.append('<style class="module-asset">' + data + '</style>');
                resolve(data);
            }, 'text');
        });
    },
});

module.exports = { Model: HtmlModel, View: HtmlView };
