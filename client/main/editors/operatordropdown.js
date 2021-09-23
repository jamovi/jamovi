
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
    $functionsContent.append($('<div class="item item-activated" data-name="equal" data-value="==">==</div>'));
    descriptions.equal = { label: _('Equal to'), content: '' };
    $functionsContent.append($('<div class="item" data-name="notequal" data-value="!=">!=</div>'));
    descriptions.notequal = { label: _('Not equal to'), content: '' };
    $functionsContent.append($('<div class="item" data-name="gt" data-value=">">&gt;</div>'));
    descriptions.gt = { label: _('Greater than'), content: '' };
    $functionsContent.append($('<div class="item" data-name="lt" data-value="<">&lt;</div>'));
    descriptions.lt = { label: _('Less than'), content: '' };
    $functionsContent.append($('<div class="item" data-name="gte" data-value=">=">&gt;=</div>'));
    descriptions.gte = { label: _('Greater than or equal to'), content: '' };
    $functionsContent.append($('<div class="item" data-name="lte" data-value="<=">&lt;=</div>'));
    descriptions.lte = { label: _('Less than or equal to'), content: '' };

    return descriptions;
}

const dropdown = function() {

    this.isScrollTarget = function(target) {
        return target === this.$functionsContent[0];
    };

    this.$options = $('<div class="jmv-operator-dropdown-options"></div>');//.appendTo(this.$el);
    this.$el = this.$options;

    this.$ops = $('<div class="ops-box"></div>').appendTo(this.$options);
    this.$label = $('<div class="option-label">This is a label!</div>').appendTo(this.$options);
    this.$description = $('<div class="option-description">This is the place where the option description will go!</div>').appendTo(this.$options);

    this.$functions = $('<div class="op"></div>').appendTo(this.$ops);
    this.$functionsTitle = $(`<div class="title">${_('Operators')}</div>`).appendTo(this.$functions);
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
                this.$description.html(_('No information about this function is avaliable'));
            }
        }
        else {
            this.$label.html('');
            this.$description.html('');
        }
    });

    this.show = function($formula) {
        this.$formula = $formula;
    };

    this.focusedOn = function() {
        return this.$formula;
    };
};

module.exports = dropdown;
