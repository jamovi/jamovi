
'use strict';

const $ = require('jquery');
const Backbone = require('backbone');
Backbone.$ = $;
const keyboardJS = require('keyboardjs');
const formulaToolbar = require('./formulatoolbar');
const dropdown = require('./dropdown');
const Notify = require('../notification');

const FilterWidget = Backbone.View.extend({
    className: 'FilterWidget',
    initialize(args) {

        this.dataset = this.model;
        this.attached = false;

        this._exampleFormulas = [
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

        this._editNote = new Notify({ duration: 3000 });

        dropdown.init();
        this.formulaSetup = new formulaToolbar(this.dataset);

        this.$el.empty();
        this.$el.addClass('jmv-filter-widget');
        this.$filterListButtons = $('<div class="jmv-filter-list-buttons"></div>').appendTo(this.$el);
        this.$filterList = $('<div class="jmv-filter-list-box"></div>').appendTo(this.$el);

        this.$addFilter = $(`<div class="filter-button filter-button-tooltip add-filter" title="${_('Add new filter')}"></div>`).appendTo(this.$filterListButtons);
        this.$addFilter.on('click', (event) => {
            this._internalCreate = true;
            this._addFilter();

        });
        this.$addFilter.on('mouseout', event => {
            this._clickedButton = false;
        });

        this.dataset.on('dataSetLoaded', this._dataSetLoaded, this);
        this.dataset.on('columnsDeleted', event => this._columnsDeleted(event));
        this.dataset.on('columnsInserted', event => this._columnsInserted(event));
        this.dataset.on('columnsActiveChanged', event => this._columnsActiveChanged(event));
        this.dataset.on('columnsChanged', event => this._columnsChanged(event));

        let filtersVisible = this.dataset.get('filtersVisible');

        this.$showFilter = $(`<div class="filter-button filter-button-tooltip ${(filtersVisible ? 'show-filter-columns' : 'hide-filter-columns')}" title="${_('Show filter columns')}"></div>`).appendTo(this.$filterListButtons);
        this.$showFilter.on('click', (event) => {
            this.dataset.toggleFilterVisibility();
        });

        this.dataset.on('change:filtersVisible', event => this._updateEyeButton());

    },
    _updateEyeButton() {
        if (this.dataset.get('filtersVisible')) {
            this.$showFilter.removeClass('show-filter-columns');
            this.$showFilter.addClass('hide-filter-columns');
            this.$showFilter.attr('title', 'Hide filter columns');
        }
        else {
            this.$showFilter.removeClass('hide-filter-columns');
            this.$showFilter.addClass('show-filter-columns');
            this.$showFilter.attr('title', 'Show filter columns');
        }
    },
    async _addFilter() {
        let i = -1;
        let column = null;
        do {
            i += 1;
            column = this.dataset.getColumn(i);
        } while(column.columnType === 'filter');

        try {
            await this.dataset.insertColumn({ index: i, columnType: 'filter', hidden: this.dataset.get('filtersVisible') === false });
            column = this.dataset.getColumn(i);
            this.setColumnForEdit(column.id);
        }
        catch(error) {
            this._notifyEditProblem({
                title: error.message,
                message: error.cause,
                type: 'error',
            });
        }
    },
    _notifyEditProblem(details) {
        this._editNote.set(details);
        this.trigger('notification', this._editNote);
    },
    setColumnForEdit(id) {
        this.dataset.set('editingVar', [id]);
    },
    _isColumnRoot(column) {
        let columns = this.dataset.attributes.columns;
        for (let i = 0; i < columns.length; i++) {
            if (column.columnType !== 'filter')
                break;

            if (columns[i].id === column.id)
                return true;
            else if (columns[i].filterNo === column.filterNo)
                break;
        }

        return false;
    },
    _columnsActiveChanged(event) {
        for (let c = event.start; c <= event.end; c++) {
            let column = this.dataset.getColumn(c);
            if (column.columnType === 'filter' && this._isColumnRoot(column)) {
                let $filter = this.$filterList.find('.jmv-filter-options[data-columnid=' + column.id + ']:not(.remove)');

                this._setActive($filter, event.value);
            }
        }
    },
    _getFilterDetails($filters, columnIndex) {
        let $filter = null;
        let widgetIndex = 0;
        let widgetColumnIndex = 0;
        let nextWidgetColumnIndex = 0;
        if ($filters.length === 0)
            return null;

        let $formulaBoxes = null;
        let found = false;
        for (widgetIndex = 0; widgetIndex < $filters.length; widgetIndex++) {
            $filter = $($filters[widgetIndex]);
            $formulaBoxes = $filter.find('.formula-box:not(.remove)');
            widgetColumnIndex = nextWidgetColumnIndex;
            nextWidgetColumnIndex += $formulaBoxes.length;
            if (columnIndex >= widgetColumnIndex && columnIndex < nextWidgetColumnIndex) {
                found = true;
                break;
            }
        }

        if (!found)
            return null;

        let details = { $filter: $filter, isBase: columnIndex === widgetColumnIndex, fcount: $formulaBoxes.length };

        let $splitters = this.$filterList.find('.jmv-filter-splitter:not(.remove)');

        let splitterIndex = widgetIndex;
        if (widgetIndex >= $splitters.length)
            splitterIndex = widgetIndex - 1;

        details.$splitter = $($splitters[splitterIndex]);

        let formulaIndex = columnIndex - widgetColumnIndex;
        details.$formulaBox = $($formulaBoxes[formulaIndex]);

        return details;
    },
    _dataSetLoaded() {
        this.$filterList.empty();
        let columns = this.dataset.attributes.columns;
        let index = 0;
        for (let i = 0; i < columns.length; i++) {
            let column = columns[i];
            if (column.columnType !== 'filter')
                break;

            if (this._isColumnRoot(column))
                this._createFilter(column, index++);
        }
    },
    _columnsDeleted(event) {
        let removed = false;

        let removeBase = (details) => {
            if (this.attached) {
                details.$filter.one("webkitTransitionEnd otransitionend oTransitionEnd msTransitionEnd transitionend",
                (event) => {
                    details.$filter.remove();
                    details.$splitter.remove();
                });

                details.$filter.addClass('remove');
                details.$splitter.addClass('remove');

                this._collapseSection(details.$filter[0]);
                if (details.$splitter.length > 0)
                    this._collapseSection(details.$splitter[0]);
            }
            else {
                details.$filter.remove();
                details.$splitter.remove();
            }
        };

        let removeSub = (details) => {
            if (this.attached) {
                details.$formulaBox.one("webkitTransitionEnd otransitionend oTransitionEnd msTransitionEnd transitionend",
                (event) => {
                    details.$formulaBox.remove();
                });
                details.$formulaBox.addClass('remove');

                this._collapseSection(details.$formulaBox[0]);
            }
            else {
                details.$formulaBox.remove();
            }
        };

        //let removedCount = 0;
        let indices = $.extend(true, {}, event.indices);

        event.ids.sort((a,b) => indices[a].index - indices[b].index);

        for (let id of event.ids) {
            let index = indices[id].index;
            let $filters = this.$filterList.find('.jmv-filter-options:not(.remove)');
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
                let $formulaBoxes = details.$filter.find('.formula-box:not(.remove)');
                if ($formulaBoxes.length === 0)
                    removeBase(details);
                else {
                    details.$filter.attr('data-columnid', $($formulaBoxes[0]).attr('data-columnid'));
                    this._convertRemoveBoxToAddBox($($formulaBoxes[0]));
                }
            }
            else
                removeSub(details);
        }
    },
    _convertRemoveBoxToAddBox($element) {
        let columnId =  parseInt($element.attr('data-columnid'));
        $element.find('.equal').text('=');
        $element.find('.formula').removeClass('and-formula');
        let $removeButton = $element.find('.remove-nested');
        $removeButton.off('click.removenested');
        this.addNestedEvents($removeButton, columnId);
        $removeButton.removeClass('remove-nested');
        $removeButton.addClass('add-nested');
        $removeButton.attr('title', _('Add another nested filter'));
        $removeButton.find('span').removeClass('mif-cross').addClass('mif-plus');
    },
    _columnsInserted(event) {

        if (event.ids.length === 0)
            return;

        let ids = event.ids.slice();
        ids.sort((a, b) => event.indices[a].dIndex - event.indices[b].dIndex);

        for (let id of ids) {
            let c = event.indices[id].index;
            let column = this.dataset.getColumn(c);
            if (column.columnType === 'filter') {
                let columns = this.dataset.attributes.columns;
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
                    let $filter = this.$filterList.find('.jmv-filter-options[data-columnid=' + rColumn.id + ']:not(.remove)');
                    let $formulaList = $filter.find('.formula-list');
                    this._createFormulaBox(rColumn, column, column.index - rColumn.index, $filter, $formulaList);
                }
            }
        }
        setTimeout(() => {
            this.$filterList.find('[contenteditable=false]').attr('contenteditable', 'true');
        }, 0);
    },
    _columnsChanged(event) {

        for (let changes of event.changes) {

            if (changes.created || changes.deleted)
                continue;

            let column = this.dataset.getColumnById(changes.id);
            if (column.columnType !== 'filter')
                continue;

            let $formulaBox = this.$filterList.find('.formula-box[data-columnid=' + column.id + ']:not(.remove)');
            this._setFormula($formulaBox, column.formula, column.formulaMessage);

            if (this._isColumnRoot(column)) {
                let $filter = this.$filterList.find('.jmv-filter-options[data-columnid=' + column.id + ']:not(.remove)');

                let $label = $filter.find('.label');
                $label.text(column.name);

                this._setDescription($filter, column.description);
            }
        }
    },
    _removeFilter(id) {
        if (id === -1 && id !== null)
            return Promise.resolve();

        let column = this.dataset.getColumnById(id);
        if (column === undefined || column.columnType !== 'filter')
            return Promise.resolve();

        let relatedColumns = this.columnsOf(id);
        if (relatedColumns.length === 0)
            return Promise.resolve();

        let ids = [];
        for (let i = 0; i < relatedColumns.length; i++)
            ids.push(relatedColumns[i].column.id);

        return this.dataset.deleteColumns(ids).catch((error) => {
            this._notifyEditProblem({
                title: error.message,
                message: error.cause,
                type: 'error',
            });
        });
    },

    _setFormula($formulaBox, formula, formulaMessage) {
        let $formula = $formulaBox.find('.formula');
        let $formulaMessage = $formulaBox.find('.formulaMessage');

        if ($formula.length === 0)
            $formula = $formula;
        $formula[0].textContent = formula;

        if (formulaMessage === '')
            $formula.removeClass('in-errror');
        else
            $formula.addClass('in-errror');
        $formulaMessage.text(formulaMessage);
    },
    _setDescription($filter, description) {
        let $description = $filter.find('.description');
        $description[0].textContent = description;
    },
    _setActive($filter, active) {
        let $status = $filter.find('.status');
        let $active = $filter.find('.active');
        if (active) {
            $status[0].textContent = _('active');
            $active.removeClass('filter-disabled');
            $active.attr('title', _('Filter is active'));
        }
        else {
            $status[0].textContent = _('inactive');
            $active.addClass('filter-disabled');
            $active.attr('title', _('Filter is inactive'));
        }


    },

    _createFormulaBox(rootColumn, relatedColumn, rIndex, $filter, $formulaList) {
        let $formulaBox = $('<div class="formula-box filter-hidden" data-columnid="' + relatedColumn.id + '" data-rootid="' + rootColumn.id + '"></div>');

        let $list = $formulaList.find('.formula-box:not(.remove)');
        if (rIndex >= $list.length)
            $formulaBox.appendTo($formulaList);
        else
            $formulaBox.insertBefore($($list[rIndex]));

        if (rIndex > 0) {
            $(`<div class="equal">${_('and')}</div>`).appendTo($formulaBox);
            let $removeNested = $('<div class="remove-nested" title="Remove nested filter"><span class="mif-cross"></span></div>').appendTo($formulaBox);
            this.removeNestedEvents($removeNested, relatedColumn.id);
        }
        else {
            $('<div class="equal">=</div>').appendTo($formulaBox);
            let $addNested = $(`<div class="add-nested" title="${_('Add another nested filter')}"><span class="mif-plus"></span></div>`).appendTo($formulaBox);
            this.addNestedEvents($addNested, rootColumn.id);
        }

        let $showEditor = $(`<div class="show-editor" title="${_('Show formula editor')}"><div class="down-arrow"></div></div>`).appendTo($formulaBox);

        $showEditor.on('click', (event) => {
            if (this._$wasEditingFormula !== $formula) {
                dropdown.show($formula, this.formulaSetup, $formulaBox[0].getAttribute('data-expanding') === 'true' || $filter[0].getAttribute('data-expanding') === 'true');
                this.formulaSetup.show($formula, null);
                $formula.focus();
                $showEditor.addClass('is-active');
            }
            event.stopPropagation();
            event.preventDefault();
        });

        $showEditor.on('mousedown', (event) => {
            this._$wasEditingFormula = dropdown.focusedOn();
            this._editorClicked = true;
        });

        let $formulaPair = $('<div class="formula-pair"></div>').appendTo($formulaBox);

        let _example = this._exampleFormulas[Math.floor(Math.random() * Math.floor(this._exampleFormulas.length - 1))];
        let $formula = $('<div class="formula' + ((rIndex > 0) ? ' and-formula' : '') + '" type="text" placeholder="e.g. ' + _example + '" contenteditable="true"></div>').appendTo($formulaPair);

        $formula.on('input', (event) => {
            dropdown.updatePosition();
        });

        $formula.on('editor:closing', () => {
            $showEditor.removeClass('is-active');
        });

        let $formulaMessageBox = $('<div class="formulaMessageBox""></div>').appendTo($formulaPair);
        let $formulaMessage = $('<div class="formulaMessage""></div>').appendTo($formulaMessageBox);

        $formula[0].textContent = relatedColumn.formula;
        $formulaMessage.text(relatedColumn.formulaMessage);
        if (relatedColumn.formulaMessage === '')
            $formula.removeClass('in-errror');
        else
            $formula.addClass('in-errror');

        $formula.addClass('selected');

        this.addEvents($filter, $formula, 'formula', relatedColumn);

        setTimeout(() => {
            if (this.attached)
                this._expandSection($formulaBox[0]);
            $formulaBox.removeClass('filter-hidden');

            if (this._internalCreate) {
                setTimeout(() => {
                    this.focusOn($formula);
                }, 0);
            }
        }, 10);

    },
    _isRealBlur() {
        return dropdown.clicked() || this._editorClicked;
    },

    _createFilter(column, index) {
        let $filters = this.$filterList.find('.jmv-filter-options:not(.remove)');

        let insertBefore = -1;
        if ($filters.length > 0 && index < $filters.length)
            insertBefore = index;

        let $filter = $('<div class="jmv-filter-options filter-hidden" data-columnid="' + column.id + '"></div>');
        if (insertBefore !== -1) {
            $filter.insertBefore($filters[insertBefore]);
            $('<div class="jmv-filter-splitter"></div>').insertAfter($filter);
        }
        else {
            $filter.appendTo(this.$filterList);
            if (index !== 0)
                $('<div class="jmv-filter-splitter"></div>').insertBefore($filter);
        }

        let $titleBox = $('<div class="title-box"></div>').appendTo($filter);
        $(`<div class="label-parent"><div class="label">${_('Filter {i}', {i: (index + 1)} )}</div></div>`).appendTo($titleBox);
        let $middle = $('<div class="middle-box"></div>').appendTo($titleBox);
        let $statusBox = $('<div class="status-box"></div>').appendTo($middle);
        let $active = $(`<div class="active" title="${_('Filter is active')}"><div class="switch"></div></div>`).appendTo($statusBox);
        let $status = $(`<div class="status">${_('active')}</div>`).appendTo($statusBox);
        $('<div class="header-splitter"></div>').appendTo($titleBox);


        let $removeButton = $(`<div class="remove-filter-btn" title="${_('Remove filter')}"><span class="mif-cross"></span></div>`);
        $removeButton.appendTo($titleBox);


        let $formulaList = $('<div class="formula-list"></div>').appendTo($filter);
        let $description = $(`<div class="description" type="text" placeholder="${_('Description')}"></div>`).appendTo($filter);

        $removeButton.on('click', async (event) => {
            if (this._removingFilter)
                return;

            let columnId = parseInt($filter.attr('data-columnid'));
            this._removingFilter = true;
            await this._removeFilter(columnId);
            this._removingFilter = false;

            event.stopPropagation();
            event.preventDefault();
        });

        $filter.on('click', (event) => {
            if ($filter.hasClass('remove'))
                return;

            let columnId = parseInt($filter.attr('data-columnid'));
            this.dataset.set('editingVar', [columnId]);
        });

        let relatedColumns = this.columnsOf(column.id);
        for (let i = 0; i < relatedColumns.length; i++)
            this._createFormulaBox(column, relatedColumns[i].column, i, $filter, $formulaList);

        $active.removeClass('filter-disabled');
        $status[0].textContent = column.active ? _('active') : _('inactive');
        if ( ! column.active)
            $active.addClass('filter-disabled');

        let activeChanged = (event) => {

            let columnId = parseInt($filter.attr('data-columnid'));
            let fColumn = this.dataset.getColumnById(columnId);
            let active = fColumn.active;
            let related = this.columnsOf(fColumn.id);
            let pairs = [];
            for (let colInfo of related)
                pairs.push({id: colInfo.column.id, values: { active: !active } });

            this.setColumnProperties($filter, pairs);
            event.stopPropagation();
            event.preventDefault();
        };


        $active.on('click', activeChanged);
        $status.on('click', activeChanged);

        $description[0].textContent = column.description;

        this.addEvents($filter, $description, 'description', column);

        $description.attr('contenteditable', 'true');

        setTimeout(() => {
            if (this.attached)
                this._expandSection($filter[0], '100px');
            this._stickyBottom(this.$filterList);
            $filter.removeClass('filter-hidden');
        }, 10);
    },
    _collapseSection(element) {
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
    },

    _expandSection(element, value) {

        element.setAttribute('data-expanding', true);
        let sectionHeight = element.scrollHeight;

        element.style.height = value === undefined ? sectionHeight : value;

        element.addEventListener('transitionend', (e) => {
            element.removeEventListener('transitionend', e.callee);
            element.style.height = null;
            element.setAttribute('data-expanding', false);
            dropdown.updatePosition();
        });
    },
    _stickyBottom($element) {
        if (this._stickyBottomCount === undefined)
            this._stickyBottomCount = 0;

        if (this._stickyBottomCount < 3) {
            let height = $element[0].scrollHeight;
            if (height !== this._stickyBottomHeight) {
                this._stickyBottomCount = 0;
                this._stickyBottomHeight = height;
                $element.scrollTop(height);
            }
            else
                this._stickyBottomCount += 1;

            setTimeout(() => {
                this._stickyBottom($element);
            }, 10);
        }
        else
            this._stickyBottomCount = 0;
    },
    focusOn($element) {
        setTimeout(() => {
            this._internalCreate = false;
            $element.focus();
        }, 0);
    },
    async setColumnProperties($filter, pairs) {
        if (pairs.length === 0)
            return;

        let $title = $filter.find(".title-box");
        let timeoutId = setTimeout(function () {
            $title.addClass('think');
        }, 400);

        try {
            await this.dataset.changeColumns(pairs);
            clearTimeout(timeoutId);
            $title.removeClass("think");
        }
        catch (error) {
            this._notifyEditProblem({
                title: error.message,
                message: error.cause,
                type: 'error',
            });
        }
    },
    addNestedEvents($element, id) {
        $element.on('click.addnested', async (event) => {
            let relatedColumns = this.columnsOf(id);
            let parentInfo = relatedColumns[relatedColumns.length - 1];
            let index = parentInfo.index + 1;
            let filterNo = parentInfo.column.filterNo;
            this._internalCreate = true;

            try {
                await this.dataset.insertColumn({ index: index, columnType: 'filter', filterNo: filterNo, hidden: this.dataset.get('filtersVisible') === false, active: relatedColumns[0].column.active });
                let column = this.dataset.getColumn(index);
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
    },
    removeNestedEvents($element, id) {
        $element.on('click.removenested', async (event) => {

            if (this._removingFilter)
                return;

            this._removingFilter = true;

            try {
                await this.dataset.deleteColumn(id);
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
        });
    },
    addEvents($filter, $element, name, column) {
        $element.data('id', column.id);

        $element.on('click', (event) => {
            event.stopPropagation();
            event.preventDefault();
        });

        $element.on('focus', () => {
            if (this._removingFilter) {
                $element.blur();
                return;
            }

            keyboardJS.pause('filter-' + column.id);
            this.dataset.set('editingVar', [column.id]);

            $element.select();
        });
        $element.on('blur', (event) => {
            if (this._isRealBlur()) {
                this._editorClicked = false;
                return;
            }

            keyboardJS.resume('filter-' + column.id);
            if ($element[0].textContent !== column[name]) {
                let data = { };
                data[name] = $element[0].textContent;
                this.setColumnProperties($filter, [{ id: column.id, values: data }]);
            }

            window.clearTextSelection();
        });
        $element.on('keydown', (event) => {
            if (event.keyCode === 13 && event.shiftKey === false) {    //enter
                $element.blur();
                event.preventDefault();
                event.stopPropagation();
            }

            if (event.keyCode === 9) {    //tab
                event.preventDefault();
                event.stopPropagation();
            }
        });
    },
    _moveRight() {
        let colNo = this.dataset.getColumnById(this.dataset.attributes.editingVar[0]).index;
        colNo++;
        if (colNo <= this.dataset.attributes.vColumnCount - 1) {
            let column = this.dataset.getColumn(colNo);
            if (column.columnType === 'filter')
                this.dataset.set('editingVar', [column.id]);
        }
    },
    _moveLeft() {
        let colNo = this.dataset.getColumnById(this.dataset.attributes.editingVar[0]).index;
        colNo--;
        if (colNo >= 0) {
            let column = this.dataset.getColumn(colNo);
            if (column.columnType === 'filter')
                this.dataset.set('editingVar', [column.id]);
        }
    },
    detach() {
        if ( ! this.attached)
            return;

        this.$el.find('.remove').remove(); //clean up any removes that exist because the transistionend was not called.

        this.attached = false;
    },
    columnsOf(id) {
        let children = [];
        let column = this.dataset.getColumnById(id);
        let columns = this.dataset.get("columns");
        for (let i = 0; i < columns.length; i++) {
            let col = columns[i];
            if (col.columnType !== 'filter')
                break;

            if (column.filterNo === col.filterNo)
                children.push({ column: col, index: i, id: col.id });
        }

        return children;
    },
    rootOf(id) {
        let column = this.dataset.getColumnById(id);
        let children = [];
        let columns = this.dataset.get("columns");
        for (let i = 0; i < columns.length; i++) {
            let col = columns[i];
            if (col.columnType !== 'filter')
                break;

            if (col.filterNo === column.filterNo)
                return { column: col, index: i };
        }
    },
    _cleanUp() {
        let $toRemove = this.$filterList.find('.remove');
        if ($toRemove.length > 0) {
            $toRemove.remove();
        }
        let $test = this.$filterList.find('[data-expanding=true]');
        if ($test.length > 0) {
            $test.css('height', '');
            $test.attr('data-expanding', false);
        }
    },
    attach() {

        this._cleanUp();

        this.attached = true;

        this.update();

        setTimeout(() => {
            this.$filterList.find('[contenteditable=false]').attr('contenteditable', 'true');
        }, 0);

    },
    update() {
        this._updateEyeButton();

        let $filters = this.$filterList.find('.jmv-filter-options:not(.remove)');

        let edittingIds = this.dataset.get('editingVar');
        let $scrollTo = null;
        for (let i = 0; i < $filters.length; i++) {
            let $filter = $($filters[i]);

            let columnId = parseInt($filter.attr('data-columnid'));
            $filter.removeClass('selected');

            let relatedColumns = this.columnsOf(columnId);
            for (let rc = 0; rc < relatedColumns.length; rc++) {
                let relatedColumn = relatedColumns[rc];
                if (edittingIds.includes(relatedColumn.id)) {
                    $filter.addClass('selected');
                    let $formula = $($filter.find('.formula')[rc]);
                    $formula.addClass('selected');
                    if ($scrollTo === null)
                        $scrollTo = $filter;
                }
            }
        }
        if ($scrollTo)
            $scrollTo[0].scrollIntoView();
    }
});

module.exports = FilterWidget;
