'use strict';

import focusLoop from '../../common/focusloop';
import DataSetViewModel from '../dataset';
import { DropdownContent } from './dropdown';

function insertText(el: HTMLElement, newText: string, cursorOffset = 0, range = null, checkEscape = true) {
    
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

type FunctionDescription = {
  label: string;
  content: string;
};

export type Descriptions = {
  [name: string]: FunctionDescription;
};

function allFunctions(functionsContent) : Descriptions {
    const descriptions = {};

    function createElement(tag, attrs = {}, textContent = '') {
        const el = document.createElement(tag);
        for (const [key, value] of Object.entries(attrs)) {
            if (key === 'class') el.className = value;
            else if (key === 'dataset') {
                for (const [dKey, dValue] of Object.entries(value)) {
                    el.dataset[dKey] = dValue;
                }
            }
            else if (key === 'html') {
                el.innerHTML = value;
            }
            else {
                el.setAttribute(key, value);
            }
        }
        if (textContent) el.textContent = textContent;
        return el;
    }

    function addGroup(titleKey, items) {
        let labelId = focusLoop.getNextAriaElementId('label');
        let group = createElement('div', { role: 'group', 'aria-labelledby': labelId });
        group.appendChild(createElement('div', {
            id: labelId,
            role: 'presentation',
            class: 'subtitle',
            'data-name': ''
        }, _(titleKey)));
        functionsContent.appendChild(group);

        for (const item of items) {
            group.appendChild(createElement('div', {
                role: 'option',
                'aria-selected': 'false',
                class: 'item',
                dataset: { name: item.name }
            }, item.name));
            descriptions[item.name] = { label: item.label, content: item.content };
        }
    }

    addGroup('Math', [
        { name: 'ABS', label: 'ABS( <i>number</i> )', content: _('Absolute value: Returns the absolute value in a column of data.') },
        { name: 'EXP', label: 'EXP( <i>number</i> )', content: _('Exponential: raises *e* to the power of each value in a column of data.') },
        { name: 'LN', label: 'LN( <i>number</i> )', content: _('Natural logarithm (base *e*): the natural logarithm (base e) of each value in a column of data.') },
        { name: 'LOG10', label: 'LOG10( <i>number</i> )', content: _('Log base 10: the logarithm (base 10) of each value in a column of data.') },
        { name: 'SQRT', label: 'SQRT( <i>number</i> )', content: _('Square root: the square root of each value in a column of data.') }
    ]);

    addGroup('Statistical', [
        { name: 'ABSIQR', label: 'ABSIQR( <i>variable</i> )', content: _('Absolute deviation from the median: measures the average absolute deviation of values from the median. Convenience short-hand for <b>ABS(IQR( variable ))</b>') },
        { name: 'ABSZ', label: 'ABSZ( <i>variable</i>, group_by=0 )', content: _('Absolute z-score: Convenience short-hand for <b>ABS(Z( variable ))</b>') },
        { name: 'BOXCOX', label: 'BOXCOX( <i>variable, lambda</i> )', content: _('Box Cox: Returns a Box Cox transformation of the variable.') },
        { name: 'IQR', label: 'IQR( <i>variable</i> )', content: _('Interquartile Range: Returns values of 0 to indicate a number is within the box of a boxplot and values larger than 1.5 to indicate the number is outside the whiskers.') },
        { name: 'MAX', label: 'MAX( <i>variable</i> )', content: _('Maximum: identifies the highest value in a row or column of data.') },
        { name: 'MAXABSIQR', label: 'MAXABSIQR( variable 1, variable 2, … )', content: _('Maximum Absolute Interquartile Range: Convenience short-hand for <b>MAX(ABSIQR( variable 1, variable 2, … ))</b>') },
        { name: 'MAXABSZ', label: 'MAXABSZ( variable 1, variable 2, …, group_by=0 )', content: _('Maximum Absolute Z-Score: Convenience short-hand for <b>MAX(ABSZ( variable 1, variable 2, … ))</b>') },
        { name: 'MEAN', label: 'MEAN( <i>number 1, number 2, …</i>, ignore_missing=0, min_valid=0 )', content: _('Mean: Calculate the mean score across a row of data.') },
        { name: 'MIN', label: 'MIN( <i>variable</i> )', content: _('Minimum: identifies the lowest value in a row of data.') },
        { name: 'RANK', label: 'RANK( <i>variable</i> )', content: _('Ranking: assigns an ordinal rank to each value in a column of data.') },
        { name: 'ROUND', label: 'ROUND( <i>variable</i>, digits=0 )', content: _('Rounding: adjusts each value in a column of data to a specified number of decimal places or to the nearest whole number.') },
        { name: 'FLOOR', label: 'FLOOR( <i>variable</i> )', content: _('Floor: returns the greatest integer that is less than each value in a column of numbers, effectively rounding down to the nearest whole number.') },
        { name: 'CEILING', label: 'CEILING( <i>variable</i> )', content: _('Ceiling: returns the smallest integer that is greater than or equal to each value in a column of numbers, effectively rounding up to the nearest whole number.') },
        { name: 'SCALE', label: 'SCALE( <i>variable</i>, group_by=0 )', content: _('Returns the normalized values of a set of numbers - synonym for <b>Z(var)</b>') },
        { name: 'STDEV', label: 'STDEV( <i>number 1, number 2, …</i>, ignore_missing=0 )', content: _('Standard deviation: measures the amount of standard deviation in a row of data.') },
        { name: 'SUM', label: 'SUM( <i>number 1, number 2, …</i>, ignore_missing=0, min_valid=0 )', content: _('Summation: Returns the sum of a row of data.') },
        { name: 'VMAD', label: 'VMAD( <i>variable</i>, group_by=0 )', content: _('Median Absolute Deviation: Returns the median absolute deviation of a variable.') },
        { name: 'VMADR', label: 'VMADR( <i>variable</i>, group_by=0 )', content: _('Robust Median Absolute Deviation: Returns the robust median absolute deviation of a variable.') },
        { name: 'VMAX', label: 'VMAX( <i>variable</i>, group_by=0 )', content: _('Maximum: identifies the highest value in a variable.') },
        { name: 'VMEAN', label: 'VMEAN( <i>variable</i>, group_by=0 )', content: _('Mean: Calculate the mean score of a variable.') },
        { name: 'VMED', label: 'VMED( <i>variable</i>, group_by=0 )', content: _('Median: Returns the median of a variable.') },
        { name: 'VMIN', label: 'VMIN( <i>variable</i>, group_by=0 )', content: _('Minimum: identifies the lowest value in a variable.') },
        { name: 'VMODE', label: 'VMODE( <i>variable</i>, group_by=0 )', content: _('Mode: Returns the most common value, or mode, in a variable.') },
        { name: 'VN', label: 'VN( <i>variable</i>, group_by=0 )', content: _('Sample Size (or n): Returns the number of cases in a variable.') },
        { name: 'VSE', label: 'VSE( <i>variable</i>, group_by=0 )', content: _('Standard Error: Returns the standard error of a variable.') },
        { name: 'VSTDEV', label: 'VSTDEV( <i>variable</i>, group_by=0 )', content: _('Standard deviation: measures the amount of standard deviation in a variable.') },
        { name: 'VSUM', label: 'VSUM( <i>variable</i>, group_by=0 )', content: _('Summation: Returns the sum of a variable.') },
        { name: 'VAR', label: 'VAR( <i>number 1, number 2, …</i>, ignore_missing=0 )', content: _('Variance: Returns the variance of a row of data.') },
        { name: 'VVAR', label: 'VVAR( <i>variable</i>, group_by=0 )', content: _('Variance: Returns the variance of a variable.') },
        { name: 'Z', label: 'Z( <i>variable</i>, group_by=0 )', content: _('Z-score: Returns the normalized values of a set of numbers.') }
    ]);

    addGroup('Logical', [
        { name: 'IF', label: 'IF( <i>expression, value, else</i> )', content: _('If the expression resolves true, use the value, otherwise the else.') },
        { name: 'IFMISS', label: 'IFMISS( <i>variable, value, else</i> )', content: _('When the variable contains a missing value, use the value, otherwise the else.') },
        { name: 'NOT', label: 'NOT( <i>value</i> )', content: _('Inverts a boolean value: true (1) becomes false (0), false (0) becomes true (1).') }
    ]);

    addGroup('Text', [
        { name: 'CONTAINS', label: 'CONTAINS( <i>\'needle\', haystack</i> )', content: _('Determines if specificied string of text (i.e. \'needle\') appears in the variable (i.e. haystack) and can be expanded to look for multiple strings across one or more variables: <b>CONTAINS(\'text_1\', \'text_2\', var_1, var_2)</b>.' ) },
        { name: 'SPLIT', label: 'SPLIT( <i>variable</i>, \'by\', position)', content: _('Splits a string of text in a variable by a specified character (or string of text) and returns only the text at the specified position. For example, the string `ParticiapntbyP01` using <b>SPLIT(var, \'by\', 3)`` would return `P01`)</b>.')}, 
        { name: 'TEXT', label: 'TEXT( <i>number</i> )', content: _('Converts the value to text format (numbers to strings of text).') },
        { name: 'VALUE', label: 'VALUE( <i>text</i> )', content: _('Converts text (strings) to values (if possible).') }
    ]);

    addGroup('Date / Time', [
        { name: 'DATEVALUE', label: 'DATEVALUE( <i>value, format=\'%Y-%m-%d\'</i> )', content: _('Takes a date in text format (i.e. 2000-12-20) and converts to the number of days since the 1st of January, 1970.') },
        { name: 'DATE', label: 'DATE( <i>value, format=\'%Y-%m-%d\'</i> )', content: _('Takes a number representing the number of days since the 1st of January 1970, and produces a formatted date.') }
    ]);

    addGroup('Reference', [
        { name: 'HLOOKUP', label: 'HLOOKUP( <i>index, value 1, value 2, ..., ignore_missing=0</i> )', content: _('The value in the provided values at index.') },
        { name: 'MATCH', label: 'MATCH( <i>value, value 1, value 2, ...</i> )', content: _('The index of value in the provided values.') }
    ]);

    addGroup('Misc', [
        { name: 'COUNT', label: 'COUNT( <i>value 1, value 2, ...</i> )', content: _('Counts the number of non-missing values') },
        { name: 'FILTER', label: 'FILTER( <i>variable, filter expression</i> )', content: _('Filters a variable using a filter expression. For example, ``FILTER(var_1, var_2 == "Group_A")`` returns only rows in var_1 where var_2 is matched with the label "Group A".') },
        { name: 'INT', label: 'INT( <i>number</i> )', content: _('Converts a number to an integer.') },
        { name: 'OFFSET', label: 'OFFSET( <i>variable, integer</i> )', content: _('Offsets a column of data up or down by +/- n rows') },
        { name: 'ROW', label: 'ROW( <i>NO ARGUMENTS</i> )', content: _('Returns a column with each row indicating the row number.') },
        { name: 'SAMPLE', label: 'SAMPLE( <i>variable, n, otherwise=NA</i> )', content: _('Draws a random sample of n values from a variable.') },
        { name: 'VROWS', label: 'VROWS( <i>variable</i>, group_by=0 )', content: _('Returns the number of rows of a variable.') }
    ]);

    addGroup('Simulation', [
        { name: 'BETA', label: 'BETA( <i>alpha, beta</i> )', content: _('Draws samples from a Beta distribution.') },
        { name: 'GAMMA', label: 'GAMMA( <i>shape, scale</i> )', content: _('Draws samples from a Gamma distribution.') },
        { name: 'NORM', label: 'NORM( <i>mean, sd</i> )', content: _('Draws samples from a normal (Gaussian) distribution.') },
        { name: 'UNIF', label: 'UNIF( <i>low, high</i> )', content: _('Draws samples from a uniform distribution.') }
    ]);

    return descriptions;
}

export class Toolbar extends HTMLElement implements DropdownContent {
  private model: DataSetViewModel;
  private lastRange: Range | null;
  private descriptions: Descriptions;

  private $label: HTMLDivElement;
  private $description: HTMLDivElement;
  private $functionsContent: HTMLDivElement;
  private $varsContent: HTMLDivElement;
  private $formula!: HTMLDivElement;

  constructor(model: DataSetViewModel) {
    super();
    this.model = model;
    this.lastRange = null;

    // Main container
    this.id = focusLoop.getNextAriaElementId('tool');
    this.classList.add('jmv-formula-toolbar-options');

    // Ops container
    let $ops = document.createElement('div');
    $ops.setAttribute('role', 'presentation');
    $ops.className = 'ops-box';
    this.appendChild($ops);

    // Label
    this.$label = document.createElement('div');
    this.$label.setAttribute('aria-live', 'polite');
    this.$label.className = 'option-label';
    this.appendChild(this.$label);

    // Description
    this.$description = document.createElement('div');
    this.$description.setAttribute('aria-live', 'polite');
    this.$description.className = 'option-description';
    this.appendChild(this.$description);

    // Functions panel
    let $functions = document.createElement('div');
    $functions.setAttribute('role', 'presentation');
    $functions.className = 'op';
    $ops.appendChild($functions);

    const functionsLabelId = focusLoop.getNextAriaElementId('label');
    let $functionsTitle = document.createElement('div');
    $functionsTitle.id = functionsLabelId;
    $functionsTitle.className = 'title';
    $functionsTitle.textContent = _('Functions');
    $functions.appendChild($functionsTitle);

    this.$functionsContent = document.createElement('div');
    this.$functionsContent.setAttribute('role', 'listbox');
    this.$functionsContent.setAttribute('tabindex', '0');
    this.$functionsContent.setAttribute('aria-labelledby', functionsLabelId);
    this.$functionsContent.className = 'content';
    $functions.appendChild(this.$functionsContent);

    this.descriptions = allFunctions(this.$functionsContent);

    const info = this.descriptions.ABS;
    if (info) {
      this.$description.innerHTML = info.content;
      this.$label.innerHTML = info.label;
    }

    this.$functionsContent.addEventListener("dblclick", (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (target.classList.contains('item')) {
        setTimeout(() => this.insertFunction(target.dataset.name!), 0);
      }
    });

    this.$functionsContent.addEventListener('focus', () => this.displayFunctionInfo());

    this.$functionsContent.addEventListener('keydown', (event: KeyboardEvent) => {
      this.onkeydownEvent(event, this.insertFunction.bind(this));
      this.displayFunctionInfo();
    });

    this.$functionsContent.addEventListener("click", (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      const items = this.$functionsContent.querySelectorAll(".item");
      items.forEach(item => {
        item.classList.remove("item-activated");
        item.setAttribute('aria-selected', 'false');
      });
      if (target.classList.contains("item")) {
        target.classList.add("item-activated");
        target.setAttribute('aria-selected', 'true');
        this.displayFunctionInfo();
      } else {
        this.$description.textContent = '';
        this.$label.textContent = '';
      }
    });

    // Variables panel
    let $vars = document.createElement('div');
    $vars.className = 'op';
    $ops.appendChild($vars);

    const varsLabelId = focusLoop.getNextAriaElementId('label');
    let $varsTitle = document.createElement('div');
    $varsTitle.id = varsLabelId;
    $varsTitle.className = 'title';
    $varsTitle.textContent = _('Variables');
    $vars.appendChild($varsTitle);

    this.$varsContent = document.createElement('div');
    this.$varsContent.setAttribute('role', 'listbox');
    this.$varsContent.setAttribute('tabindex', '0');
    this.$varsContent.setAttribute('aria-labelledby', varsLabelId);
    this.$varsContent.className = 'content';
    $vars.appendChild(this.$varsContent);

    this.$varsContent.addEventListener("dblclick", (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (target.dataset.name !== 'current' && target.classList.contains('item')) {
        setTimeout(() => this.insertvar(target.dataset.name!), 0);
      }
    });

    this.$varsContent.addEventListener('focus', () => this.displayVariableInfo());

    this.$varsContent.addEventListener("click", (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      const items = this.$varsContent.querySelectorAll(".item");
      items.forEach(item => item.classList.remove("item-activated"));
      if (target.classList.contains("item")) {
        target.classList.add("item-activated");
        items.forEach(item => item.setAttribute('aria-selected', 'false'));
        target.setAttribute('aria-selected', 'true');
        this.displayVariableInfo();
      }
    });

    this.$varsContent.addEventListener('keydown', (event: KeyboardEvent) => {
      this.onkeydownEvent(event, this.insertvar.bind(this));
      this.displayVariableInfo();
    });
  }

  public isScrollTarget(target: EventTarget | null): boolean {
    return target === this.$functionsContent || target === this.$varsContent;
  }

  private displayFunctionInfo(): void {
    const selectedItem = this.$functionsContent.querySelector(".item[aria-selected='true']") as HTMLElement | null;
    if (!selectedItem) {
      this.$label.textContent = '';
      this.$description.textContent = _('No information about this function is available');
      return;
    }

    const info = this.descriptions[selectedItem.dataset.name!];
    if (info) {
      this.$label.innerHTML = info.label;
      this.$description.innerHTML = info.content;
    } else {
      this.$label.textContent = '';
      this.$description.textContent = _('No information about this function is available');
    }
  }

  private insertFunction(value: string): void {
    insertText(this.$formula, value + "()", -1, this.lastRange);
    this.$formula.dispatchEvent(new Event('input'));
  }

  private insertvar(value: string): void {
    insertText(this.$formula, value, 0, this.lastRange, value !== '$source');
    this.$formula.dispatchEvent(new Event('input'));
  }

  private onkeydownEvent(event: KeyboardEvent, insertCallback: (name: string) => void): void {
    const list = Array.from((event.currentTarget as HTMLElement).querySelectorAll<HTMLElement>('.item'));
    if (!list.length) return;

    const selectedItem = (event.currentTarget as HTMLElement).querySelector(".item[aria-selected='true']") as HTMLElement | null;
    let index = selectedItem ? list.indexOf(selectedItem) : -1;

    switch (event.keyCode) {
      case 40: // down
        index = (index === -1 || index === list.length - 1) ? 0 : index + 1;
        this.selectItem(event.currentTarget as HTMLElement, list[index]);
        event.preventDefault();
        break;
      case 38: // up
        index = (index === -1 || index === 0) ? list.length - 1 : index - 1;
        this.selectItem(event.currentTarget as HTMLElement, list[index]);
        event.preventDefault();
        break;
      case 13: // enter
      case 32: // space
        if (selectedItem) {
          setTimeout(() => insertCallback(selectedItem.dataset.name!), 0);
          event.preventDefault();
        }
        break;
    }
  }

  private selectItem(listRoot: HTMLElement, target: HTMLElement): void {
    const items = listRoot.querySelectorAll(".item");
    items.forEach(item => {
      item.classList.remove("item-activated");
      item.setAttribute('aria-selected', 'false');
    });
    if (target && target.classList.contains("item")) {
      target.classList.add("item-activated");
      target.setAttribute('aria-selected', 'true');
      target.scrollIntoView({ behavior: "smooth", block: "center" });
    } else {
      this.$description.textContent = '';
      this.$label.textContent = '';
    }
  }

  private displayVariableInfo(): void {
    const selectedItem = this.$varsContent.querySelector(".item[aria-selected='true']") as HTMLElement | null;
    if (!selectedItem) {
      this.$description.textContent = '';
      this.$label.textContent = '';
      return;
    }

    const value = selectedItem.textContent!;
    if (value === '$source') {
      this.$description.textContent = _('The current value of the variable to which this transform is applied.');
      this.$label.textContent = _('Keyword: {v}', { v: value });
    } else {
      this.$description.textContent = _('This is a data variable.');
      this.$label.textContent = _('Variable: {v}', { v: value });
    }
  }

  public show($formula: HTMLDivElement, variableName: string, useValue?: boolean): void {
    this.$formula = $formula;

    this.$varsContent.innerHTML = '';
    if (useValue) {
      const sourceDiv = document.createElement('div');
      sourceDiv.setAttribute('role', 'option');
      sourceDiv.className = 'item';
      sourceDiv.dataset.name = '$source';
      sourceDiv.textContent = '$source';
      this.$varsContent.appendChild(sourceDiv);
    }

    for (const col of this.model.get("columns")) {
      if (col.name && col.columnType !== 'filter') {
        const div = document.createElement('div');
        div.setAttribute('role', 'option');
        div.className = 'item';
        div.dataset.name = col.name;

        if (col.name === variableName) {
          div.classList.add('item-grayed-out');
          div.setAttribute('aria-disabled', 'true');
          div.textContent = `${col.name} ${_('(current)')}`;
        } else {
          div.textContent = col.name;
        }

        this.$varsContent.appendChild(div);
      }
    }
  }

  public focusedOn(): HTMLElement {
    return this.$formula;
  }
}

customElements.define('jmv-formula-toolbar', Toolbar);

export default Toolbar;
