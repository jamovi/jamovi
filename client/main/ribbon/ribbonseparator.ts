'use strict';

import { HTMLElementCreator as HTML }  from '../../common/htmlelementcreator';
import { EventEmitter } from 'events';

export class RibbonSeparator extends EventEmitter {

    el: HTMLElement;
    dock: 'right' | 'left';

    constructor(params?) {
        super();

        if (params === undefined)
            params = { };

        let right = params.right === undefined ? false : params.right;
        let el = params.el === undefined ? HTML.create('div') : params.el;

        this.el = el;
        this.el.classList.add('jmv-ribbon-separator');

        this.dock = right ? 'right' : 'left';

        if (right)
            this.el.classList.add('right');
    }
}

export default RibbonSeparator;