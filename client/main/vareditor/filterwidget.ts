
'use strict';

import formulaToolbar from './formulatoolbar';
import dropdown from './dropdown';
import Notify from '../notification';
import { HTMLElementCreator as HTML }  from '../../common/htmlelementcreator';
import DataSetViewModel, { Column, ColumnActiveChangedEvent, ColumnType } from '../dataset';
import { NotifData } from '../ribbon/notifs';

type FilterDetails = { 
    $filter: HTMLElement; 
    isBase: boolean;
    fcount: number;
    $splitter: HTMLElement;
    $formulaBox: HTMLElement
 };

class FilterWidget extends HTMLElement {

    model: DataSetViewModel;
    _exampleFormulas: string[] = [
            "gender == 'female'",
            "score == 10",
            "consent == 'yes'",
            "Q1 != 'don\'t know'",
            "ROW() <= 100",
            "ROW() % 2",
            "-1.5 < Z(score) < 1.5",
            "ROW() != 33 and ROW() != 37",
            "score > 0.5"
        ];
    attached: boolean = false;
    _editNote: Notify = new Notify({ duration: 3000 });
    formulaSetup: formulaToolbar;
    _internalCreate: boolean;
    _clickedButton: boolean;
    _removingFilter: boolean;
    _editorClicked: boolean;
    _stickyBottomCount: number;
    _stickyBottomHeight: number;

    $filterList: HTMLElement;
    $showFilter: HTMLButtonElement;
    _$wasEditingFormula: HTMLElement;
    

    constructor(model: DataSetViewModel) {
        super();

        this.model = model;

        this.removeNested = this.removeNested.bind(this);

        dropdown.init();
        this.formulaSetup = new formulaToolbar(this.model);

        this.classList.add('jmv-filter-widget', 'FilterWidget');
        let $filterListButtons = HTML.parse('<div class="jmv-filter-list-buttons"></div>');
        this.append($filterListButtons);
        this.$filterList = HTML.parse('<div class="jmv-filter-list-box"></div>');
        this.append(this.$filterList);

        let $addFilter = HTML.parse(`<button class="filter-button filter-button-tooltip add-filter" aria-label="${_('Add new filter')}"></button>`);
        $filterListButtons.append($addFilter);
        $addFilter.addEventListener('click', (event) => {
            this._internalCreate = true;
            this._addFilter();

        });
        $addFilter.addEventListener('mouseout', event => {
            this._clickedButton = false;
        });

        this.model.on('dataSetLoaded', this._dataSetLoaded, this);
        this.model.on('columnsDeleted', event => this._columnsDeleted(event));
        this.model.on('columnsInserted', event => this._columnsInserted(event));
        this.model.on('columnsActiveChanged', (event: ColumnActiveChangedEvent) => this._columnsActiveChanged(event));
        this.model.on('columnsChanged', event => this._columnsChanged(event));

        let filtersVisible = this.model.get('filtersVisible');

        this.$showFilter = HTML.parse(`<button class="filter-button filter-button-tooltip ${(filtersVisible ? 'show-filter-columns' : 'hide-filter-columns')}" aria-label="${_('Show filter columns')}"></button>`);
        $filterListButtons.append()
        this.$showFilter.addEventListener('click', (event) => {
            this.model.toggleFilterVisibility();
        });

        this.model.on('change:filtersVisible', event => this._updateEyeButton());

    }

    _updateEyeButton() {
        if (this.model.get('filtersVisible')) {
            this.$showFilter.classList.remove('show-filter-columns');
            this.$showFilter.classList.add('hide-filter-columns');
            this.$showFilter.setAttribute('title', _('Hide filter columns'));
        }
        else {
            this.$showFilter.classList.remove('hide-filter-columns');
            this.$showFilter.classList.add('show-filter-columns');
            this.$showFilter.setAttribute('title', _('Show filter columns'));
        }
    }

