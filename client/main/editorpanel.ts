
'use strict';

import focusLoop  from '../common/focusloop';
import { EventEmitter } from 'events';
import { HTMLElementCreator as HTML }  from '../common/htmlelementcreator';


export class EditorPanel extends EventEmitter {
    el: HTMLElement; 
    title: HTMLElement; 
    contents: HTMLElement; 
    titleBox: HTMLElement;
    visible: boolean;
    attachedItem: HTMLElement;
    onBack: () => void;
    $icon: HTMLElement;

    constructor(el: HTMLElement) {
        super();

        this._notifyEditProblem = this._notifyEditProblem.bind(this);

        this.el = el;
        this.el.innerHTML = '';
        this.el.classList.add('jmv-editor-panel');

        //this.$el.empty();
        //this.$el.addClass('jmv-editor-panel');
        focusLoop.addFocusLoop(this.el, { level: 1 });

        let main = HTML.create('div', {class: 'jmv-editor-panel-main'});
        this.el.append(main);

        let ok =   HTML.create('button', { class: 'jmv-editor-panel-ok', 'aria-label': _('Ok'), tabindex: "0" }, 
                        HTML.create('span', { class: 'mif-checkmark' }),
                        HTML.create('span', { class: 'mif-arrow-down' })
                    );
        main.append(ok);

        //this.$ok = $(`<button aria-label="${_('Ok')}" tabindex="0" class="jmv-editor-panel-ok"><span class="mif-checkmark"></span><span class="mif-arrow-down"></span></button>`).appendTo(this.$main);

        let titleBox =   HTML.create('div', { class: 'title-box' }); 
        main.append(titleBox);
        this.titleBox = titleBox;

        let title =   HTML.create('div', { class: 'title' }); 
        titleBox.append(title);
        this.title = title;

        let contents =   HTML.create('div', { class: 'content' }); 
        main.append(contents);
        this.contents = contents;

        //this.$titleBox = $('<div class="title-box"></div>').appendTo(this.$main);
        //this.$title = $('<div class="title"></div>').appendTo(this.$titleBox);
        //this.$contents = $('<div class="content"></div>').appendTo(this.$main);

        ok.addEventListener('click', this.close.bind(this));
    }

    close() {
        let backCall = this.onBack;
        this.attach(null);
        if (backCall)
            backCall();
    }

    attach(item: (HTMLElement & {$icon?: HTMLElement}), onBack: () => void = null) {

        this.onBack = onBack;
        if (item !== null && item === this.attachedItem) {
            if (this.el.classList.contains('hidden'))
                this.el.classList.remove('hidden');
            return;
        }

        let hide = true;

        if (this.attachedItem) {
            this.attachedItem.remove();
            if (this.$icon)
                this.$icon.remove();
            this.$icon = null;
            this.title.innerHTML = '';
            this.attachedItem.removeEventListener('notification', this._notifyEditProblem);
            this.attachedItem = null;
        }

        if (item) {
             this.contents.append(item);
             this.title.innerText = item.title;
             if (item.$icon) {
                this.titleBox.append(item.$icon);
                 this.$icon = item.$icon;
             }
             this.attachedItem = item;
             this.attachedItem.addEventListener('notification', this._notifyEditProblem);
             hide = false;
        }

        if (hide) {
            if (this.visible) {
                this.el.classList.add('hidden');
                let event = new CustomEvent('editor:hidden');
                this.el.dispatchEvent(event);
                //this.$el.trigger('editor:hidden');
                //focusLoop.leaveFocusLoop(this.el);
                this.visible = false;
            }
        }
        else {
            if ( ! this.visible) {
                this.el.classList.remove('hidden');
                let event = new CustomEvent('editor:visible');
                this.el.dispatchEvent(event);
                //this.$el.trigger('editor:visible');
                setTimeout(() => {
                    focusLoop.enterFocusLoop(this.el);
                }, 200);
                this.visible = true;
            }
        }

    }

    _notifyEditProblem(note) {
        this.emit('notification', note);
    }

    isVisible() {
        return this.el.classList.contains('hidden') === false;
    }

}

export default EditorPanel;
