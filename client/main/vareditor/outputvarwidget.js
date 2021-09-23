
'use strict';

const $ = require('jquery');
const Backbone = require('backbone');
Backbone.$ = $;
const DataVarLevelWidget = require('./datavarlevelwidget');

const OutputVarWidget = Backbone.View.extend({
    className: 'OutputVarWidget',
    initialize(args) {

        this.attached = false;

        this.$el.empty();
        this.$el.addClass('jmv-variable-editor-outputvarwidget');

        this.$body = $('<div class="jmv-outputvarwidget-body"></div>').appendTo(this.$el);
        this.$left = $('<div class="top-box"></div>').appendTo(this.$body);

        //this.$details = $('<div class="jmv-vareditor-connection-details"><label for="data-type">used by</label></div>').appendTo(this.$left);
        //this.$analysisName = $('<div class="analysis-name" tabindex="0">None</div>').appendTo(this.$details);

        this.$levelsCrtl = $('<div class="jmv-variable-editor-levels-control"></div>').appendTo(this.$body);
        this.$levelsContainer = $('<div class="container"></div>').appendTo(this.$levelsCrtl);
        this.$levelsTitle = $(`<div class="title">${_('Levels')}</div>`).appendTo(this.$levelsContainer);
        this.$levels = $('<div class="levels"></div>').appendTo(this.$levelsContainer);
        this.$levelItems = $();
        this.levelCtrls = [];

        this.model.on('change:levels', event => this._setOptions(event.changed.levels));

        //this._updateConnectionDetails();

    },
    setParent(parent) {
        this.editorWidget = parent;
        this.analyses = parent.analyses;
        //this._updateConnectionDetails();
    },
    /*_updateConnectionDetails() {
        if ( ! this.analysis)
            return;

        let found = false;
        for (let analysis in this.analyses) {
            let outputs = analysis.getUsingOutputs();
            for (let output of outputs) {
                if (output === this.model.name) {
                    found = true;
                    this.connectionDetails = analysis;
                    break;
                }
            }
            if (found)
                break;
        }

        if (found) {
            this.$analysisName.text(this.connectionDetails.name);
        }
        else {
            this.connectionDetails = null;
            this.$analysisName.text('None');
        }

    },*/
    _setOptions(levels) {
        if ( ! this.attached)
            return;

        if (levels === null || levels.length === 0) {
            this.$levels.empty();
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

                    this.$levels.append(levelCtrl.$el);
                    this.levelCtrls.push(levelCtrl);
                }
                else {
                    levelCtrl = this.levelCtrls[i];
                    levelCtrl.updateLevel(level);
                }
            }
        }

        this.$levelItems = this.$levels.find('.jmv-variable-editor-level');
    },

    detach() {
        if ( ! this.attached)
            return;

        this.attached = false;
    },
    attach() {
        this.attached = true;
        this._setOptions(this.model.get('levels'));
    }
});

module.exports = OutputVarWidget;