    async _addFilter() {
        let i = -1;
        let column = null;
        do {
            i += 1;
            column = this.model.getColumn(i);
        } while(column.columnType === 'filter');

        try {
            await this.model.insertColumn({ index: i, columnType: ColumnType.FILTER, hidden: this.model.get('filtersVisible') === false });
            column = this.model.getColumn(i);
            this.setColumnForEdit(column.id);
        }
        catch(error) {
            this._notifyEditProblem({
                title: error.message,
                message: error.cause,
                type: 'error',
            });
        }
    }

    _notifyEditProblem(details: Partial<NotifData>) {
        this._editNote.set(details);
        this.dispatchEvent(new CustomEvent('notification', { detail: this._editNote }));
    }

    setColumnForEdit(id: number) {
        this.model.set('editingVar', [id]);
    }

    _isColumnRoot(column: Column) {
        let columns = this.model.attributes.columns;
        for (let i = 0; i < columns.length; i++) {
            if (column.columnType !== 'filter')
                break;

            if (columns[i].id === column.id)
                return true;
            else if (columns[i].filterNo === column.filterNo)
                break;
        }

        return false;
    }

    _columnsActiveChanged(event: ColumnActiveChangedEvent) {
        for (let c = event.start; c <= event.end; c++) {
            let column = this.model.getColumn(c);
            if (column.columnType === 'filter' && this._isColumnRoot(column)) {
                let $filter = this.$filterList.querySelector('.jmv-filter-options[data-columnid="' + column.id + '"]:not(.remove)');

                this._setActive($filter, event.value);
            }
        }
    }

    _getFilterDetails($filters: NodeListOf<HTMLElement>, columnIndex: number): FilterDetails {
        let $filter: HTMLElement = null;
        let widgetIndex = 0;
        let widgetColumnIndex = 0;
        let nextWidgetColumnIndex = 0;
        if ($filters.length === 0)
            return null;

        let $formulaBoxes: NodeListOf<HTMLElement> = null;
        let found = false;
        for (widgetIndex = 0; widgetIndex < $filters.length; widgetIndex++) {
            $filter = $filters[widgetIndex] as HTMLElement;
            $formulaBoxes = $filter.querySelectorAll<HTMLElement>('.formula-box:not(.remove)');
            widgetColumnIndex = nextWidgetColumnIndex;
            nextWidgetColumnIndex += $formulaBoxes.length;
            if (columnIndex >= widgetColumnIndex && columnIndex < nextWidgetColumnIndex) {
                found = true;
                break;
            }
        }

        if (!found)
            return null;

        let details: FilterDetails = { $filter: $filter, isBase: columnIndex === widgetColumnIndex, fcount: $formulaBoxes.length, $splitter: undefined, $formulaBox: undefined };

        let $splitters = this.$filterList.querySelectorAll<HTMLElement>('.jmv-filter-splitter:not(.remove)');

        let splitterIndex = widgetIndex;
        if (widgetIndex >= $splitters.length)
            splitterIndex = widgetIndex - 1;

        details.$splitter = $splitters[splitterIndex];

        let formulaIndex = columnIndex - widgetColumnIndex;
        details.$formulaBox = $formulaBoxes[formulaIndex];

        return details;
    }

    _dataSetLoaded() {
        this.$filterList.innerHTML = '';
        let columns = this.model.attributes.columns;
        let index = 0;
        for (let i = 0; i < columns.length; i++) {
            let column = columns[i];
            if (column.columnType !== 'filter')
                break;

            if (this._isColumnRoot(column))
                this._createFilter(column, index++);
        }
    }

