
'use strict';

import { EventDistributor, EventMap } from '../../common/eventmap';
import { HTMLElementCreator as HTML }  from '../../common/htmlelementcreator';

export interface NotifData {
    id: number,
    text: string,
    options: { name: string, text: string, dismiss?: boolean }[]
}

class Notif extends EventMap<NotifData> {
    constructor(options: Partial<NotifData>) {
        super(Object.assign({
            id: 0,
            text: '',
            options: [ { name: 'dismiss', text: 'OK' } ],
        }, options));
    }
}

class View extends EventDistributor {
    nextId: number = 1;
    notifs: Notif[] = [];

    constructor() {
        super();
        this.classList.add('RibbonNotifs');
    }

    _added(notif: Notif) {
        let index = this.notifs.indexOf(notif);
        let html = `<div class="jmv-ribbon-notif" data-id="${notif.get('id')}">
                        <div class="inner">
                            <div class="message">
                                ${notif.get('text')}
                            </div>
                            <div class="options">
                                ${  (function() {
                                        let buttons: string = '';
                                        notif.get('options').forEach((option) => {
                                            buttons += `<button data-id="${notif.get('id')}" data-name="${option.name}" data-dismiss="${option.dismiss !== false ? 1 : 0}">${option.text}</button>`;
                                        })
                                        return buttons;
                                    })()
                                }
                            </div>
                        </div>
                    </div>`;
        let el = HTML.parse(html);

        if (index === 0)
            this.prepend(el);
        else {
            const referenceNode = this.children[index - 1];
            if (referenceNode && referenceNode.nextSibling)
                this.insertBefore(el, referenceNode.nextSibling);
            else 
                this.appendChild(el);
        }

        let buttons = el.querySelectorAll('button');
        buttons.forEach(button => {
            button.addEventListener('click', (event) => this._clicked(event));
        });
        
    }

    _clicked(event) {
        let src = event.target as HTMLElement;
        let id = parseInt(src.getAttribute('data-id'));
        let name = src.getAttribute('data-name');
        let dismiss = src.getAttribute('data-dismiss') === '1';

        let notif = this.notifs.filter((notif) => notif.get('id') === id)[0];
        notif.trigger('click', { target: notif, name: name });

        if (dismiss)
            this.removeNotif(notif);
    }

    removeNotif(notif: Notif) {
        let index = this.notifs.indexOf(notif);
        if (index !== -1) {
            this.notifs.splice(index, 1);
            this._removed(notif);
        }
    }

    _removed(notif: Notif) {
        let el = this.querySelector<HTMLElement>(`[data-id="${notif.attributes.id}"]`);
        let height = el.offsetHeight;
        el.style.height =  '' + height + 'px';
        void(el.offsetHeight);
        el.style.height = '0px';
        el.addEventListener('transitionend', () => {
            el.remove();
            notif.trigger('dismissed', { target: notif });
        }, { once: true });
    }

    notify(options: Partial<NotifData>) {
        options.id = this.nextId++;
        let notif = new Notif(options);
        this.notifs.push(notif);
        this._added(notif);
        return notif;
    }
}

customElements.define('jmv-notifs', View);

export default View;
