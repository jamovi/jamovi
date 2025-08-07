
'use strict';

import { HTMLElementCreator as HTML }  from '../../common/htmlelementcreator';
import VariableModel from './variablemodel';
import DataVarLevelWidget from './datavarlevelwidget';

class  OutputVarWidget extends HTMLElement {
    attached: boolean = false;
    model: VariableModel;
    $levels: HTMLElement;
    $levelItems: NodeListOf<Element>;
    levelCtrls: DataVarLevelWidget[] = [];

    constructor(model: VariableModel) {
        super();

        this.model = model;
        this.classList.add('jmv-variable-editor-outputvarwidget', 'OutputVarWidget');

        let $body = HTML.parse('<div class="jmv-outputvarwidget-body"></div>');
        this.append($body);

        let $left = HTML.parse('<div class="top-box"></div>');
        $body.append($left);

        let $levelsCrtl = HTML.parse('<div class="jmv-variable-editor-levels-control"></div>');
        $body.append($levelsCrtl);

        let $levelsContainer = HTML.parse('<div class="container"></div>');
        $levelsCrtl.append($levelsContainer);

        $levelsContainer.append(HTML.parse(`<div class="title">${_('Levels')}</div>`));
        this.$levels = HTML.parse('<div class="levels"></div>');
        $levelsContainer.append(this.$levels);

        this.$levelItems = this.$levels.querySelectorAll('.jmv-variable-editor-level');

        this.model.on('change:levels', event => this._setOptions(event.changed.levels));
    }

    _setOptions(levels) {
        if ( ! this.attached)
            return;

        if (levels === null || levels.length === 0) {
            this.$levels.innerHTML = '';
            this.levelCtrls = [];
        }
        else if (this.levelCtrls.length > levels.length) {
            for (let i = levels.length; i < this.$levelItems.length; i++)
                this.$levelItems[i].remove();
            this.levelCtrls.splice(levels.length, this.levelCtrls.length - levels.length);
        }

        if (levels) {
            for (let i = 0; i < levels.length; i++) {
                let level = levels[i];
                let levelCtrl = null;
                if (i >= this.levelCtrls.length) {
                    levelCtrl = new DataVarLevelWidget(level, this.model, i, true);

                    this.$levels.append(levelCtrl);
                    this.levelCtrls.push(levelCtrl);
                }
                else {
                    levelCtrl = this.levelCtrls[i];
                    levelCtrl.updateLevel(level);
                }
            }
        }

        this.$levelItems = this.$levels.querySelectorAll('.jmv-variable-editor-level');
    }

    detach() {
        if ( ! this.attached)
            return;

        this.attached = false;
    }

    attach() {
        this.attached = true;
        this._setOptions(this.model.get('levels'));
    }
}

customElements.define('jmv-output-variable-editor', OutputVarWidget)

export default OutputVarWidget;