    _columnsDeleted(event) {
        let removed = false;

        let removeBase = (details: FilterDetails) => {
            if (this.attached) {
                
                details.$filter.addEventListener('transitionend', (event) => {
                    details.$filter.remove();
                    if (details.$splitter)
                        details.$splitter.remove();
                }, { once: true });

                details.$filter.classList.add('remove');
                if (details.$splitter)
                    details.$splitter.classList.add('remove');

                this._collapseSection(details.$filter);
                if (details.$splitter)
                    this._collapseSection(details.$splitter);
            }
            else {
                details.$filter.remove();
                if (details.$splitter)
                    details.$splitter.remove();
            }
        };

        let removeSub = (details: FilterDetails) => {
            if (this.attached) {
                details.$formulaBox.addEventListener('transitionend', (event) => {
                    details.$formulaBox.remove();
                }, { once: true });

                details.$formulaBox.classList.add('remove');

                this._collapseSection(details.$formulaBox);
            }
            else {
                details.$formulaBox.remove();
            }
        };

        let indices = structuredClone(event.indices);

        event.ids.sort((a,b) => indices[a].index - indices[b].index);

        for (let id of event.ids) {
            let index = indices[id].index;
            let $filters = this.$filterList.querySelectorAll<HTMLElement>('.jmv-filter-options:not(.remove)');
            let details = this._getFilterDetails($filters, index);
            if (details === null)
                break;

            removed = true;

            for (let x in indices) {
                let i = indices[x];
                if (i.index > index)
                    i.index -= 1;
            }

            if (details.isBase) {
                removeSub(details);
                let $formulaBoxes = details.$filter.querySelectorAll('.formula-box:not(.remove)');
                if ($formulaBoxes.length === 0)
                    removeBase(details);
                else {
                    details.$filter.setAttribute('data-columnid', $formulaBoxes[0].getAttribute('data-columnid'));
                    this._convertRemoveBoxToAddBox($formulaBoxes[0]);
                }
            }
            else
                removeSub(details);
        }
    }

    _convertRemoveBoxToAddBox($element: Element) {
        let columnId =  parseInt($element.getAttribute('data-columnid'));
        $element.querySelector('.equal').textContent = '=';
        $element.querySelector('.formula').classList.remove('and-formula');
        let $removeButton = $element.querySelector('.remove-nested');
        $removeButton.removeEventListener('click', this.removeNested);
        this.addNestedEvents($removeButton, columnId);
        $removeButton.classList.remove('remove-nested');
        $removeButton.classList.add('add-nested');
        $removeButton.setAttribute('title', _('Add another nested filter'));
        $removeButton.querySelector('span').classList.remove('mif-cross')
        $removeButton.querySelector('span').classList.add('mif-plus');
    }

    _columnsInserted(event) {

        if (event.ids.length === 0)
            return;

        let ids = event.ids.slice();
        ids.sort((a, b) => event.indices[a].dIndex - event.indices[b].dIndex);

        for (let id of ids) {
            let c = event.indices[id].index;
            let column = this.model.getColumn(c);
            if (column.columnType === 'filter') {
                let columns = this.model.attributes.columns;
                if (this._isColumnRoot(column)) {
                    let index = 0;
                    for (let i = 0; i < columns.length; i++) {
                        let existingColumn = columns[i];
                        if (i >= c)
                            break;
                        if (existingColumn.columnType === 'filter') {
                            if (this._isColumnRoot(existingColumn))
                                index += 1;
                        }
                        else
                            break;
                    }
                    this._createFilter(column, index);
                }
                else {
                    let rootInfo = this.rootOf(column.id);
                    let rColumn = rootInfo.column;
                    let $filter = this.$filterList.querySelector('.jmv-filter-options[data-columnid="' + rColumn.id + '"]:not(.remove)');
                    let $formulaList = $filter.querySelector('.formula-list');
                    this._createFormulaBox(rColumn, column, column.index - rColumn.index, $filter, $formulaList);
                }
            }
        }
        setTimeout(() => {
            this.$filterList.querySelectorAll('[contenteditable="false"]').forEach(el => el.setAttribute('contenteditable', 'true'));
        }, 0);
    }

