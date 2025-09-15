'use strict';

import keyboardJS from 'keyboardjs';

import VariableModel from './vareditor/variablemodel';
import EditorWidget from './vareditor/editorwidget';
import EditorPanel from './editorpanel';
import TransformEditor from './editors/transformeditor';
import focusLoop from '../common/focusloop';
import { HTMLElementCreator as HTML } from '../common/htmlelementcreator';
import DataSetViewModel, { ColumnType } from './dataset';
import ViewController from './viewcontroller';
import Selection from './selection';

export class VariableEditor extends HTMLElement {
    currentIds: number[] | null;
    controller: ViewController;
    selection: Selection;

    $main: HTMLElement;
    $stageEditor: HTMLElement;
    $hoverHeader: HTMLElement;

    editorPanel: EditorPanel;
    transformEditor: TransformEditor;
    editorModel: VariableModel;

    $ok: HTMLButtonElement;
    $left: HTMLButtonElement;
    $right: HTMLButtonElement;

    _keyboardListener: (event: KeyboardEvent) => void;
    _previousKeyboardContext: string;

    editors: EditorWidget[];

    currentEditor?: EditorWidget;
    prevIds: number[] | null;
    commonColumn: any;

    _showId: number | null;

    model: DataSetViewModel;

    constructor() {
        super();
    }

