'use strict';

import { h }  from '../../common/htmlelementcreator';
import { RibbonItem } from './ribbontab';

export class Placeholder extends HTMLElement implements RibbonItem {
    dock: 'left' | 'right' = 'left';

    constructor(index:string, label:string) {
        super();
        this.classList.add('jmv-ribbon-button');
        this.classList.add('jmv-ribbon-temp-button');
        this.setAttribute('data-name', index);
        this.append(h('div', { class: 'jmv-ribbon-button-icon placeholder-icon' }));
        this.append(h('div', { class: 'jmv-ribbon-button-label placeholder-label' }, label));
        this.append(h('div', { class: 'jmv-ribbon-menu-arrow', style: 'margin: 7px 0 0 0;' }));
    }
}

customElements.define('jmv-ribbon-placeholder', Placeholder);

export default Placeholder;
