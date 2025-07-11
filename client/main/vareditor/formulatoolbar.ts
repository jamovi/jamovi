
'use strict';

import $ from 'jquery';
import focusLoop from '../../common/focusloop';

function insertText(el, newText, cursorOffset = 0, range = null, checkEscape = true) {
    
    let sel = window.getSelection();
    let start = 0;
    let end = 0;
    if (el.hasAttribute('sel-start'))
        start = parseInt(el.getAttribute('sel-start'));
    if (el.hasAttribute('sel-end'))
        end = parseInt(el.getAttribute('sel-end'));
    let text = el.textContent;
    let before = text.substring(0, start);
    let after  = text.substring(end, text.length);

    if (cursorOffset === -1 && start !== end) {
        let textSelected = text.substring(start, end);
        el.textContent = (before + newText.substring(0, newText.length - 2) + '(' + textSelected + ')' + after);
        sel.setBaseAndExtent(el.firstChild, start + newText.length + cursorOffset, el.firstChild, start + newText.length + textSelected.length + cursorOffset);
    } else {

        if (checkEscape && cursorOffset !== -1 && newText.search(/[ ~!@#$%^&*\+\-\=()\[\]{};,<>?\/\\]/) !== -1)
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

function allFunctions($functionsContent) {
    let descriptions = { };

    let labelId = focusLoop.getNextAriaElementId('label');
    let $group = $(`<div role="group" aria-labelledby="${labelId}"></div>`);
    $group.append($(`<div id="${labelId}" role="presentation" class="subtitle" data-name="">${_('Math')}</div>`));
    $functionsContent.append($group);
    $group.append($(`<div role="option" aria-selected="true" class="item item-activated" data-name="ABS">ABS</div>`));
    descriptions.ABS = { label: 'ABS( <i>number</i> )', content: _('Returns the absolute value of a number.') };
    $group.append($('<div role="option" aria-selected="false" class="item" data-name="EXP">EXP</div>'));
    descriptions.EXP = { label: 'EXP( <i>number</i> )', content: _('Returns the exponent for basis ℯ of a number.') };
    $group.append($('<div role="option" aria-selected="false" class="item" data-name="LN">LN</div>'));
    descriptions.LN = { label: 'LN( <i>number</i> )', content: _('Returns the natural logarithm of a number.') };
    $group.append($('<div role="option" aria-selected="false" class="item" data-name="LOG10">LOG10</div>'));
    descriptions.LOG10 = { label: 'LOG10( <i>number</i> )', content: _('Returns the base-10 logarithm of a number.') };
    $group.append($('<div role="option" aria-selected="false" class="item" data-name="SQRT">SQRT</div>'));
    descriptions.SQRT = { label: 'SQRT( <i>number</i> )', content: _('Returns the square root of a number.') };

    labelId = focusLoop.getNextAriaElementId('label');
    $group = $(`<div role="group" aria-labelledby="${labelId}"></div>`);
    $group.append($(`<div id="${labelId}" role="presentation" class="subtitle" data-name="">${_('Statistical')}</div>`));
    $functionsContent.append($group);
    $group.append($('<div role="option" aria-selected="false" class="item" data-name="ABSIQR">ABSIQR</div>'));
    descriptions.ABSIQR = { label: 'ABSIQR( <i>variable</i> )', content: _('Convenience short-hand for ABS(IQR( variable ))') };
    $group.append($('<div role="option" aria-selected="false" class="item" data-name="ABSZ">ABSZ</div>'));
    descriptions.ABSZ = { label: 'ABSZ( <i>variable</i>, group_by=0 )', content: _('Convenience short-hand for ABS(Z( variable ))') };
    $group.append($('<div role="option" aria-selected="false" class="item" data-name="BOXCOX">BOXCOX</div>'));
    descriptions.BOXCOX = { label: 'BOXCOX( <i>variable, lambda</i> )', content: _('Returns a Box Cox transformation of the variable.') };
    $group.append($('<div role="option" aria-selected="false" role="option" aria-selected="false" class="item" data-name="IQR">IQR</div>'));
    descriptions.IQR = { label: 'IQR( <i>variable</i> )', content: _('Returns a whether the variable is an outlier according to the IQR: If the value is within the box of a Boxplot 0 is returned, absolute values larger than 1.5 are outside the whiskers.') };
    $group.append($('<div role="option" aria-selected="false" class="item" data-name="MAX">MAX</div>'));
    descriptions.MAX = { label: 'MAX( <i>variable</i> )', content: _('Returns the largest value of a set of numbers.') };
    $group.append($('<div role="option" aria-selected="false" class="item" data-name="MAXABSIQR">MAXABSIQR</div>'));
    descriptions.MAXABSIQR = { label: 'MAXABSIQR( variable 1, variable 2, … )', content: _('Convenience short-hand for MAX(ABSIQR( variable 1, variable 2, … ))') };
    $group.append($('<div role="option" aria-selected="false" class="item" data-name="MAXABSZ">MAXABSZ</div>'));
    descriptions.MAXABSZ = { label: 'MAXABSZ( variable 1, variable 2, …, group_by=0 )', content: _('Convenience short-hand for MAX(ABSZ( variable 1, variable 2, … ))') };
    $group.append($('<div role="option" aria-selected="false" class="item" data-name="MEAN">MEAN</div>'));
    descriptions.MEAN = { label: 'MEAN( <i>number 1, number 2, …</i>, ignore_missing=0, min_valid=0 )', content: _('Returns the mean of a set of numbers.') };
    $group.append($('<div role="option" aria-selected="false" class="item" data-name="MIN">MIN</div>'));
    descriptions.MIN = { label: 'MIN( <i>variable</i> )', content: _('Returns the smallest value of a set of numbers.') };
    $group.append($('<div role="option" aria-selected="false" class="item" data-name="RANK">RANK</div>'));
    descriptions.RANK = { label: 'RANK( <i>variable</i> )', content: _('Ranks each value') };
    $group.append($('<div role="option" aria-selected="false" class="item" data-name="ROUND">ROUND</div>'));
    descriptions.ROUND = { label: 'ROUND( <i>variable</i>, digits=0 )', content: _('Rounds each value') };
    $group.append($('<div role="option" aria-selected="false" class="item" data-name="FLOOR">FLOOR</div>'));
    descriptions.FLOOR = { label: 'FLOOR( <i>variable</i> )', content: _('Rounds each value to the integer below') };
    $group.append($('<div role="option" aria-selected="false" class="item" data-name="CEILING">CEILING</div>'));
    descriptions.CEILING = { label: 'CEILING( <i>variable</i> )', content: _('Rounds each value to the integer above') };
    $group.append($('<div role="option" aria-selected="false" class="item" data-name="SCALE">SCALE</div>'));
    descriptions.SCALE = { label: 'SCALE( <i>variable</i>, group_by=0 )', content: _('Returns the normalized values of a set of numbers.') };
    $group.append($('<div role="option" aria-selected="false" class="item" data-name="STDEV">STDEV</div>'));
    descriptions.STDEV = { label: 'STDEV( <i>number 1, number 2, …</i>, ignore_missing=0 )', content: _('Returns the standard deviation of a set of numbers.') };
    $group.append($('<div role="option" aria-selected="false" class="item" data-name="SUM">SUM</div>'));
    descriptions.SUM = { label: 'SUM( <i>number 1, number 2, …</i>, ignore_missing=0, min_valid=0 )', content: _('Returns the sum of a set of numbers.') };
    $group.append($('<div role="option" aria-selected="false" class="item" data-name="VMAD">VMAD</div>'));
    descriptions.VMAD = { label: 'VMAD( <i>variable</i>, group_by=0 )', content: _('Returns the median absolute deviation of a variable.') };
    $group.append($('<div role="option" aria-selected="false" class="item" data-name="VMADR">VMADR</div>'));
    descriptions.VMADR = { label: 'VMADR( <i>variable</i>, group_by=0 )', content: _('Returns the robust median absolute deviation of a variable.') };
    $group.append($('<div role="option" aria-selected="false" class="item" data-name="VMAX">VMAX</div>'));
    descriptions.VMAX = { label: 'VMAX( <i>variable</i>, group_by=0 )', content: _('Returns the largest value of a variable.') };
    $group.append($('<div role="option" aria-selected="false" class="item" data-name="VMEAN">VMEAN</div>'));
    descriptions.VMEAN = { label: 'VMEAN( <i>variable</i>, group_by=0 )', content: _('Returns the overall mean of a variable.') };
    $group.append($('<div role="option" aria-selected="false" class="item" data-name="VMED">VMED</div>'));
    descriptions.VMED = { label: 'VMED( <i>variable</i>, group_by=0 )', content: _('Returns the median of a variable.') };
    $group.append($('<div role="option" aria-selected="false" class="item" data-name="VMIN">VMIN</div>'));
    descriptions.VMIN = { label: 'VMIN( <i>variable</i>, group_by=0 )', content: _('Returns the smallest value of a variable.') };
    $group.append($('<div role="option" aria-selected="false" class="item" data-name="VMODE">VMODE</div>'));
    descriptions.VMODE = { label: 'VMODE( <i>variable</i>, group_by=0 )', content: _('Returns the most common value in a variable.') };
    $group.append($('<div role="option" aria-selected="false" class="item" data-name="VN">VN</div>'));
    descriptions.VN = { label: 'VN( <i>variable</i>, group_by=0 )', content: _('Returns the number of cases in a variable.') };
    $group.append($('<div role="option" aria-selected="false" class="item" data-name="VSE">VSE</div>'));
    descriptions.VSE = { label: 'VSE( <i>variable</i>, group_by=0 )', content: _('Returns the standard error of the mean of a variable.') };
    $group.append($('<div role="option" aria-selected="false" class="item" data-name="VSTDEV">VSTDEV</div>'));
    descriptions.VSTDEV = { label: 'VSTDEV( <i>variable</i>, group_by=0 )', content: _('Returns the standard deviation of a variable.') };
    $group.append($('<div role="option" aria-selected="false" class="item" data-name="VSUM">VSUM</div>'));
    descriptions.VSUM = { label: 'VSUM( <i>variable</i>, group_by=0 )', content: _('Returns the overall sum of a variable.') };
    $group.append($('<div role="option" aria-selected="false" class="item" data-name="VAR">VAR</div>'));
    descriptions.VAR = { label: 'VAR( <i>number 1, number 2, …</i>, ignore_missing=0 )', content: _('Returns the variance of a set of numbers.') };
    $group.append($('<div role="option" aria-selected="false" class="item" data-name="VVAR">VVAR</div>'));
    descriptions.VVAR = { label: 'VVAR( <i>variable</i>, group_by=0 )', content: _('Returns the variance of a variable.') };
    $group.append($('<div role="option" aria-selected="false" class="item" data-name="Z">Z</div>'));
    descriptions.Z = { label: 'Z( <i>variable</i>, group_by=0 )', content: _('Returns the normalized values of a set of numbers.') };

    labelId = focusLoop.getNextAriaElementId('label');
    $group = $(`<div role="group" aria-labelledby="${labelId}"></div>`);
    $group.append($(`<div id="${labelId}" role="presentation" class="subtitle" data-name="">${_('Logical')}</div>`));
    $functionsContent.append($group);
    $group.append($('<div role="option" aria-selected="false" class="item" data-name="IF">IF</div>'));
    descriptions.IF = { label: 'IF( <i>expression, value, else</i> )', content: _('If the expression resolves true, use the value, otherwise the else.') };
    $group.append($('<div role="option" aria-selected="false" class="item" data-name="IFMISS">IFMISS</div>'));
    descriptions.IFMISS = { label: 'IFMISS( <i>variable, value, else</i> )', content: _('When the variable contains a missing value, use the value, otherwise the else.') };
    $group.append($('<div role="option" aria-selected="false" class="item" data-name="NOT">NOT</div>'));
    descriptions.NOT = { label: 'NOT( <i>value</i> )', content: _('Inverts the value.') };

    labelId = focusLoop.getNextAriaElementId('label');
    $group = $(`<div role="group" aria-labelledby="${labelId}"></div>`);
    $group.append($(`<div id="${labelId}" role="presentation" class="subtitle" data-name="">${_('Text')}</div>`));
    $functionsContent.append($group);
    $group.append($('<div role="option" aria-selected="false" class="item" data-name="CONTAINS">CONTAINS</div>'));
    descriptions.CONTAINS = { label: 'CONTAINS( <i>item1, item2, item3, ..., in1, in2, in3, ...</i> )', content: _('Determines if any of the items appear in in1, in2, in3, .... Note that most of these arguments are optional -- it is possible to simply use __CONTAINS(needle, haystack)__.') };
    $group.append($('<div role="option" aria-selected="false" class="item" data-name="SPLIT">SPLIT</div>'));
    descriptions.SPLIT = { label: 'SPLIT( <i>variable</i>, sep=\',\', piece )', content: _('Splits text into pieces based on a separator. _piece_ specifies the desired piece by index.') };
    $group.append($('<div role="option" aria-selected="false" class="item" data-name="TEXT">TEXT</div>'));
    descriptions.TEXT = { label: 'TEXT( <i>number</i> )', content: _('Converts the value to text.') };
    $group.append($('<div role="option" aria-selected="false" class="item" data-name="VALUE">VALUE</div>'));
    descriptions.VALUE = { label: 'VALUE( <i>text</i> )', content: _('Converts text to a number (if possible).') };

    labelId = focusLoop.getNextAriaElementId('label');
    $group = $(`<div role="group" aria-labelledby="${labelId}"></div>`);
    $group.append($(`<div id="${labelId}" role="presentation" class="subtitle" data-name="">${_('Date / Time')}</div>`));
    $functionsContent.append($group);
    $group.append($('<div role="option" aria-selected="false" class="item" data-name="DATEVALUE">DATEVALUE</div>'));
    descriptions.DATEVALUE = { label: 'DATEVALUE( <i>value, format=\'%Y-%m-%d\'</i> )', content: _('Parses a date, and converts it to the number of days since the 1st of January, 1970.') };
    $group.append($('<div role="option" aria-selected="false" class="item" data-name="DATE">DATE</div>'));
    descriptions.DATE = { label: 'DATE( <i>value, format=\'%Y-%m-%d\'</i> )', content: _('Takes a number representing the number of days since the 1st of January 1970, and produces a formatted date.') };

    labelId = focusLoop.getNextAriaElementId('label');
    $group = $(`<div role="group" aria-labelledby="${labelId}"></div>`);
    $group.append($(`<div id="${labelId}" role="presentation" class="subtitle" data-name="">${_('Reference')}</div>`));
    $functionsContent.append($group);
    $group.append($('<div role="option" aria-selected="false" class="item" data-name="HLOOKUP">HLOOKUP</div>'));
    descriptions.HLOOKUP = { label: 'HLOOKUP( <i>index, value 1, value 2, ..., ignore_missing=0</i> )', content: _('The value in the provided values at index.') };
    $group.append($('<div role="option" aria-selected="false" class="item" data-name="MATCH">MATCH</div>'));
    descriptions.MATCH = { label: 'MATCH( <i>value, value 1, value 2, ...</i> )', content: _('The index of value in the provided values.') };

    labelId = focusLoop.getNextAriaElementId('label');
    $group = $(`<div role="group" aria-labelledby="${labelId}"></div>`);
    $group.append($(`<div id="${labelId}" role="presentation" class="subtitle" data-name="">${_('Misc')}</div>`));
    $functionsContent.append($group);
    $group.append($('<div role="option" aria-selected="false" class="item" data-name="COUNT">COUNT</div>'));
    descriptions.COUNT = { label: 'COUNT( <i>value 1, value 2, ...</i> )', content: _('Counts the number of non-missing values') };
    $group.append($('<div role="option" aria-selected="false" class="item" data-name="FILTER">FILTER</div>'));
    descriptions.FILTER = { label: 'FILTER( <i>variable, filter expression</i> )', content: _('Filters a variable using the filter expression.') };
    $group.append($('<div role="option" aria-selected="false" class="item" data-name="INT">INT</div>'));
    descriptions.INT = { label: 'INT( <i>number</i> )', content: _('Converts a number to an integer.') };
    $group.append($('<div role="option" aria-selected="false" class="item" data-name="OFFSET">OFFSET</div>'));
    descriptions.OFFSET = { label: 'OFFSET( <i>variable, integer</i> )', content: _('Offsets the values up or down.') };
    $group.append($('<div role="option" aria-selected="false" class="item" data-name="ROW">ROW</div>'));
    descriptions.ROW = { label: 'ROW( <i>NO ARGUMENTS</i> )', content: _('Returns the row numbers.') };
    $group.append($('<div role="option" aria-selected="false" class="item" data-name="SAMPLE">SAMPLE</div>'));
    descriptions.SAMPLE = { label: 'SAMPLE( <i>variable, n, otherwise=NA</i> )', content: _('Draws a sample of n from the variable. i.e. SAMPLE(var, 20), i.e. SAMPLE(1, 20), i.e. SAMPLE(\'training\', 20, \'test\')') };
    $group.append($('<div role="option" aria-selected="false" class="item" data-name="VROWS">VROWS</div>'));
    descriptions.VROWS = { label: 'VROWS( <i>variable</i>, group_by=0 )', content: _('Returns the number of rows of a variable.') };

    labelId = focusLoop.getNextAriaElementId('label');
    $group = $(`<div role="group" aria-labelledby="${labelId}"></div>`);
    $group.append($(`<div id="${labelId}" role="presentation" class="subtitle" data-name="">${_('Simulation')}</div>`));
    $functionsContent.append($group);
    $group.append($('<div role="option" aria-selected="false" class="item" data-name="BETA">BETA</div>'));
    descriptions.BETA = { label: 'BETA( <i>alpha, beta</i> )', content: _('Draws samples from a Beta distribution.') };
    $group.append($('<div role="option" aria-selected="false" class="item" data-name="GAMMA">GAMMA</div>'));
    descriptions.GAMMA = { label: 'GAMMA( <i>shape, scale</i> )', content: _('Draws samples from a Gamma distribution.') };
    $group.append($('<div role="option" aria-selected="false" class="item" data-name="NORM">NORM</div>'));
    descriptions.NORM = { label: 'NORM( <i>mean, sd</i> )', content: _('Draws samples from a normal (Gaussian) distribution.') };
    $group.append($('<div role="option" aria-selected="false" class="item" data-name="UNIF">UNIF</div>'));
    descriptions.UNIF = { label: 'UNIF( <i>low, high</i> )', content: _('Draws samples from a uniform distribution.') };

    return descriptions;
}

const toolbar = function(dataset) {
    this.dataset = dataset;

    this.isScrollTarget = function(target) {
        return target === this.$functionsContent[0] || target === this.$varsContent[0];
    };

    this.id = focusLoop.getNextAriaElementId('tool');

    this.$options = $(`<div id="${this.id}" class="jmv-formula-toolbar-options"></div>`);//.appendTo(this.$el);
    this.$el = this.$options;



    this.$ops = $(`<div role="presentation" class="ops-box"></div>`).appendTo(this.$options);
    this.$label = $('<div aria-live="polite" class="option-label">This is a label!</div>').appendTo(this.$options);
    this.$description = $('<div aria-live="polite" class="option-description">This is the place where the option description will go!</div>').appendTo(this.$options);

    this.$functions = $(`<div role="presentation" class="op"></div>`).appendTo(this.$ops);
    let labelId = focusLoop.getNextAriaElementId('label');
    this.$functionsTitle = $(`<div id="${labelId}" class="title">${_('Functions')}</div>`).appendTo(this.$functions);
    this.$functionsContent = $(`<div role="listbox"  tabindex="0" aria-labelledby="${labelId}" class="content"></div>`).appendTo(this.$functions);

    this.descriptions = allFunctions(this.$functionsContent);

    this.lastRange = null;

    let info = this.descriptions.ABS;
    if (info !== undefined) {
        this.$description.html(info.content);
        this.$label.html(info.label); // this html insertion is not a problem as the label is generated above.
    }

    this.$functionsContent.on("dblclick", (event) => {
        if ($(event.target).hasClass('item')) {
            //this.$formula.focus();
            setTimeout(() => {
                insertText(this.$formula[0], event.target.dataset.name + "()", -1, this.lastRange);
                this.$formula.trigger('input', { });
            }, 0);
        }
    });

    this.$functionsContent.on('focus', (event) => {
        this.displayFunctionInfo();
    });

    this.$functionsContent.on('keydown', (event) => {
        this.onkeydown(event, this.insertFunction);
        this.displayFunctionInfo();
    });

    this.displayFunctionInfo = function() {
        let $selectedItem = this.$functionsContent.find(".item[aria-selected=true]");
        let info = this.descriptions[$selectedItem.data('name')];
        if (info !== undefined) {
            this.$label.html(info.label); // this html insertion is not a problem as the label is generated above.
            this.$description.html(info.content);
        }
        else {
            this.$label.text('');
            this.$description.text(_('No information about this function is available'));
        }
    }

    this.insertFunction = function(value) {
        insertText(this.$formula[0], value + "()", -1, this.lastRange);
        this.$formula.trigger('input', { });
    }

    this.onkeydown = function(event, insertCallback) {
        let list = $(event.delegateTarget).find('.item');
        if (event.keyCode === 40) { //down key
            let $selectedItem = $(event.delegateTarget).find(".item[aria-selected=true]");
            let index = list.index($selectedItem[0]);
            if (index === -1 || index === list.length - 1)
                index = 0;
            else
                index += 1;

            let next = list[index];
            this.selectItem($(event.delegateTarget), $(next));

            event.preventDefault();
            event.stopPropagation();
        }
        else if (event.keyCode === 38) { //up key
            let $selectedItem = $(event.delegateTarget).find(".item[aria-selected=true]");
            let index = list.index($selectedItem[0]);
            if (index === -1 || index === 0)
                index = list.length - 1;
            else
                index -= 1;

            let next = list[index];
            this.selectItem($(event.delegateTarget), $(next));

            event.preventDefault();
            event.stopPropagation();
        }
        else if (event.keyCode == 13 || event.keyCode == 32) {
            //this.$formula.focus();
            let $selectedItem = $(event.delegateTarget).find(".item[aria-selected=true]");
            if ($selectedItem) {
                setTimeout(() => {
                    insertCallback.call(this, $selectedItem[0].dataset.name);
                }, 0);
                event.preventDefault();
            }
        }
    }

    this.selectItem = function($list, $target) {
        $list.find(".item").removeClass("item-activated");
        $list.find(".item[aria-selected=true]").attr('aria-selected', 'false');
        if ($target.hasClass("item")) {
            $target.addClass("item-activated");
            $target.attr('aria-selected', 'true');
            $target[0].scrollIntoView({ behavior: "smooth", block: "center" });
        }
        else {
            this.$description.text('');
            this.$label.text('');
        }
    }

    this.$functionsContent.on("click", (event) => {
        this.$functionsContent.find(".item").removeClass("item-activated");
        this.$functionsContent.find(".item[aria-selected=true]").attr('aria-selected', 'false');
        if ($(event.target).hasClass("item")) {
            $(event.target).addClass("item-activated");
            $(event.target).attr('aria-selected', 'true');
            this.displayFunctionInfo();
        }
        else {
            this.$description.text('');
            this.$label.text('');
        }
    });

    this.$vars = $('<div class="op"></div>').appendTo(this.$ops);
    labelId = focusLoop.getNextAriaElementId('label');
    this.$varsTitle = $(`<div id="${labelId}" class="title">${_('Variables')}</div>`).appendTo(this.$vars);
    this.$varsContent = $(`<div role="listbox" tabindex="0" aria-labelledby="${labelId}" class="content"></div>`).appendTo(this.$vars);

    this.insertvar = function(value) {
        insertText(this.$formula[0], value, 0, this.lastRange, value !== '$source');
        this.$formula.trigger('input', { });
    }

    this.$varsContent.on("dblclick", (event) => {
        if (event.target.dataset.name !== 'current' && $(event.target).hasClass('item')) {
            //this.$formula.focus();
            setTimeout(() => {
                let value = event.target.dataset.name;
                insertText(this.$formula[0], value, 0, this.lastRange, value !== '$source');
                this.$formula.trigger('input', { });
            }, 0);
        }
    });

    this.$varsContent.on('focus', (event) => {
        this.displayVariableInfo();
    });

    this.displayVariableInfo = function() {
        let $selectedItem = this.$varsContent.find(".item[aria-selected=true]");
        let value = $selectedItem.text();
        if (value === '$source') {
            this.$description.text(_('The current value of the variable to which this transform is applied.'));
            this.$label.text(_('Keyword: {v}', {v: value }));
        }
        else {
            this.$description.text(_('This is a data variable.'));
            this.$label.text(_('Variable: {v}', {v: value}));
        }
    }

    this.$varsContent.on("click", (event) => {
        this.$varsContent.find(".item").removeClass("item-activated");
        $(event.target).addClass("item-activated");
        this.$varsContent.find(".item[aria-selected=true]").attr('aria-selected', 'false');
        $(event.target).attr('aria-selected', 'true');
        this.displayVariableInfo();
    });

    this.$varsContent.on('keydown', (event) => {
        this.onkeydown(event, this.insertvar);
        this.displayVariableInfo();
    });

    this.show = function($formula, variableName, useValue) {

        this.$formula = $formula;

        this.$varsContent.empty();
        if (useValue)
            this.$varsContent.append($('<div role="option" class="item" data-name="$source">$source</div>'));
        for (let col of this.dataset.get("columns")) {
            if (col.name !== '' && col.columnType !== 'filter') {
                if (col.name === variableName)
                    this.$varsContent.append($(`<div role="option" aria-disabled="true" class="item item-grayed-out" data-name="current">${col.name} ${_('(current)')}</div>`));
                else
                    this.$varsContent.append($('<div role="option" class="item" data-name="' + col.name + '">' + col.name + '</div>'));
            }
        }
    };

    this.focusedOn = function() {
        return this.$formula;
    };
};



export default toolbar;
