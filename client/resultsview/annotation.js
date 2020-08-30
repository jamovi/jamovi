
'use strict';

window.katex = require('katex');
window.hljs = require('highlight.js');
const Quill = require('quill');

const $ = require('jquery');
const Parchment = Quill.import('parchment');
const TextBlot = Quill.import('blots/text');
const QuillDeltaToHtmlConverter = require('quill-delta-to-html').QuillDeltaToHtmlConverter;

//////////////////////////////////////////////////////////////////////////////
// Needed to fix an issue with how quill interacts with highlightjs
// the issue meant that the highlightjs stylings wouldn't work properly,
// and line spacing became problematic for code-blocks.
let _get = function get(object, property, receiver) { if (object === null) object = Function.prototype; var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { return get(parent, property, receiver); } } else if ("value" in desc) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } };
const CodeBlock = Quill.import('formats/code-block');
class NewCodeBlock extends CodeBlock {
    replaceWith(block) {
        this.domNode.textContent = this.domNode.textContent;
        this.attach();
        let newItem = _get(Object.getPrototypeOf(CodeBlock.prototype), 'replaceWith', this).call(this, block);
        newItem.domNode.textContent = newItem.domNode.textContent;
        this.scroll.update('silent');
    }
}
NewCodeBlock.className = 'ql-syntax';
Quill.register(NewCodeBlock, true);
///////////////////////////////////////////////////////////////////////////////

const Embed = Quill.import('blots/embed');
class FormulaBlot extends Embed {
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

    clickHandler(event) {
        $(this.domNode).trigger('formula-clicked', this);
    }
}
FormulaBlot.blotName = 'formula';
FormulaBlot.className = 'ql-formula';
FormulaBlot.tagName = 'SPAN';

Quill.register(FormulaBlot, true);

