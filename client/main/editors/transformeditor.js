'use strict';

const $ = require('jquery');
const keyboardJS = require('keyboardjs');
const opsToolbar = require('./operatordropdown');
const tarp = require('../utils/tarp');
const formulaToolbar = require('../vareditor/formulatoolbar');
const dropdown = require('../vareditor/dropdown');
const VariableList = require('../vareditor/variablelist');
const ColourPalette = require('./colourpalette');

const TransformEditor = function(dataset) {

    this.dataset = dataset;

    this.$el = $('<div class="jmv-transform-editor"></div>');

    this.title = 'TRANSFORM';
    this.$icon = $('<div class="transform-colour"></div>');

    this._exampleFormulas = [
        { s: ">", a: "2000", b: "$value" },
        { s: "<=", a: "1000", b: "A" },
        { s: "==", a: "5", b: "B" },
        { s: "<", a: "17000", b: "'Male'" },
        { s: ">=", a: "1", b: "'Early'" },
        { s: "=", a: "'tom'", b: "'medium'" }
    ];

    this.model = { };

    this._id = null;

    this.setTransformId = function(id) {
        this._id = id;
        this._populate();
    };

    this.transformId = function() {
        return this._id;
    };

    this._init = function() {
        this.dataset.on('dataSetLoaded', this._dataSetLoaded, this);

        dropdown.init();
        this.formulasetup = new formulaToolbar(this.dataset);
        this.opsToolbar = new opsToolbar();

        this.formula = [ '' ];

        this.$top = $('<div class="jmv-transform-editor-top"></div>').appendTo(this.$el);
        this.$title = $('<input class="jmv-variable-editor-widget-title" type="text" maxlength="63">').appendTo(this.$top);
        this.$description = $('<div class="jmv-variable-editor-widget-description" type="text" placeholder="Description" contenteditable="true">').appendTo(this.$top);

        this.setInputEvents = function($element, isDiv, propertyName) {
            let _applyOnBlur = true;
            $element.focus(() => {
                keyboardJS.pause('');
                $element.select();
            } );

            $element.blur(() => {
                if (_applyOnBlur) {
                    keyboardJS.resume();
                    let id = this._id;
                    let values = { };
                    if (isDiv)
                        values[propertyName] = $element[0].textContent;
                    else
                        values[propertyName] = $element.val();
                    this.dataset.setTransforms([{ id: id, values: values }]).then(() => {
                        this._populate();
                    });
                }
                _applyOnBlur = true;
            } );

            $element.keydown((event) => {
                var keypressed = event.keyCode || event.which;
                if (keypressed === 13) { // enter key
                    $element.blur();
                    event.preventDefault();
                    event.stopPropagation();
                }
                else if (keypressed === 27) { // escape key
                    _applyOnBlur = false;
                    $element.blur();
                    let id = this._id;
                    let value = this.dataset.getTransformById(id)[propertyName];
                    if (isDiv)
                        $element[0].textContent = value;
                    else
                        $element.val(value);
                    event.preventDefault();
                    event.stopPropagation();
                }
            });
        };

        this.setInputEvents(this.$title, false, 'name');
        this.setInputEvents(this.$description, true, 'description');

        this.$contents = $('<div class="contents"></div>').appendTo(this.$el);

        let $insertBox = $('<div class="insert-box"></div>').appendTo(this.$contents);
        this.$insert = $('<button class="insert button" title="Add condition"></button>').appendTo($insertBox);

        this.$insert.on('keydown', (event) => {
            if ( event.keyCode === 9 ) { //tab
                if (event.shiftKey === false && this._nextFocus) {
                    this._nextFocus.focus();
                    event.preventDefault();
                }
                else if (event.shiftKey === true && this._nextShiftFocus) {
                    this._nextShiftFocus.focus();
                    event.preventDefault();
                }

                this._nextFocus = null;
                this._nextShiftFocus = null;
            }
        });

        this.$insert.on('click', (event) => {
            this._focusFormulaControls();
            this.formula.splice(this.formula.length - 1, 0, '', '');
            this._addTransformUIItem('', '', true);
            this._updateLastFormulaTag();

            setTimeout(() => {
                let $formulas = this.$options.find('.formula');
                $($formulas[$formulas.length-3]).focus();
                this.$options.animate({scrollTop:this.$options[0].scrollHeight}, 'slow');
            },0);
        });

        this.$insert.focus(() => {
            keyboardJS.pause('');
            this._focusFormulaControls();
        } );

        this.$insert.blur(() => {
            keyboardJS.resume();
        } );

        this.$options = $('<div class="jmv-transform-editor-options"></div>').appendTo(this.$contents);

        let $rightBox = $('<div class="right-box"></div>').appendTo(this.$contents);
        let $moveup = $('<div class="move-up button"><span class="mif-arrow-up"></span></div>').appendTo($rightBox);
        let $movedown = $('<div class="move-down button"><span class="mif-arrow-down"></span></div>').appendTo($rightBox);

        $moveup.on('mousedown', (event) => {
            let $item = this.$options.find('.selected');
            if ($item)
                this._swapFormulaItems($item, 'up');
        });

        $movedown.on('mousedown', (event) => {
            let $item = this.$options.find('.selected');
            if ($item)
                this._swapFormulaItems($item, 'down');
        });

        let elements3 = this._addTransformUIItem('');

        $(window).on('keydown', event => {
            if ( ! this.$contents.hasClass('super-focus'))
                return;

            let undo = event.key === 'Escape';
            if (event.key === 'Escape' || event.key === 'Enter') {
                if (undo) {
                    this.formula = this._undoFormula;
                    this._createFormulaUI(false);
                }
                tarp.hide('recode-formula');
            }
        });


        this.$bottom = $('<div class="jmv-transform-editor-bottom"></div>').appendTo(this.$el);
        this.$connectionInfo = $('<div class="jmv-transform-editor-widget-info"></div>').appendTo(this.$bottom);
        this.$viewConnectionInfo = $('<div class="view-button">View</div>').appendTo(this.$bottom);

        this.variableList = new VariableList();
        this.$viewConnectionInfo.on('click', (event) => {
            let columns = [];
            for (let column of this.dataset.attributes.columns) {
                if (column.transform === this._id)
                    columns.push(column);
            }
            if (columns.length > 0) {
                this.variableList.populate(columns, true);
                dropdown.show(this.$viewConnectionInfo, this.variableList);
            }
            event.preventDefault();
            event.stopPropagation();
        });

        this.dataset.on('columnsChanged', (event) => {
            for (let change of event.changes) {
                if (change.transformChanged) {
                    this._populate();
                    break;
                }
            }
        });

        this.dataset.on('transformsChanged', (event) => {
            for (let change of event.changes) {
                if (change.id === this._id) {
                    this._updateErrorMessages();
                    break;
                }
            }
        });
    };

    this._updateErrorMessages = function() {
        let transform = this.dataset.getTransformById(this._id);

        let $messageBoxes = this.$options.find('.formula-message');
        for (let i = 0; i < transform.formulaMessage.length; i++) {
            let msg = transform.formulaMessage[i];
            $messageBoxes[i].textContent = msg;
        }
    };

    this._focusFormulaControls = function() {
        if (this.$contents.hasClass('super-focus'))
            return;

        this._undoFormula = this.formula.slice();

        this.$contents.addClass('super-focus');
        tarp.show('recode-formula', true, 0.1, 299).then(() => {
            this.$contents.removeClass('super-focus');
            this._applyFormula();
        }, () => {
            this.$contents.removeClass('super-focus');
            this._applyFormula();
        });
    };

    this._addTransformUIItem = function(formula1, formula2, hasTransition) {
        let hasCondition = formula2 !== undefined;

        let tag = 'if value';
        if ( ! hasCondition) {
            if (this.formula.length === 1)
                tag = '=';
            else
                tag = 'else use';
        }

        let elements = this._createFormulaBox(this.$options, hasCondition, hasTransition);

        this._createSubFormula(elements, tag, hasCondition, formula1, 0);

        elements.$showEditor.on('click', (event) => {
            let $formula = null;
            for (let $next_formula of elements.$formulas) {
                if (this._$wasEditingFormula === $next_formula) {
                    $formula = $next_formula;
                    break;
                }
            }
            if ( ! $formula ) {
                $formula = elements.$focusedFormula === null ? elements.$formulas[0] : elements.$focusedFormula;
                dropdown.show(elements.$formulaGrid, this.formulasetup);
                this.formulasetup.show($formula, '', true);
                $formula.focus();
                elements.$showEditor.addClass('is-active');
            }
        });

        elements.$showEditor.on('mousedown', (event) => {
            this._$wasEditingFormula = dropdown.focusedOn() !== null ? this.formulasetup.focusedOn() : null;
            elements._editorClicked = true;
        });

        if (hasCondition) {
            this._createSubFormula(elements, 'use', false, formula2, 1);
            this._createFormulaButtons(elements);
        }

        let $items =  elements.$formulaGrid.find('.formula-list-item');
        $($items[$items.length-1]).addClass('item-last');

        let $msgItems =  elements.$formulaGrid.find('.formula-message-box');
        $($msgItems[$msgItems.length-1]).addClass('item-last');


        if (hasTransition) {
            setTimeout(() => {
                let height = elements.$formulaGrid.outerHeight();
                this._expandSection(elements.$formulaBox[0], height + 'px');
                elements.$formulaBox.removeClass('hidden');
            }, 0);
        }
        else {
            elements.$formulaBox.removeClass('hidden');
        }
    };

    this._updateLastFormulaTag = function() {
        let $equal = this.$options.find('.recode-else .equal');
        let $formula = this.$options.find('.recode-else .formula');
        let tag = '=';
        if (this.formula.length > 1)
            tag = 'else use';

        let indent = (tag.length + 1) + 'ch';
        $formula.css('text-indent', indent);
        $equal.html(tag);
    };

    this._applyFormula = function() {
        if (this._applyId)
            clearTimeout(this._applyId);

        this._applyId = setTimeout(() => {
            let id = this._id;
            let values = { formula: this.formula };
            this._applyId = null;
            this.dataset.setTransforms([{ id: id, values: values }]);
        }, 0);
    };

    this._createFormulaUI = function(hasTransition) {
        this.$options.empty();
        for (let i = 0; i < this.formula.length; i += 2)
            this._addTransformUIItem(this.formula[i], this.formula[i+1], hasTransition);
    };

    this._populate = function(event) {
        let id = this._id;
        if (id !== null) {
            let transform = this.dataset.getTransformById(id);
            if (transform) {

                this.$icon.css('background-color', ColourPalette.get(transform.colourIndex));

                this.$title.val(transform.name);
                this.$description[0].textContent = transform.description;

                let updateFormula = false;
                if ( ! this.formula || this.formula.length !== transform.formula.length)
                     updateFormula = true;
                else {
                    for (let i = 0; i < this.formula.length; i++) {
                        if (this.formula[i] !== transform.formula[i]) {
                            updateFormula = true;
                            break;
                        }
                    }
                }
                this.formula = transform.formula;
                if (updateFormula)
                    this._createFormulaUI(true);


                this.connectedColumns = [];
                let columns = this.dataset.attributes.columns;
                let count = 0;
                for (let column of columns) {
                    if (column.transform === id)
                        this.connectedColumns.push(column);
                }
                this.$connectionInfo[0].textContent = 'This transform is being used by ' + this.connectedColumns.length + ' ' + (this.connectedColumns.length === 1 ? 'variable' : 'variables');
                this._updateErrorMessages();
                return;
            }
        }

        this.$title.html('');
        this.$description.html('');
    };

    this._swapFormulaItems = function($item, direction) {

        if (!this.formula || this.formula.length <= 1)
            return;

        let $formula = $item.find(':focus');
        let index = $item.index();

        if ( ! this._swappingItems &&
             ! ((index === 0 && direction === 'up' ) || (((index+1) * 2) >= (this.formula.length-1) && direction === 'down'))) {
            this._swappingItems = true;

            let $items = this.$options.find('.formula-box');
            let oIndex = index-1;
            if (direction === 'down')
                oIndex = index+1;

            let $other = $($items[oIndex]);

            let iHeight = $item.outerHeight(true);
            let oHeight = $other.outerHeight(true);

            $item.css('top', (parseFloat($item.css('top')) + (direction === 'up' ? (-oHeight) : oHeight)) + 'px');
            $other.css('top', (parseFloat($other.css('top')) - (direction === 'up' ? (-iHeight) : iHeight)) + 'px');

            $item.one("webkitTransitionEnd otransitionend oTransitionEnd msTransitionEnd transitionend", (event) => {
                $item.css('top', '0px');
                $other.css('top', '0px');
                $other.css('transition', 'none');
                $item.detach();
                if (direction === 'up')
                    $other.before($item);
                else
                    $other.after($item);

                setTimeout(() => {
                    $other.css('transition', '');
                    $formula.focus();
                    this._swappingItems = false;

                    let y1 = this.formula[(index * 2) + 0];
                    let y2 = this.formula[(index * 2) + 1];

                    this.formula[(index * 2) + 0] = this.formula[(oIndex * 2) + 0];
                    this.formula[(index * 2) + 1] = this.formula[(oIndex * 2) + 1];

                    this.formula[(oIndex * 2) + 0] = y1;
                    this.formula[(oIndex * 2) + 1] = y2;
                }, 0);
            });
        }

        setTimeout(() => {
            $formula.focus();
        }, 0);
    };

    this._dataSetLoaded = function(event) {
        this._populate(event);
    };

    this._removeCondition = function($formulaBox) {
        this._focusFormulaControls();
        let condIndex = $formulaBox.index();
        let index = condIndex * 2;
        this.formula.splice(index, 2);
        $formulaBox.remove();
        this._updateLastFormulaTag();
    };

    this._createFormulaButtons = function(elements) {
        let $rm = $('<div class="remove-cond" data-index="0"><span class="mif-cross"></span></div>').appendTo(elements.$formulaGrid);
        $rm.on('click', (event) => {
            elements.$formulaBox.one("webkitTransitionEnd otransitionend oTransitionEnd msTransitionEnd transitionend", (event) => {
                this._removeCondition(elements.$formulaBox);
            });
            elements.$formulaBox.addClass('remove');
            this._collapseSection(elements.$formulaBox[0]);
        });
    };

    this._collapseSection = function(element) {
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
    };

    this._expandSection = function(element, value) {

        element.setAttribute('data-expanding', true);
        let sectionHeight = element.scrollHeight;

        element.style.height = value === undefined ? sectionHeight : value;

        element.addEventListener('transitionend', (e) => {
            element.removeEventListener('transitionend', e.callee);
            element.style.height = null;
            element.setAttribute('data-expanding', false);
            dropdown.updatePosition();
        });
    };

    this._createFormulaBox = function($parent, isCondition, hasTransition) {
        let $elseBox = $parent.find('.recode-else');
        let className = 'recode-if';
        if ( ! isCondition)
            className = 'recode-else';
        if (hasTransition)
            className = className + ' hidden';

        let $formulaBox = $('<div class="formula-box ' + className + '"></div>');

        if ($elseBox.length > 0) {
            if ( ! isCondition)
                throw 'The else statement ui already exists';

            $formulaBox.insertBefore($elseBox);
        }
        else
            $parent.append($formulaBox);

        let $showEditor = $('<div class="show-editor" title="Show formula editor"><div class="down-arrow"></div></div>').appendTo($formulaBox);

        let $formulaGrid = $('<div class="formula-grid"></div>').appendTo($formulaBox);

        return { $formulaBox,  $showEditor, $formulaGrid, _editorClicked: false };
    };

    this._startsWithValidOps = function($formula) {
        let validOps = ['==', '!=', '=', '<=', '>=', '<', '>'];

        let text = $formula.text().trim();

        if (text === '') {
            text = $formula.attr('placeholder');
        }

        for (let i = 0; i < validOps.length; i++) {
            if (text.startsWith(validOps[i])) {
                let count = validOps[i].length;
                if (count < text.length && text[count] !== ' ') {

                    let startPosition = $formula[0].selectionStart;
                    let endPosition = $formula[0].selectionEnd;

                    text = text.slice(0, count) + ' ' + text.slice(count);
                    $formula.text(text);
                }
                return validOps[i].length;

            }
        }

        return 0;
    };

    this._createSubFormula = function(elements, prefix, hasOp, formula, index) {

        let $formulaBox = elements.$formulaBox;

        let indent = (prefix.length + 1) + 'ch';

        if (hasOp === undefined)
            hasOp = false;

        let $formulaGrid = $formulaBox.find('.formula-grid');

        let _example = this._exampleFormulas[Math.floor(Math.random() * Math.floor(this._exampleFormulas.length - 1))].b;
        let _sign = '';
        if (hasOp) {
            _example = this._exampleFormulas[Math.floor(Math.random() * Math.floor(this._exampleFormulas.length - 1))].a;
            _sign = this._exampleFormulas[Math.floor(Math.random() * Math.floor(this._exampleFormulas.length - 1))].s + ' ';
        }

        let $fp = $('<div class="formula-list-item item-' + index + '" style="grid-column-start: ' + (index + 1) + '; grid-row-start: 1;"></div>').appendTo($formulaGrid);

        elements.$focusedFormula = null;
        if (elements.$formulas === undefined)
            elements.$formulas = [ ];

        let $formula = $('<div class="formula" type="text" placeholder="' + _sign + 'e.g. ' + _example + '" contenteditable="true" data-index="' + index + '" style="text-indent:' + indent + '">' + formula + '</div>').appendTo($fp);
        $('<div class="equal">' + prefix + '</div>').appendTo($fp);

        elements.$formulas.push($formula);

        let $opEdit = null;

        $formula.on('blur', (event) => {
            this.$options.find('.selected').removeClass('selected');
            this.formula[($formulaBox.index() * 2) + index] = $formula[0].textContent;
            if (hasOp && elements._editorClicked === false)
                $opEdit.hide();
        });

        $formula.on('focus', (event) => {
            elements.$formulaBox.addClass('selected');
            elements.$focusedFormula = $formula;
            this._focusFormulaControls();
            if (this.formulasetup.focusedOn() !== $formula)
                this.formulasetup.show($formula, '', true);
            if (hasOp)
                $opEdit.show();
        });

        $formula.on('input', (event) => {
            dropdown.updatePosition();

            if (hasOp) {
                let count = this._startsWithValidOps($formula);
                if (count !== 0)
                    $opEdit.css('width', (count+1) + 'ch');

                if (dropdown.content() === this.opsToolbar)
                    dropdown.hide();
            }
        });

        if (hasOp) {
            $opEdit = $('<div class="down-arrow">a</div>').appendTo($fp);
            $opEdit.css('width', _sign.length + 'ch');
            $opEdit.hide();

            $opEdit.on('click', (event) => {
                if (this._$wasEditingOpsFormula !== $formula || dropdown.content !== this.opsToolbar) {
                    this.opsToolbar.show($formula);
                    dropdown.show($formula, this.opsToolbar);

                    let sel = window.getSelection();
                    /*let range = sel.getRangeAt(0);
                    let start = range.startOffset;
                    let end = range.endOffset;
                    let text = el.textContent;
                    let before = text.substring(0, start);
                    let after  = text.substring(end, text.length);*/

                    let count = this._startsWithValidOps($formula);

                    /*let textSelected = text.substring(start, end);
                    el.textContent = (before + newText + after);*/
                    sel.setBaseAndExtent($formula[0].firstChild, 0, $formula[0].firstChild, count);
                    $formula[0].focus();
                    //elements.$formula.focus();
                    $opEdit.addClass('is-active');
                }
                event.stopPropagation();
                event.preventDefault();
            });

            $opEdit.on('mousedown', (event) => {
                this._$wasEditingOpsFormula = dropdown.focusedOn() !== null ? this.opsToolbar.focusedOn() : null;
                elements._editorClicked = true;
            });

            $formula.on('editor:closing', () => {
                $opEdit.removeClass('is-active');
                elements.$showEditor.removeClass('is-active');
            });
        }

        $formula.focus(() => {
            keyboardJS.pause();
        });
        $formula.blur((event) => {
            if (this._isRealBlur(elements)) {
                elements._editorClicked = false;
                return;
            }

            keyboardJS.resume();
        });
        $formula.on('keydown', (event) => {
            if (event.keyCode === 13 && event.shiftKey === false) {    //enter
                $formula.blur();
                event.preventDefault();
            }

            if ( event.keyCode === 9) { //tab
                let $formulas = this.$options.find('.formula');
                if ((event.shiftKey === false && $formulas[$formulas.length - 2] === $formula[0]) ||
                    (event.shiftKey === true && $formulas[$formulas.length - 1] === $formula[0])) {
                    this._nextShiftFocus = $($formulas[$formulas.length - 2]);
                    this._nextFocus = $($formulas[$formulas.length - 1]);
                    this.$insert.focus();
                    event.preventDefault();
                }
                else if (event.shiftKey === false && $formulas[$formulas.length - 1] === $formula[0]) {
                        this._nextShiftFocus = $($formulas[$formulas.length - 1]);
                        this._nextFocus = null;
                        this.$insert.focus();
                        event.preventDefault();
                }
            }
        });

        let $formulaMessageBox = $('<div class="formula-message-box  item-' + index + '" style="grid-column-start: ' + (index + 1) + '; grid-row-start: 2;"></div>').appendTo($formulaGrid);
        elements.$formulaMessage = $('<div class="formula-message"></div>').appendTo($formulaMessageBox);

        return elements;
    };

    this._isRealBlur = function(elements) {
        return dropdown.clicked() || elements._editorClicked;
    };

    this._init();
};

module.exports = TransformEditor;
