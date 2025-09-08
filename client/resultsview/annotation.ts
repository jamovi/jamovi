
'use strict';

import katex from 'katex';
window.katex = katex;

import Quill from 'quill';
import hljs from 'highlight.js';

const Parchment = Quill.import('parchment');
const TextBlot = Quill.import('blots/text');

import { QuillDeltaToHtmlConverter } from 'quill-delta-to-html';
import _focusLoop from '../common/focusloop';
import { HTMLElementCreator as HTML }  from '../common/htmlelementcreator';
import { AnnotationAction, IAnnotation } from './annotations';

//////////////////////////////////////////////////////////////////////////////
// Needed to fix an issue with how quill interacts with highlightjs
// the issue meant that the highlightjs stylings wouldn't work properly,
// and line spacing became problematic for code-blocks.
let _get = function get(object, property, receiver) { if (object === null) object = Function.prototype; var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { return get(parent, property, receiver); } } else if ("value" in desc) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } };
const CodeBlock = Quill.import('formats/code-block');
class NewCodeBlock extends CodeBlock {
    static className = 'ql-syntax';

    replaceWith(block) {
        this.domNode.textContent = this.domNode.textContent;
        this.attach();
        let newItem = _get(Object.getPrototypeOf(CodeBlock.prototype), 'replaceWith', this).call(this, block);
        newItem.domNode.textContent = newItem.domNode.textContent;
        this.scroll.update('silent');
    }
}
Quill.register(NewCodeBlock, true);
///////////////////////////////////////////////////////////////////////////////

const Embed = Quill.import('blots/embed');
class FormulaBlot extends Embed {
    static blotName = 'formula';
    static className = 'ql-formula';
    static tagName = 'SPAN';

    static create(value) {
        let node = super.create(value);
        if (typeof value === 'string') {
            window.katex.render(value, node, {
                throwOnError: false,
                errorColor: '#f00'
            });
            node.setAttribute('data-value', value);
        }
        return node;
    }

    static value(domNode) {
        return domNode.getAttribute('data-value');
    }

    constructor(domNode) {
        super(domNode);

        // Bind our click handler to the class.
        this.clickHandler = this.clickHandler.bind(this);
        domNode.addEventListener('click', this.clickHandler);
    }

    clickHandler(event: MouseEvent) {
        this.domNode.dispatchEvent(new CustomEvent('formula-clicked', { detail: this, bubbles: true }));
    }
}
Quill.register(FormulaBlot, true);

class Annotation extends HTMLElement implements IAnnotation {

    path: string;
    address: string[];
    suffix: string;
    isFocused: boolean;
    attached: boolean;

    _editor: HTMLElement;
    _editorBox: HTMLElement;
    ql_editor: HTMLElement;
    _transferElement: HTMLElement;

    finaliseBlur: NodeJS.Timeout;
    selectionClearTimeOut: NodeJS.Timeout;

    lastSelection: {index: number,  length: number };
    level: number;

    blotToRemove: any;

    editor: Quill;

    constructor(address, suffix, title) {
        super();

        this.initialise(address, suffix, title);
    }

