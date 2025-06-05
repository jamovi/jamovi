'use strict';

import $ from 'jquery';
import { GridControl } from './gridcontrol';
const RequestDataSupport = require('./requestdatasupport');
import { HTMLElementCreator as HTML }  from '../common/htmlelementcreator';

export class CustomControl extends GridControl {
    observer: MutationObserver;
    timeoutId: NodeJS.Timeout;

    /**
     * @deprecated Should not be used. Rather use `(property) CustomControl.el: HTMLElement`.
     */
    $el: any;

    constructor(params) {
        super(params);

        RequestDataSupport.extendTo(this);

        this.el = HTML.parse('<div class="silky-custom-control silky-control-margin-' + this.getPropertyValue("margin") + '"></div>');
        this.$el = $(this.el);

        this.timeoutId = null;
    }

    update() {
        this.emit('update');
    }

    onDisposed() {
        if (this.observer)
            this.observer.disconnect();
    }

    onLoaded() {
        this.observer = new MutationObserver( (mutations) => {
            if (this.timeoutId === null) {
                this.timeoutId = setTimeout(() => {
                    this.timeoutId = null;
                    let event = new CustomEvent('contentchanged');
                    this.el.dispatchEvent(event);
                }, 0);
            }
        } );

        this.observer.observe(this.el, { attributes: true, childList: true, attributeOldValue: true });
    }

    onDataChanged(data) {
        if (data.dataType !== 'columns')
            return;

        if (data.dataInfo.nameChanged || data.dataInfo.measureTypeChanged || data.dataInfo.dataTypeChanged || data.dataInfo.countChanged)
            this.update();
    }
}

export default CustomControl;
