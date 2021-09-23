
'use strict';

const $ = require('jquery');
const Backbone = require('backbone');
const underscore = require('underscore');
Backbone.$ = $;

const Notif = Backbone.Model.extend({
    defaults: {
        id: 0,
        text: '',
        options: [ { name: 'dismiss', text: 'OK' } ],
    },
});

const Collection = Backbone.Collection.extend({
    model: Notif,
});

const View = Backbone.View.extend({
    tagName: 'div',
    className: 'RibbonNotifs',
    initialize() {
        this.model = this.model || new Collection();
        this.model.on('add', this._added, this);
        this.model.on('remove', this._removed, this);

        this.nextId = 1;

        this.templ = underscore.template(`
            <div class="jmv-ribbon-notif" data-id="<%= get('id') %>">
                <div class="inner">
                    <div class="message">
                        <%=get('text')%>
                    </div>
                    <div class="options">
                        <% underscore.each(get('options'), (option) => { %>
                            <button
                                data-id="<%= get('id') %>"
                                data-name="<%= option.name %>"
                                data-dismiss="<%= option.dismiss !== false ? 1 : 0 %>"
                            ><%= option.text %>
                            </button>
                        <% }) %>
                    </div>
                </div>
            </div>`);
    },
    _added(notif) {
        let index = this.model.models.indexOf(notif);
        let html = this.templ(notif);
        let $el = $(html);

        if (index === 0)
            this.$el.prepend($el);
        else
            $(this.$el.children()[index-1]).after($el);

        $el.find('button').on('click', (event) => this._clicked(event));
    },
    _clicked(event) {
        let $src = $(event.target);
        let id = parseInt($src.attr('data-id'));
        let name = $src.attr('data-name');
        let dismiss = $src.attr('data-dismiss') === '1';

        let notif = this.model.models.filter((notif) => notif.get('id') === id)[0];
        notif.trigger('click', { target: notif, name: name });

        if (dismiss)
            this.model.remove(notif);
    },
    _removed(notif) {
        let $el = this.$el.children('[data-id=' + notif.attributes.id + ']');
        let height = $el.height();
        $el.css('height', '' + height + 'px');
        void($el[0].offsetHeight);
        $el.css('height', '0px');
        $el.one('transitionend', () => {
            $el.remove();
            notif.trigger('dismissed', { target: notif });
        });
    },
    notify(options) {
        options.id = this.nextId++;
        let notif = new Notif(options);
        this.model.add(notif);
        return notif;
    },
});

module.exports = View;