    initialise(address: string[], suffix: string, title: string) {
        this.path = address.join('/') + ':' + suffix;
        this.address = address;
        this.suffix = suffix;
        this.isFocused = false;
        this.lastSelection = null;

        this.classList.add('jmv-annotation', 'body');
        this.tabIndex = 0;
        this.role = 'region';
        this.ariaRoleDescription = title;
        this.ariaDescription = _('Press enter to edit');

        
        this.innerHTML = `<div class="editor-box">
                <div class="editor jmv-note-theme"></div>
            </div>`;

        this.addEventListener('formula-clicked', (event: CustomEvent) => {
            let blot = event.detail;
            let index = blot.offset(this.editor.scroll);
            this.editor.setSelection(index);
            let $blot = blot.domNode;
            this.blotToRemove = blot;
            this.editor.theme.tooltip.edit('formula', $blot.getAttribute('data-value'));
        });

        this._editor = this.querySelector('.editor');
        this._editorBox = this.querySelector('.editor-box');

        this.editor = new Quill(this._editor, {
            modules: {
                formula: true,
                syntax: { highlight: text => hljs.highlightAuto(text).value },
                toolbar: [],
                history: {
                  delay: 1000,
                  maxStack: 500,
                  userOnly: true
                },
                clipboard: { }
            },
            placeholder: '>',
            theme: 'snow'
        });


        this.editor.keyboard.addBinding({
            key: 'Escape'
        }, (range, context) => {
            //this.editor.blur();
            this.focus();
        });
        

        let saveFunction = this.editor.theme.tooltip.save;
        this.editor.theme.tooltip.save = () => {
            if (this.blotToRemove)
                this.blotToRemove.remove();
            saveFunction.call(this.editor.theme.tooltip);
            this.blotToRemove = null;
            this.editor.focus();
        };

        let cancelFunction = this.editor.theme.tooltip.cancel;
        this.editor.theme.tooltip.cancel = () => {
            cancelFunction.call(this);
            this.blotToRemove = null;
            this.editor.focus();
        };

        this.editor.theme.tooltip.preview.addEventListener('click', (event) => {
            window.openUrl(event.currentTarget.href);
            event.stopPropagation();
            event.preventDefault();
        });

        let $formulaHelp = HTML.parse<HTMLLinkElement>(`<a class="ql-help" rel="noopener noreferrer" target="_blank" href="https://katex.org/docs/supported.html" style="margin-left: 20px;">${_('Help')}</a>`);
        $formulaHelp.addEventListener('click', (event) => {
            window.openUrl('https://katex.org/docs/supported.html');
            event.stopPropagation();
            event.preventDefault();
        });

        this.editor.theme.tooltip.root.append($formulaHelp);

        this.editor.theme.tooltip.textbox.addEventListener('focus', (event) => this.cancelBlur());
        this.editor.theme.tooltip.textbox.setAttribute('placeholder', _('Enter your URL here'));

        this.addEventListener('keydown', (event) => {
            if (event.code === 'Enter') {
                this.ql_editor.focus();
                event.preventDefault();
            }
        });

        this.ql_editor = this.querySelector('.ql-editor');
        this.ql_editor.setAttribute('tabindex', '-1');
        this.ql_editor.setAttribute('role', 'document');
        this.ql_editor.setAttribute('aria-label', `${_('Annotation')}`);
        this.ql_editor.addEventListener('keydown', (event: KeyboardEvent) => {
            if (event.code === 'Tab') {
                event.stopPropagation();
            }
        });

        this.ql_editor.addEventListener('focusout', (event) => {
            if (event.relatedTarget instanceof HTMLElement)
                this._transferElement = event.relatedTarget;
        });
        this.ql_editor.addEventListener('focusin', (event) => {
            this._transferElement = null;
        });



        this._backgroundClicked = this._backgroundClicked.bind(this);
        this._event = this._event.bind(this);

        this._focused = this._focused.bind(this);
        this._pointerDown = this._pointerDown.bind(this);
        this._blur = this._blur.bind(this);

        this.attach();
    }

    compareAddress(address: string[], suffix: string) {
        let path = address.join('/') + ':' + suffix;
        return this.path === path;
    }

    _pointerDown(event) {
        if (event.button !== 0)
            event.preventDefault();
    }

    _blur(event) {
        if (!this.selectionClearTimeOut) {
            this.selectionClearTimeOut = setTimeout(() => {
                _focusLoop.pauseFocusControl(this._transferElement);
                this.editor.setSelection(null);
                this.selectionClearTimeOut = null;
                _focusLoop.resumeFocusControl();
            }, 10);
        }
    }

    attach() {
        if (this.attached)
            return;

        this.ql_editor.addEventListener('focus', this._focused);
        this.ql_editor.addEventListener('pointerdown', this._pointerDown);
        this.addEventListener('click', this._backgroundClicked);

        this.editor.on('editor-change', this._event);
        this.editor.root.addEventListener('blur', this._blur);

        this.attached = true;
    }

