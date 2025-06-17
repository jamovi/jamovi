
'use strict';

const $ = require('jquery');
import focusLoop from '../../common/focusloop';

const dropdown = function() {
    this._inTools = false;
    this.$formula = null;

    $(window).resize( (event) => {
        this._findPosition();
    } );

    window.addEventListener('scroll', (event) => {
        if (this._shown && ! this._waiting && this.item.isScrollTarget(event.target) === false) {
            this.hide({ data: { dropdown: this, check: false } });
        }
    }, true);

    this.$el = $('<div class="jmv-dropdown-widget dropdown-hidden dropdown-remove" tabindex="-1"></div>');
    let options = { level: 1, hoverFocus: false, closeHandler: () => { this.hide({ data: { dropdown: this, check: false } }); }, exitKeys: ['Escape'] };
    focusLoop.addFocusLoop(this.$el[0], options);

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

    this.$el.on('focusout', (event) => {
        if (this.$el[0].contains(event.relatedTarget))
            return;

        if (this._shown && event.relatedTarget !== this.$formula[0])
            this.hide( { data: { dropdown: this, check: false } });
    });

    this.hide = function(event) {
        let self = event.data.dropdown;
        if (( ! event.data.check || self._inTools === false) && self._shown) {
            self.$el.addClass('dropdown-hidden dropdown-remove');
            self.$content.off('hide-dropdown', null, this.hide);
            self.$formula.trigger('editor:closing');
            self.$formula.attr('aria-expanded', false);
            self.$formula = null;
            self._shown = false;
            self._waiting = false;
            if (this._resolve) {
                this._resolve();
                this._resolve = null;
            }
            
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

    this.onFocusOut = function(event) {
        if (this._shown && this.$el[0].contains(event.relatedTarget) === false && this.$el[0] !== event.relatedTarget)
            this.hide( { data: { dropdown: this, check: false } });
    };
    this.onFocusOut = this.onFocusOut.bind(this);

    this.show = function($formula, content, wait) {

        if (content.$el != this.$content) {
            if (this.$content) {
                this.$content.detach();
                this.$content.off('hide-dropdown', null, this.hide);
            }
            if (this._resolve) {
                this._resolve();
                this._resolve = null;
            }

            this.$content = content.$el;
            this.$content.on('hide-dropdown', null, { dropdown: this, check: false }, this.hide);
            this.$contents.append(content.$el);
            this.item = content;
        }

        if ( ! this._resolve) {
            this._promise = new Promise((resolve, reject) => {
                this._resolve = resolve;
            });
        }

        setTimeout(() => {
            focusLoop.enterFocusLoop(this.$el[0], { withMouse: false, exitSelector: $formula[0] });
        }, 200);


        if (this._shown && $formula === this.$formula)
            return this._promise;

        this._shown = true;
        this._waiting = wait;

        if (this.$formula) {
            this.$formula.attr('aria-expanded', false);
            this.$formula.off('focusout', this.onFocusOut);
        }

        this.$formula = $formula;

        if (this.$formula) {
            this.$formula.attr('aria-expanded', true);
            this.$formula.on('focusout', this.onFocusOut);
        }

        if ( ! wait)
            this._findPosition();

        return this._promise;
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
    return _dropdown.show($formula, content, wait);
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

const content = function() {
    return _dropdown.item;
};

const enter = function() {
    focusLoop.enterFocusLoop(_dropdown.$el[0], { withMouse: false, exitSelector: _dropdown.$formula[0] });
}

const hasFocus = function(relatedTarget) {
    if (relatedTarget === undefined)
        relatedTarget = document.activeElement;

    return relatedTarget && (_dropdown.$el[0].contains(relatedTarget) || _dropdown.$el[0] === relatedTarget);
}

module.exports = { init, show, hide, updatePosition, focusedOn, clicked, isVisible, content, enter, hasFocus };
