'use strict';

import _Framesg from 'framesg';
let Framesg = _Framesg;
if ('default' in Framesg) // this import is handled differently between browserify and vite
    Framesg = Framesg.default;

import host from './host';
import I18ns, { I18nData } from '../common/i18n';

import focusLoop from '../common/focusloop';
import { HTMLElementCreator as HTML } from '../common/htmlelementcreator';
import { EventEmitter } from 'tsee';
import DataSetViewModel from './dataset';
import { Analysis } from './analyses';
import Settings from './settings';
import Instance from './instance';
import Store from './store';

interface IFrameCommsApi {
    frameDocumentReady: (data: any) => void;
    onFrameMouseEvent: (data: any) => void;
    onOptionsChanged: (data: any) => void;
    hideOptions: (data: any) => void;
    requestAction: (data: any) => any;
    optionsViewReady: (ready: boolean) => void;
    requestData: (data: any) => any;
    action: (data: { type: 'findModule', data: any }) => void;
}

class AnalysisResources extends EventEmitter {
    frame: HTMLIFrameElement;
    key: string;
    optionsViewReady: boolean;
    name: string;
    dataSetModel: DataSetViewModel
    analysis: Analysis;
    ready: Promise<any>;
    def: string | { error: string, data: any };
    i18nDef: I18nData;
    options: { [name: string]: string };
    frameComms: typeof Framesg;
    frameCommsApi: IFrameCommsApi;
    notifyDocumentReady: () => void;
    notifyAborted: (reason?: any) => void;
    jamoviVersion: string;

    constructor(analysis: Analysis, target: HTMLElement, iframeUrl: string, instanceId: string, public settings: Settings, public store: Store) {
        super();

        this.analysis = analysis;
        this.name = analysis.name;
        this.options = null;
        this.def = null;
        this.optionsViewReady = false;

        this.key = analysis.ns + '-' + analysis.name;

        let element = `<iframe id="${this.key}"
                name="${this.key}"
                sandbox="allow-scripts allow-same-origin"
                src="${iframeUrl}${instanceId}/"
                class="silky-options-control silky-hidden-options-control"
                style="overflow: hidden; box-sizing: border-box;"
                aria-label="${analysis.name} Options"></iframe>`;

        this.frame = HTML.parse(element);
        target.append(this.frame);

        this.settings.on('change:decSymbol', () => this.updateSettings());

        this.frameCommsApi = {
            action: action => {
                switch (action.type) {
                    case 'findModule':
                        const moduleName = this.analysis.ns;
                        this.store.show(1, `module::${moduleName}`);
                }
            },

            frameDocumentReady: data => {
                this.notifyDocumentReady();
                this.emit("frameReady");
            },

            onFrameMouseEvent: data => {
                

                const iframe = document.querySelector('iframe.silky-options-control');

                const rect = iframe.getBoundingClientRect();
                const scrollLeft = window.scrollX || window.pageXOffset;
                const scrollTop = window.scrollY || window.pageYOffset;

                const pos = {
                    left: rect.left + scrollLeft,
                    top: rect.top + scrollTop
                };

                data.pageX += pos.left;
                data.pageY += pos.top;

                let event = new MouseEvent( data.eventName, data);
                document.dispatchEvent(event);
            },

            onOptionsChanged: data => {
                this.analysis.setOptions(data.values);

                for (let name in data.properties) {
                    let pData = data.properties[name];
                    for (let i = 0; i < pData.length; i++) {
                        this.analysis.options.setProperty(name, pData[i].name, pData[i].key, pData[i].value);
                    }
                }
            },

            hideOptions: data => {
                this.emit("hideOptions");
            },

            requestAction: data => {
                if (data.requestType === "createColumn") {
                    let column = this.dataSetModel.getFirstEmptyColumn();
                    return this.dataSetModel.changeColumn(column.id, data.requestData ).then(() => { return column.name; });
                }
            },

            optionsViewReady: ready => {
                this.optionsViewReady = ready;
            },

            requestData: data => {
                if (data.requestType === "columns") {
                    let columns = this.dataSetModel.get('columns');
                    let columnData = [];
                    for (let i = 0; i < columns.length; i++) {
                        if (columns[i].columnType === 'none')
                            continue;
                        columnData.push({ name: columns[i].name, id: columns[i].id, measureType: columns[i].measureType, dataType: columns[i].dataType, columnType:  columns[i].columnType, outputAnalysisId: columns[i].outputAnalysisId });
                    }
                    data.columns = columnData;
                }
                else if (data.requestType === "column") {
                    let found = false;
                    let columns = this.dataSetModel.get('columns');
                    for (let i = 0; i < columns.length; i++) {
                        if ((data.requestData.columnId !== undefined && columns[i].id === data.requestData.columnId) ||
                            (data.requestData.columnName !== undefined && columns[i].name === data.requestData.columnName)) {
                            found = true;
                            for (let p = 0; p < data.requestData.properties.length; p++) {
                                let propertyName = data.requestData.properties[p];
                                data[propertyName] = columns[i][propertyName];
                            }
                            break;
                        }
                    }
                    data.columnFound = found;
                }
                else
                    data.error = "Request type unknown";
                return data;
            }
        };

        this.frameComms = new Framesg(this.frame.contentWindow, this.key, this.frameCommsApi);

        
        this.notifyDocumentReady = null;

        this.ready = Promise.all([
            analysis.ready.then(() => {
                return new Promise<string | { error: string, data: any }>((resolve, reject) => {
                    if (analysis.missingModule) {
                        let version = analysis.modules._moduleDefns[analysis.ns]._version;
                        this.def = { error: _('Missing or incompatible module'), data: { moduleName: analysis.ns, analysisName: analysis.name, version: version.substring(0, version.lastIndexOf('.')) } };
                        resolve(this.def);
                    }
                    else if (analysis.uijs) {
                        this.def = analysis.uijs;
                        this.i18nDef = analysis.i18n;
                        resolve(analysis.uijs);
                    }
                    else {
                        // shouldn't get here
                        let url = '../analyses/' + analysis.ns + '/' + analysis.name.toLowerCase();

                        return fetch(url).then(response => response.text())
                            .then(script => {
                                this.def = script;
                                resolve(script);
                            })
                            .catch(error => {
                                // Optional: handle error or reject if needed
                                console.error("Fetch error:", error);
                            });
                    }
                });
            }),
            new Promise<void>((resolve, reject) => {
                this.notifyDocumentReady = resolve;
                this.notifyAborted = reject;
            }),
            host.version.then((version: string) => {
                this.jamoviVersion = version;
            })
        ]).then(() => {
            return this.frameComms.send("setOptionsDefinition", this.def, this.i18nDef, I18ns.get('app').localeData, this.jamoviVersion, analysis.id, focusLoop.focusMode);
        });
    }

