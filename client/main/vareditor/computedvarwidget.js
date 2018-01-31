
'use strict';

const _ = require('underscore');
const $ = require('jquery');
const Backbone = require('backbone');
Backbone.$ = $;

const keyboardJS = require('keyboardjs');

function insertText(el, newText, cursorOffset = 0) {

    let sel = window.getSelection();
    let range = sel.getRangeAt(0);
    let start = range.startOffset;
    let end = range.endOffset;
    let text = el.textContent;
    let before = text.substring(0, start);
    let after  = text.substring(end, text.length);

    if (cursorOffset === -1 && start !== end) {
        let textSelected = text.substring(start, end);
        el.textContent = (before + newText.substring(0, newText.length - 2) + '(' + textSelected + ')' + after);
        sel.setBaseAndExtent(el.firstChild, start + newText.length + cursorOffset, el.firstChild, start + newText.length + textSelected.length + cursorOffset);
    } else {

        if (cursorOffset !== -1 && newText.search(/[ ~!@#$%^&*\+\-\=()\[\]{};,<>?/\\]/) !== -1)
            newText = '\`' + newText + '\`';

        el.textContent = (before + newText + after);
        sel.setBaseAndExtent(el.firstChild, start + newText.length + cursorOffset, el.firstChild, start + newText.length + cursorOffset);
    }
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

const ComputedVarWidget = Backbone.View.extend({
    className: 'ComputedVarWidget',
    initialize(args) {

        this.attached = false;

        this.$el.empty();
        this.$el.addClass('jmv-variable-computed-widget');

        this.$methods = $('<div class="jmv-variable-computed-methods"></div>').appendTo(this.$el);

        this.$top = $('<div class="top"></div>').appendTo(this.$methods);
        this.$top.append($('<div class="item">Formula</div>'));

        this.$methods.append($('<div class="separator"></div>'));

        this.$bottom = $('<div class="bottom"></div>').appendTo(this.$methods);

        this.$options = $('<div class="jmv-variable-computed-options"></div>').appendTo(this.$el);
        this.$formulaBox = $('<div class="formula-box"></div>').appendTo(this.$options);
        this.$equal = $('<div class="equal">=</div>').appendTo(this.$formulaBox);
        this.$formula = $('<div class="formula" type="text" placeholder="Type formula here\u2026"></div>').appendTo(this.$formulaBox);
        this.$formulaMessageBox = $('<div class="formulaMessageBox""></div>').appendTo(this.$formulaBox);
        this.$formulaMessage = $('<div class="formulaMessage""></div>').appendTo(this.$formulaMessageBox);


        this.$formula.focus(() => {
            keyboardJS.pause();
        });
        this.$formula.blur((event) => {
            keyboardJS.resume();
        });
        this.$formula.on('keydown', (event) => {
            if (event.keyCode === 13 && event.shiftKey === false) {    //enter
                this.model.apply();
                event.preventDefault();
            }

            if (event.keyCode === 9) {    //tab
                event.preventDefault();
            }
        });
        this.$formula.on('input', (event) => {
            this.model.set('formula', this.$formula[0].textContent);
        });

        this.model.on('change:formula', (event) => this._setFormula(event.changed.formula));
        this.model.on('change:formulaMessage', (event) => this._setFormulaMessage(event.changed.formulaMessage));


        this.$ops = $('<div class="ops-box"></div>').appendTo(this.$options);

        this.$functions = $('<div class="op"></div>').appendTo(this.$ops);
        this.$functionsTitle = $('<div class="title">Functions</div>').appendTo(this.$functions);
        this.$functionsContent = $('<div class="content"></div>').appendTo(this.$functions);

        this.$functionsContent.append($('<div class="subtitle" data-name="">Math</div>'));
        this.$functionsContent.append($('<div class="item" data-name="ABS">ABS</div>'));
        this.$functionsContent.append($('<div class="item" data-name="EXP">EXP</div>'));
        this.$functionsContent.append($('<div class="item" data-name="LN">LN</div>'));
        this.$functionsContent.append($('<div class="item" data-name="LOG10">LOG10</div>'));
        this.$functionsContent.append($('<div class="item" data-name="SQRT">SQRT</div>'));

        this.$functionsContent.append($('<div class="subtitle" data-name="">Statistical</div>'));
        this.$functionsContent.append($('<div class="item" data-name="BOXCOX">BOXCOX</div>'));
        this.$functionsContent.append($('<div class="item" data-name="MEAN">MEAN</div>'));
        this.$functionsContent.append($('<div class="item" data-name="SCALE">SCALE</div>'));
        this.$functionsContent.append($('<div class="item" data-name="SUM">SUM</div>'));
        this.$functionsContent.append($('<div class="item" data-name="VMEAN">VMEAN</div>'));
        this.$functionsContent.append($('<div class="item" data-name="VMED">VMED</div>'));
        this.$functionsContent.append($('<div class="item" data-name="VMODE">VMODE</div>'));
        this.$functionsContent.append($('<div class="item" data-name="VN">VN</div>'));
        this.$functionsContent.append($('<div class="item" data-name="VSE">VSE</div>'));
        this.$functionsContent.append($('<div class="item" data-name="VSTDEV">VSTDEV</div>'));
        this.$functionsContent.append($('<div class="item" data-name="VSUM">VSUM</div>'));
        this.$functionsContent.append($('<div class="item" data-name="VVAR">VVAR</div>'));
        this.$functionsContent.append($('<div class="item" data-name="Z">Z</div>'));

        this.$functionsContent.append($('<div class="subtitle" data-name="">Logical</div>'));
        this.$functionsContent.append($('<div class="item" data-name="IF">IF</div>'));
        this.$functionsContent.append($('<div class="item" data-name="IFELSE">IFELSE</div>'));
        this.$functionsContent.append($('<div class="item" data-name="IFMISS">IFMISS</div>'));
        this.$functionsContent.append($('<div class="item" data-name="NOT">NOT</div>'));

        this.$functionsContent.append($('<div class="subtitle" data-name="">Misc</div>'));
        this.$functionsContent.append($('<div class="item" data-name="FILTER">FILTER</div>'));
        this.$functionsContent.append($('<div class="item" data-name="INT">INT</div>'));
        this.$functionsContent.append($('<div class="item" data-name="OFFSET">OFFSET</div>'));
        this.$functionsContent.append($('<div class="item" data-name="ROW">ROW</div>'));
        this.$functionsContent.append($('<div class="item" data-name="TEXT">TEXT</div>'));
        this.$functionsContent.append($('<div class="item" data-name="VALUE">VALUE</div>'));
        this.$functionsContent.append($('<div class="item" data-name="VROWS">VROWS</div>'));

        this.$functionsContent.append($('<div class="subtitle" data-name="">Simulation</div>'));
        this.$functionsContent.append($('<div class="item" data-name="BETA">BETA</div>'));
        this.$functionsContent.append($('<div class="item" data-name="GAMMA">GAMMA</div>'));
        this.$functionsContent.append($('<div class="item" data-name="NORM">NORM</div>'));
        this.$functionsContent.append($('<div class="item" data-name="UNIF">UNIF</div>'));

        this.$functionsContent.on("dblclick", (event) => {
            if ($(event.target).hasClass('item')) {
                insertText(this.$formula[0], event.target.dataset.name + "()", -1);
                this.model.set('formula', this.$formula[0].textContent);
            }
        });

        this.$functionsContent.on("click", (event) => {
            this.$formula.focus();
            $(".content .item").removeClass("item-activated");
            if ($(event.target).hasClass("item"))
                $(event.target).addClass("item-activated");
        });

        this.$vars = $('<div class="op"></div>').appendTo(this.$ops);
        this.$varsTitle = $('<div class="title">Variables</div>').appendTo(this.$vars);
        this.$varsContent = $('<div class="content"></div>').appendTo(this.$vars);

        this.$varsContent.on("dblclick", (event) => {
            if (event.target.dataset.name !== 'current' && $(event.target).hasClass('item')) {
                insertText(this.$formula[0], event.target.dataset.name);
                this.model.set('formula', this.$formula[0].textContent);
            }
        });

        this.$varsContent.on("click", (event) => {
            this.$formula.focus();
            $(".content .item").removeClass("item-activated");
            $(event.target).addClass("item-activated");
        });

        // this.$math = $('<div class="op"></div>').appendTo(this.$ops);
        // this.$mathTitle = $('<div class="title">Operators</div>').appendTo(this.$math);
        // this.$mathContent = $('<div class="content"></div>').appendTo(this.$math);
        // this.$mathContent.append($('<div class="item" data-name="+">+</div>'));
        // this.$mathContent.append($('<div class="item" data-name="-">-</div>'));
        // this.$mathContent.append($('<div class="item" data-name="*">*</div>'));
        // this.$mathContent.append($('<div class="item" data-name="/">/</div>'));
        // this.$mathContent.append($('<div class="item" data-name="^">^</div>'));
        // this.$mathContent.append($('<div class="item" data-name="%">%</div>'));
        //
        // this.$mathContent.on("dblclick", (event) => {
        //     if ($(event.target).hasClass('item')) {
        //         insertText(this.$formula[0], " " + event.target.dataset.name + " ");
        //         this.model.set('formula', this.$formula[0].textContent);
        //     }
        // });
        // this.$mathContent.on("click", (event) => {
        //     this.$formula.focus();
        //     $(".content .item").removeClass("item-activated");
        //     $(event.target).addClass("item-activated");
        // });

    },
    _setFormula(formula) {
        if ( ! this.attached)
            return;
        this.$formula[0].textContent = formula;
    },
    _setFormulaMessage(formulaMessage) {
        if ( ! this.attached)
            return;
        this.$formulaMessage.text(formulaMessage);
    },
    detach() {
        if ( ! this.attached)
            return;
        this.model.apply();
        this.$formula.attr('contenteditable', 'false');
        this.attached = false;
    },
    attach() {
        this.attached = true;

        this._setFormula(this.model.attributes.formula);
        this._setFormulaMessage(this.model.attributes.formulaMessage);
        this.$formula.attr('contenteditable', 'true');

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