    _columnsChanged(event) {

        for (let changes of event.changes) {

            if (changes.created || changes.deleted)
                continue;

            let column = this.model.getColumnById(changes.id);
            if (column.columnType !== 'filter')
                continue;

            let $formulaBox = this.$filterList.querySelector('.formula-box[data-columnid="' + column.id + '"]:not(.remove)');
            this._setFormula($formulaBox, column.formula, column.formulaMessage);

            if (this._isColumnRoot(column)) {
                let $filter = this.$filterList.querySelector('.jmv-filter-options[data-columnid="' + column.id + '"]:not(.remove)');

                let $label = $filter.querySelector('.label');
                $label.textContent = column.name;

                this._setDescription($filter, column.description);
            }
        }
    }

    _removeFilter(id: number) {
        if (id === -1 && id !== null)
            return Promise.resolve();

        let column = this.model.getColumnById(id);
        if (column === undefined || column.columnType !== 'filter')
            return Promise.resolve();

        let relatedColumns = this.columnsOf(id);
        if (relatedColumns.length === 0)
            return Promise.resolve();

        let ids: number[] = [];
        for (let i = 0; i < relatedColumns.length; i++)
            ids.push(relatedColumns[i].column.id);

        return this.model.deleteColumns(ids).catch((error) => {
            this._notifyEditProblem({
                title: error.message,
                message: error.cause,
                type: 'error',
            });
        });
    }

    _setFormula($formulaBox: Element, formula, formulaMessage) {
        let $formula = $formulaBox.querySelector('.formula');
        let $formulaMessage = $formulaBox.querySelector('.formulaMessage');

        $formula.textContent = formula;

        if (formulaMessage === '')
            $formula.classList.remove('in-errror');
        else
            $formula.classList.add('in-errror');
        $formulaMessage.textContent = formulaMessage;
    }

    _setDescription($filter: Element, description: string) {
        let $description = $filter.querySelector('.description');
        $description.textContent = description;
    }

    _setActive($filter: Element, active) {
        let $status = $filter.querySelector('.status');
        let $active = $filter.querySelector('.active');
        if (active) {
            $status.textContent = _('active');
            $active.classList.remove('filter-disabled');
            $active.setAttribute('title', _('Filter is active'));
        }
        else {
            $status.textContent = _('inactive');
            $active.classList.add('filter-disabled');
            $active.setAttribute('title', _('Filter is inactive'));
        }


    }