    setup() {
        this.classList.add('jmv-variable-editor', 'VariableEditor');

        focusLoop.addFocusLoop(this);

        this.currentIds = null;

        // Main container
        this.$main = HTML.parse('<div class="jmv-variable-editor-main" data-type="none"></div>');
        this.append(this.$main);

        // Stage editor
        this.$stageEditor = HTML.parse('<div id="import-editor" class="hidden"></div>');
        this.append(this.$stageEditor);

        this.$stageEditor.addEventListener('editor:hidden', () => {
            this.$stageEditor.style.height = '0px';
            this.$hoverHeader.style.height = '0px';
            this.transformEditor.setTransformId(null);
            this.classList.remove('sub-editor-open');
        });

        this.$stageEditor.addEventListener('editor:visible', () => {
            if (!this.currentEditor) return;

            const labelBox = this.currentEditor.$labelBox;
            const labelRect = labelBox.getBoundingClientRect();
            const editorRect = this.getBoundingClientRect();

            const top = labelRect.top - editorRect.top;
            const marginTop = parseFloat(getComputedStyle(this.currentEditor.$title).marginTop);

            const h = labelBox.offsetHeight + top + marginTop;
            this.$hoverHeader.style.height = `${h}px`;
            this.$stageEditor.style.height = `${this.clientHeight - h}px`;
            this.classList.add('sub-editor-open');
        });

        this.editorPanel = new EditorPanel(this.$stageEditor);
        this.editorPanel.on('notification', (note: any) => {
            this.dispatchEvent(new CustomEvent('notification', { detail: note, bubbles: true }));
        });

        this.transformEditor = new TransformEditor(this.model);

        this.$ok = HTML.parse(`
            <button aria-label="${_('Ok')}" tabindex="0" class="jmv-variable-editor-ok jmv-tooltip" title="${_('Hide variable setup')}">
                <span class="mif-checkmark"></span><span class="mif-arrow-up"></span>
            </button>`) as HTMLButtonElement;
        this.$main.append(this.$ok);

        this.$right = HTML.parse(`
            <button aria-label="${_('Next variable')}" tabindex="0" class="jmv-variable-editor-button-right jmv-tooltip" title="${_('Next variable')}">
                <span class="mif-chevron-right"></span>
            </button>`) as HTMLButtonElement;
        this.$main.append(this.$right);

        this.$left = HTML.parse(`
            <button aria-label="${_('Previous variable')}" tabindex="0" class="jmv-variable-editor-button-left jmv-tooltip" title="${_('Previous variable')}">
                <span class="mif-chevron-left"></span>
            </button>`) as HTMLButtonElement;
        this.$main.append(this.$left);

        this.$hoverHeader = HTML.parse('<div class="hover-header"></div>');
        this.append(this.$hoverHeader);

        this.$hoverHeader.addEventListener('mouseout', () => {
            this.classList.remove('hover');
        });

        this.$hoverHeader.addEventListener('mouseenter', () => {
            this.classList.add('hover');
        });

        this.$hoverHeader.addEventListener('click', () => {
            this._hideEditor();
        });

        this.editorModel = new VariableModel(this.model);

        this._keyboardListener = (event: KeyboardEvent) => {
            if (event.metaKey || event.ctrlKey || event.altKey)
                return;

            switch (event.key) {
                case 'ArrowUp':
                case 'ArrowDown':
                case 'Enter':
                    event.preventDefault();
                    break;

                case 'Escape':
                    if (this.editorModel.get('changes'))
                        this.editorModel.revert();
                    event.preventDefault();
                    break;
            }
        };

        this._previousKeyboardContext = keyboardJS.getContext();
        keyboardJS.setContext('controller');
        keyboardJS.bind('', (event) => this._keyboardListener(event));
        keyboardJS.setContext(this._previousKeyboardContext);

        this.model.on('columnsChanged', (event: any) => {
            if (this.model.attributes.editingVar === null)
                return;
            let ids = this.model.attributes.editingVar;
            for (let changes of event.changes) {
                if (ids.includes(changes.id)) {
                    if (changes.deleted) {
                        this.model.set('editingVar', [-1], { silent: true });
                        this.currentIds = [-1];
                        let newColumn = this.model.getColumn(changes.dIndex, true);
                        let index = ids.indexOf(changes.id);
                        ids.splice(index, 1);
                        if (newColumn)
                            ids.splice(index, 0, newColumn.id);
                        this.model.set('editingVar', ids);
                        this._update();
                    } else if (changes.columnTypeChanged) {
                        this.model.set('editingVar', [-1], { silent: true });
                        this.currentIds = [-1];
                        this.model.set('editingVar', ids);
                        this._update();
                    } else if (
                        changes.measureTypeChanged ||
                        changes.dataTypeChanged ||
                        changes.levelsChanged ||
                        changes.nameChanged
                    ) {
                        this._update();
                    }
                    break;
                }
            }
        });

        this.$ok.addEventListener('click', () => {
            if (this.editorModel.get('changes'))
                this.editorModel.apply();
            else
                this.model.set('editingVar', null);
        });

        this._moveLeft = (withMouse: boolean) => {
            const colId = this.model.attributes.editingVar[0];
            const column = this.model.getColumnById(colId);

            let colNo = column.dIndex;
            if (this.selection.hiddenIncluded)
                colNo = column.index;

            colNo--;
            const newColumn = this.model.getColumn(colNo, !this.selection.hiddenIncluded);
            if (newColumn)
                this.model.set('editingVar', [newColumn.id]);

            if (!withMouse) {
                setTimeout(() => {
                    this.$left.focus();
                }, 10);
            }
        };

        this.$left.addEventListener('click', (event) => {
            const mouseEvent = event as MouseEvent & { detail?: number };
            this._moveLeft(mouseEvent.detail !== undefined && mouseEvent.detail > 0);
        });

        this._moveRight = (withMouse: boolean) => {
            const colId = this.model.attributes.editingVar[0];
            const column = this.model.getColumnById(colId);
            let colNo = column.dIndex;
            if (this.selection.hiddenIncluded)
                colNo = column.index;

            colNo++;
            const newColumn = this.model.getColumn(colNo, !this.selection.hiddenIncluded);
            if (newColumn)
                this.model.set('editingVar', [newColumn.id]);

            if (!withMouse) {
                setTimeout(() => {
                    this.$right.focus();
                }, 10);
            }
        };

        this.$right.addEventListener('click', (event) => {
            const mouseEvent = event as MouseEvent & { detail?: number };
            this._moveRight(mouseEvent.detail !== undefined && mouseEvent.detail > 0);
        });

        this.editorModel.on('change:changes', () => {
            if (this.$ok.classList.contains('apply'))
                this.$ok.title = _('Apply changes');
            else
                this.$ok.title = _('Hide');
        });

        this.editorModel.on('notification', (note: any) => {
            this.dispatchEvent(new CustomEvent('notification', { detail: note, bubbles: true }));
        });

        this.editors = [
            new EditorWidget(this.editorModel),
            new EditorWidget(this.editorModel)
        ];

        this.$main.prepend(this.editors[0]);
        this.$main.prepend(this.editors[1]);

        this.editors[0].style.left = '0';
        this.editors[0].style.opacity = '1';
        this.editors[0].style.visibility = 'visible';

        this.editors[1].style.left = '100%';
        this.editors[1].style.opacity = '0';
        this.editors[1].style.visibility = 'hidden';

        for (const widget of this.editors) {
            widget.addEventListener('edit:transform', (event: CustomEvent<number>) => {
                this._showTransformEditor(event.detail);
            });

            widget.addEventListener('edit:missing', (event: CustomEvent) => {
                this._showEditor(event.detail);
            });
        }

        this.model.on('change:editingVar', (event: any) => {
            setTimeout(() => {
                this.prevIds = this.currentIds;
                this.currentIds = this.model.get('editingVar');
                this._hideEditor();
                this._editingVarChanged(event);
            }, 0);
        });
    }

    init(dataset, controller) {
        this.controller = controller;
        this.selection = this.controller.selection;
        this.model = dataset;

        this.setup();
    }

