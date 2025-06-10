'use strict';

import { HTMLElementCreator as HTML }  from '../../common/htmlelementcreator';

export class Placeholder {
    el: HTMLElement;
    dock = 'left';

    constructor(index:string, label:string) {
        this.el = HTML.parse(`<button class="jmv-ribbon-button jmv-ribbon-temp-button" data-name="${index}">
        <div class="jmv-ribbon-button-icon placeholder-icon"></div>
        <div class="jmv-ribbon-button-label placeholder-label">${label}</div>
        </button>`);
    }
}

export default Placeholder;
