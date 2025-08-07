'use strict';

import NewVarWidget from './newvarwidget';
import DataVarWidget from './datavarwidget';
import OutputVarWidget from './outputvarwidget';
import ComputedVarWidget from './computedvarwidget';
import RecodedVarWidget from './recodedvarwidget';
import FilterWidget from './filterwidget';
import VariableListItem from './variablelistitem';
import VariableModel from './variablemodel';

import { HTMLElementCreator as HTML }  from '../../common/htmlelementcreator';
import { ColumnType } from '../dataset';

declare global {
    interface Window {
        clearTextSelection: () => void;
    }
}

window.clearTextSelection = function() {
    const selection = window.getSelection?.();
    if (selection?.empty) selection.empty();
    else if (selection?.removeAllRanges) selection.removeAllRanges();
    else if ((document as any).selection) (document as any).selection.empty();
};

class EditorWidget extends HTMLElement {
    model: VariableModel;
    attached: boolean;
    $$widgets: HTMLElement[];

    $labelBox: HTMLElement;
    $label: HTMLElement;
    $importedAs: HTMLElement;
    $importedAsLabel: HTMLElement;
    $importedAsName: HTMLElement;
    $descBox: HTMLElement;
    $title: HTMLInputElement;
    $description: HTMLElement;
    $multiVarBox: HTMLElement;
    $multiVarLabel: HTMLElement;
    $scrollWrapper: HTMLElement;
    $multiVarList: HTMLElement;
    $body: HTMLElement;
    $footer: HTMLElement;
    $active: HTMLInputElement;

    dataVarWidget: DataVarWidget;
    computedVarWidget: ComputedVarWidget;
    recodedVarWidget: RecodedVarWidget;
    filterWidget: FilterWidget;
    outputWidget: OutputVarWidget;
    newVarWidget: NewVarWidget;