    setAnalysisTitle(title: string) {
        if ( ! this.analysis.missingModule)
            this.frameComms.send("setTitle", title);
    }

    updateSettings() {
        this.frameComms.send("updateSettings", {
            decSymbol: this.settings.getSetting('decSymbol', '.')
        });
    }

    destroy() {
        this.frame.remove();
        //this.frameComms.disconnect(); //This function doesn't yet exist which is a problem and a slight memory leak, i have submitted an issue to the project.
        //Temp work around, kind of.
        this.frameComms.receiveNamespace = "deleted"; //this will result in the internal message function exiting without executing any potentially problematic commands. However, the event handler is still attached and this is a problem.
    }

    setDataModel(dataSetModel: DataSetViewModel) {
        this.dataSetModel = dataSetModel;
    }

    initializeView() {
        this.optionsViewReady = false;
        this.ready.then(() => {
            this.analysis.ready.then(() => {
                this.updateData(this.analysis.options.getValues());
            });
        });  
    }

    updateData(options: { [name: string]: any }) {
        this.options = options;
        if (!this.analysis.missingModule)
            this.frameComms.send("initialiseOptions", { id: this.analysis.id, options: this.options });
    }

    updateOptions(values) {
        if ( ! this.analysis.missingModule)
            this.frameComms.send("updateOptions", values);
    }

    notifyDataChanged(dataType, dataInfo) {
        this.frameComms.send("dataChanged", { dataType: dataType, dataInfo: dataInfo });
    }

    abort() {
        this.notifyAborted("Aborted");
    }
}

class OptionsPanel {
    _currentResources: AnalysisResources;
    _analysesResources: { [key: string]: AnalysisResources } ;
    dataSetModel: DataSetViewModel

    constructor(public el: HTMLElement, public model: Instance, public iframeUrl: string, public store: Store ) {

        this._analysesResources = {};

        this._currentResources = null;

        window.addEventListener('resize', () => { this.resizeHandler(); });
        el.addEventListener('resized', () => { this.resizeHandler(); });

        model.analyses().on('analysisHeadingChanged', this._analysisNameChanged, this);

        model.analyses().on('analysisOptionsChanged', this._optionsChanged, this);

        this.render();
    }

    setFocus() {
        if (this._currentResources) {
            this._currentResources.frame.focus();
           setTimeout(() => { // needed for firefox cross iframe focus
                this._currentResources.frame.contentWindow.focus();
            }, 100);
        }
    }

    _optionsChanged(analysis: Analysis, incoming?: boolean) {
        if (incoming) {
            let analysesKey = analysis.ns + "-" + analysis.name;
            let resources = this._analysesResources[analysesKey];
            if (resources && analysis.id === resources.analysis.id)
                resources.updateOptions(analysis.options.getValues());
        }
    }

    _analysisNameChanged(analysis: Analysis) {
        let analysesKey = analysis.ns + "-" + analysis.name;
        let resources = this._analysesResources[analysesKey];
        if (resources)
            resources.setAnalysisTitle(analysis.getHeading());
    }

