'use strict';

const $ = require('jquery');
const ActionHub = require('./actionhub');
const Backbone = require('backbone');
Backbone.$ = $;

const host = require('./host');
const ResultsPanel = require('./resultspanel');
const focusLoop = require('../common/focusloop');
const jamoviIcon = require('../common/icon');

const ResultsView = Backbone.View.extend({
    className: 'ResultsView',
    initialize: function (args) {
        host.version.then(version => {
            this.icon = new jamoviIcon(version);
            this.$el[0].appendChild(this.icon.el);
        });
        

        this.$el.addClass('jmv-results');
        this.$el.attr('tabindex', '-1');
        focusLoop.applyShortcutOptions(this.$el[0], {
                key: 'R',
                maintainAccessibility: true,
                action: (event) => {
                    focusLoop.enterFocusLoop(this.selectedView.$el[0], { withMouse: false });
                    this.model.set('selectedAnalysis', null);
                },
                position: { x: '15px', y: '15px' }
            }
        );

        this.$richView = $('<div></div>');
        this.$richView.appendTo(this.$el);
        this.richView = new ResultsPanel({
            el: this.$richView,
            iframeUrl: args.iframeUrl,
            model: this.model,
            mode: 'rich' });
        this.richView.on('hideOptions', () => {
            this.trigger('hideOptions');
        });

        this.selectedView = this.richView;

        this.model.set('resultsSupplier', this);

        ActionHub.get('textUndo').on('request', (source) => this.selectedView.annotationAction({ type: 'undo', name: '', value: '' }));
        ActionHub.get('textRedo').on('request', (source) => this.selectedView.annotationAction({ type: 'redo', name: '', value: '' }));
        ActionHub.get('textCopy').on('request', (source) => this.selectedView.annotationAction({ type: 'copy', name: '', value: '' }));
        ActionHub.get('textPaste').on('request', (source) => this.selectedView.annotationAction({ type: 'paste', name: '', value: '' }));
        ActionHub.get('textCut').on('request', (source) => this.selectedView.annotationAction({ type: 'cut', name: '', value: '' }));

        ActionHub.get('textBold').on('request', (source) => this.selectedView.annotationAction({ type: 'format', name: 'bold', value: ! source.value }));
        ActionHub.get('textItalic').on('request', (source) => this.selectedView.annotationAction({ type: 'format', name: 'italic', value: ! source.value }));
        ActionHub.get('textUnderline').on('request', (source) => this.selectedView.annotationAction({ type: 'format', name: 'underline', value: ! source.value }));
        ActionHub.get('textStrike').on('request', (source) => this.selectedView.annotationAction({ type: 'format', name: 'strike', value: ! source.value }));
        ActionHub.get('textSubScript').on('request', (source) => this.selectedView.annotationAction({ type: 'format', name: 'script', value: source.value ? '' : 'sub' }));
        ActionHub.get('textSuperScript').on('request', (source) => this.selectedView.annotationAction({ type: 'format', name: 'script', value: source.value ? '' : 'super' }));
        ActionHub.get('textColor').on('request', (source) => {
            if (source.name === 'textColor')
                this.selectedView.annotationAction({ type: 'authentication', name: 'textColor', value: '' });
            else
                this.selectedView.annotationAction({ type: 'format', name: 'color', value: source.name === 'tcReset' ? '' : source.title });
        });
        ActionHub.get('textBackColor').on('request', (source) => {
            if (source.name === 'textBackColor')
                this.selectedView.annotationAction({ type: 'authentication', name: 'textBackColor', value: '' });
            else
                this.selectedView.annotationAction({ type: 'format', name: 'background', value: source.name === 'bcReset' ? '' : source.title });
        });
        ActionHub.get('textH2').on('request', (source) => this.selectedView.annotationAction({ type: 'format', name: 'header', value: source.value ? '' : 2 }));
        ActionHub.get('textFormula').on('request', () => this.selectedView.annotationAction({ type: 'format', name: 'formula', value: '' }));
        ActionHub.get('textIndentLeft').on('request', () => this.selectedView.annotationAction({ type: 'format', name: 'indent', value: "-1" }));
        ActionHub.get('textIndentRight').on('request', () => this.selectedView.annotationAction({ type: 'format', name: 'indent', value: "+1" }));
        ActionHub.get('textCodeBlock').on('request', (source) => this.selectedView.annotationAction({ type: 'format', name: 'code-block', value: ! source.value }));
        ActionHub.get('textAlignLeft').on('request', () => this.selectedView.annotationAction({ type: 'format', name: 'align', value: '' }));
        ActionHub.get('textAlignCenter').on('request', () => this.selectedView.annotationAction({ type: 'format', name: 'align', value: 'center' }));
        ActionHub.get('textAlignRight').on('request', () => this.selectedView.annotationAction({ type: 'format', name: 'align', value: 'right' }));
        ActionHub.get('textAlignJustify').on('request', () => this.selectedView.annotationAction({ type: 'format', name: 'align', value: 'justify' }));
        ActionHub.get('textListOrdered').on('request', (source) => this.selectedView.annotationAction({ type: 'format', name: 'list', value: source.value ? '' : 'ordered' }));
        ActionHub.get('textListBullet').on('request', (source) => this.selectedView.annotationAction({ type: 'format', name: 'list', value: source.value ? '' : 'bullet' }));
        ActionHub.get('textClear').on('request', () => this.selectedView.annotationAction({ type: 'clean', name: 'script', value: '' }));
        ActionHub.get('textLink').on('request', () => this.selectedView.annotationAction({ type: 'format', name: 'link', value: '' }));
    },
    showWelcome() {

        const iframe = document.createElement('iframe');
        iframe.classList.add('jmv-welcome-iframe');
        iframe.sandbox = 'allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox';
        // hidden to begin with, only show if successful
        iframe.style.display = 'none';

        this.welcome = document.createElement('div');
        this.welcome.classList.add('jmv-welcome-panel');

        this.welcome.appendChild(iframe);
        this.$el[0].appendChild(this.welcome);

        host.version.then((version) => {
            iframe.src = `https://www.jamovi.org/welcome/?v=${ version }&p=${ host.os }&plan=${ localStorage.getItem("plan") }`;
        });

        const messageHandler = (event) => {
            // wait for a ready message from the iframe's content
            // only a successful load of the page will lead to this
            // anything else, i.e. a 500 will not be made visible
            if (event.source === iframe.contentWindow
                    && event.data.status === 'ready') {
                iframe.style.display = null;
                window.removeEventListener('message', messageHandler);
            }
        };
        window.addEventListener('message', messageHandler);

        this.hidePlaceHolder();

        this.model.analyses().once('analysisCreated', (event) => {
            this.hideWelcome();
        });
    },
    hideWelcome() {
        if (this.welcome)
            this.welcome.classList.add('jmv-welcome-panel-hidden');
        
        this.hidePlaceHolder();
    },
    hidePlaceHolder() {
        if (this.icon)
            this.icon.el.classList.add('hidden');
    },
    getAsHTML(options, part) {
        return this.richView.getAsHTML(options, part);
    },
});

module.exports = ResultsView;
