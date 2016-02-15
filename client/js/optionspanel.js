
var _ = require('underscore')
var $ = require('jquery')
var Backbone = require('backbone')
Backbone.$ = $
var SilkyView = require('./view')


var OptionsPanel = SilkyView.extend({

    initialize: function() {

        this._inited = false;

        var self = this;
        $(window).resize(function() { self.resizeHandler(); })
        this.$el.on('resized', function() { self.resizeHandler(); });
    },

    setContent: function(optionsView) {
        this._newContent = true;
        this._title = optionsView.getTitle();
        this.body = optionsView;
        this.render();
    },

    render: function() {

        if (this._inited === false)
            this.$el.empty();

        if (_.isUndefined(this.$container)) {
            this.$container = $('<div class="silky-options-control"></div>')
            this.$el.append(this.$container);
        }

        if (_.isUndefined(this.$title)) {
            this.$title = $('<h1 class="silky-options-title" style="display: inline">' + this._title + '</h1>')
            this.$hide = $('<div class="silky-sp-back-button splitpanel-hide-button"><span class="mif-arrow-right"></span></div>')
            this.$header = $('<div class="silky-options-header" style="display: flex; justify-content: space-between; align-items:center;""></div>')
            this.$header.append(this.$title)
            this.$header.append(this.$hide)
            this.$container.append(this.$header);
        }

        if (_.isUndefined(this.$body)) {
            this.$body = $('<div class="silky-options-body" style="overflow: auto;"></div>')
            this.$container.append(this.$body);
        }

        if (this._newContent) {
            this.$body.empty();
            this.$title.html(this._title);
            if (this.body.render)
                this.body.render();
            this.$body.append(this.body.$el);
        }

        if (this._inited === false) {
            var self = this;
            var hideButton = this.$el.find(".splitpanel-hide-button")
            hideButton.on("click", function(event) {
                self.$el.trigger("splitpanel-hide");
            });
        }

        this._inited = true;
        this._newContent = false;
    },

    resizeHandler: function() {
        if (_.isUndefined(this.$body))
            return;


        var t = this.$body.position()

        var value = this.$el.height() - t.top;

        this.$body.css("height", value);

    },

    onClose: function() {
        this.$el.find(".splitpanel-hide-button").off("click");
    }

})

module.exports = OptionsPanel