    _createFormulaBox(rootColumn: Column, relatedColumn: Column, rIndex: number, $filter: Element, $formulaList: Element) {
        let $formulaBox = HTML.parse('<div class="formula-box filter-hidden" data-columnid="' + relatedColumn.id + '" data-rootid="' + rootColumn.id + '"></div>');

        let $list = $formulaList.querySelectorAll('.formula-box:not(.remove)');
        if (rIndex >= $list.length)
            $formulaList.append($formulaBox);
        else
            $formulaList.insertBefore($formulaBox, $list[rIndex]);

        if (rIndex > 0) {
            $formulaBox.append(HTML.parse(`<div class="equal">${_('and')}</div>`));
            let $removeNested = HTML.parse(`<button class="remove-nested" aria-label="${_('Remove nested filter')}" data-id="${relatedColumn.id}"><span class="mif-cross"></span></button>`);
            $formulaBox.append($removeNested);
            this.removeNestedEvents($removeNested);
        }
        else {
            $formulaBox.append(HTML.parse('<div class="equal">=</div>'));
            let $addNested = HTML.parse(`<button class="add-nested" aria-label="${_('Add another nested filter')}"><span class="mif-plus"></span></button>`);
            $formulaBox.append($addNested);
            this.addNestedEvents($addNested, rootColumn.id);
        }

        let $showEditor = HTML.parse(`<button aria-controls="${this.formulaSetup.id}" class="show-editor" aria-label="${_('Show formula editor')}"><div class="down-arrow"></div></button>`);
        $formulaBox.append($showEditor);

        $showEditor.addEventListener('click', (event) => {
            if (this._$wasEditingFormula !== $formula) {
                dropdown.show($formula, this.formulaSetup, $formulaBox.getAttribute('data-expanding') === 'true' || $filter.getAttribute('data-expanding') === 'true');
                this.formulaSetup.show($formula, null);
                $showEditor.classList.add('is-active');
            }
            event.stopPropagation();
            event.preventDefault();
        });

        $showEditor.addEventListener('mousedown', (event) => {
            this._$wasEditingFormula = dropdown.focusedOn();
            this._editorClicked = true;
        });

        let $formulaPair = HTML.parse('<div class="formula-pair"></div>');
        $formulaBox.append($formulaPair);

        let _example = this._exampleFormulas[Math.floor(Math.random() * Math.floor(this._exampleFormulas.length - 1))];
        let $formula = HTML.parse<HTMLTextAreaElement>('<div class="formula' + ((rIndex > 0) ? ' and-formula' : '') + '" type="text" spellcheck="false" placeholder="e.g. ' + _example + '" contenteditable="true" tabindex="0"></div>');
        $formulaPair.append($formula);

        document.addEventListener("selectionchange", () => {
            const sel = window.getSelection();
            if ($formula && ($formula.contains(sel.anchorNode) || sel.anchorNode === $formula)) {
                let range = sel.getRangeAt(0);
                $formula.setAttribute('sel-start', range.startOffset.toString());
                $formula.setAttribute('sel-end', range.endOffset.toString());
            }
        });

        $formula.addEventListener('keydown', (event) => {
            if (event.keyCode === 9) {    //tab
                if (dropdown.isVisible()) {
                    dropdown.enter();
                    event.stopPropagation();
                }
                event.preventDefault();
            }
        });

        $formula.addEventListener('input', (event) => {
            dropdown.updatePosition();
        });

        $formula.addEventListener('editor:closing', () => {
            $showEditor.classList.remove('is-active');
        });

        let $formulaMessageBox = HTML.parse('<div class="formulaMessageBox""></div>');
        $formulaPair.append($formulaMessageBox);
        let $formulaMessage = HTML.parse('<div class="formulaMessage""></div>');
        $formulaMessageBox.append($formulaMessage);

        $formula.textContent = relatedColumn.formula;
        $formulaMessage.textContent = relatedColumn.formulaMessage;
        if (relatedColumn.formulaMessage === '')
            $formula.classList.remove('in-errror');
        else
            $formula.classList.add('in-errror');

        $formula.classList.add('selected');

        this.addEvents($filter, $formula, 'formula', relatedColumn);

        setTimeout(() => {
            if (this.attached)
                this._expandSection($formulaBox);
            $formulaBox.classList.remove('filter-hidden');

            if (this._internalCreate) {
                setTimeout(() => {
                    this.focusOn($formula);
                }, 0);
            }
        }, 10);

    }

    _isRealBlur() {
        return dropdown.clicked() || this._editorClicked;
    }

