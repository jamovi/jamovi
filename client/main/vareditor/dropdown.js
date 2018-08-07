
'use strict';

const $ = require('jquery');

const dropdown = function() {
    this._inTools = false;

    $(window).resize( (event) => {
        this._findPosition();
    } );

    window.addEventListener('scroll', (event) => {
        if (this._shown && ! this._waiting && this.item.isScrollTarget(event.target) === false) {
            this.hide({ data: { dropdown: this, check: false } });
        }
    }, true);

    this.$el = $('<div class="jmv-dropdown-widget dropdown-hidden dropdown-remove"></div>');

    this.$contents = $('<div class="jmv-dropdown-contents"></div>').appendTo(this.$el);

    $(document).on('mousedown', (event) => {
        let divRect = this.$el[0].getBoundingClientRect();
        let inTool = event.clientX >= divRect.left && event.clientX <= divRect.right && event.clientY >= divRect.top && event.clientY <= divRect.bottom;
        let inFormula = false;
        if (this.$formula) {
            divRect = this.$formula[0].getBoundingClientRect();
            inFormula = event.clientX >= divRect.left && event.clientX <= divRect.right && event.clientY >= divRect.top && event.clientY <= divRect.bottom;
        }

        this._inTools = inTool;

        if ( ! inTool && ! inFormula)
            this.hide({ data: { dropdown: this, check: false } });

    });

    $(document).on('mouseup', (event) => {
        let divRect = this.$el[0].getBoundingClientRect();
        let inTool = event.clientX >= divRect.left && event.clientX <= divRect.right && event.clientY >= divRect.top && event.clientY <= divRect.bottom;

        if (inTool) {
            if (this.$formula)
                this.$formula.focus();
                this.$formula.select();
        }
    });

    this.hide = function(event) {
        let self = event.data.dropdown;
        if (( ! event.data.check || self._inTools === false) && self._shown) {
            self.$el.addClass('dropdown-hidden dropdown-remove');
            self.$content.off('hide-dropdown', null, this.hide);
            self.$formula.off('blur.dropdown', null, this.hide);
            self.$formula.trigger('editor:closing');
            self.$formula = null;
            self._shown = false;
            self._waiting = false;
            //self._inTools = false;
        }

        self._inTools = false;
    };

    this._findPosition = function() {
        if ( ! this.$formula )
            return;

        if ( ! this._shown)
            return;

        this.$el.removeClass('dropdown-remove');
        setTimeout(() => {
            this.$el.removeClass('dropdown-hidden');
            this.$el.on('transitionend', (event) => {
                this._waiting = false;
            });
        }, 0);

        let offset = this.$formula.offset();
        let positionInfo = this.$formula[0].getBoundingClientRect();
        let height = positionInfo.height;
        let width = this.$formula.outerWidth(false);
        let data = {
            top: offset.top + height + 1,
            left: offset.left
        };
        this.$el.offset(data);
        this.$el.css('min-width', width);
    };

    this.show = function($formula, content, wait) {

        if (content.$el != this.$content) {
            if (this.$content) {
                this.$content.detach();
                this.$content.off('hide-dropdown', null, this.hide);
            }
            this.$content = content.$el;
            this.$content.on('hide-dropdown', null, { dropdown: this, check: false }, this.hide);
            this.$contents.append(content.$el);
            this.item = content;
        }

        if (this._shown && $formula === this.$formula)
            return;

        this._shown = true;
        this._waiting = wait;

        if (this.$formula)
            this.$formula.off('blur.dropdown', null, this.hide);

        this.$formula = $formula;

        this.$formula.on('blur.dropdown', null, { dropdown: this, check: true }, this.hide);

        if ( ! wait)
            this._findPosition();
    };
};

let  _dropdown = null;

const init = function() {
    if (_dropdown === null) {
        _dropdown = new dropdown();
        $('body').append(_dropdown.$el);
    }
};

const show = function($formula, content, wait) {
    _dropdown.show($formula, content, wait);
};

const hide = function() {
    _dropdown.hide( { data: { dropdown: _dropdown, check: false } });
};

const updatePosition = function() {
    _dropdown._findPosition();
};

const focusedOn = function() {
    return _dropdown.$formula;
};

const clicked = function() {
    return _dropdown._inTools;
};

const isVisible = function() {
    return _dropdown._shown;
};

module.exports = { init, show, hide, updatePosition, focusedOn, clicked, isVisible };