    private _showTransformEditor(transformId: number) {
        if (this.transformEditor.transformId() !== transformId) {
            this.transformEditor.setTransformId(transformId);
            const editingVar = this.model.get('editingVar');
            this.editorPanel.attach(this.transformEditor);
        }
    }

    private _showEditor(editor: any) {
        this.editorPanel.attach(editor);
        if (editor.refresh)
            editor.refresh();
    }

    private _hideEditor() {
        this.editorPanel.attach(null);
    }

    private _update() {
        if (this.commonColumn) {
            this.$main.setAttribute('data-type', this.commonColumn.columnType);
            this.editorModel.setColumn(this.model.attributes.editingVar, this.commonColumn.columnType);
        }
    }

    setFocus() {
        if (this.editorPanel.isVisible())
            focusLoop.enterFocusLoop(this.editorPanel.el);
        else
            focusLoop.enterFocusLoop(this);
    }

    private _editingVarChanged(event: any) {
        const prevIds = this.prevIds;
        const currentIds = this.currentIds;

        if ((prevIds === null || currentIds === null) && prevIds !== currentIds)
            this.dispatchEvent(new CustomEvent('visibility-changing', { detail: prevIds === null && currentIds !== null }));

        let prev: number | null = null;
        let now: number | null = null;

        if (prevIds !== null) {
            const prevColumn = this.model.getColumnById(prevIds[0]);
            prev = prevColumn ? prevColumn.index : null;
        }

        this.commonColumn = null;
        if (currentIds !== null) {
            this.commonColumn = this.model.getColumnById(currentIds[0]);
            now = this.commonColumn ? this.commonColumn.index : null;
        }

        if (currentIds !== null && prevIds !== null) {
            const isSame = currentIds.length === prevIds.length && currentIds.every(a => prevIds.includes(a));
            if (isSame)
                return;
        }

        if (currentIds === null) {
            this.classList.add('hidden');
            if (prevIds !== null)
                this.editors[0].detach();
            keyboardJS.setContext(this._previousKeyboardContext);
        } else {
            if (this.classList.contains('hidden')) {
                this.classList.remove('hidden');
                setTimeout(() => {
                    focusLoop.enterFocusLoop(this);
                }, 100);
            }

            this.$left.classList.toggle('hidden', now <= 0);
            this.$right.classList.toggle('hidden', now >= this.model.attributes.vColumnCount - 1);

            this._previousKeyboardContext = keyboardJS.getContext();
            keyboardJS.setContext('controller');

            if (prevIds !== null && currentIds !== null && this.commonColumn) {
                if (
                    (this.editorModel.get('columnType') === ColumnType.FILTER && this.commonColumn.columnType === ColumnType.FILTER) ||
                    (this.editorModel.get('columnType') === this.commonColumn.columnType &&
                        (currentIds.length > 1 || (currentIds.length === 1 && prevIds.length > 1)) &&
                        ((currentIds.length > 1 && prevIds.length > 1) ||
                            (currentIds.length === 1 && prevIds.includes(currentIds[0])) ||
                            (prevIds.length === 1 && currentIds.includes(prevIds[0]))))
                ) {
                    this._update();
                    this.editors[0].update();
                    return;
                }
            }

            let editor: EditorWidget;
            let old: EditorWidget;

            if (prevIds !== null) {
                editor = this.editors[1];
                old = this.editors[0];

                this.editors[1] = old;
                this.editors[0] = editor;
            } else {
                editor = this.editors[0];
                old = this.editors[1];
            }

            old.detach();

            this._update();

            editor.attach();
            this.currentEditor = editor;

            if (prevIds !== null) {
                const goLeft = now < prev || (now === prev && prevIds.length > currentIds.length);
                if (goLeft) {
                    editor.classList.add('inactive');
                    editor.style.left = '-100%';
                    old.style.left = '100%';
                    old.style.opacity = '0';
                    old.style.visibility = 'hidden';
                } else {
                    editor.classList.add('inactive');
                    editor.style.left = '100%';
                    old.style.left = '-100%';
                    old.style.opacity = '0';
                    old.style.visibility = 'hidden';
                }

                if (this._showId)
                    clearTimeout(this._showId);

                this._showId = window.setTimeout(() => {
                    editor.classList.remove('inactive');
                    editor.style.left = '0';
                    editor.style.opacity = '1';
                    editor.style.visibility = 'visible';
                    this._showId = null;
                }, 10);
            }
        }
    }

    // These methods are assigned dynamically in constructor, so declare here for types:
    private _moveLeft: (withMouse: boolean) => void;
    private _moveRight: (withMouse: boolean) => void;
}

customElements.define('jmv-variable-editor', VariableEditor);

export default VariableEditor;
