
'use strict';

const $ = require('jquery');
const MissingValueListItem = require('./missingvaluelistitem');

const MissingValueList = function() {
    this.isScrollTarget = function(target) {
        return target === this.$list[0];
    };

    this.isConditionValid = function(text) {

        let trimText = text.trim();
        let validOps = ['==', '!=', '<=', '>=', '<', '>', '='];

        for (let i = 0; i < validOps.length; i++) {
            let op = validOps[i];
            if (trimText.startsWith(op)) {
                if (trimText.length > op.length)
                    return true;
                else
                    return false;
            }
        }

        return false;
    };

    this.getValue = function() {
        let value = [];
        let j = 0;
        for (let i = 0; i < this.items.length; i++) {
            let condition = this.items[i].value;
            if (this.isConditionValid(condition))
                value[j++] = condition;
        }
        return value;
    };

    this.$el = $('<div class="jmv-missing-value-list"></div>');

    this.$list = $('<div class="list"></div>').appendTo(this.$el);

    this.$bottom = $('<div class="bottom"></div>').appendTo(this.$el);
    this.$createNew = $(`<div class="add-missing-value" tabindex="0"><div class="insert"></div><div>${_('Add Missing Value')}</div></div>`).appendTo(this.$bottom);

    this.$createNew.on('click', (event) => {
        this.createNew();
    });

    this.createNew = function() {
        let item = new MissingValueListItem('');
        this.items.push(item);
        item.$el.addClass('hidden');
        item.$el.appendTo(this.$list);
        this._createItemEvents(item);
        this.$el.trigger('add-missing-value');
        setTimeout(() => {
            this.$list.animate({scrollTop:this.$list[0].scrollHeight}, 'slow');
            item.$el.removeClass('hidden');
            item.$el.find('.formula').focus();
        },0);
    };

    this.$createNew.on('keydown', (event) => {
        if ( event.keyCode === 13) {   //enter
            this.createNew();
            event.preventDefault();
            event.stopPropagation();
        }
    });

    this.items = [];
    this.populate = function(values) {
        if (values !== null && values.length === this.items.length) {
            for (let i = 0; i < this.items.length; i++) {
                let item = this.items[i];
                item.setValue(values[i]);
            }
        }
        else {
            this.$list.empty();
            this.items = [];
            if (values !== null) {
                for (let value of values) {
                    let item = new MissingValueListItem(value);
                    this.items.push(item);
                    item.$el.appendTo(this.$list);
                    this._createItemEvents(item);
                }
            }
        }
    };

    this._createItemEvents = function(item) {
        item.$el.on('removed', (x) => {
            let indexRemoved = -1;
            this.items = this.items.filter((i, j) => {
                if (i === item)
                    indexRemoved = j;
                return i !== item;
            });
            let $fp = item.$el;
            $fp.one("webkitTransitionEnd otransitionend oTransitionEnd msTransitionEnd transitionend", (event) => {
                $fp.remove();
            });
            $fp.addClass('remove');
            this._collapseSection($fp[0]);
            this.$el.trigger('missing-value-removed', indexRemoved);
        });
        item.$el.on('value-changed', (x) => {
            this.$el.trigger('missing-values-changed');
        });
    };

    this._collapseSection = function(element) {
        let sectionHeight = element.scrollHeight;

        let elementTransition = element.style.transition;
        element.style.transition = '';

        requestAnimationFrame(() => {
            element.style.height = sectionHeight + 'px';
            element.style.transition = elementTransition;
            requestAnimationFrame(() => {
                element.style.height = 0 + 'px';
            });
        });
    };

    this._expandSection = function(element, value) {

        element.setAttribute('data-expanding', true);
        let sectionHeight = element.scrollHeight;

        element.style.height = value === undefined ? sectionHeight : value;

        element.addEventListener('transitionend', (e) => {
            element.removeEventListener('transitionend', e.callee);
            element.style.height = null;
            element.setAttribute('data-expanding', false);
        });
    };


    //this.populate(["== 'empty'", "<= 100"])
};



module.exports = MissingValueList;
