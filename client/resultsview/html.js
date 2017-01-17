'use strict';

const $ = require('jquery');
const Backbone = require('backbone');
Backbone.$ = $;

const Elem = require('./element');

var HtmlModel = Backbone.Model.extend({
    defaults : {
        name: "name",
        title: "(no title)",
        element: '(no syntax)',
        error: null,
        status: 'complete',
        stale: false,
    }
});

var HtmlView = Elem.View.extend({
    initialize: function(data) {

        Elem.View.prototype.initialize.call(this, data);

        this.$el.addClass('silky-results-html');

        if (this.model === null)
            this.model = new HtmlModel();

        this.$head = $('head');
        this.render();
    },
    type: function() {
        return 'Html';
    },
    render: function() {

        this.$head.find('.module-asset').remove();

        let doc = this.model.attributes.element;
        let promises = [ ];

        for (let ss of doc.stylesheets) {
            let url = 'assets/' + ss;
            let promise = this._insertSS(url);
            promises.push(promise);
        }

        for (let script of doc.scripts)
            this.$head.append('<script src="assets/' + script + '" class="module-asset"></script>');

        this.ready = Promise.all(promises).then(() => {
            this.$el.html(doc.content);
        });
    },
    _insertSS(url) {
        return new Promise((resolve) => {
            $.get(url, (data) => {
                this.$head.append('<style>' + data + '</style>');
                resolve(data);
            }, 'text');
        });
    },
});

module.exports = { Model: HtmlModel, View: HtmlView };