    detach() {
        if ( ! this.attached)
            return;

        this.ql_editor.removeEventListener('focus', this._focused);
        this.ql_editor.removeEventListener('pointerdown', this._pointerDown);
        this.removeEventListener('click', this._backgroundClicked);

        this.editor.off('editor-change', this._event);

        this.editor.root.removeEventListener('blur', this._blur);

        if (this.isFocused) {
            this.isFocused = false;
            this.classList.remove('focused');
            let length = this.editor.getLength();
            if (length <= 1)
                this.classList.remove('edited');
            else
                this.classList.add('edited');

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

    getContents() {
        return this.editor.getContents();
    }

    setContents(contents) {
        if (contents === null)
            this.editor.setContents([]);
        else
            this.editor.setContents(contents);

        let length = this.editor.getLength();
        if (length <= 1)
            this.classList.remove('edited');
        else
             this.classList.add('edited');
    }

    isEmpty() {
        let length = this.editor.getLength();
        return length <= 1;
    }

    _event(eventName, range, oldRange, source) {
        if (eventName === 'selection-change') {

            if (range === null) {
                this._blurred();
            }
            else {
                this.lastSelection = this.editor.getSelection();
                this._fireEvent('annotation-format-changed', this.editor.getFormat());
            }
        }

        if (eventName === 'text-change' && source === 'user') {
            this._fireEvent('annotation-changed');
        }
    }

    _blurred() {
        if (this.isFocused === false || this.finaliseBlur)
            return;

        this.finaliseBlur = setTimeout(() => {
            this.isFocused = false;
            let length = this.editor.getLength();
            if (length <= 1) {
                this.classList.remove('edited');
                this.addEventListener('click', this._backgroundClicked);
            }
            else
                this.classList.add('edited');

            this.storeContents();

            this.finaliseBlur = null;
            this.classList.remove('focused');
            this._fireEvent('annotation-lost-focus');
        }, 300);
    }

    storeContents() {
        let contents = null;
        if (this.isEmpty() === false)
            contents = this.getContents();

        let data = { };
        data[this.suffix] = contents;
        window.setParam(this.address, data);
    }

    deactivate() {
        this.detach();
        return false;
    }

    activate() {
        this.attach();
    }

    update() {
        if (this.isFocused)
            return true;

        let delta = window.getParam(this.address, this.suffix);
        if (delta)
            this.setContents(delta);
        else
            this.setContents(null);

        return true;
    }

    _focused(e) {
        this.cancelBlur();

        if (this.isFocused === true)
            return;

        this.isFocused = true;
        let focusedList = document.getElementsByClassName('had-focus');
        for (let focused of focusedList)
            focused.classList.remove('had-focus');
        this.classList.add('had-focus');
        this.classList.add('focused');
        this.classList.add('edited');
        this._fireEvent('annotation-editing');
    }

    _backgroundClicked(e) {
        this.setFocus();
    }

    setFocus(text?: string) {

        this.removeEventListener('click', this._backgroundClicked);
        this.classList.add('edited');
        this.editor.focus();

        if (text !== undefined && text !== '' && this.isEmpty())
            this.editor.insertText(0, text, { });
    }

    refocus() {
        if (this.hasFocus() === false)
            this.setFocus();

        this.editor.setSelection(this.lastSelection);
    }

    blur() {
        this.editor.blur();
    }

    hasFocus() {
        return this.editor.hasFocus() || (this.isFocused === true && this.finaliseBlur === null);
    }

    _fireEvent(name: string, data?: any) {
        let annotationId = this.getAttribute('aid');
        let event = new CustomEvent(name, {
          bubbles: true,
          detail: { annotationId: this.id, annotationType: 'standard', isEditable: true, annotationData: data }
        });
        this.dispatchEvent(event);
    }

    cancelBlur() {
        if (this.finaliseBlur) {
            clearTimeout(this.finaliseBlur);
            this.finaliseBlur = null;
        }

        if (this.selectionClearTimeOut) {
            clearTimeout(this.selectionClearTimeOut);
            this.selectionClearTimeOut = null;
        }
    }

    getHTML() {

        if (this.isEmpty())
            return '';

        let deltaOps = this.editor.getContents().ops;

        let cfg = {};

        let converter = new QuillDeltaToHtmlConverter(deltaOps, cfg);

        let html = converter.convert();

        return html;
    }

    processToolbarAction(action: AnnotationAction) {
        if (action.type === 'authentication') {
            this.cancelBlur();
            return;
        }
            
        this.editor.focus();
        if (this.lastSelection)
            this.editor.setSelection(this.lastSelection.index, this.lastSelection.length);
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
                this.editor.history.undo();
            break;
            case 'redo':
                this.editor.history.redo();
            break;
            case 'format':
                if (action.name === 'formula') {
                    this.editor.theme.tooltip.edit('formula');
                }
                else if (action.name === 'link') {
                    let range = this.editor.getSelection();
                    if (range == null || range.length === 0)
                        return;
                    this.editor.theme.tooltip.edit('link');
                }
                else {
                    this.editor.format(action.name, action.value, 'user');
                    this._fireEvent('annotation-format-changed', this.editor.getFormat());
                }

            break;
            case 'clean':
                let range = this.editor.getSelection();
                if (range == null)
                    return;
                if (range.length == 0) {
                    let formats = this.editor.getFormat();
                    Object.keys(formats).forEach((name) => {
                        // Clean functionality in existing apps only clean inline formats
                        if (Parchment.query(name, Parchment.Scope.INLINE) != null) {
                            this.editor.format(name, false);
                        }
                    });
                } else {
                    this.editor.removeFormat(range, Quill.sources.USER);
                }
                break;
        }
    }

}

customElements.define('jmv-annotation', Annotation);

export default Annotation;
