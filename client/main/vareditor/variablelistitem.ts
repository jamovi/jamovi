'use strict';

import focusLoop from '../../common/focusloop';
import { Column } from '../dataset';

class VariableListItem extends HTMLElement {
  variable: Column;
  name: string;
  id: string;
  el: HTMLDivElement;
  icon: HTMLDivElement;
  label: HTMLDivElement;

  constructor(variable: Column) {
    super();
    this.variable = variable;
    this.name = variable.name;

    const labelId = focusLoop.getNextAriaElementId('label');
    this.id = focusLoop.getNextAriaElementId('listitem');

    // Create main container div
    this.className = 'jmv-variable-list-item';
    this.setAttribute('role', 'listitem');
    this.setAttribute('aria-labelledby', labelId);

    // Create icon div
    this.icon = document.createElement('div');
    this.icon.className = `icon variable-type-${variable.measureType} data-type-${variable.dataType}`;
    this.appendChild(this.icon);

    // Create label div
    this.label = document.createElement('div');
    this.label.id = labelId;
    this.label.className = 'label';
    this.label.textContent = this.name;
    this.appendChild(this.label);

    // Add click event listener that triggers a custom 'selected' event on this
    this.addEventListener('click', () => {
      const event = new CustomEvent('selected', { detail: this });
      this.dispatchEvent(event);
    });
  }
}

customElements.define('jmv-variablelistitem', VariableListItem);

export default VariableListItem;