    _createFilter(column, index) {
        let $filters = this.$filterList.querySelectorAll('.jmv-filter-options:not(.remove)');

        let insertBefore = -1;
        if ($filters.length > 0 && index < $filters.length)
            insertBefore = index;

        let $filter = HTML.parse('<div class="jmv-filter-options filter-hidden" data-columnid="' + column.id + '"></div>');
        if (insertBefore !== -1) {
            this.$filterList.insertBefore($filters[insertBefore], $filter);
            this.$filterList.insertBefore($filters[insertBefore], HTML.parse('<div class="jmv-filter-splitter"></div>'));
        }
        else {
            if (index !== 0)
                this.$filterList.append(HTML.parse('<div class="jmv-filter-splitter"></div>'));
            this.$filterList.append($filter);
        }

        let $titleBox = HTML.parse('<div class="title-box"></div>');
        $filter.append($titleBox);
        $titleBox.append(HTML.parse(`<div class="label-parent"><div class="label">${_('Filter {i}', {i: (index + 1)} )}</div></div>`));
        let $middle = HTML.parse('<div class="middle-box"></div>');
        $titleBox.append($middle);
        let $statusBox = HTML.parse('<div class="status-box" tabindex="0"></div>');
        $middle.append($statusBox);
        let $active = HTML.parse(`<div class="active" aria-label="${_('Filter is active')}"><div class="switch"></div></div>`);
        $statusBox.append($active);
        let $status = HTML.parse(`<div class="status">${_('active')}</div>`);
        $statusBox.append($status);
        $titleBox.append(HTML.parse('<div class="header-splitter"></div>'));


        let $removeButton = HTML.parse(`<button class="remove-filter-btn" aria-label="${_('Remove filter')}"><span class="mif-cross"></button></div>`);
        $titleBox.append($removeButton);


        let $formulaList = HTML.parse('<div class="formula-list"></div>');
        $filter.append($formulaList);
        let $description = HTML.parse<HTMLTextAreaElement>(`<div class="description" type="text" spellcheck="true" placeholder="${_('Description')}" tabindex="0"></div>`);
        $filter.append($description);

        $removeButton.addEventListener('click', async (event) => {
            if (this._removingFilter)
                return;

            let columnId = parseInt($filter.getAttribute('data-columnid'));
            this._removingFilter = true;
            await this._removeFilter(columnId);
            this._removingFilter = false;

            event.stopPropagation();
            event.preventDefault();
        });

        $filter.addEventListener('click', (event) => {
            if ($filter.classList.contains('remove'))
                return;

            let columnId = parseInt($filter.getAttribute('data-columnid'));
            this.model.set('editingVar', [columnId]);
        });

        let relatedColumns = this.columnsOf(column.id);
        for (let i = 0; i < relatedColumns.length; i++)
            this._createFormulaBox(column, relatedColumns[i].column, i, $filter, $formulaList);

        $active.classList.remove('filter-disabled');
        $status.textContent = column.active ? _('active') : _('inactive');
        if ( ! column.active)
            $active.classList.add('filter-disabled');

        let activeChanged = (event) => {

            let columnId = parseInt($filter.getAttribute('data-columnid'));
            let fColumn = this.model.getColumnById(columnId);
            let active = fColumn.active;
            let related = this.columnsOf(fColumn.id);
            let pairs = [];
            for (let colInfo of related)
                pairs.push({id: colInfo.column.id, values: { active: !active } });

            this.setColumnProperties($filter, pairs);
            event.stopPropagation();
            event.preventDefault();
        };

        $statusBox.addEventListener('click', activeChanged);
        $statusBox.addEventListener('keydown', (event) => {
            if (event.keyCode === 13 || event.keyCode === 32)   //enter  - space
                activeChanged(event);
        });

        $description.textContent = column.description;

        this.addEvents($filter, $description, 'description', column);

        $description.setAttribute('contenteditable', 'true');

        setTimeout(() => {
            if (this.attached)
                this._expandSection($filter, '100px');
            this._stickyBottom(this.$filterList);
            $filter.classList.remove('filter-hidden');
        }, 10);
    }

    _collapseSection(element: HTMLElement) {
        let sectionHeight = element.scrollHeight;

        let elementTransition = element.style.transition;
        element.style.transition = '';

        requestAnimationFrame(() => {
            element.style.height = sectionHeight + 'px';
            element.style.transition = elementTransition;
            requestAnimationFrame(() => {
                element.style.height = 0 + 'px';
            });
        });
    }

