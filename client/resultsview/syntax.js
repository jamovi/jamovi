'use strict';

var _ = require('underscore');
var $ = require('jquery');
var Backbone = require('backbone');
Backbone.$ = $;

var Element = require('./element');

var SyntaxModel = Backbone.Model.extend({
    defaults : {
        name: "name",
        title: "(no title)",
        element: '(no syntax)',
        error: null,
        status: 'complete'
    }
});

var SyntaxView = Element.View.extend({
    initialize: function(data) {

        Element.View.prototype.initialize.call(this, data);

        this.$el.addClass('silky-results-syntax');

        if (this.model === null)
            this.model = new SyntaxModel();

        this.render();
    },
    type: function() {
        return "Syntax";
    },
    render: function() {

        var syntax = this.model.attributes.element;
        var $syntax = $('<pre style="silky-results-syntax-text"></pre>').appendTo(this.$el);
        $syntax.text(syntax);
    }
});

module.exports = { Model: SyntaxModel, View: SyntaxView };