const Annotation = function(address, suffix) {

    this.initialise = function(address, suffix) {
        this.path = address.join('/') + ':' + suffix;
        this.address = address;
        this.suffix = suffix;
        this.isFocused = false;
        this.lastSelection = null;

        this.$el = $(`<div class="jmv-annotation body">
            <div class="editor-box">
                <div class="editor jmv-note-theme"></div>
            </div>
        </div>`);

        this.$el.on('formula-clicked', (event, blot) => {
            let index = blot.offset(this.editor.scroll);
            this.editor.setSelection(index);
            let $blot = $(blot.domNode);
            this.blotToRemove = blot;
            this.editor.theme.tooltip.edit('formula', $blot.attr('data-value'));
        });

        this._editor = this.$el[0].querySelector('.editor');
        this._editorBox = this.$el[0].querySelector('.editor-box');

        this.editor = new Quill(this._editor, {
            modules: {
                formula: true,
                syntax: true,
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
            this.editor.blur();
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

        let $formulaHelp = $(`<a class="ql-help" rel="noopener noreferrer" target="_blank" href="https://katex.org/docs/supported.html" style="margin-left: 20px;">Help</a>`);
        $formulaHelp.on('click', (event) => {
            window.openUrl('https://katex.org/docs/supported.html');
            event.stopPropagation();
            event.preventDefault();
        });

        this.editor.theme.tooltip.root.append($formulaHelp[0]);

        this.editor.theme.tooltip.textbox.addEventListener('focus', (event) => this.cancelBlur());
        $(this.editor.theme.tooltip.textbox).attr('placeholder', 'Enter your URL here');

        this._host = this.$el[0];
        this._body = this.$el[0];

        this.ql_editor = this._body.querySelector('.ql-editor');

        this._backgroundClicked = this._backgroundClicked.bind(this);
        this._event = this._event.bind(this);

        this._focusEvent = (event) => this._focused(event);
        this._blurEvent =(event) => this.editor.setSelection(null);

        this.attach();
    };

    this.compareAddress = function(address, suffix) {
        let path = address.join('/') + ':' + suffix;
        return this.path === path;
    };

    this.attach = function() {
        if (this.attached)
            return;

        this.ql_editor.addEventListener('focus', this._focusEvent);
        this._host.addEventListener('click', this._backgroundClicked);

        this.editor.on('editor-change', this._event);
        this.editor.root.addEventListener('blur', this._blurEvent);

        this.attached = true;
    };

    this.detach = function() {
        if ( ! this.attached)
            return;

        this.ql_editor.removeEventListener('focus', this._focusEvent);
        this._host.removeEventListener('click', this._backgroundClicked);

        this.editor.off('editor-change', this._event);

        this.editor.root.removeEventListener('blur', this._blurEvent);

        if (this.isFocused) {
            this.isFocused = false;
            this._host.classList.remove('focused');
            let length = this.editor.getLength();
            if (length <= 1)
                this._host.classList.remove('edited');
            else
                this._host.classList.add('edited');

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
        if (contents === null)
            this.editor.setContents([]);
        else
            this.editor.setContents(contents);

        let length = this.editor.getLength();
        if (length <= 1)
            this._host.classList.remove('edited');
        else
             this._host.classList.add('edited');
    };

    this.isEmpty = function() {
        let length = this.editor.getLength();
        return length <= 1;
    };

    this._event = function(eventName, range, oldRange, source) {
        if (eventName === 'selection-change') {

            if (range === null)
                this._blurred();
            else {
                this.lastSelection = this.editor.getSelection();
                this._fireEvent('annotation-format-changed', this.editor.getFormat());
            }
        }

        if (eventName === 'text-change' && source === 'user') {
            this._fireEvent('annotation-changed');
        }
    };

    this._blurred = function(e) {
        if (this.isFocused === false || this.finaliseBlur)
            return;

        this.finaliseBlur = setTimeout(() => {
            this.isFocused = false;
            let length = this.editor.getLength();
            if (length <= 1) {
                this._host.classList.remove('edited');
                this._host.addEventListener('click', this._backgroundClicked);
            }
            else
                this._host.classList.add('edited');

            this.storeContents();

            this.finaliseBlur = null;
            this._host.classList.remove('focused');
            this._fireEvent('annotation-lost-focus');
        }, 300);
    };

    this.storeContents = function() {
        let contents = null;
        if (this.isEmpty() === false)
            contents = this.getContents();

        let data = { };
        data[this.suffix] = contents;
        window.setParam(this.address, data);
    };

    this.deactivate = function() {
        this.detach();
        return false;
    };

    this.activate = function() {
        this.attach();
    };

    this.update = function() {
        if (this.isFocused)
            return true;

        let delta = window.getParam(this.address, this.suffix);
        if (delta)
            this.setContents(delta);
        else
            this.setContents(null);

        return true;
    };

    this._focused = function(e) {
        this.cancelBlur();

        if (this.isFocused === true)
            return;

        this.isFocused = true;
        let focusedList = document.getElementsByClassName('had-focus');
        for (let focused of focusedList)
            focused.classList.remove('had-focus');
        this._host.classList.add('had-focus');
        this._host.classList.add('focused');
        this._host.classList.add('edited');
        this._fireEvent('annotation-editing');
    };

    this._backgroundClicked = function(e) {
        this.focus();
    };

    this.focus = function(text) {

        this._host.removeEventListener('click', this._backgroundClicked);
        this._host.classList.add('edited');
        this.editor.focus();

        if (text !== undefined && text !== '' && this.isEmpty())
            this.editor.insertText(0, text, { });
    };

    this.refocus = function() {
        if (this.hasFocus() === false)
            this.focus();

        this.editor.setSelection(this.lastSelection);
    };

    this.blur = function() {
        this.editor.blur();
    };

    this.hasFocus = function() {
        return this.editor.hasFocus() || (this.isFocused === true && this.finaliseBlur === null);
    };

    this._fireEvent = function(name, data) {
        let annotationId = this._host.getAttribute('aid');
        let event = new CustomEvent(name, {
          bubbles: true,
          detail: { annotationId: this.id, annotationType: 'standard', isEditable: true, annotationData: data }
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

        if (this.isEmpty())
            return '';

        let deltaOps = this.editor.getContents().ops;

        let cfg = {};

        let converter = new QuillDeltaToHtmlConverter(deltaOps, cfg);

        let html = converter.convert();

        return html;
    };

    this.processToolbarAction = function(action) {
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
    };

    this.initialise(address, suffix);
};

module.exports = Annotation;
