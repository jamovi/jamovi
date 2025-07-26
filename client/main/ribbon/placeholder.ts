'use strict';

import { HTMLElementCreator as HTML }  from '../../common/htmlelementcreator';
import { RibbonItem } from './ribbontab';

export class Placeholder extends HTMLElement implements RibbonItem {
    dock: 'left' | 'right' = 'left';

    constructor(index:string, label:string) {
        super();
        this.classList.add('jmv-ribbon-button');
        this.classList.add('jmv-ribbon-temp-button');
        this.setAttribute('data-name', index);
        this.append(HTML.parse(`<div class="jmv-ribbon-button-icon placeholder-icon"></div>`));
        this.append(HTML.parse(`<div class="jmv-ribbon-button-label placeholder-label">${label}</div>`));
    }
}

customElements.define('jmv-ribbon-placeholder', Placeholder);

export default Placeholder;
