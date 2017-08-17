
'use strict';

const _ = require('underscore');
const $ = require('jquery');
const Backbone = require('backbone');
Backbone.$ = $;

const keyboardJS = require('keyboardjs');
const CaretCoordinates = require('textarea-caret-position');

function insertText(el, newText, cursorOffset = 0) {
    let start = el.selectionStart;
    let end = el.selectionEnd;
    let text = el.value;
    let before = text.substring(0, start);
    let after  = text.substring(end, text.length);

    if (cursorOffset === -1 && start !== end) {
        let textSelected = text.substring(start, end);
        el.value = (before + newText.substring(0, newText.length - 2) + '(' + textSelected + ')' + after);
        el.selectionStart = start + newText.length + cursorOffset;
        el.selectionEnd = start + newText.length + textSelected.length + cursorOffset;
    } else {
        el.value = (before + newText + after);
        el.selectionStart = el.selectionEnd = start + newText.length + cursorOffset;
    }
    el.focus();
}

function insertInto(open, close, input){
    let val = input.value, s = input.selectionStart, e = input.selectionEnd;
    if (e==s) {
        input.value = val.slice(0,e) + open + close + val.slice(e);
        input.selectionStart += close.length;
        input.selectionEnd = e + close.length;
    } else {
        input.value = val.slice(0,s) + open + val.slice(s,e) + close + val.slice(e);
        input.selectionStart += close.length + 1;
        input.selectionEnd = e + close.length;
    }
}

const ComputedVarWidget = Backbone.View.extend({
    className: 'ComputedVarWidget',
    initialize(args) {

        this.attached = true;

        this.$el.empty();
        this.$el.addClass('jmv-variable-computed-widget');

        this.$methods = $('<div class="jmv-variable-computed-methods"></div>').appendTo(this.$el);

        this.$top = $('<div class="top"></div>').appendTo(this.$methods);
        this.$top.append($('<div class="item">Formula</div>'));

        this.$methods.append($('<div class="separator"></div>'));

        this.$bottom = $('<div class="bottom"></div>').appendTo(this.$methods);

        this.$options = $('<div class="jmv-variable-computed-options"></div>').appendTo(this.$el);
        this.$error = $('<div class="error"></div>').appendTo(this.$options);
        this.$formulaBox = $('<div class="formula-box"></div>').appendTo(this.$options);
        this.$equal = $('<div class="equal">=</div>').appendTo(this.$formulaBox);
        this.$formula = $('<textarea class="formula" type="text" placeholder="Type formula here\u2026">').appendTo(this.$formulaBox);

        this.$formula.on('input scroll', (event) => {
            this._onSelectionChange();
        });

        this.$formula.focus(() => {
            keyboardJS.pause();
            document.addEventListener('selectionchange', this._onSelectionChange);
        } );
        this.$formula.blur((event) => {
            keyboardJS.resume();
            document.removeEventListener('selectionchange', this._onSelectionChange);
        } );


        this.$ops = $('<div class="ops-box"></div>').appendTo(this.$options);

        this.$functions = $('<div class="op"></div>').appendTo(this.$ops);
        this.$functionsTitle = $('<div class="title">Functions</div>').appendTo(this.$functions);
        this.$functionsContent = $('<div class="content"></div>').appendTo(this.$functions);
        this.$functionsContent.append($('<div class="item" data-name="EXP">EXP</div>'));
        this.$functionsContent.append($('<div class="item" data-name="LOG">LOG</div>'));
        this.$functionsContent.append($('<div class="item" data-name="LOG10">LOG10</div>'));
        this.$functionsContent.append($('<div class="item" data-name="MEAN">MEAN</div>'));
        this.$functionsContent.append($('<div class="item" data-name="SD">SD</div>'));
        this.$functionsContent.append($('<div class="item" data-name="SQRT">SQRT</div>'));
        this.$functionsContent.append($('<div class="item" data-name="SUM">SUM</div>'));


        this.$functionsContent.on("dblclick", (event) => {
            if ($(event.target).hasClass('item'))
                insertText(this.$formula[0], event.target.dataset.name + "()", -1);
        });

        this.$functionsContent.on("click", (event) => {
            this.$formula.focus();
            $(".content .item").removeClass("item-activated");
            $(event.target).addClass("item-activated");
        });

        this.$vars = $('<div class="op"></div>').appendTo(this.$ops);
        this.$varsTitle = $('<div class="title">Variables</div>').appendTo(this.$vars);
        this.$varsContent = $('<div class="content"></div>').appendTo(this.$vars);

        this.$varsContent.on("dblclick", (event) => {
            if (event.target.dataset.name !== 'current' && $(event.target).hasClass('item'))
                insertText(this.$formula[0], event.target.dataset.name);
        });

        this.$varsContent.on("click", (event) => {
            this.$formula.focus();
            $(".content .item").removeClass("item-activated");
            $(event.target).addClass("item-activated");
        });

        this.$math = $('<div class="op"></div>').appendTo(this.$ops);
        this.$mathTitle = $('<div class="title">Operators</div>').appendTo(this.$math);
        this.$mathContent = $('<div class="content"></div>').appendTo(this.$math);
        this.$mathContent.append($('<div class="item" data-name="+">+</div>'));
        this.$mathContent.append($('<div class="item" data-name="-">-</div>'));
        this.$mathContent.append($('<div class="item" data-name="*">*</div>'));
        this.$mathContent.append($('<div class="item" data-name="/">/</div>'));
        this.$mathContent.append($('<div class="item" data-name="^">^</div>'));

        this.$mathContent.on("dblclick", (event) => {
            if ($(event.target).hasClass('item'))
                insertText(this.$formula[0], " " + event.target.dataset.name + " ");
        });
        this.$mathContent.on("click", (event) => {
            this.$formula.focus();
            $(".content .item").removeClass("item-activated");
            $(event.target).addClass("item-activated");
        });

    },
    detach() {
        this.model.apply();
        this.attached = false;
    },
    attach() {
        this.attached = true;
        // update displayed values from model

        this.$varsContent.empty();
        let dataset = this.model.dataset;
        let name = this.model.get("name");
        for (let col of dataset.get("columns")) {
            if (col.name !== '') {
                if (col.name === name)
                    this.$varsContent.append($('<div class="item item-grayed-out" data-name="current">' + col.name + " (current)" + '</div>'));
                else
                    this.$varsContent.append($('<div class="item" data-name="' + col.name + '">' + col.name + '</div>'));
            }
        }
    }
});

module.exports = ComputedVarWidget;