    _expandSection(element: HTMLElement, value?: string) {

        element.setAttribute('data-expanding', 'true');
        let sectionHeight = element.scrollHeight;

        element.style.height = value === undefined ? `${sectionHeight}px` : value;

        element.addEventListener('transitionend', (e) => {
            element.removeEventListener('transitionend', e.callee);
            element.style.height = null;
            element.setAttribute('data-expanding', 'false');
            dropdown.updatePosition();
        });
    }

    _stickyBottom($element: Element) {
        if (this._stickyBottomCount === undefined)
            this._stickyBottomCount = 0;

        if (this._stickyBottomCount < 3) {
            let height = $element.scrollHeight;
            if (height !== this._stickyBottomHeight) {
                this._stickyBottomCount = 0;
                this._stickyBottomHeight = height;
                $element.scrollTop = height;
            }
            else
                this._stickyBottomCount += 1;

            setTimeout(() => {
                this._stickyBottom($element);
            }, 10);
        }
        else
            this._stickyBottomCount = 0;
    }

    focusOn($element: HTMLElement) {
        setTimeout(() => {
            this._internalCreate = false;
            $element.focus();
        }, 0);
    }

    async setColumnProperties($filter: Element, pairs: {
        index: number;
        id: number;
        values: Partial<Column>;
    }[]) {
        if (pairs.length === 0)
            return;

        let $title = $filter.querySelector(".title-box");
        let timeoutId = setTimeout(function () {
            $title.classList.add('think');
        }, 400);

        try {
            await this.model.changeColumns(pairs);
            clearTimeout(timeoutId);
            $title.classList.remove("think");
        }
        catch (error) {
            this._notifyEditProblem({
                title: error.message,
                message: error.cause,
                type: 'error',
            });
        }
    }

    addNestedEvents($element: Element, id: number) {
        $element.addEventListener('click', async (event) => {
            let relatedColumns = this.columnsOf(id);
            let parentInfo = relatedColumns[relatedColumns.length - 1];
            let index = parentInfo.index + 1;
            let filterNo = parentInfo.column.filterNo;
            this._internalCreate = true;

            try {
                await this.model.insertColumn({ index: index, columnType: ColumnType.FILTER, filterNo: filterNo, hidden: this.model.get('filtersVisible') === false, active: relatedColumns[0].column.active });
                let column = this.model.getColumn(index);
                this.setColumnForEdit(column.id);
            }
            catch(error) {
                this._notifyEditProblem({
                    title: error.message,
                    message: error.cause,
                    type: 'error',
                });
            }
            event.stopPropagation();
            event.preventDefault();
        });
    }

    async removeNested(event: MouseEvent){
        if (this._removingFilter)
            return;

        let id = parseInt((event.currentTarget as HTMLButtonElement).getAttribute('data-id'));


        this._removingFilter = true;

        try {
            await this.model.deleteColumn(id);
            this._removingFilter = false;
        }
        catch(error) {
            this._notifyEditProblem({
                title: error.message,
                message: error.cause,
                type: 'error',
            });
        }

        event.stopPropagation();
        event.preventDefault();
    }

    removeNestedEvents($element: HTMLElement) {
        $element.addEventListener('click', this.removeNested);
    }

    addEvents($filter: Element, $element: HTMLTextAreaElement, name: string, column: Column) {
        $element.dataset.id = column.id.toString();

        $element.addEventListener('click', (event) => {
            event.stopPropagation();
            event.preventDefault();
        });

        $element.addEventListener('focus', () => {
            if (this._removingFilter) {
                $element.blur();
                return;
            }

            setTimeout(() => { //so that the focusloop handler can process the focus mode before editingVar is set. Otherwise the spreadsheet gets the focus.
                this.model.set('editingVar', [column.id]);
            }, 0);
        });
        $element.addEventListener('blur', (event) => {
            if (this._isRealBlur()) {
                this._editorClicked = false;
                return;
            }

            if ($element.textContent !== column[name]) {
                let data = { };
                data[name] = $element.textContent;
                this.setColumnProperties($filter, [{ id: column.id, values: data }]);
            }

            window.clearTextSelection();
        });
        $element.addEventListener('keydown', (event) => {
            if (event.keyCode === 13 && event.shiftKey === false) {    //enter
                dropdown.hide();
                $element.blur();
            }
        });
    }