    reloadAnalyses(moduleName: string) {
        let analysis = null;
        if (this._currentResources !== null && this._currentResources.analysis.ns === moduleName) {
            analysis = this._currentResources.analysis;
            this.removeMsgListeners(this._currentResources);
            this._currentResources.abort();
            this._currentResources.frame.classList.add('silky-hidden-options-control');
            this._currentResources = null;
        }

        for (let analysesKey in this._analysesResources) {
            if (this._analysesResources[analysesKey].analysis.ns === moduleName) {
                this._analysesResources[analysesKey].destroy();
                delete this._analysesResources[analysesKey];
            }
        }

        if (analysis !== null) {
            this.setAnalysis(analysis);
        }
    }

    setAnalysis(analysis: Analysis) {
        let analysesKey = analysis.ns + "-" + analysis.name;

        let resources = this._analysesResources[analysesKey];
        let createdNew = false;

        if (resources === undefined) {
            resources = new AnalysisResources(analysis, this.el, this.iframeUrl, this.model.instanceId(), this.model.settings(), this.store);
            resources.setDataModel(this.dataSetModel);
            this._analysesResources[analysesKey] = resources;
            createdNew = true;
        }

        if (this._currentResources !== null && resources !== this._currentResources) {
            this.removeMsgListeners(this._currentResources);
            this._currentResources.abort();
            this._currentResources.frame.classList.add('silky-hidden-options-control');
            this._currentResources.frame.style.height = '0px';
            this._currentResources = null;
        }

        resources.analysis = analysis;
        resources.initializeView();
        
        if (this._currentResources === null) {
            this._currentResources = resources;
            this.addMsgListeners(this._currentResources);
            this.updateContentHeight();
        }
        if (this._currentResources !== null) {
            this._currentResources.frame.style.height = '';
            this._currentResources.frame.classList.remove('silky-hidden-options-control');
            if (focusLoop.inAccessibilityMode())
                focusLoop.transferFocus(this._currentResources.frame);
        }
    }

    notifyOfDataChange(resource: AnalysisResources, dataType: 'columns', dataInfo: any) {
        resource.ready.then(() => {
            resource.notifyDataChanged(dataType, dataInfo);
        });
    }

    setDataSetModel(dataSetModel: DataSetViewModel) {
        this.dataSetModel = dataSetModel;

        this.dataSetModel.on('dataSetLoaded', event => {
            let data = { measureTypeChanged: true, dataTypeChanged: true, nameChanged: true, levelsChanged: true, countChanged: true };
            for (let analysesKey in this._analysesResources)
                this.notifyOfDataChange(this._analysesResources[analysesKey], 'columns', data);
        });

        this.dataSetModel.on('columnsChanged', event => {

            let data = { measureTypeChanged: false, dataTypeChanged: false, nameChanged: false, levelsChanged: false, countChanged: true };
            for (let changes of event.changes) {
                if (changes.measureTypeChanged)
                    data.measureTypeChanged = true;
                if (changes.dataTypeChanged)
                    data.dataTypeChanged = true;
                if (changes.nameChanged)
                    data.nameChanged = true;
                if (changes.levelsChanged)
                    data.levelsChanged = true;
                if (changes.deleted || changes.created)
                    data.countChanged = true;
            }

            if (data.measureTypeChanged || data.dataTypeChanged || data.nameChanged || data.levelsChanged || data.countChanged) {
                for (let analysesKey in this._analysesResources)
                    this.notifyOfDataChange(this._analysesResources[analysesKey], 'columns', data);
            }

        });
    }

    render() {
        this.el.innerHTML = '';
    }

    updateContentHeight() {
        if (this._currentResources === null)
            return;

        let frame = this._currentResources.frame;
        const offsetParent = frame.offsetParent;
        const pos = {
            top: frame.offsetTop,
            left: frame.offsetLeft
        };

        let style = window.getComputedStyle(this.el);

        let height = parseFloat(style.height)
            - parseFloat(style.paddingTop)
            - parseFloat(style.paddingBottom)
            - parseFloat(style.borderTopWidth)
            - parseFloat(style.borderBottomWidth);

        let value = height - pos.top;

        frame.style.height = `${value}px`;
    }

    addMsgListeners(resource: AnalysisResources) {
        resource.on("hideOptions", () => {
            this.model.set('selectedAnalysis', null);
        });

        resource.on("frameReady", () => {
            this.updateContentHeight();
        });
    }

    removeMsgListeners(resource: AnalysisResources) {
        resource.removeAllListeners("hideOptions");
        resource.removeAllListeners("frameReady");
    }

    hideOptions(clearSelected?: boolean) {
        if (clearSelected === undefined)
            clearSelected = true;
        if (clearSelected) {
            let selectedAnalysis = this.model.attributes.selectedAnalysis;
            if (selectedAnalysis !== null && typeof(selectedAnalysis) !== 'string')
                this.model.set('selectedAnalysis', null);
        }

        let event = new CustomEvent('splitpanel-hide');
        this.el.dispatchEvent(event);
    }

    frameReady(data) {
        this.updateContentHeight();
    }

    resizeHandler() {
        this.updateContentHeight();
    }
}

export default OptionsPanel;