    constructor(model: VariableModel) {
        super();
        this.model = model;
        this.attached = false;
        this.classList.add('EditorWidget', 'jmv-variable-editor-widget');
        this.setAttribute('aria-hidden', 'true');

        // Label box
        this.$labelBox = HTML.parse('<div class="label-box"></div>');
        this.append(this.$labelBox);

        this.$label = HTML.parse('<div class="jmv-variable-editor-widget-label"></div>');
        this.$labelBox.append(this.$label);

        this.$labelBox.append(HTML.parse('<div class="label-spacer"></div>'));

        this.$importedAs = HTML.parse('<div class="imported-as single-variable-support"></div>');
        this.$labelBox.append(this.$importedAs);

        this.$importedAsLabel = HTML.parse(`<div class="label ">${_('Imported as')}:</div>`);
        this.$importedAs.append(this.$importedAsLabel);

        this.$importedAsName = HTML.parse('<div class="name"></div>');
        this.$importedAs.append(this.$importedAsName);

        // Description box
        this.$descBox = HTML.parse('<div class="desc-box"></div>');
        this.append(this.$descBox);

        this.$title = HTML.parse<HTMLInputElement>(`<input class="jmv-variable-editor-widget-title single-variable-support" type="text" maxlength="63" aria-label="${_('Variable Name')}">`);
        this.$descBox.append(this.$title);

        this._addTextEvents(this.$title, 'name');

        this.model.on('change:name', () => {
            if (!this.attached) return;
            const name = this.model.get('name');
            if (this.$title.value !== name)
                this.$title.value = name;
        });

        this.$title.addEventListener('blur', () => {
            this.model.set('name', this.$title.value);
        });

        this.$description = HTML.parse(`<div class="jmv-variable-editor-widget-description single-variable-support" spellcheck="true" placeholder="${_('Description')}" aria-label="${_('Variable Description')}" contenteditable="true" tabindex="0"></div>`);
        this.$descBox.append(this.$description);

        this._addTextEvents(this.$description, 'description');

        this.model.on('change:description', () => {
            if (!this.attached) return;
            const desc = this.model.get('description');
            if (this.$description.textContent !== desc)
                this.$description.textContent = desc;
        });

        this.$description.addEventListener('blur', () => {
            this.model.set('description', this.$description.textContent);
        });

        // Multi variable info box
        this.$multiVarBox = HTML.parse('<div class="multi-var-info"></div>');
        this.$descBox.append(this.$multiVarBox);

        this.$multiVarLabel = HTML.parse(`<div class="multi-var-info-label">${_('Selected')}:</div>`);
        this.$multiVarBox.append(this.$multiVarLabel);

        this.$scrollWrapper = HTML.parse('<div class="scroll-wrapper"></div>');
        this.$multiVarBox.append(this.$scrollWrapper);

        this.$multiVarList = HTML.parse('<div class="multi-var-info-list"></div>');
        this.$scrollWrapper.append(this.$multiVarList);

        this.model.on('columnChanging', () => {
            if (document.activeElement === this.$description && this.$description.textContent !== this.model.attributes.description)
                this.$description.blur();
            if (document.activeElement === this.$title && this.$title.value !== this.model.attributes.name)
                this.$title.blur();
        });

        // Body and footer
        this.$body = HTML.parse('<div class="jmv-variable-editor-widget-body"></div>');
        this.append(this.$body);

        this.$footer = HTML.parse('<div class="jmv-variable-editor-widget-footer"></div>');
        this.append(this.$footer);

        const statusBox = HTML.parse('<div class="status-box"></div>');
        const statusLabel = HTML.parse<HTMLLabelElement>(`<label class="status">${_('Retain unused levels in analyses')}</label>`);

        this.$active = HTML.parse<HTMLInputElement>('<input class="active" type="checkbox"/>');
        const switchSpan = HTML.parse('<span class="switch"></span>');

        statusLabel.append(this.$active, switchSpan);
        statusBox.append(statusLabel);
        this.$footer.append(statusBox);

        if (this.model.get('trimLevels') === false) {
            this.$active.classList.add('retain-levels');
            this.$active.checked = true;
        }
        else {
            this.$active.classList.remove('retain-levels');
            this.$active.checked = false;
        }

        const activeChanged = () => {
            const value = this.$active.classList.contains('retain-levels');
            this.model.set('trimLevels', value);
        };

        this.$active.addEventListener('click', activeChanged);
        this.$active.addEventListener('keyup', (event) => {
            if (event.keyCode === 13) 
                activeChanged();
        });

        this.model.on('change:trimLevels', () => {
            if (this.model.get('trimLevels') === false) {
                this.$active.classList.add('retain-levels');
                this.$active.checked = true;
            }
            else {
                this.$active.classList.remove('retain-levels');
                this.$active.checked = false;
            }
        });

        this.model.on('change:ids', () => this._updateMultiVariableState());
        this.model.dataset.on('columnsChanged', () => this._updateMultiVariableState());

        // Widgets containers & instances
        this.$$widgets = [];

        const widgetClasses = [
            ['dataVarWidget', DataVarWidget],
            ['computedVarWidget', ComputedVarWidget],
            ['recodedVarWidget', RecodedVarWidget],
            ['filterWidget', FilterWidget],
            ['outputWidget', OutputVarWidget],
            ['newVarWidget', NewVarWidget]
        ] as const;

        for (const [key, WidgetClass] of widgetClasses) {
            const instance = new WidgetClass(key === 'filterWidget' ? this.model.dataset : this.model );
            this.$body.append(instance);
            (this as any)[key] = instance;
            //if ('setParent' in instance) 
            //    instance.setParent(this);
            //if (key === 'recodedVarWidget' || key === 'filterWidget')
            //    instance.on('notification', this._notifyEditProblem, this);
            this.$$widgets.push(instance);
        }
    }

    _updateMultiVariableState() {
        const ids = this.model.get('ids');
        if (ids !== null && this.model.columns.length > 1) {
            this.classList.add('multiple-variables');
            this.$multiVarList.innerHTML = '';
            for (const column of this.model.columns) {
                const item = new VariableListItem(column);
                this.$multiVarList.appendChild(item);
            }
        }
        else {
            this.classList.remove('multiple-variables');
        }
        this._updateHeading();
    }

    _updateImportAsLabel(columnType: ColumnType, name: string) {
        if (columnType === ColumnType.DATA || columnType === ColumnType.COMPUTED || columnType === ColumnType.RECODED) {
            const importName = this.model.get('importName');
            if (importName !== name && importName !== '') {
                if (this.$importedAsName.textContent !== importName)
                    this.$importedAsName.textContent = importName;
                this.$importedAs.style.display = '';
            }
            else {
                this.$importedAs.style.display = 'none';
            }
        }
    }

    _addTextEvents(element: HTMLElement | HTMLInputElement, propertyName: string) {
        element.addEventListener('focus', () => {
            if ('select' in element && typeof element.select === 'function')
                element.select();
        });

        element.addEventListener('blur', () => {
            window.clearTextSelection();
        });

        element.addEventListener('keydown', (event: KeyboardEvent) => {
            const key = event.keyCode || event.which;
            if (key === 13) { // Enter
                if (element instanceof HTMLElement) element.blur();
                event.preventDefault();
                event.stopPropagation();
            }
            else if (key === 27) { // Escape
                if (element instanceof HTMLElement) element.blur();
                if (this.model.get('changes'))
                    this.model.revert();
                event.preventDefault();
                event.stopPropagation();
            }
        });
    }

