
'use strict';

import { h }  from '../../common/htmlelementcreator';
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

        let $container = h('div', { class: 'jmv-variable-new-container var-buttons' });
        this.append($container);

        let $data = h('button', { class: 'button data-variable var-buttons-list-item var-buttons-auto-select' },
            h('div', { class: 'icon' }),
            h('div', { class: 'text' }, _('New data variable')));
        $container.append($data);

        let $computed = h('button', { class: 'button computed-variable var-buttons-list-item var-buttons-auto-select' },
            h('div', { class: 'icon' }),
            h('div', { class: 'text' }, _('New computed variable')));
        $container.append($computed);

        let $recoded = h('button', { class: 'button transformed-variable var-buttons-list-item var-buttons-auto-select' },
            h('div', { class: 'icon' }),
            h('div', { class: 'text' }, _('New transformed variable')));
        $container.append($recoded);

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
