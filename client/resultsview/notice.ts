'use strict';

import Elem, { ElementData, ElementModel } from './element';

import I18ns from '../common/i18n';
import { HTMLElementCreator as HTML }  from '../common/htmlelementcreator';
import { AnalysisStatus } from './create';

export enum NoticeType {
    WARNING1 = 1,
    WARNING2 = 2,
    INFO = 3,
    ERROR = 0
}

export interface INoticeElementData {
    type: NoticeType,
    content: string
}

export class Model extends Elem.Model<ElementModel<INoticeElementData>> {
    constructor(data?: ElementModel<INoticeElementData>) {
        super(data || 
            {
                name: 'name',
                title: '(no title)',
                element: { type: NoticeType.INFO, content: '' },
                error: null,
                status: AnalysisStatus.ANALYSIS_COMPLETE,
                stale: false,
                options: { },
            }
        );
    }
}


export class NoticeView extends Elem.View<Model> {
    constructor(model: Model, data: ElementData) {
        super(model, data)

        this._handleLinkClick = this._handleLinkClick.bind(this);

        this.classList.add('jmv-results-notice');

        let $html = HTML.parse('<div class="notice-box"><div class="icon"></div><div class="content"></div></div>');
        this.addContent($html);

        this.render();
    }

    type() {
        return 'Notice';
    }

    label() {
        return _('Notice');
    }

    render() {

        let doc = this.model.attributes.element;

        let $icon = this.querySelector('.icon');
        $icon.classList.remove('info', 'error', 'warning-1', 'warning-2');
        switch (doc.type) {
            case 1:
                $icon.classList.add('warning-1');
                break;
            case 2:
                $icon.classList.add('warning-2');
                break;
            case 3:
                $icon.classList.add('info');
                break;
            case 0:
                $icon.classList.add('error');
                break;
        }

        let $content = this.querySelector('.content');
        this.querySelectorAll('a[href]').forEach(el => el.removeEventListener('click', this._handleLinkClick));

        const content = I18ns.get('app').__(doc.content, { prefix: '<strong>', postfix: '</strong>' });

        $content.innerHTML = this.stringToParagraphs(content);

        this.querySelectorAll('a[href]').forEach(el => el.addEventListener('click', this._handleLinkClick));
    }

    stringToParagraphs(input: string): string {
        return input
            .replace(/\r\n/g, "\n")
            .split(/\n{1,}/)
            .map(p => p.trim())
            .filter(p => p.length > 0)
            .map(p => `<p>${p}</p>`)
            .join("");
    }

    _handleLinkClick(event: Event) {
        if (event.target instanceof HTMLElement) {
            let href = event.target.getAttribute('href');
            window.openUrl(href);
        }
    }
}

customElements.define('jmv-results-notice', NoticeView);

