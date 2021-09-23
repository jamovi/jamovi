
'use strict';

const $ = require('jquery');

function insertText(el, newText, cursorOffset = 0, checkEscape = true) {

    let sel = window.getSelection();
    let range = sel.getRangeAt(0);
    let start = range.startOffset;
    let end = range.endOffset;
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

    $functionsContent.append($(`<div class="subtitle" data-name="">${_('Math')}</div>`));
    $functionsContent.append($(`<div class="item item-activated" data-name="ABS">ABS</div>`));
    descriptions.ABS = { label: 'ABS( <i>number</i> )', content: _('Returns the absolute value of a number.') };
    $functionsContent.append($('<div class="item" data-name="EXP">EXP</div>'));
    descriptions.EXP = { label: 'EXP( <i>number</i> )', content: _('Returns the exponent for basis \u212F of a number.') };
    $functionsContent.append($('<div class="item" data-name="LN">LN</div>'));
    descriptions.LN = { label: 'LN( <i>number</i> )', content: _('Returns the natural logarithm of a number.') };
    $functionsContent.append($('<div class="item" data-name="LOG10">LOG10</div>'));
    descriptions.LOG10 = { label: 'LOG10( <i>number</i> )', content: _('Returns the base-10 logarithm of a number.') };
    $functionsContent.append($('<div class="item" data-name="SQRT">SQRT</div>'));
    descriptions.SQRT = { label: 'SQRT( <i>number</i> )', content: _('Returns the square root of a number.') };

    $functionsContent.append($(`<div class="subtitle" data-name="">${_('Statistical')}</div>`));
    $functionsContent.append($('<div class="item" data-name="ABSIQR">ABSIQR</div>'));
    descriptions.ABSIQR = { label: 'ABSIQR( <i>variable</i> )', content: _('Convenience short-hand for ABS(IQR( variable ))') };
    $functionsContent.append($('<div class="item" data-name="ABSZ">ABSZ</div>'));
    descriptions.ABSZ = { label: 'ABSZ( <i>variable</i>, group_by=0 )', content: _('Convenience short-hand for ABS(Z( variable ))') };
    $functionsContent.append($('<div class="item" data-name="BOXCOX">BOXCOX</div>'));
    descriptions.BOXCOX = { label: 'BOXCOX( <i>variable, lambda</i> )', content: _('Returns a Box Cox transformation of the variable.') };
    $functionsContent.append($('<div class="item" data-name="IQR">IQR</div>'));
    descriptions.IQR = { label: 'IQR( <i>variable</i> )', content: _('Returns a whether the variable is an outlier according to the IQR: If the value is within the box of a Boxplot 0 is returned, absolute values larger than 1.5 are outside the whiskers.') };
    $functionsContent.append($('<div class="item" data-name="MAX">MAX</div>'));
    descriptions.MAX = { label: 'MAX( <i>variable</i> )', content: _('Returns the largest value of a set of numbers.') };
    $functionsContent.append($('<div class="item" data-name="MAXABSIQR">MAXABSIQR</div>'));
    descriptions.MAXABSIQR = { label: 'MAXABSIQR( variable 1, variable 2, \u2026 )', content: _('Convenience short-hand for MAX(ABSIQR( variable 1, variable 2, \u2026 ))') };
    $functionsContent.append($('<div class="item" data-name="MAXABSZ">MAXABSZ</div>'));
    descriptions.MAXABSZ = { label: 'MAXABSZ( variable 1, variable 2, \u2026, group_by=0 )', content: _('Convenience short-hand for MAX(ABSZ( variable 1, variable 2, \u2026 ))') };
    $functionsContent.append($('<div class="item" data-name="MEAN">MEAN</div>'));
    descriptions.MEAN = { label: 'MEAN( <i>number 1, number 2, \u2026</i>, ignore_missing=0, min_valid=0 )', content: _('Returns the mean of a set of numbers.') };
    $functionsContent.append($('<div class="item" data-name="MIN">MIN</div>'));
    descriptions.MIN = { label: 'MIN( <i>variable</i> )', content: _('Returns the smallest value of a set of numbers.') };
    $functionsContent.append($('<div class="item" data-name="RANK">RANK</div>'));
    descriptions.RANK = { label: 'RANK( <i>variable</i> )', content: _('Ranks each value') };
    $functionsContent.append($('<div class="item" data-name="ROUND">ROUND</div>'));
    descriptions.ROUND = { label: 'ROUND( <i>variable</i>, digits=0 )', content: _('Rounds each value') };
    $functionsContent.append($('<div class="item" data-name="SCALE">SCALE</div>'));
    descriptions.SCALE = { label: 'SCALE( <i>variable</i>, group_by=0 )', content: _('Returns the normalized values of a set of numbers.') };
    $functionsContent.append($('<div class="item" data-name="STDEV">STDEV</div>'));
    descriptions.STDEV = { label: 'STDEV( <i>number 1, number 2, \u2026</i>, ignore_missing=0 )', content: _('Returns the standard deviation of a set of numbers.') };
    $functionsContent.append($('<div class="item" data-name="SUM">SUM</div>'));
    descriptions.SUM = { label: 'SUM( <i>number 1, number 2, \u2026</i>, ignore_missing=0, min_valid=0 )', content: _('Returns the sum of a set of numbers.') };
    $functionsContent.append($('<div class="item" data-name="VMAX">VMAX</div>'));
    descriptions.VMAX = { label: 'VMAX( <i>variable</i>, group_by=0 )', content: _('Returns the largest value of a variable.') };
    $functionsContent.append($('<div class="item" data-name="VMEAN">VMEAN</div>'));
    descriptions.VMEAN = { label: 'VMEAN( <i>variable</i>, group_by=0 )', content: _('Returns the overall mean of a variable.') };
    $functionsContent.append($('<div class="item" data-name="VMED">VMED</div>'));
    descriptions.VMED = { label: 'VMED( <i>variable</i>, group_by=0 )', content: _('Returns the median of a variable.') };
    $functionsContent.append($('<div class="item" data-name="VMIN">VMIN</div>'));
    descriptions.VMIN = { label: 'VMIN( <i>variable</i>, group_by=0 )', content: _('Returns the smallest value of a variable.') };
    $functionsContent.append($('<div class="item" data-name="VMODE">VMODE</div>'));
    descriptions.VMODE = { label: 'VMODE( <i>variable</i>, group_by=0 )', content: _('Returns the most common value in a variable.') };
    $functionsContent.append($('<div class="item" data-name="VN">VN</div>'));
    descriptions.VN = { label: 'VN( <i>variable</i>, group_by=0 )', content: _('Returns the number of cases in a variable.') };
    $functionsContent.append($('<div class="item" data-name="VSE">VSE</div>'));
    descriptions.VSE = { label: 'VSE( <i>variable</i>, group_by=0 )', content: _('Returns the standard error of the mean of a variable.') };
    $functionsContent.append($('<div class="item" data-name="VSTDEV">VSTDEV</div>'));
    descriptions.VSTDEV = { label: 'VSTDEV( <i>variable</i>, group_by=0 )', content: _('Returns the standard deviation of a variable.') };
    $functionsContent.append($('<div class="item" data-name="VSUM">VSUM</div>'));
    descriptions.VSUM = { label: 'VSUM( <i>variable</i>, group_by=0 )', content: _('Returns the overall sum of a variable.') };
    $functionsContent.append($('<div class="item" data-name="VAR">VAR</div>'));
    descriptions.VAR = { label: 'VAR( <i>number 1, number 2, \u2026</i>, ignore_missing=0 )', content: _('Returns the variance of a set of numbers.') };
    $functionsContent.append($('<div class="item" data-name="VVAR">VVAR</div>'));
    descriptions.VVAR = { label: 'VVAR( <i>variable</i>, group_by=0 )', content: _('Returns the variance of a variable.') };
    $functionsContent.append($('<div class="item" data-name="Z">Z</div>'));
    descriptions.Z = { label: 'Z( <i>variable</i>, group_by=0 )', content: _('Returns the normalized values of a set of numbers.') };

    $functionsContent.append($(`<div class="subtitle" data-name="">${_('Logical')}</div>`));
    $functionsContent.append($('<div class="item" data-name="IF">IF</div>'));
    descriptions.IF = { label: 'IF( <i>expression, value, else</i> )', content: _('If the expression resolves true, use the value, otherwise the else.') };
    $functionsContent.append($('<div class="item" data-name="IFMISS">IFMISS</div>'));
    descriptions.IFMISS = { label: 'IFMISS( <i>variable, value, else</i> )', content: _('When the variable contains a missing value, use the value, otherwise the else.') };
    $functionsContent.append($('<div class="item" data-name="NOT">NOT</div>'));
    descriptions.NOT = { label: 'NOT( <i>value</i> )', content: _('Inverts the value.') };

    $functionsContent.append($(`<div class="subtitle" data-name="">${_('Text')}</div>`));
    $functionsContent.append($('<div class="item" data-name="CONTAINS">CONTAINS</div>'));
    descriptions.CONTAINS = { label: 'CONTAINS( <i>item1, item2, item3, ..., in1, in2, in3, ...</i> )', content: _('Determines if any of the items appear in in1, in2, in3, .... Note that most of these arguments are optional -- it is possible to simply use <strong>CONTAINS(needle, haystack)</strong>.') };
    $functionsContent.append($('<div class="item" data-name="SPLIT">SPLIT</div>'));
    descriptions.SPLIT = { label: 'SPLIT( <i>variable</i>, sep=\',\', piece )', content: _('Splits text into pieces based on a separator. <i>piece</i> specifies the desired piece by index.') };
    $functionsContent.append($('<div class="item" data-name="TEXT">TEXT</div>'));
    descriptions.TEXT = { label: 'TEXT( <i>number</i> )', content: _('Converts the value to text.') };
    $functionsContent.append($('<div class="item" data-name="VALUE">VALUE</div>'));
    descriptions.VALUE = { label: 'VALUE( <i>text</i> )', content: _('Converts text to a number (if possible).') };

    $functionsContent.append($(`<div class="subtitle" data-name="">${_('Reference')}</div>`));
    $functionsContent.append($('<div class="item" data-name="HLOOKUP">HLOOKUP</div>'));
    descriptions.HLOOKUP = { label: 'HLOOKUP( <i>index, value 1, value 2, ...</i> )', content: _('The value in the provided values at index.') };
    $functionsContent.append($('<div class="item" data-name="MATCH">MATCH</div>'));
    descriptions.MATCH = { label: 'MATCH( <i>value, value 1, value 2, ...</i> )', content: _('The index of value in the provided values.') };

    $functionsContent.append($(`<div class="subtitle" data-name="">${_('Misc')}</div>`));
    $functionsContent.append($('<div class="item" data-name="FILTER">FILTER</div>'));
    descriptions.FILTER = { label: 'FILTER( <i>variable, filter expression</i> )', content: _('Filters a variable using the filter expression.') };
    $functionsContent.append($('<div class="item" data-name="INT">INT</div>'));
    descriptions.INT = { label: 'INT( <i>number</i> )', content: _('Converts a number to an integer.') };
    $functionsContent.append($('<div class="item" data-name="OFFSET">OFFSET</div>'));
    descriptions.OFFSET = { label: 'OFFSET( <i>variable, integer</i> )', content: _('Offsets the values up or down.') };
    $functionsContent.append($('<div class="item" data-name="ROW">ROW</div>'));
    descriptions.ROW = { label: 'ROW( <i>NO ARGUMENTS</i> )', content: _('Returns the row numbers.') };
    $functionsContent.append($('<div class="item" data-name="SAMPLE">SAMPLE</div>'));
    descriptions.SAMPLE = { label: 'SAMPLE( <i>variable, n, otherwise=NA</i> )', content: _('Draws a sample of n from the variable. i.e. SAMPLE(var, 20), i.e. SAMPLE(1, 20), i.e. SAMPLE(\'training\', 20, \'test\')') };
    $functionsContent.append($('<div class="item" data-name="VROWS">VROWS</div>'));
    descriptions.VROWS = { label: 'VROWS( <i>variable</i>, group_by=0 )', content: _('Returns the number of rows of a variable.') };

    $functionsContent.append($(`<div class="subtitle" data-name="">${_('Simulation')}</div>`));
    $functionsContent.append($('<div class="item" data-name="BETA">BETA</div>'));
    descriptions.BETA = { label: 'BETA( <i>alpha, beta</i> )', content: _('Draws samples from a Beta distribution.') };
    $functionsContent.append($('<div class="item" data-name="GAMMA">GAMMA</div>'));
    descriptions.GAMMA = { label: 'GAMMA( <i>shape, scale</i> )', content: _('Draws samples from a Gamma distribution.') };
    $functionsContent.append($('<div class="item" data-name="NORM">NORM</div>'));
    descriptions.NORM = { label: 'NORM( <i>mean, sd</i> )', content: _('Draws samples from a normal (Gaussian) distribution.') };
    $functionsContent.append($('<div class="item" data-name="UNIF">UNIF</div>'));
    descriptions.UNIF = { label: 'UNIF( <i>low, high</i> )', content: _('Draws samples from a uniform distribution.') };

    return descriptions;
}

