'use strict';

const $ = require('jquery');
const Backbone = require('backbone');
Backbone.$ = $;

const Elem = require('./element');


export const NoticeModel = Elem.Model.extend({
    defaults : {
        name: 'name',
        title: '(no title)',
        element: { },
        error: null,
        status: 'complete',
        stale: false,
        options: { },
    }
});


export const NoticeView = Elem.View.extend({
    initialize: function(data) {

        Elem.View.prototype.initialize.call(this, data);

        this.$el.addClass('jmv-results-notice');

        let $html = $('<div class="notice-box"><div class="icon"></div><div class="content"></div></div>');
        this.addContent($html);

        if (this.model === null)
            this.model = new NoticeModel();

        this.render();
    },
    type: function() {
        return 'Notice';
    },
    label: function() {
        return _('Notice');
    },
    render: function() {

        let doc = this.model.attributes.element;

        let $icon = this.$el.find('.icon');
        $icon.removeClass('info error warning');
        switch (doc.type) {
            case 1:
                $icon.addClass('warning-1');
                break;
            case 2:
                $icon.addClass('warning-2');
                break;
            case 3:
                $icon.addClass('info');
                break;
            case 4:
                $icon.addClass('error');
                break;
        }

        let $content = this.$el.find('.content');
        this.$el.find('a[href]').off('click');
        $content.html(doc.content);
        this.$el.find('a[href]').on('click', (event) => this._handleLinkClick(event));
    },
    _handleLinkClick(event) {
        let href = $(event.target).attr('href');
        window.openUrl(href);
    },
});

