
'use strict';

import { HTMLElementCreator as HTML }  from '../common/htmlelementcreator';
import { AnnotationAction, IAnnotation } from './annotations';

export class Heading extends HTMLElement implements IAnnotation {
    $heading: HTMLHeadingElement;

    attached: boolean;
    suffix: string;
    path: string;
    address: string[];
    originalHeading: string;
    isFocused: boolean;

    finaliseBlur: NodeJS.Timeout;
    level: number;

    constructor(address, text) {
        super();

        this._keyDownEvent.bind(this);
        this.initialise(address, text);
    }

    initialise(address: string[], text: string) {
        this.suffix = 'heading';
        this.path = `${ address.join('/') }:heading`;
        this.address = address;
        this.isFocused = false;
        this.originalHeading = text;

        this.classList.add('jmv-editable-header');
        this.tabIndex = 0;
        this.ariaLabel = _(`Analysis Heading - {title}`, {title: text});
        this.role = 'textbox';
        this.ariaDescription = _('Press enter to edit');

        this.$heading = HTML.parse(`<h1 contenteditable spellcheck="false" tabindex="-1">${ text }</h1>`);
        this.append(this.$heading);


        this.addEventListener('keydown', (event) => {
            if (event.code === 'Enter') {
                this.$heading.focus();
                event.preventDefault();
            }
        });

        this._focused = this._focused.bind(this);
        this._blurred = this._blurred.bind(this);
        this._textChanged = this._textChanged.bind(this);
        this._pointerDown = this._pointerDown.bind(this);

        this.attach();
    }

    _pointerDown(event) {
        if (event.button !== 0)
            event.preventDefault();
    }

    compareAddress(address, isTop) {
        let path = address.join('/') + ':' + isTop;
        return this.path === path;
    }

    _keyDownEvent(event) {
        if (event.keyCode === 13 && event.shiftKey === false) {    //enter
            event.preventDefault();
            event.stopPropagation();
        }

        if (event.keyCode === 27 && event.shiftKey === false) {    //esc
            this.blur();
            event.preventDefault();
            event.stopPropagation();
        }
    }
    
    attach() {
        if (this.attached)
            return;

        this.$heading.addEventListener('focus', this._focused);
        this.$heading.addEventListener('pointerdown', this._pointerDown);
        this.$heading.addEventListener('blur', this._blurred);
        this.$heading.addEventListener('input', this._textChanged);
        this.$heading.addEventListener('keydown', this._keyDownEvent);

        this.attached = true;
    }

    detach() {
        if ( ! this.attached)
            return;

        this.$heading.removeEventListener('focus', this._focused);
        this.$heading.removeEventListener('pointerdown', this._pointerDown);
        this.$heading.removeEventListener('blur', this._blurred);
        this.$heading.removeEventListener('input', this._textChanged);
        this.$heading.removeEventListener('keydown', this._keyDownEvent);

        if (this.isFocused) {
            this.isFocused = false;
            this.classList.remove('focused');
            let text = this.$heading.innerText;
            let edited = text === this.originalHeading;
            this._headingChanged();
            this.finaliseBlur = null;
            this._fireEvent('annotation-lost-focus');
        }

        this.remove();
        this.setup(0);
        this.attached = false;
    }

    setup(level: number) {
        this.setAttribute('level', level.toString());

        this.level = level;
    }

    setContents(contents) {

        let newText = null;
        if (contents === null)
            newText = this.originalHeading;
        else
            newText = contents;

        let text = this.$heading.innerText;
        if (newText !== text) {
            this.$heading.innerText = newText;

            text = this.$heading.innerText;
            let edited = text === this.originalHeading;

            this._headingChanged();
        }
    }

    update() {
        let delta = window.getParam(this.address, this.suffix);
        if (delta)
            this.setContents(delta);
        else
            this.setContents(null);
    }

    isEdited() {
        let text = this.$heading.innerText;
        return text !== this.originalHeading;
    }

    _textChanged(event) {
        if (this.isEdited())
            this.classList.add('edited');
        else
            this.classList.remove('edited');
        this._fireEvent('annotation-changed');
    }

    _getSelection() {
        var el = this.$heading;
        var range = document.createRange();
        var sel = window.getSelection();
        range.setStart(el.childNodes[2], 5);
        range.collapse(true);
        sel.removeAllRanges();
        sel.addRange(range);
    }

    _headingChanged() {

        this.setAttribute('aria-label', _('Analysis Heading - {title}', { title: this.$heading.innerText }));
        if (this.isEdited())
            this.classList.add('edited');
        else
            this.classList.remove('edited');
    }

    _blurred(e) {
        if (this.isFocused === false || this.finaliseBlur)
            return;

        this.finaliseBlur = setTimeout(() => {
            this.isFocused = false;

            let text = this.$heading.innerText;
            if (text.trim() === '')
                this.$heading.innerText = this.originalHeading;

            this._headingChanged();

            this.storeContents();

            this.finaliseBlur = null;
            this.classList.remove('focused');
            this._fireEvent('annotation-lost-focus');
        }, 300);
    }

    storeContents() {
        let contents = null;
        if (this.isEdited())
            contents = this.$heading.innerText;

        window.setParam(this.address, { 'heading': contents });

        this._fireEvent('heading-changed', { text: contents });
    }

    _focused(e) {
        this.cancelBlur();
        this._fireFormatEvent();

        if (this.isFocused === true)
            return;

        this.isFocused = true;
        let focusedList = document.getElementsByClassName('had-focus');
        for (let focused of focusedList)
            focused.classList.remove('had-focus');
        this.classList.add('had-focus');
        this.classList.add('focused');

        this._fireEvent('annotation-editing');
    }

    setfocus(text?: string) {

        this.$heading.focus();

        if (text !== undefined && text !== '') {
            this.$heading.innerText = text;
            if (text !== this.originalHeading) {
                this.classList.add('edited');
            }
        }
    }

    refocus() {
        if (this.hasFocus() === false)
            this.setfocus();
    }

    blur() {
        this.$heading.blur();
    }

    hasFocus() {
        return document.activeElement === this.$heading || (this.isFocused === true && this.finaliseBlur === null);
    }

    _fireEvent(name: string, data?: any) {
        let event = new CustomEvent(name, {
          bubbles: true,
          detail: { headingData: data }
        });
        this.dispatchEvent(event);
    }

    _fireFormatEvent() {
        let event = new CustomEvent('annotation-format-changed', {
          bubbles: true,
          detail: { annotationId: this.id, annotationType: 'heading', isEditable: false, annotationData: null }
        });
        this.dispatchEvent(event);
    }

    cancelBlur() {
        if (this.finaliseBlur) {
            clearTimeout(this.finaliseBlur);
            this.finaliseBlur = null;
        }
    }

    getHTML() {
        return `<h1>${ this.innerText }</h1>`;
    }

    processToolbarAction(action: AnnotationAction) {
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
    }
}

customElements.define('jmv-results-heading', Heading);

export default Heading;
