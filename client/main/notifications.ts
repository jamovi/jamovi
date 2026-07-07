
'use strict';

import { EventDistributor } from "../common/eventmap";
import { h } from '../common/htmlelementcreator';
import Notify from "./notification";

class NotificationView extends EventDistributor {

    model: Notify;
    $title: HTMLElement;
    $progressBar: HTMLElement;
    $progressBarBar: HTMLElement;
    $message: HTMLElement;
    $buttons: HTMLElement;
    _finished: () => void;
    dismiss: () => void;
    reshow: () => void;
    timeout: NodeJS.Timeout;

    constructor(model: Notify) {
        super();
        this.model = model;

        this.setAttribute('role', 'alert');
        this.classList.add('notification');
        this.classList.add('jmv-notification', 'hidden');
        this.setAttribute('data-type', this.model.get('type'));

        this.model.on('change', () => this._update());
        this.model.on('change:dismissed', () => this.dismiss());

        let $icon  = h('div', { class: 'jmv-notification-icon' });
        this.append($icon);

        let $info = h('div', { class: 'jmv-notification-info' });
        this.append($info);

        this.$title = h('div', { class: 'jmv-notification-title' });
        $info.append(this.$title);

        let $body  = h('div', { class: 'jmv-notification-body' });
        $info.append($body);

        let $content = h('div', { class: 'jmv-notification-content' });
        $body.append($content);

        this.$progressBar = h('div', { class: 'jmv-notification-progressbar' });
        $content.append(this.$progressBar);
        this.$progressBarBar = h('div', { class: 'jmv-notification-progressbarbar' });
        this.$progressBar.append(this.$progressBarBar);

        this.$message = h('div', { class: 'jmv-notification-message' });
        $content.append(this.$message);

        this.$buttons = h('div', { class: 'jmv-notification-buttons' });
        $content.append(this.$buttons);

        let $cancel = h('div', { class: 'jmv-notification-button-cancel' }, _('Cancel'));
        this.$buttons.append($cancel);

        this.$buttons.style.display = (this.model.attributes.cancel ? null : 'none');

        $cancel.addEventListener('click', (event) => {
            this.model.cancel();
            this.model.dismiss();
        });

        this._finished = () => {
            let event = new CustomEvent('finished');
            this.dispatchEvent(event);
        };
        this.dismiss = () => {
            this.addEventListener('transitionend', this._finished, { once: true });
            this.model.set('visible', false);
        };
        this.reshow = () => {
            this.removeEventListener('transitionend', this._finished);
            clearTimeout(this.timeout);
            this.model.attributes.visible = true;
            if (this.model.duration !== 0)
                this.timeout = setTimeout(this.dismiss, this.model.duration);
            setTimeout(() => this._update(), 50);
        };

        this.reshow();
    }

    _update() {
        this.classList.toggle('hidden', this.model.attributes.visible === false);
        this.$message.innerText = this.model.attributes.message;
        this.$title.innerText = this.model.attributes.title;

        if (this.model.attributes.progress[1] > 0) {
            this.$progressBarBar.style.width = `${ 100 * this.model.attributes.progress[0] / this.model.attributes.progress[1] }%`;
            this.$progressBar.style.display = '';
            this.$message.style.display = 'none';
        }
        else {
            this.$progressBar.style.display = 'none';
            this.$message.style.display = '';
        }

        this.$buttons.style.display = (this.model.attributes.cancel ? null : 'none');
    }
}

customElements.define('jmv-notification', NotificationView);

interface NotificationItem { model: Notify, $view: NotificationView }

class Notifications {
    el: HTMLElement;
    list: NotificationItem[];

    constructor(el) {
        this.el = el;
        this.el.classList.add('jmv-notifications');
        this.list = [ ];
    }

    notify(notification: Notify) {
        let found = false;
        let dismiss = notification.attributes.dismissed;

        for (let item of this.list) {
            if (item.model === notification || (notification.attributes.id !== undefined && notification.attributes.id === item.model.attributes.id)) {
                found = true;
                if ( ! dismiss) {
                    item.model.set(notification.attributes);
                    item.$view.reshow();
                }
                else {
                    item.model.dismiss();
                }
                break;
            }
        }

        if (found === false && dismiss === false) {
            let $view =new NotificationView(notification)
            this.el.append($view);
            let item: NotificationItem = { model: notification, $view: $view };
            this.list.push(item);

            $view.addEventListener('finished', () => {
                this.list = this.list.filter(v => v !== item);
                $view.remove();
            });
        }
    }
};



export default Notifications;
