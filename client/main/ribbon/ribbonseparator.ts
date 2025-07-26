'use strict';

import { RibbonItem } from './ribbontab';

export class RibbonSeparator extends HTMLElement implements RibbonItem {

    dock: 'right' | 'left';

    constructor(params?) {
        super();

        if (params === undefined)
            params = { };

        let right = params.right === undefined ? false : params.right;

        this.classList.add('jmv-ribbon-separator');

        this.dock = right ? 'right' : 'left';

        if (right)
            this.classList.add('right');
    }
}

customElements.define('jmv-ribbon-sep', RibbonSeparator);

export default RibbonSeparator;