    _show(widget: HTMLElement) {
        for (const w of this.$$widgets) {
            if (!widget.isSameNode(w))
                w.style.display = 'none';
        }
        widget.style.display = '';
    }

    detach() {
        this.attached = false;

        this.dataVarWidget.detach();
        this.computedVarWidget.detach();
        this.newVarWidget.detach();
        this.recodedVarWidget.detach();
        this.filterWidget.detach();
        this.outputWidget.detach();

        this.setAttribute('aria-hidden', 'true');
    }

    _updateHeading() {
        const type = this.model.get('columnType');
        const ids = this.model.get('ids');
        const multiSupport = ids !== null && this.model.columns.length > 1;

        if (type === 'data')
            this.$label.textContent = n_('Data Variable', 'Multiple Data Variables ({n})', multiSupport ? this.model.columns.length : 1);
        else if (type === 'computed')
            this.$label.textContent = n_('Computed Variable', 'Multiple Computed Variables ({n})', multiSupport ? this.model.columns.length : 1);
        else if (type === 'recoded')
            this.$label.textContent = n_('Transformed Variable', 'Multiple Transformed Variables ({n})', multiSupport ? this.model.columns.length : 1);
        else if (type === 'output')
            this.$label.textContent = n_('Output Variable', 'Multiple Output Variables ({n})', multiSupport ? this.model.columns.length : 1);
        else if (type === 'filter')
            this.$label.textContent = _('Row Filters');
    }

    attach() {
        this.attached = true;

        const name = this.model.get('name');
        if (this.$title.value !== name)
            this.$title.value = name;

        const description = this.model.get('description');
        if (this.$description.textContent !== description)
            this.$description.textContent = description;

        if (this.model.get('trimLevels') === false) {
            this.$active.classList.add('retain-levels');
            this.$active.checked = true;
        }
        else {
            this.$active.classList.remove('retain-levels');
            this.$active.checked = false;
        }

        const type = this.model.get('columnType');

        this._updateImportAsLabel(type, name);
        this._updateHeading();

        if (type === ColumnType.DATA) {
            this.$footer.style.display = '';
            this.$labelBox.style.display = '';
            this.$label.style.display = '';
            this.$title.style.display = '';
            this.$description.style.display = '';
            this._show(this.dataVarWidget); // dataVarWidget container
            this.dataVarWidget.attach();
        }
        else if (type === ColumnType.COMPUTED) {
            this.$footer.style.display = '';
            this.$labelBox.style.display = '';
            this.$label.style.display = '';
            this.$title.style.display = '';
            this.$description.style.display = '';
            this._show(this.computedVarWidget);
            this.computedVarWidget.attach();
        }
        else if (type === ColumnType.RECODED) {
            this.$footer.style.display = '';
            this.$labelBox.style.display = '';
            this.$label.style.display = '';
            this.$title.style.display = '';
            this.$description.style.display = '';
            this._show(this.recodedVarWidget);
            this.recodedVarWidget.attach();
        }
        else if (type === ColumnType.FILTER) {
            this.$footer.style.display = 'none';
            this.$labelBox.style.display = '';
            this.$importedAs.style.display = 'none';
            this.$label.style.display = '';
            this.$title.style.display = 'none';
            this.$description.style.display = 'none';
            this._show(this.filterWidget);
            this.filterWidget.attach();
        }
        else if (type === ColumnType.OUTPUT) {
            this.$footer.style.display = 'none';
            this.$labelBox.style.display = '';
            this.$importedAs.style.display = 'none';
            this.$label.style.display = '';
            this.$title.style.display = '';
            this.$description.style.display = '';
            this._show(this.outputWidget);
            this.outputWidget.attach();
        }
        else {
            this.$footer.style.display = 'none';
            this.$labelBox.style.display = 'none';
            this.$title.style.display = 'none';
            this.$description.style.display = 'none';
            this._show(this.newVarWidget);
            this.newVarWidget.attach();
        }

        this.setAttribute('aria-hidden', 'false');
    }

    update() {
        const type = this.model.get('columnType');
        if (type === 'filter') this.filterWidget.update();
    }
}

customElements.define('jmv-editor-wrapper', EditorWidget);

export default EditorWidget;