const toolbar = function(dataset) {
    this.dataset = dataset;

    this.isScrollTarget = function(target) {
        return target === this.$functionsContent[0] || target === this.$varsContent[0];
    };

    this.$options = $('<div class="jmv-formula-toolbar-options"></div>');//.appendTo(this.$el);
    this.$el = this.$options;

    this.$ops = $('<div class="ops-box"></div>').appendTo(this.$options);
    this.$label = $('<div class="option-label">This is a label!</div>').appendTo(this.$options);
    this.$description = $('<div class="option-description">This is the place where the option description will go!</div>').appendTo(this.$options);

    this.$functions = $('<div class="op"></div>').appendTo(this.$ops);
    this.$functionsTitle = $(`<div class="title">${_('Functions')}</div>`).appendTo(this.$functions);
    this.$functionsContent = $('<div class="content"></div>').appendTo(this.$functions);

    this.descriptions = allFunctions(this.$functionsContent);

    let info = this.descriptions.ABS;
    if (info !== undefined) {
        this.$label.html(info.label);
        this.$description.html(info.content);
    }

    this.$functionsContent.on("dblclick", (event) => {
        if ($(event.target).hasClass('item')) {
            insertText(this.$formula[0], event.target.dataset.name + "()", -1);
            this.$formula.trigger('input', { });
        }
    });

    this.$functionsContent.on("click", (event) => {
        this.$formula.focus();
        $(".content .item").removeClass("item-activated");
        if ($(event.target).hasClass("item")) {
            $(event.target).addClass("item-activated");
            let info = this.descriptions[$(event.target).data('name')];
            if (info !== undefined) {
                this.$label.html(info.label);
                this.$description.html(info.content);
            }
            else {
                this.$label.html('');
                this.$description.html(_('No information about this function is avaliable'));
            }
        }
        else {
            this.$label.html('');
            this.$description.html('');
        }
    });

    this.$vars = $('<div class="op"></div>').appendTo(this.$ops);
    this.$varsTitle = $(`<div class="title">${_('Variables')}</div>`).appendTo(this.$vars);
    this.$varsContent = $('<div class="content"></div>').appendTo(this.$vars);

    this.$varsContent.on("dblclick", (event) => {
        if (event.target.dataset.name !== 'current' && $(event.target).hasClass('item')) {
            let value = event.target.dataset.name;
            insertText(this.$formula[0], value, 0, value !== '$source');
            this.$formula.trigger('input', { });
        }
    });

    this.$varsContent.on("click", (event) => {
        this.$formula.focus();
        $(".content .item").removeClass("item-activated");
        $(event.target).addClass("item-activated");
        let value = $(event.target).text();
        if (value === '$source') {
            this.$label.html(_('Keyword: {v}', {v: value }));
            this.$description.html(_('The current value of the variable to which this transform is applied.'));
        }
        else {
            this.$label.html(_('Variable: {v}', {v: value}));
            this.$description.html(_('This is a data variable.'));
        }
    });

    this.$el.on('click', (event) => {
        if (this.$formula)
            this.$formula.focus();
    });

    this.show = function($formula, variableName, useValue) {

        this.$formula = $formula;

        this.$varsContent.empty();
        if (useValue)
            this.$varsContent.append($('<div class="item" data-name="$source">$source</div>'));
        for (let col of this.dataset.get("columns")) {
            if (col.name !== '' && col.columnType !== 'filter') {
                if (col.name === variableName)
                    this.$varsContent.append($(`<div class="item item-grayed-out" data-name="current">${col.name} ${_('(current)')}</div>`));
                else
                    this.$varsContent.append($('<div class="item" data-name="' + col.name + '">' + col.name + '</div>'));
            }
        }
    };

    this.focusedOn = function() {
        return this.$formula;
    };
};



module.exports = toolbar;
