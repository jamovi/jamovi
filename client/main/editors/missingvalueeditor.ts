'use strict';

import tarp from '../utils/tarp';
import MissingValueList from '../vareditor/missingvaluelist';
import VariableModel from '../vareditor/variablemodel';
import { HTMLElementCreator as HTML }  from '../../common/htmlelementcreator';
import interactionManager, { type FocusLoop } from '../../common/interactionmanager';


class MissingValueEditor extends HTMLElement {
    model: VariableModel;
    _undoFormula: any;
    _internalChange: boolean;
    missingValueList: MissingValueList;
    private loop: FocusLoop;

    constructor(model: VariableModel) {
        super();
        this.model = model;
        this.classList.add('jmv-missing-value-editor');

        this.title = _('Missing Values');
        this._id = -1;

        this._init();
    }

    refresh() {
        this.missingValueList.populate(this.model.get('missingValues'));
        //this.missingValueList.focus();
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
            this._closeFormulaControls();
        }, () => {
            this._closeFormulaControls();
        });
    }

    _closeFormulaControls() {
        let $contents = this.missingValueList;

        if ( ! $contents.classList.contains('super-focus'))
            return;

        $contents.classList.remove('super-focus');
        this.loop.deactivate({ source: 'programmatic' });
        this.model.apply();
    }

    _init() {
        let $contents = HTML.parse('<div class="contents"></div>');
        this.append($contents)

        this.missingValueList = new MissingValueList();
        $contents.append(this.missingValueList);

        this.loop = interactionManager.registerLoop(this.missingValueList, {
            level: 2,
            exitSelector: this.missingValueList,
            keyToEnter: true,
            modal: true,
            exitKeys: ['Escape'],
        });
        this.loop.on('activate', () => this._focusFormulaControls());
        this.loop.on('deactivate', () => tarp.hide('missings'));


        this.missingValueList.addEventListener('missing-value-removed', (event: CustomEvent<number>) => {
            let index = event.detail;
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
            this._internalChange = true;
            this.model.set('missingValues', this.missingValueList.getValue());
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
