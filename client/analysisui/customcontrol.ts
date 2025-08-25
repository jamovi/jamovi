'use strict';


import { GridControl, GridControlProperties } from './gridcontrol';
import GetRequestDataSupport from './requestdatasupport';
import { HTMLElementCreator as HTML }  from '../common/htmlelementcreator';

type CustomControlProperties = GridControlProperties & {
    update: () => void;
};

export class CustomControl extends GridControl<CustomControlProperties> {
    observer: MutationObserver;
    timeoutId: NodeJS.Timeout;

    constructor(params: CustomControlProperties, parent) {
        super(params, parent);

        GetRequestDataSupport(this);

        this.setRootElement(HTML.parse('<div class="silky-custom-control silky-control-margin-' + this.getPropertyValue("margin") + '"></div>'));

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
