'use strict';

import $ from 'jquery';
import focusLoop from '../../common/focusloop';
import DataSetViewModel from '../dataset';
import { DropdownContent } from './dropdown';

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
        { name: 'ABS', label: 'ABS( <i>number</i> )', content: _('Returns the absolute value of a number.') },
        { name: 'EXP', label: 'EXP( <i>number</i> )', content: _('Returns the exponent for basis ℯ of a number.') },
        { name: 'LN', label: 'LN( <i>number</i> )', content: _('Returns the natural logarithm of a number.') },
        { name: 'LOG10', label: 'LOG10( <i>number</i> )', content: _('Returns the base-10 logarithm of a number.') },
        { name: 'SQRT', label: 'SQRT( <i>number</i> )', content: _('Returns the square root of a number.') }
    ]);

    addGroup('Statistical', [
        { name: 'ABSIQR', label: 'ABSIQR( <i>variable</i> )', content: _('Convenience short-hand for ABS(IQR( variable ))') },
        { name: 'ABSZ', label: 'ABSZ( <i>variable</i>, group_by=0 )', content: _('Convenience short-hand for ABS(Z( variable ))') },
        { name: 'BOXCOX', label: 'BOXCOX( <i>variable, lambda</i> )', content: _('Returns a Box Cox transformation of the variable.') },
        { name: 'IQR', label: 'IQR( <i>variable</i> )', content: _('Returns a whether the variable is an outlier according to the IQR: If the value is within the box of a Boxplot 0 is returned, absolute values larger than 1.5 are outside the whiskers.') },
        { name: 'MAX', label: 'MAX( <i>variable</i> )', content: _('Returns the largest value of a set of numbers.') },
        { name: 'MAXABSIQR', label: 'MAXABSIQR( variable 1, variable 2, … )', content: _('Convenience short-hand for MAX(ABSIQR( variable 1, variable 2, … ))') },
        { name: 'MAXABSZ', label: 'MAXABSZ( variable 1, variable 2, …, group_by=0 )', content: _('Convenience short-hand for MAX(ABSZ( variable 1, variable 2, … ))') },
        { name: 'MEAN', label: 'MEAN( <i>number 1, number 2, …</i>, ignore_missing=0, min_valid=0 )', content: _('Returns the mean of a set of numbers.') },
        { name: 'MIN', label: 'MIN( <i>variable</i> )', content: _('Returns the smallest value of a set of numbers.') },
        { name: 'RANK', label: 'RANK( <i>variable</i> )', content: _('Ranks each value') },
        { name: 'ROUND', label: 'ROUND( <i>variable</i>, digits=0 )', content: _('Rounds each value') },
        { name: 'FLOOR', label: 'FLOOR( <i>variable</i> )', content: _('Rounds each value to the integer below') },
        { name: 'CEILING', label: 'CEILING( <i>variable</i> )', content: _('Rounds each value to the integer above') },
        { name: 'SCALE', label: 'SCALE( <i>variable</i>, group_by=0 )', content: _('Returns the normalized values of a set of numbers.') },
        { name: 'STDEV', label: 'STDEV( <i>number 1, number 2, …</i>, ignore_missing=0 )', content: _('Returns the standard deviation of a set of numbers.') },
        { name: 'SUM', label: 'SUM( <i>number 1, number 2, …</i>, ignore_missing=0, min_valid=0 )', content: _('Returns the sum of a set of numbers.') },
        { name: 'VMAD', label: 'VMAD( <i>variable</i>, group_by=0 )', content: _('Returns the median absolute deviation of a variable.') },
        { name: 'VMADR', label: 'VMADR( <i>variable</i>, group_by=0 )', content: _('Returns the robust median absolute deviation of a variable.') },
        { name: 'VMAX', label: 'VMAX( <i>variable</i>, group_by=0 )', content: _('Returns the largest value of a variable.') },
        { name: 'VMEAN', label: 'VMEAN( <i>variable</i>, group_by=0 )', content: _('Returns the overall mean of a variable.') },
        { name: 'VMED', label: 'VMED( <i>variable</i>, group_by=0 )', content: _('Returns the median of a variable.') },
        { name: 'VMIN', label: 'VMIN( <i>variable</i>, group_by=0 )', content: _('Returns the smallest value of a variable.') },
        { name: 'VMODE', label: 'VMODE( <i>variable</i>, group_by=0 )', content: _('Returns the most common value in a variable.') },
        { name: 'VN', label: 'VN( <i>variable</i>, group_by=0 )', content: _('Returns the number of cases in a variable.') },
        { name: 'VSE', label: 'VSE( <i>variable</i>, group_by=0 )', content: _('Returns the standard error of the mean of a variable.') },
        { name: 'VSTDEV', label: 'VSTDEV( <i>variable</i>, group_by=0 )', content: _('Returns the standard deviation of a variable.') },
        { name: 'VSUM', label: 'VSUM( <i>variable</i>, group_by=0 )', content: _('Returns the overall sum of a variable.') },
        { name: 'VAR', label: 'VAR( <i>number 1, number 2, …</i>, ignore_missing=0 )', content: _('Returns the variance of a set of numbers.') },
        { name: 'VVAR', label: 'VVAR( <i>variable</i>, group_by=0 )', content: _('Returns the variance of a variable.') },
        { name: 'Z', label: 'Z( <i>variable</i>, group_by=0 )', content: _('Returns the normalized values of a set of numbers.') }
    ]);

    addGroup('Logical', [
        { name: 'IF', label: 'IF( <i>expression, value, else</i> )', content: _('If the expression resolves true, use the value, otherwise the else.') },
        { name: 'IFMISS', label: 'IFMISS( <i>variable, value, else</i> )', content: _('When the variable contains a missing value, use the value, otherwise the else.') },
        { name: 'NOT', label: 'NOT( <i>value</i> )', content: _('Inverts the value.') }
    ]);

    addGroup('Text', [
        { name: 'CONTAINS', label: 'CONTAINS( <i>item1, item2, item3, ..., in1, in2, in3, ...</i> )', content: _('Determines if any of the items appear in in1, in2, in3, .... Note that most of these arguments are optional -- it is possible to simply use __CONTAINS(needle, haystack)__.' ) },
        { name: 'SPLIT', label: 'SPLIT( <i>variable</i>, sep=\',\', piece )', content: _('Splits text into pieces based on a separator. _piece_ specifies the desired piece by index.') },
        { name: 'TEXT', label: 'TEXT( <i>number</i> )', content: _('Converts the value to text.') },
        { name: 'VALUE', label: 'VALUE( <i>text</i> )', content: _('Converts text to a number (if possible).') }
    ]);

    addGroup('Date / Time', [
        { name: 'DATEVALUE', label: 'DATEVALUE( <i>value, format=\'%Y-%m-%d\'</i> )', content: _('Parses a date, and converts it to the number of days since the 1st of January, 1970.') },
        { name: 'DATE', label: 'DATE( <i>value, format=\'%Y-%m-%d\'</i> )', content: _('Takes a number representing the number of days since the 1st of January 1970, and produces a formatted date.') }
    ]);

    addGroup('Reference', [
        { name: 'HLOOKUP', label: 'HLOOKUP( <i>index, value 1, value 2, ..., ignore_missing=0</i> )', content: _('The value in the provided values at index.') },
        { name: 'MATCH', label: 'MATCH( <i>value, value 1, value 2, ...</i> )', content: _('The index of value in the provided values.') }
    ]);

    addGroup('Misc', [
        { name: 'COUNT', label: 'COUNT( <i>value 1, value 2, ...</i> )', content: _('Counts the number of non-missing values') },
        { name: 'FILTER', label: 'FILTER( <i>variable, filter expression</i> )', content: _('Filters a variable using the filter expression.') },
        { name: 'INT', label: 'INT( <i>number</i> )', content: _('Converts a number to an integer.') },
        { name: 'OFFSET', label: 'OFFSET( <i>variable, integer</i> )', content: _('Offsets the values up or down.') },
        { name: 'ROW', label: 'ROW( <i>NO ARGUMENTS</i> )', content: _('Returns the row numbers.') },
        { name: 'SAMPLE', label: 'SAMPLE( <i>variable, n, otherwise=NA</i> )', content: _('Draws a sample of n from the variable. i.e. SAMPLE(var, 20), i.e. SAMPLE(1, 20), i.e. SAMPLE(\'training\', 20, \'test\')') },
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
  private $$formula!: $<HTMLElement>;
  private $formula!: HTMLTextAreaElement;

  constructor(model: DataSetViewModel) {
    super();
    this.model = model;
    this.lastRange = null;

    // Main container
    this.id = focusLoop.getNextAriaElementId('tool');
    this.className = 'jmv-formula-toolbar-options';

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

  public show($formula: $<HTMLElement>, variableName: string, useValue: boolean): void {
    this.$$formula = $formula;
    this.$formula = $formula[0] as HTMLTextAreaElement;

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

  public focusedOn(): $<HTMLElement> {
    return this.$$formula;
  }
}

customElements.define('jmv-formula-toolbar', Toolbar);

export default Toolbar;
