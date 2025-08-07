
'use strict';

import VariableModel from "./variablemodel";
import { HTMLElementCreator as HTML }  from '../../common/htmlelementcreator';

class DataVarLevelWidget extends HTMLElement {

    model: VariableModel;
    readOnly: boolean;
    index: number;
    $value: HTMLElement;
    $label: HTMLInputElement;

    constructor(level, model: VariableModel, i: number, readOnly?: boolean) {
        super();

        this._keydown = this._keydown.bind(this);
        this._focus = this._focus.bind(this);
        this._blur = this._blur.bind(this);

        this.readOnly = readOnly ? true : false;
        this.model = model;

        let diff = level.importValue !== level.label;
        this.index = i;
        this.setAttribute('data-index', i.toString());
        this.setAttribute('data-changed', diff.toString());
        this.classList.add('jmv-variable-editor-level');

        if (level.pinned)
            this.classList.add('pinned');

        let $pin = HTML.parse(`<button class="pin" aria-label="${ _('Pin level') }"></button>`);
        this.append($pin);
        $pin.addEventListener('click', () => {
            setTimeout(() => { // delay so that the parent control click can suspend applying the settings
                let level = null;
                if (this.classList.contains('pinned'))
                    level = this.model.editLevelPinned(this.index, false);
                else
                    level = this.model.editLevelPinned(this.index, true);
                this.updateLevel(level);
            }, 0);

        });
        this.$value = HTML.parse('<div class="jmv-variable-editor-level-value">' + level.importValue + '</div>');
        this.append(this.$value);


        if (this.readOnly === false)
            this.$label = HTML.parse('<input class="jmv-variable-editor-level-label" data-index="' + i + '" type="text" spellcheck="true" value="' + level.label + '" />');
        else
            this.$label = HTML.parse('<div class="jmv-variable-editor-level-label">' + level.label + '</div>');

        this.append(this.$label);

        if (this.readOnly)
            this.$label.classList.add('read-only');

        if ( ! this.readOnly) {
            this.$label.addEventListener('focus', this._focus);
            this.$label.addEventListener('blur', this._blur);
            this.$label.addEventListener('keydown', this._keydown);
        }

        this.updateLevel(level);
    }

    _keydown(event) {
        let keypressed = event.keyCode || event.which;
        if (keypressed === 13) { // enter key
            this.$label.blur();
            event.preventDefault();
            event.stopPropagation();
        }
        else if (keypressed === 27) { // escape key
            this.$label.blur();
            if (this.model.get('changes'))
                this.model.revert();
            event.preventDefault();
            event.stopPropagation();
        }
    }

    _focus(event) {
        this.$label.select();
    }

    _blur(event) {
        let label = this.$label.value;
        let level = this.model.editLevelLabel(this.index, label);
        this.updateLevel(level);
        this.classList.remove('selected');
    }

    updateLevel(level) {

        let levels = [level, ...level.others];
        let labels = [...new Set(levels.map(level => level.label))];
        let imports = [...new Set(levels.map(level => level.importValue))];
        let clash = levels.length > 1 && (labels.length > 1 || labels[0] === null);
        let isNew = level.importValue === null;
        let pinned = level.pinnedChanged ? level.pinned : ! levels.find(element => element.pinned === false);

        if (pinned)
            this.classList.add('pinned');
        else
            this.classList.remove('pinned');

        let label = labels.join(', ');
        if (isNew)
            this.$label.setAttribute('placeholder', label ? label : _("Enter label..."));
        else if (clash)
            this.$label.setAttribute('placeholder', label ? label : _("change label..."));
        else
            this.$label.setAttribute('placeholder', '');

        if (clash && level.modified === false) {
            if (this.readOnly)
                this.$label.innerText = '';
            else
                this.$label.value = '';
        }
        else {
            if (this.readOnly)
                this.$label.innerText = labels[0];
            else
                this.$label.value = labels[0];
        }

        let importValue = imports.join(', ');
        if (this.model._compareWithValue) {
            importValue = level.value.toString();
        }

        let diff = importValue !== label;
        this.setAttribute('data-changed', diff.toString());

        let subtext = importValue;

        this.$value.innerText = subtext;
    }
}

customElements.define('jmv-level', DataVarLevelWidget);

export default DataVarLevelWidget;
