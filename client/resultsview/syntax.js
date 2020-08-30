'use strict';

const $ = require('jquery');
const Backbone = require('backbone');
Backbone.$ = $;

const Elem = require('./element');

var SyntaxModel = Elem.Model.extend({
    defaults : {
        name:    'name',
        title:   '(no title)',
        element: '(no syntax)',
        error: null,
        status: 'complete',
        stale: false,
        options: { },
    }
});

var SyntaxView = Elem.View.extend({
    initialize: function(data) {

        Elem.View.prototype.initialize.call(this, data);

        this.$el.addClass('jmv-results-syntax');

        this.$title = $('<h' + (this.level+1) + ' class="jmv-results-image-title"></h' + (this.level+1) + '>');
        this.addContent(this.$title);

        if (this.model === null)
            this.model = new SyntaxModel();

        this.$syntax = $('<pre class="jmv-results-syntax-text"></pre>');
        this.addContent(this.$syntax);

        this.render();
    },
    type: function() {
        return 'Syntax';
    },
    render: function() {

        let syntax = this.model.attributes.element;
        this.$syntax.text(syntax);

        if (this.$title) {
            if (this.model.attributes.title)
                this.$title.text(this.model.attributes.title);
            else
                this.$title.empty();
        }

        if (this.model.attributes.stale)
            this.$syntax.addClass('stale');
        else
            this.$syntax.removeClass('stale');

        return true;
    }
});

module.exports = { Model: SyntaxModel, View: SyntaxView };
