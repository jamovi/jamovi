'use strict';

import tarp from '../utils/tarp';
import MissingValueList from '../vareditor/missingvaluelist';
import VariableModel from '../vareditor/variablemodel';
import { HTMLElementCreator as HTML }  from '../../common/htmlelementcreator';


class MissingValueEditor extends HTMLElement {
    model: VariableModel;
    _undoFormula: any;
    _internalChange: boolean;
    missingValueList: MissingValueList;

    constructor(model: VariableModel) {
        super();
        this.model = model;
        this.classList.add('jmv-missing-value-editor');

        this.title = _('Missing Values');
        this._id = -1;

        window.addEventListener('keydown', event => {
            if ( ! this.missingValueList.classList.contains('super-focus'))
                return;

            let undo = event.key === 'Escape';
            if (event.key === 'Escape' || event.key === 'Enter') {
                if (undo)
                    this.model.set('missingValues', this._undoFormula);

                tarp.hide('missings');
            }
        });

        this._init();
    }

    refresh() {
        this.missingValueList.populate(this.model.get('missingValues'));
        this.missingValueList.querySelector<HTMLElement>('add-missing-value')?.focus();
    }

    isAttached() {
        return document.contains(this);
    }

    _focusFormulaControls() {
        let $contents = this.missingValueList;

        if ($contents.classList.contains('super-focus'))
            return;

        this._undoFormula = this.model.get('missingValues');

        this.model.suspendAutoApply();
        $contents.classList.add('super-focus');
        tarp.show('missings', true, 0.1, 299).then(() => {
            $contents.classList.remove('super-focus');
            this.model.apply();
        }, () => {
            $contents.classList.remove('super-focus');
            this.model.apply();
        });
    }

    _init() {
        let $contents = HTML.parse('<div class="contents"></div>');
        this.append($contents)

        this.missingValueList = new MissingValueList();
        $contents.append(this.missingValueList);

        //this.missingValueList.querySelector<HTMLElement>('add-missing-value').focus();

        this.missingValueList.addEventListener('missing-value-removed', (event: CustomEvent<number>) => {
            let index = event.detail;
            this._focusFormulaControls();
            let values = this.model.get('missingValues');
            let newValues = [];
            if (values !== null) {
                for (let i = 0; i < values.length; i++) {
                    if (i !== index)
                        newValues.push(values[i]);
                }
            }
            this._internalChange = true;
            this.model.set('missingValues', newValues);
        });

        this.missingValueList.addEventListener('missing-values-changed', (event: CustomEvent<number>) => {
            this._focusFormulaControls();
            this._internalChange = true;
            this.model.set('missingValues', this.missingValueList.getValue());
        });

        this.missingValueList.addEventListener('click', (event) => {
            this._focusFormulaControls();
        });

        this.missingValueList.populate(this.model.get('missingValues'));

        this.model.on('change:missingValues', event => {
            if (this._internalChange) {
                this._internalChange = false;
                return;
            }

            if (this.isAttached())
                this.missingValueList.populate(this.model.get('missingValues'));
        });

        this.model.on('change:id', event => {
            if (this.isAttached())
                this.missingValueList.populate(this.model.get('missingValues'));
        });

        this.model.on('change:autoApply', event => {
            if (this.isAttached() && this.model.get('autoApply'))
                tarp.hide('missings');
        });
    }
}

customElements.define('jmv-missing-value-editor', MissingValueEditor);

export default MissingValueEditor;
