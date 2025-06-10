
'use strict';

import { HTMLElementCreator as HTML }  from '../htmlelementcreator';
import { EventEmitter } from 'events';

export class ToolbarSeparator extends EventEmitter {
    el: HTMLElement;

    constructor(params) {
        super();

        if (params === undefined)
            params = { };

        let right = params.right === undefined ? false : params.right;
        let orientation = params.orientation === undefined ? 'horizontal' : params.orientation;
        let el = params.el === undefined ? HTML.create('div') : params.el;

        this.el = el;
        this.el.classList.add('jmv-toolbar-separator');
        this.el.classList.add('jmv-toolbar-separator-' + orientation);

        this.dock = right ? 'right' : 'left';

        if (right)
            this.el.classList.add('right');
    }
};

export default ToolbarSeparator;
