
'use strict';

const $ = require('jquery');
const formatIO = require('../common/utils/formatio');

const Heading = function(address, text) {

    this.initialise = function(address, text) {
        this.suffix = 'heading';
        this.path = `${ address.join('/') }:heading`;
        this.address = address;
        this.isFocused = false;
        this.lastSelection = null;
        this.originalHeading = text;

        this.$el = $(`<div class="jmv-editable-header">
                        <h1 contenteditable spellcheck="false">${ text }</h1>
                      </div>`
                    );

        this._host = this.$el[0];
        this.$heading = this.$el.find('h1');

        this._focusEvent = (event) => this._focused(event);
        this._blurEvent = (event) => this._blurred(event);
        this._inputEvent = (event) => this._textChanged(event);

        this.attach();
    };

    this.compareAddress = function(address, isTop) {
        let path = address.join('/') + ':' + isTop;
        return this.path === path;
    };

    this._keyDownEvent = function(event) {
        if (event.keyCode === 13 && event.shiftKey === false) {    //enter
            event.preventDefault();
            event.stopPropagation();
        }

        if (event.keyCode === 27 && event.shiftKey === false) {    //esc
            $(this).blur();
            event.preventDefault();
            event.stopPropagation();
        }
    };
    this._keyDownEvent.bind(this);

    this.attach = function() {
        if (this.attached)
            return;

        this.$heading[0].addEventListener('focus', this._focusEvent);
        this.$heading[0].addEventListener('blur', this._blurEvent);
        this.$heading[0].addEventListener('input', this._inputEvent);
        this.$heading[0].addEventListener('keydown', this._keyDownEvent);

        this.attached = true;
    };

    this.detach = function() {
        if ( ! this.attached)
            return;

        this.$heading[0].removeEventListener('focus', this._focusEvent);
        this.$heading[0].removeEventListener('blur', this._blurEvent);
        this.$heading[0].removeEventListener('input', this._inputEvent);
        this.$heading[0].removeEventListener('keydown', this._keyDownEvent);

        if (this.isFocused) {
            this.isFocused = false;
            this._host.classList.remove('focused');
            let text = this.$heading.text();
            let edited = text === this.originalHeading;
            this._headingChanged();
            this.finaliseBlur = null;
            this._fireEvent('annotation-lost-focus');
        }

        this.$el.detach();
        this.setup(0);
        this.attached = false;
    };

    this.setup = function(level) {
        this.$el.attr('level', level);

        this.level = level;
    };

    this.getContents = function() {
        return this.editor.getContents();
    };

    this.setContents = function(contents) {

        let newText = null;
        if (contents === null)
            newText = this.originalHeading;
        else
            newText = contents;

        let text = this.$heading.text();
        if (newText !== text) {
            this.$heading.text(newText);

            text = this.$heading.text();
            let edited = text === this.originalHeading;

            this._headingChanged();
        }
    };

    this.update = function() {
        let delta = window.getParam(this.address, this.suffix);
        if (delta)
            this.setContents(delta);
        else
            this.setContents(null);
    };

    this.isEdited = function() {
        let text = this.$heading.text();
        return text !== this.originalHeading;
    };

    this._textChanged = function(event) {
        if (this.isEdited())
            this._host.classList.add('edited');
        else
            this._host.classList.remove('edited');
        this._fireEvent('annotation-changed');
    };

    this._getSelection = function() {
        var el = this.$heading[0];
        var range = document.createRange();
        var sel = window.getSelection();
        range.setStart(el.childNodes[2], 5);
        range.collapse(true);
        sel.removeAllRanges();
        sel.addRange(range);
    };

    this._headingChanged = function() {
        if (this.isEdited())
            this._host.classList.add('edited');
        else
            this._host.classList.remove('edited');
    };

    this._blurred = function(e) {
        if (this.isFocused === false || this.finaliseBlur)
            return;

        this.finaliseBlur = setTimeout(() => {
            this.isFocused = false;

            let text = this.$heading.text();
            if (text.trim() === '')
                this.$heading.text(this.originalHeading);

            this._headingChanged();

            this.storeContents();

            this.finaliseBlur = null;
            this._host.classList.remove('focused');
            this._fireEvent('annotation-lost-focus');
        }, 300);
    };

    this.storeContents = function() {
        let contents = null;
        if (this.isEdited())
            contents = this.$heading.text();

        window.setParam(this.address, { 'heading': contents });

        this._fireEvent('heading-changed', { text: contents });
    };

    this._focused = function(e) {
        this.cancelBlur();
        this._fireFormatEvent();

        if (this.isFocused === true)
            return;

        this.isFocused = true;
        let focusedList = document.getElementsByClassName('had-focus');
        for (let focused of focusedList)
            focused.classList.remove('had-focus');
        this._host.classList.add('had-focus');
        this._host.classList.add('focused');

        this._fireEvent('annotation-editing');
    };

    this.focus = function(text) {

        this.$heading.focus();

        if (text !== undefined && text !== '' && this.isEmpty()) {
            this.$heading.text(text);
            if (text !== this.originalHeading) {
                this._host.classList.add('edited');
            }
        }
    };

    this.refocus = function() {
        if (this.hasFocus() === false)
            this.focus();
    };

    this.blur = function() {
        this.$heading.blur();
    };

    this.hasFocus = function() {
        return document.activeElement === this.$heading[0] || (this.isFocused === true && this.finaliseBlur === null);
    };

    this._fireEvent = function(name, data) {
        let event = new CustomEvent(name, {
          bubbles: true,
          detail: { headingData: data }
        });
        this._host.dispatchEvent(event);
    };

    this._fireFormatEvent = function() {
        let event = new CustomEvent('annotation-format-changed', {
          bubbles: true,
          detail: { annotationId: this.id, annotationType: 'heading', isEditable: false, annotationData: null }
        });
        this._host.dispatchEvent(event);
    };

    this.cancelBlur = function() {
        if (this.finaliseBlur) {
            clearTimeout(this.finaliseBlur);
            this.finaliseBlur = null;
        }
    };

    this.getHTML = function() {
        return `<h1>${ this.$el.text() }</h1>`;
    };

    this.processToolbarAction = function(action) {
        this.refocus();
        this.cancelBlur();

        switch (action.type) {
            case 'copy':
                document.execCommand("copy");
            break;
            case 'paste':
                document.execCommand("paste");
            break;
            case 'cut':
                document.execCommand("cut");
            break;
            case 'undo':
                document.execCommand("undo");
            break;
            case 'redo':
                document.execCommand("redo");
            break;
        }
    };

    this.initialise(address, text);
};

module.exports = Heading;
