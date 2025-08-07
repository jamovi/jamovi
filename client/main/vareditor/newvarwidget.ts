
'use strict';

import { HTMLElementCreator as HTML }  from '../../common/htmlelementcreator';
import { ColumnType } from '../dataset';
import VariableModel from './variablemodel';

class NewVarWidget extends HTMLElement {

    attached: boolean;
    model: VariableModel;

    constructor(model: VariableModel) {
        super();

        this.model = model;

        this.attached = false;

        this.classList.add('jmv-variable-new-widget', 'NewVarWidget');

        let $container = HTML.parse('<div class="jmv-variable-new-container var-buttons"></div>');
        this.append($container);

        let $data = HTML.parse('<button class="button data-variable var-buttons-list-item var-buttons-auto-select"></button>');
        $container.append($data);
        $data.append(HTML.parse('<div class="icon"</div>'));
        $data.append(HTML.parse(`<div class="text">${_('New data variable')}</div>`));

        let $computed = HTML.parse('<button class="button computed-variable var-buttons-list-item var-buttons-auto-select"></button>');
        $container.append($computed);
        $computed.append(HTML.parse('<div class="icon"</div>'));
        $computed.append(HTML.parse(`<div class="text">${_('New computed variable')}</div>`));

        let $recoded = HTML.parse('<button class="button transformed-variable var-buttons-list-item var-buttons-auto-select"></button>');
        $container.append($recoded);
        $recoded.append(HTML.parse('<div class="icon"</div>'));
        $recoded.append(HTML.parse(`<div class="text">${_('New transformed variable')}</div>`));

        $data.addEventListener('click', (event) => {
            this.model.set('columnType', ColumnType.DATA);
        });

        $computed.addEventListener('click', (event) => {
            this.model.set('columnType', ColumnType.COMPUTED);
        });

        $recoded.addEventListener('click', (event) => {
            this.model.set('columnType', ColumnType.RECODED);
        });
    }

    detach() {
        this.attached = false;
    }

    attach() {
        this.attached = true;
    }
}

customElements.define('jmv-new-variable', NewVarWidget);

export default NewVarWidget;