    _moveRight() {
        let colNo = this.model.getColumnById(this.model.attributes.editingVar[0]).index;
        colNo++;
        if (colNo <= this.model.attributes.vColumnCount - 1) {
            let column = this.model.getColumn(colNo);
            if (column.columnType === 'filter')
                this.model.set('editingVar', [column.id]);
        }
    }

    _moveLeft() {
        let colNo = this.model.getColumnById(this.model.attributes.editingVar[0]).index;
        colNo--;
        if (colNo >= 0) {
            let column = this.model.getColumn(colNo);
            if (column.columnType === 'filter')
                this.model.set('editingVar', [column.id]);
        }
    }

    detach() {
        if ( ! this.attached)
            return;

        this.querySelectorAll('.remove').forEach(el => el.remove()); //clean up any removes that exist because the transistionend was not called.

        this.attached = false;
    }

    columnsOf(id: number) {
        let children: { column: Column, index: number, id: number }[] = [];
        let column = this.model.getColumnById(id);
        let columns = this.model.get("columns");
        for (let i = 0; i < columns.length; i++) {
            let col = columns[i];
            if (col.columnType !== 'filter')
                break;

            if (column.filterNo === col.filterNo)
                children.push({ column: col, index: i, id: col.id });
        }

        return children;
    }

    rootOf(id: number) {
        let column = this.model.getColumnById(id);
        let children = [];
        let columns = this.model.get("columns");
        for (let i = 0; i < columns.length; i++) {
            let col = columns[i];
            if (col.columnType !== 'filter')
                break;

            if (col.filterNo === column.filterNo)
                return { column: col, index: i };
        }
    }

    _cleanUp() {
        let $toRemove = this.$filterList.querySelectorAll('.remove');
        if ($toRemove.length > 0) {
            $toRemove.forEach(el => el.remove());
        }
        let $test = this.$filterList.querySelectorAll<HTMLElement>('[data-expanding="true"]');
        $test.forEach(el => {
            el.style.height = '';
            el.setAttribute('data-expanding', 'false');
        });
    }

    attach() {

        this._cleanUp();

        this.attached = true;

        this.update();

        setTimeout(() => {
            this.$filterList.querySelectorAll('[contenteditable="false"]').forEach(el => el.setAttribute('contenteditable', 'true'));
        }, 0);

    }

    update() {
        this._updateEyeButton();

        let $filters = this.$filterList.querySelectorAll('.jmv-filter-options:not(.remove)');

        let edittingIds = this.model.get('editingVar');
        let $scrollTo: Element = null;
        for (let i = 0; i < $filters.length; i++) {
            let $filter = $filters[i];

            let columnId = parseInt($filter.getAttribute('data-columnid'));
            $filter.classList.remove('selected');

            let relatedColumns = this.columnsOf(columnId);
            for (let rc = 0; rc < relatedColumns.length; rc++) {
                let relatedColumn = relatedColumns[rc];
                if (edittingIds.includes(relatedColumn.id)) {
                    $filter.classList.add('selected');
                    let $formula = $filter.querySelectorAll('.formula')[rc];
                    $formula.classList.add('selected');
                    if ($scrollTo === null)
                        $scrollTo = $filter;
                }
            }
        }
        if ($scrollTo && this.$filterList.scrollHeight > this.$filterList.clientHeight) {  // don't call scrollIntoView timer if there is no scrollbar
            setTimeout(() => {
                $scrollTo.scrollIntoView(false);
            }, 250);

        }
    }
}

customElements.define('jmv-filters-editor', FilterWidget);

export default FilterWidget;
