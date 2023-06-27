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
    },
    _handleLinkClick(event) {
        let href = $(event.target).attr('href');
        window.openUrl(href);
    },
});

