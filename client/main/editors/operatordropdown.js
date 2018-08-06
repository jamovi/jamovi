
'use strict';

const $ = require('jquery');

function insertText(el, newText) {

    let sel = window.getSelection();
    let range = sel.getRangeAt(0);
    let start = range.startOffset;
    let end = range.endOffset;
    let text = el.textContent;
    let before = text.substring(0, start);
    let after  = text.substring(end, text.length);

    el.textContent = (before + newText + after);
    sel.setBaseAndExtent(el.firstChild, start + newText.length, el.firstChild, start + newText.length);

    el.focus();
}

function insertInto(open, close, input){
    let val = input.textContent, s = input.selectionStart, e = input.selectionEnd;
    if (e==s) {
        input.textContent = val.slice(0,e) + open + close + val.slice(e);
        input.selectionStart += close.length;
        input.selectionEnd = e + close.length;
    } else {
        input.textContent = val.slice(0,s) + open + val.slice(s,e) + close + val.slice(e);
        input.selectionStart += close.length + 1;
        input.selectionEnd = e + close.length;
    }

}

function allFunctions($functionsContent) {
    let descriptions = { };

    //$functionsContent.append($('<div class="subtitle" data-name="">Math</div>'));
    $functionsContent.append($('<div class="item item-activated" data-name="equal" data-value="=">=</div>'));
    descriptions.equal = { label: 'Equal To', content: '' };
    $functionsContent.append($('<div class="item" data-name="gt" data-value=">">&gt;</div>'));
    descriptions.gt = { label: 'Greater Than', content: '' };
    $functionsContent.append($('<div class="item" data-name="lt" data-value="<">&lt;</div>'));
    descriptions.lt = { label: 'Less Than', content: '' };
    $functionsContent.append($('<div class="item" data-name="gte" data-value=">=">&gt;=</div>'));
    descriptions.gte = { label: 'Greater Than or egual to', content: '' };
    $functionsContent.append($('<div class="item" data-name="lte" data-value="<=">&lt;=</div>'));
    descriptions.lte = { label: 'Less Than or equal to', content: '' };

    return descriptions;
}

const dropdown = function() {
    this._inTools = false;

    $(window).resize( (event) => {
        this._findPosition();
    } );

    window.addEventListener('scroll', (event) => {
        if (this._shown && ! this._waiting && event.target !== this.$functionsContent[0]) {
            this.hide({ data: this });
        }
    }, true);

    this.$el = $('<div class="jmv-operator-dropdown-widget operator-dropdown-hidden operator-dropdown-remove"></div>');

    this.$options = $('<div class="jmv-operator-dropdown-options"></div>').appendTo(this.$el);

    this.$ops = $('<div class="ops-box"></div>').appendTo(this.$options);
    this.$label = $('<div class="option-label">This is a label!</div>').appendTo(this.$options);
    this.$description = $('<div class="option-description">This is the place where the option description will go!</div>').appendTo(this.$options);

    this.$functions = $('<div class="op"></div>').appendTo(this.$ops);
    this.$functionsTitle = $('<div class="title">Operators</div>').appendTo(this.$functions);
    this.$functionsContent = $('<div class="content"></div>').appendTo(this.$functions);

    this.descriptions = allFunctions(this.$functionsContent);

    let info = this.descriptions.equal;
    if (info !== undefined) {
        this.$label.html(info.label);
        this.$description.html(info.content);
    }

    this.$functionsContent.on("click", (event) => {
        if ($(event.target).hasClass('item')) {
            this.$formula.focus();
            insertText(this.$formula[0], event.target.dataset.value);
            this.$formula.trigger('input', { });
        }
    });

    this.$functionsContent.find('.item').on("mouseenter", (event) => {
        //this.$formula.focus();
        $(".content .item").removeClass("item-activated");
        if ($(event.target).hasClass("item")) {
            $(event.target).addClass("item-activated");
            let info = this.descriptions[$(event.target).data('name')];
            if (info !== undefined) {
                this.$label.html(info.label);
                this.$description.html(info.content);
            }
            else {
                this.$label.html('');
                this.$description.html('No information about this function is avaliable');
            }
        }
        else {
            this.$label.html('');
            this.$description.html('');
        }
    });

    this.$el.on('mousedown', (event) => {
        this._inTools = true;
    });

    this.$el.on('click', (event) => {
        if (this.$formula)
            this.$formula.focus();
    });

    this.hide = function(event) {
        let self = event.data;
        if (self._inTools === false && self._shown) {
            self.$el.addClass('operator-dropdown-hidden operator-dropdown-remove');
            self.$formula.off('blur.operator-dropdown', null, this.hide);
            self.$formula.trigger('editor:closing');
            self.$formula = null;
            self._shown = false;
            self._waiting = false;
        }
        else {
            self._inTools = false;
        }
    };

    this._findPosition = function() {
        if ( ! this.$formula )
            return;

        if ( ! this._shown)
            return;

        this.$el.removeClass('operator-dropdown-remove');
        setTimeout(() => {
            this.$el.removeClass('operator-dropdown-hidden');
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
        this.$el.outerWidth(width);
    };

    this.show = function($formula, wait) {

        if (this._shown && $formula === this.$formula)
            return;

        this._shown = true;
        this._waiting = wait;

        if (this.$formula)
            this.$formula.off('blur.operator-dropdown', null, this.hide);

        this.$formula = $formula;

        this.$formula.on('blur.operator-dropdown', null, this, this.hide);

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

const show = function($formula, wait) {
    _dropdown.show($formula, wait);
};

const hide = function() {
    _dropdown.hide({ data: _dropdown });
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

module.exports = { init, show, hide, updatePosition, focusedOn, clicked };
