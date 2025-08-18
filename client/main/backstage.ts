//
// Copyright (C) 2016 Jonathon Love
//

'use strict';

import path from 'path';

import tarp from './utils/tarp';
import Notify from './notification';

import host from './host';
import type { IShowDialogOptions, IDialogProviderResult } from './host';
import ActionHub from './actionhub';
import { s6e } from '../common/utils';
import focusLoop, { IShortcutTokenOptions } from '../common/focusloop';
import selectionLoop from '../common/selectionloop';

import { UserFacingError, CancelledError } from './errors';

import { IOpenOptions, ISaveOptions, IImportOptions, IBrowseOptions } from './backstage/fsentry';

import { FSEntryListModel, FSEntryListView, FSItemType } from './backstage/fsentry';

import type { WDType, BackstagePanelView } from './backstage/fsentry';

import { FSEntryBrowserView } from './backstage/fsentrybrowserview';
import { HTMLElementCreator as HTML }  from '../common/htmlelementcreator';


function isUrl(s) {
    return s.startsWith('https://') || s.startsWith('http://');
}

import { OneDriveView } from './backstage/onedrive';
import { EventMap, EventDistributor } from '../common/eventmap';
import { IBackstageSupport } from './instance';
import SelectionLoop from '../common/selectionloop';

interface IPlace {
    name: string, 
    title: string,  
    shortcutKey: string, 
    model?: FSEntryListModel, 
    view?: BackstagePanelView,
    action?: () => any;
    separator?: boolean;
}

interface IOp {
    name: string,
    title: string,
    shortcutKey: string,
    places?: IPlace[],
    action?: () => any
}

interface IBackstageModel {
    activated : boolean,
    taskProgress : number,
    operation : string,
    place : string,
    lastSelectedPlace : string,
    ops : IOp[],
    dialogMode : boolean
}

interface IWDOptions {
    defaultPath: string,
    permissions: {
                    write: boolean,
                    read: boolean
                },
    fixed?: boolean
    models?: FSEntryListModel[ ];
    path?: string;
    oswd?: string;
    initialised?: boolean;
}

export class BackstageModel extends EventMap<IBackstageModel> {
    instance: IBackstageSupport;

    _wdData: {[K in WDType]?: IWDOptions}
    _recentsListModel: FSEntryListModel;
    _examplesListModel: FSEntryListModel;
    _pcListModel: FSEntryListModel;
    _pcImportListModel: FSEntryListModel;
    _pcSaveListModel: FSEntryListModel;
    _deviceSaveListModel: FSEntryListModel;
    _pcExportListModel: FSEntryListModel;
    _deviceExportListModel: FSEntryListModel;
    _dialogExportListModel: FSEntryListModel;
    _oneDriveOpenModel: FSEntryListModel;
    _oneDriveSaveModel: FSEntryListModel;

    constructor(instance: IBackstageSupport) {
        super({
            activated : false,
            taskProgress : 0,
            operation : '',
            place : '',
            lastSelectedPlace : '',
            ops : [ ],
            dialogMode : false
        });

        this.instance = instance;

        this.instance.settings().on('change:recents', (event) => this._settingsChanged(event));
        this.instance.settings().on('change:examples', (event) => this._settingsChanged(event));
        this.instance.settings().on('change:mode', (event) => { this.set('ops', this.createOps()); });

        this._wdData = {
            main: {
                defaultPath: '{{Documents}}',
                permissions: {
                    write: true,
                    read: true
                }
            },
            examples: {
                defaultPath: '{{Examples}}',
                permissions: {
                    write: false,
                    read: true
                }
            },
            temp: {
                defaultPath: '{{Temp}}',
                permissions: {
                    write: true,
                    read: false
                },
                fixed: true
            }
        };

        this.on('change:operation', this._opChanged, this);
        this.on('change:place',     this._placeChanged, this);

        this._recentsListModel = new FSEntryListModel();
        this._recentsListModel.on('dataSetOpenRequested', this.tryOpen, this);

        this._examplesListModel = new FSEntryListModel();
        this._examplesListModel.attributes.browseable = false;
        this._examplesListModel.attributes.extensions = false;
        this._examplesListModel.clickProcess = 'open';
        this._examplesListModel.on('dataSetOpenRequested', this.tryOpen, this);
        this._examplesListModel.attributes.wdType = 'examples';
        this.addToWorkingDirData(this._examplesListModel);

        let openExts = [
            { description: _('Data files'), extensions: [
                'omv', 'omt', 'csv', 'tsv', 'txt', 'json', 'ods', 'xlsx', 'sav', 'zsav', 'por',
                'rdata', 'rds', 'dta', 'sas7bdat', 'xpt', 'jasp',
            ]},
            { description: _('jamovi files {ext}', { ext: '(.omv)' }), extensions: ['omv'] },
            { description: _('jamovi templates {ext}', { ext: '(.omt)' }), extensions: ['omt'] },
            { description: _('CSV (Comma delimited) {ext}', { ext: '(.csv, .txt)' }), extensions: ['csv', 'tsv', 'txt'] },
            { description: _('JSON files {ext}', { ext: '(.json, .txt)' }), extensions: ['json', 'txt'] },
            { description: _('Open Document (LibreOffice) {ext}', { ext: '(.ods)' }), extensions: ['ods'] },
            { description: _('Excel {ext}', { ext: '(.xlsx)' }), extensions: ['xlsx'] },
            { description: _('SPSS files {ext}', { ext: '(.sav, .zsav, .por)' }), extensions: ['sav', 'zsav', 'por'] },
            { description: _('R data files {ext}', { ext: '(.RData, .RDS)' }), extensions: ['rdata', 'rds'] },
            { description: _('Stata files {ext}', { ext: '(.dta)' }), extensions: ['dta'] },
            { description: _('SAS files {ext}', { ext: '(.xpt, .sas7bdat)' }), extensions: ['xpt', 'sas7bdat'] },
            { description: _('JASP files {ext}', { ext: '(.jasp)' }), extensions: ['jasp'] },
        ];

        this._pcListModel = new FSEntryListModel();
        this._pcListModel.clickProcess = 'open';
        this._pcListModel.fileExtensions = openExts;
        this._pcListModel.on('dataSetOpenRequested', this.tryOpen, this);
        this._pcListModel.on('browseRequested', this.tryBrowse, this);
        this.addToWorkingDirData(this._pcListModel);

        this._pcImportListModel = new FSEntryListModel();
        this._pcImportListModel.clickProcess = 'import';
        this._pcImportListModel.fileExtensions = openExts;
        this._pcImportListModel.set('multiselect', true);
        this._pcImportListModel.on('dataSetOpenRequested', this.tryOpen, this);
        this._pcImportListModel.on('dataSetImportRequested', this.tryImport, this);
        this._pcImportListModel.on('browseRequested', this.tryBrowse, this);
        this.addToWorkingDirData(this._pcImportListModel);

        this._pcSaveListModel = new FSEntryListModel();
        this._pcSaveListModel.clickProcess = 'save';
        this._pcSaveListModel.fileExtensions = [ { extensions: ['omv'], description: _('jamovi file {ext}', { ext: '(.omv)' }) } ];
        this._pcSaveListModel.on('dataSetOpenRequested', this.tryOpen, this);
        this._pcSaveListModel.on('dataSetSaveRequested', this.trySave, this);
        this._pcSaveListModel.on('browseRequested', this.tryBrowse, this);
        this.addToWorkingDirData(this._pcSaveListModel);

        this._deviceSaveListModel = new FSEntryListModel();
        this._deviceSaveListModel.attributes.wdType = 'temp';
        this._deviceSaveListModel.writeOnly = true;
        this._deviceSaveListModel.clickProcess = 'save';
        this._deviceSaveListModel.fileExtensions = [ { extensions: ['omv'], description: _('jamovi file {ext}', { ext: '(.omv)' }) } ];
        this._deviceSaveListModel.on('dataSetOpenRequested', this.tryOpen, this);

        if (OneDriveView)
            // for now the defined-ness of OneDriveView indicates the cloud version
            this._deviceSaveListModel.on('dataSetSaveRequested', this.tryExport, this);
        else
            this._deviceSaveListModel.on('dataSetSaveRequested', this.trySave, this);

        this._deviceSaveListModel.on('browseRequested', this.tryBrowse, this);
        this.addToWorkingDirData(this._deviceSaveListModel);

        this._pcExportListModel = new FSEntryListModel();
        this._pcExportListModel.clickProcess = 'export';
        this._pcExportListModel.fileExtensions = [
            { extensions: ['pdf'], description: _('PDF Document {ext}', { ext: '(.pdf)' }) },
            { extensions: ['html', 'htm'], description: _('Web Page {ext}', { ext: '(.html, .htm)' }) },
            { extensions: ['omt'], description: _('jamovi template {ext}', { ext: '(.omt)' }) },
            { extensions: ['csv'], description: _('CSV (Comma delimited) {ext}', { ext: '(.csv)' }) },
            { extensions: ['zip'], description: _('LaTeX bundle {ext}', { ext: '(.zip)' }) },
            { extensions: ['rds'], description: _('R object {ext}', { ext: '(.rds)' }) },
            { extensions: ['RData'], description: _('R object {ext}', { ext: '(.RData)' }) },
            { extensions: ['sav'], description: _('SPSS sav {ext}', { ext: '(.sav)' }) },
            // { extensions: ['por'], description: _('SPSS portable {ext}', { ext: '(.por)' }) },  // crashes?!
            { extensions: ['sas7bdat'], description: _('SAS 7bdat {ext}', { ext: '(.sas7bdat)' }) },
            { extensions: ['xpt'], description: _('SAS xpt {ext}', { ext: '(.xpt)' }) },
            { extensions: ['dta'], description: _('Stata {ext}', { ext: '(.dta)' }) },
            { extensions: ['qmd'], description: _('Quarto {ext}', { ext: '(.qmd)' }) },
        ];
        this._pcExportListModel.on('dataSetExportRequested', this.tryExport, this);
        this._pcExportListModel.on('dataSetOpenRequested', this.tryOpen, this);
        this._pcExportListModel.on('browseRequested', this.tryBrowse, this);
        this.addToWorkingDirData(this._pcExportListModel);

        this._deviceExportListModel = new FSEntryListModel();
        this._deviceExportListModel.clickProcess = 'export';
        this._deviceExportListModel.writeOnly = true;
        this._deviceExportListModel.fileExtensions = [
            { extensions: ['pdf'], description: _('PDF Document {ext}', { ext: '(.pdf)' }) },
            { extensions: ['html', 'htm'], description: _('Web Page {ext}', { ext: '(.html, .htm)' }) },
            { extensions: ['omt'], description: _('jamovi template {ext}', { ext: '(.omt)' }) },
            { extensions: ['csv'], description: _('CSV (Comma delimited) {ext}', { ext: '(.csv)' }) },
            { extensions: ['zip'], description: _('LaTeX bundle {ext}', { ext: '(.zip)' }) },
            { extensions: ['rds'], description: _('R object {ext}', { ext: '(.rds)' }) },
            { extensions: ['RData'], description: _('R object {ext}', { ext: '(.RData)' }) },
            { extensions: ['sav'], description: _('SPSS sav {ext}', { ext: '(.sav)' }) },
            // { extensions: ['por'], description: _('SPSS portable {ext}', { ext: '(.por)' }) },  // crashes?!
            { extensions: ['sas7bdat'], description: _('SAS 7bdat {ext}', { ext: '(.sas7bdat)' }) },
            { extensions: ['xpt'], description: _('SAS xpt {ext}', { ext: '(.xpt)' }) },
            { extensions: ['dta'], description: _('Stata {ext}', { ext: '(.dta)' }) },
        ];
        this._deviceExportListModel.on('dataSetExportRequested', this.tryExport, this);
        this._deviceExportListModel.on('dataSetOpenRequested', this.tryOpen, this);
        this._deviceExportListModel.on('browseRequested', this.tryBrowse, this);
        this._deviceExportListModel.attributes.wdType = 'temp';
        this.addToWorkingDirData(this._deviceExportListModel);

        this._dialogExportListModel = new FSEntryListModel();
        this._dialogExportListModel.clickProcess = 'export';
        if ( ! host.isElectron) {
            this._dialogExportListModel.writeOnly = true;
            this._dialogExportListModel.attributes.wdType = 'temp';
        }
        this._dialogExportListModel.fileExtensions = [ ];
        this._dialogExportListModel.on('dataSetExportRequested', this.dialogExport, this);
        this._dialogExportListModel.on('dataSetOpenRequested', this.tryOpen, this);
        this._dialogExportListModel.on('browseRequested', this.dialogBrowse, this);
        this.addToWorkingDirData(this._dialogExportListModel);

        if (OneDriveView) {
            this._oneDriveOpenModel = new FSEntryListModel();
            this._oneDriveOpenModel.clickProcess = 'open';
            this._oneDriveOpenModel.attributes.wdType = 'onedrive';
            this._oneDriveOpenModel.attributes.extensions = false;
            this._oneDriveOpenModel.on('dataSetOpenRequested', this.tryOpen, this);
            this._oneDriveOpenModel.on('cancel', () => { this.set('activated', false); });
            this._oneDriveOpenModel.fileExtensions = [
                '.omv', '.omt', '.csv', '.tsv', '.txt', '.json', '.ods', '.xlsx', '.sav', '.zsav', '.por',
                '.rdata', '.rds', '.dta', '.sas7bdat', '.xpt', '.jasp'];

            this._oneDriveSaveModel = new FSEntryListModel();
            this._oneDriveSaveModel.clickProcess = 'save';
            this._oneDriveSaveModel.attributes.wdType = 'onedrive';
            this._oneDriveSaveModel.attributes.extensions = false;
            this._oneDriveSaveModel.fileExtensions = [ { extensions: ['omv'], description: _('jamovi file {ext}', { ext: '(.omv)' }) } ];
            this._oneDriveSaveModel.on('dataSetSaveRequested', this.trySave, this);
            this._oneDriveOpenModel.on('cancel', () => { this.set('activated', false); });
            this._oneDriveSaveModel.fileExtensions = [];

            this._oneDriveSaveModel.on('change:suggestedPath', event => {
                let dirPath = this._oneDriveSaveModel.get('suggestedPath');
                this.instance.settings().setSetting('onedriveWorkingDir', dirPath);
                this._oneDriveOpenModel.set('suggestedPath', dirPath);
            });
            this.instance.settings().on('change:onedriveWorkingDir', (event) => {
                this._oneDriveSaveModel.set('suggestedPath', this.instance.settings().getSetting('onedriveWorkingDir', ''));
            });

        }


        this._savePromiseResolve = null;

        ActionHub.get('save').on('request', async () => {
            try {
                await this.requestSave();
            }
            catch (e) {
                if ( ! this.instance.attributes.saveFormat) {
                    this.set('activated', true);
                    this.set('operation', 'saveAs');
                }
            }
        });

        ActionHub.get('open').on('request', async () => {
            this.set('activated', true);
            this.set('operation', 'open');
        });

        this.attributes.ops = [

        ];

    }

    async showDialog(type: string, options: IShowDialogOptions): Promise<IDialogProviderResult> {
        this.set('dialogMode', true);
        this._dialogPath = null;
        this._dialogExportListModel.fileExtensions = options.filters;

        let _oldOps = this.get('ops');

        const mode = this.instance.settings().getSetting('mode', 'normal');

        let _ops: IOp[] = [ ];
        if (mode === 'cloud') {
            _ops = [
                {
                    name: type,
                    title: options.title,
                    shortcutKey: '1',
                    places: [
                        /*{
                            name: 'thispc', title: 'jamovi Cloud', separator: true, model: this._pcExportListModel, view: FSEntryBrowserView,
                            action: () => {
                                this._pcExportListModel.suggestedPath = this.instance.get('title');
                            }
                        },*/
                        {
                            name: 'thisdevice', title: _('Download'), shortcutKey: 'd', model: this._dialogExportListModel, view: new FSEntryBrowserView(this._dialogExportListModel),
                            action: () => {
                                this._dialogExportListModel.set('suggestedPath', this.instance.get('title'));
                            }
                        },
                    ]
                }
            ];
        }
        else {
            _ops = [
                {
                    name: type,
                    title: options.title,
                    shortcutKey: '1',
                    places: [
                        {
                            name: 'thispc', title: _('This PC'),  shortcutKey: 'd', model: this._dialogExportListModel, view: new FSEntryBrowserView(this._dialogExportListModel),
                            action: () => {
                                let filePath = this._determineSavePath('main');
                                this._dialogExportListModel.set('suggestedPath', filePath);
                                return this.setCurrentDirectory('main', path.dirname(filePath));
                            }
                        }
                    ]
                }
            ];
        }

        this.set('ops', _ops);

        this.set('activated', true);
        this.set('operation', type);
        await new Promise<void>((resolve) => {
            this.once('change:activated', () => resolve());
        });

        try {
            this.set('ops', _oldOps);
            this.set('dialogMode', false);
            if (this._dialogPath === null)
                return { cancelled: true };
            else
                return { cancelled: false, file: this._dialogPath };
        } catch(e) {
            return { cancelled: true };
        }
    }

    createOps(): IOp[] {
        const mode = this.instance.settings().getSetting('mode', 'normal');

        if (mode === 'cloud') {
            return [
                {
                    name: 'new',
                    title: _('New'),
                    shortcutKey: 'n',
                    action: () => { this.requestOpen(); }
                },
                {
                    name: 'open',
                    title: _('Open'),
                    shortcutKey: 'o',
                    places: [
                        ...OneDriveView ? [{ name: 'onedrive', title: _('One Drive'), shortcutKey: 'o', model: this._oneDriveOpenModel, view: new OneDriveView(this._oneDriveOpenModel), }] : [],
                        { name: 'examples', title: _('Data Library'), shortcutKey: 'l', model: this._examplesListModel, view: new FSEntryBrowserView(this._examplesListModel) },
                        { name: 'thisdevice', title: _('This Device'), shortcutKey: 'd', action: () => { this.tryBrowse({ list: this._pcListModel.fileExtensions, type: 'open' }); } },
                    ]
                },
                // {
                //     name: 'import',
                //     title: _('Import'),
                //     places: [
                //         /*{ name: 'thispc', title: _('jamovi Cloud'),  model: this._pcImportListModel, view: FSEntryBrowserView  },*/
                //         { name: 'thisdevice', title: _('This Device'), action: () => { this.tryBrowse({ list: this._pcImportListModel.fileExtensions, type: 'import' }); } }
                //     ]
                // },
                {
                    name: 'save',
                    title: _('Save'),
                    shortcutKey: 's',
                    action: async () => {
                        try {
                            await this.requestSave();
                        }
                        catch (e) {
                            if ( ! this.instance.attributes.saveFormat) {
                                this.set('activated', true);
                                this.set('operation', 'saveAs');
                            }
                        }
                    }
                },
                {
                    name: 'saveAs',
                    title: _('Save As'),
                    shortcutKey: 'a',
                    places: [
                        ...OneDriveView ? [{
                            name: 'onedrive', title: _('One Drive'), shortcutKey: 'o', model: this._oneDriveSaveModel, view: new OneDriveView(this._oneDriveSaveModel),
                            action: () => {
                                this._oneDriveSaveModel.set('suggestedTitle', this.instance.get('title') + '.omv');
                            }
                        }] : [],
                        {
                            name: 'thisdevice', title: _('Download'), shortcutKey: 'd', model: this._deviceSaveListModel, view: new FSEntryBrowserView(this._deviceSaveListModel),
                            action: () => {
                                this._deviceSaveListModel.set('suggestedPath', this.instance.get('title'));
                            }
                        },
                    ]
                },
                {
                    name: 'export',
                    title: _('Export'),
                    shortcutKey: 'e',
                    places: [
                        {
                            name: 'thisdevice', title: _('Download'), shortcutKey: 'd', model: this._deviceExportListModel, view: new FSEntryBrowserView(this._deviceExportListModel),
                            action: () => {
                                this._deviceExportListModel.set('suggestedPath', this.instance.get('title'));
                            }
                        },
                    ]
                }
            ];
        }
        else {
            return [
                {
                    name: 'new',
                    title: _('New'),
                    shortcutKey: 'n',
                    action: () => { this.requestOpen(); }
                },
                {
                    name: 'open',
                    title: _('Open'),
                    shortcutKey: 'o',
                    action: () => {
                        let place = this.instance.settings().getSetting('openPlace', 'thispc');
                        if (place === 'thispc') {
                            let filePath = this._determineSavePath('main');
                            return this.setCurrentDirectory('main', path.dirname(filePath)).then(() => {
                                this.attributes.place = place;
                            });
                        }
                        else
                            this.attributes.place = place;
                    },
                    places: [
                        { name: 'thispc', title: _('This PC'), shortcutKey: 'p', model: this._pcListModel, view: new FSEntryBrowserView(this._pcListModel) },
                        { name: 'examples', title: _('Data Library'), shortcutKey: 'l', model: this._examplesListModel, view: new FSEntryBrowserView(this._examplesListModel) },
                    ]
                },
                {
                    name: 'import',
                    title: _('Special Import'),
                    shortcutKey: 'i',
                    action: () => {
                        let place = this.instance.settings().getSetting('openPlace', 'thispc');
                        if (place === 'thispc') {
                            let filePath = this._determineSavePath('main');
                            return this.setCurrentDirectory('main', path.dirname(filePath)).then(() => {
                                this.attributes.place = place;
                            });
                        }
                        else
                            this.attributes.place = place;
                    },
                    places: [
                        { name: 'thispc', title: _('This PC'), shortcutKey: 'p', model: this._pcImportListModel, view: new FSEntryBrowserView(this._pcImportListModel) }
                    ]
                },
                {
                    name: 'save',
                    title: _('Save'),
                    shortcutKey: 's',
                    action: async () => {
                        try {
                            await this.requestSave();
                        }
                        catch (e) {
                            if ( ! this.instance.attributes.saveFormat) {
                                this.set('activated', true);
                                this.set('operation', 'saveAs');
                            }
                        }
                    }
                },
                {
                    name: 'saveAs',
                    title: _('Save As'),
                    shortcutKey: 'a',
                    action: () => {
                        let filePath = this._determineSavePath('main');
                        this._pcSaveListModel.set('suggestedPath', filePath);
                        return this.setCurrentDirectory('main', path.dirname(filePath));
                    },
                    places: [
                        { name: 'thispc', title: _('This PC'), shortcutKey: 'p', separator: true, model: this._pcSaveListModel, view: new FSEntryBrowserView(this._pcSaveListModel) },
                    ]
                },
                {
                    name: 'export',
                    title: _('Export'),
                    shortcutKey: 'e',
                    places: [
                        {
                            name: 'thispc', title: _('This PC'), shortcutKey: 'p', separator: true, model: this._pcExportListModel, view: new FSEntryBrowserView(this._pcExportListModel),
                            action: () => {
                                let filePath = this._determineSavePath('main');
                                this._pcExportListModel.set('suggestedPath', this.instance.get('title'));
                                return this.setCurrentDirectory('main', path.dirname(filePath));
                            }
                        }
                    ]
                }
            ];
        }
    }

    addToWorkingDirData(model: FSEntryListModel) {
        let wdType = model.attributes.wdType;
        if (this._wdData[wdType].models === undefined) {
            let wdTypeData = this._wdData[wdType];
            wdTypeData.models = [ ];
            wdTypeData.path = '';
            wdTypeData.initialised = false;
            if ( ! wdTypeData.fixed) {
                this.instance.settings().on('change:' + wdType + 'WorkingDir', (event) => {
                    this._wdData[wdType].defaultPath = this.instance.settings().getSetting(wdType + 'WorkingDir', wdTypeData.defaultPath);
                });
            }
        }
        this._wdData[wdType].models.push(model);
    }

    async tryBrowse(options: IBrowseOptions) {

        const { list, type, filename } = options;

        let filters = [];
        for (let i = 0; i < list.length; i++) {
            let desc = list[i].description === undefined ? list[i].name : list[i].description;
            filters.push({ name: desc, extensions: list[i].extensions });
        }

        const mode = this.instance.settings().getSetting('mode', 'normal');

        let osPath = '';
        if (mode === 'normal') {
            if (this._wdData.main.initialised === false)
                return;
            osPath = this._wdData.main.oswd;
        }

        if (type === 'open') {

            let result = await host.showOpenDialog({
                filters: filters,
                defaultPath: path.join(osPath, '')
            });

            if ( ! result.cancelled) {
                if (result.files) {
                    const file = result.files[0];
                    this.requestOpen({ file });
                }
                else {
                    const path = result.paths[0];
                    this.requestOpen({ path });
                }
            }
        }
        else if (type === 'import') {

            let result = await host.showOpenDialog({
                filters: filters,
                multiple: true,
                defaultPath: path.join(osPath, '')
            });

            if ( ! result.cancelled) {
                if (result.files) {
                    const file = result.files[0];
                    this.requestImport({ files: result.files });
                }
                else {
                    const paths = result.paths;
                    this.requestImport({ paths });
                }
            }
        }
        else if (type === 'save') {

            let result = await host.showSaveDialogExternal({
                filters : filters,
                defaultPath: path.join(osPath, filename),
            });

            if ( ! result.cancelled) {
                this.requestSave({ path: result.file, overwrite: true }).catch((e) => {
                    if ( ! this.instance.attributes.saveFormat) {
                        this.set('activated', true);
                        this.set('operation', 'saveAs');
                    }
                });
            }
        }
    }

    getOp(opName) {
        return this.attributes.ops.find(o => o.name === opName);
    }

    getPlace(opName, placeName) {
        let op = this.getOp(opName);
        if (op) {
            let place = op.places.find(p => p.name === placeName);
            if (place)
                return { op, place };
        }
    }

    getCurrentOp() {
        let names = this.attributes.ops.map(o => o.name);
        let index = names.indexOf(this.attributes.operation);

        if (index !== -1)
            return this.attributes.ops[index];
        else
            return null;
    }

    getCurrentPlace() {

        let op = this.getCurrentOp();
        if (op === null)
            return null;

        let names = op.places.map(o => o.name);
        let index = names.indexOf(this.attributes.place);

        if (index === -1)
            index = 0;

        if (this._opChanged) {
            if (index >= op.places.length)
                index = 0;
            else
                this.attributes.place = op.places[index].name;

            this._opChanged = false;
        }

        return op.places[index];
    }

    tryOpen(options: IOpenOptions) {
        if (options.type === FSItemType.File) {
            this.requestOpen(options);
        }
        else if ([ FSItemType.Folder, FSItemType.Drive, FSItemType.SpecialFolder ].includes(options.type)) {
            let wdType = options.wdType === undefined ? 'main' : options.wdType;
            this.setCurrentDirectory(wdType, options.path, options.type);
        }
    }

    tryImport(options: IImportOptions) {
        this.requestImport(options);
    }

    async trySave(options: ISaveOptions) {
        try {
            await this.requestSave(options);
        }
        catch (e) {
            if ( ! this.instance.attributes.saveFormat) {
                this.set('activated', true);
                this.set('operation', 'saveAs');
            }
        }
    }

    async tryExport(options: ISaveOptions) {
        try {
            options = Object.assign({ }, options, { export: true });
            await this.requestSave(options);
        }
        catch(e) {
            this.set('activated', true);
            this.set('operation', 'export');
        }
    }

    dialogExport(options: ISaveOptions) {
        this._dialogPath = options.path;  // this may constitute a hack
        this.set('activated', false);
    }

    async dialogBrowse(options: IBrowseOptions) {
        const { list, type, filename } = options;
        let filters = [];
        for (let i = 0; i < list.length; i++) {
            let desc = list[i].description === undefined ? list[i].name : list[i].description;
            filters.push({ name: desc, extensions: list[i].extensions });
        }

        const mode = this.instance.settings().getSetting('mode', 'normal');

        let osPath = '';
        if (mode === 'normal') {
            if (this._wdData.main.initialised === false)
                return;
            osPath = this._wdData.main.oswd;
        }

        if (type === 'open') {

            let result = await host.showOpenDialog({
                filters: filters,
                defaultPath: path.join(osPath, '')
            });

            if ( ! result.cancelled)
                this._dialogPath = result.files[0];
        }
        else if (type === 'import') {

            let result = await host.showOpenDialog({
                filters: filters,
                multiple: true,
                defaultPath: path.join(osPath, '')
            });

            if ( ! result.cancelled)
                this._dialogPath = result.files;
        }
        else if (type === 'save') {

            let result = await host.showSaveDialogExternal({
                filters : filters,
                defaultPath: path.join(osPath, filename),
            });

            if ( ! result.cancelled) {
                this._dialogPath = result.file;
            }
        }

        this.set('activated', false);
    }

    async setCurrentDirectory(wdType: WDType, dirPath: string, type: FSItemType = FSItemType.Folder, writeOnly=false) {
        if (dirPath === '')
            dirPath = this._wdData[wdType].defaultPath;

        if (wdType === 'examples' && dirPath.startsWith('{{Examples}}') === false)
            dirPath = this._wdData[wdType].defaultPath;

        if ( writeOnly) {
            let wdData = this._wdData[wdType];
            wdData.path = dirPath;
            wdData.oswd = dirPath;
            for (let model of wdData.models) {
                model.set({
                    error: ``,
                    items: [ ],
                    dirInfo: { path: dirPath, type: FSItemType.Folder },
                    status: 'ok'
                } );
            }

            wdData.initialised = true;
            return;
        }

        // A little delay to the 'loading' status change means that it only enters
        // the loading state if it takes longer then 100ms. This removes the ui flicker from
        // quick responses.
        let statusTimeout = null;
        statusTimeout = setTimeout(() => {
            let wdData = this._wdData[wdType];
            for (let model of wdData.models)
                model.set('status', 'loading' );
            statusTimeout = null;
        }, 100);

        let extensions = [];
        let currentPlace = this.getCurrentPlace();
        if (currentPlace.model.fileExtensions) {
            for (let extDesc of currentPlace.model.fileExtensions)
                for (let ext of extDesc.extensions)
                    extensions.push(ext);
        }

        let promise = this.instance.browse(dirPath, extensions);
        promise = promise.then(async response => {
            if (statusTimeout) {
                clearTimeout(statusTimeout);
                statusTimeout = null;
            }
            let dirPath = response.path;
            let wdData = this._wdData[wdType];
            this.instance.settings().setSetting(wdType + 'WorkingDir', dirPath);
            wdData.path = dirPath;
            wdData.oswd = response.osPath;

            if (dirPath.startsWith('{{Examples}}')) {
                let moduleName = null;
                if (dirPath === '{{Examples}}')
                    moduleName = 'jmv';
                else
                    moduleName = dirPath.match(/^{{Examples}}\/?([\S][^//]*)?/)[1];

                if (moduleName) {
                    let translator = await this.instance.modules().getTranslator(moduleName);
                    for (let item of response.contents) {
                        if (item.description)
                            item.description = translator(item.description);
                        if (item.name)
                            item.name = translator(item.name);
                    }
                }
            }

            for (let model of wdData.models) {
                model.set({
                    error: '',
                    items: response.contents,
                    dirInfo: { path: dirPath, type: type },
                    status: 'ok'
                } );
            }
            wdData.initialised = true;
        }, (error) => {

            if (statusTimeout) {
                clearTimeout(statusTimeout);
                statusTimeout = null;
            }

            if (dirPath === '')
                dirPath = '/';

            let wdData = this._wdData[wdType];
            wdData.path = dirPath;
            wdData.oswd = dirPath;
            for (let model of wdData.models) {
                model.set({
                    error: `${error.message} (${error.cause})`,
                    items: [ ],
                    dirInfo: { path: dirPath, type: FSItemType.Folder },
                    status: 'error'
                } );
            }

            wdData.initialised = true;
        });
        return promise;
    }

    hasCurrentDirectory(wdType: WDType) {
        return this._wdData[wdType].initialised;
    }

    _opChanged() {

        this._opChanged = true;

        let op = this.getCurrentOp();
        if (op === null)
            return;

        let promise = null;
        if ('action' in op)
            promise = op.action();

        if ( ! promise)
            promise = Promise.resolve();

        promise.then(() => {
            let op = this.getCurrentOp();
            if (op === null)
                return;

            if ('places' in op) {
                let names = op.places.map(o => o.name);
                let index = names.indexOf(this.attributes.lastSelectedPlace);

                if (index === -1)
                    index = names.indexOf(this.attributes.place);

                if (index === -1)
                    index = 0;

                if (op.places[index].view === undefined) {
                    index = 0;
                    while (index < op.places.length && op.places[index].view === undefined) {
                        index += 1;
                    }
                    if (index > op.places.length - 1)
                        index = 0;
                }

                let place = op.places[index].name;
                let old = this.attributes.place;

                this.attributes.place = place;
                setTimeout(() => {
                    this.trigger('change:place');
                }, 0);
            }
            else
                this.set('operation', '');
        });

        if (promise.done)  // if Q promise
            promise.done();
    }

    _placeChanged() {
        if (this.attributes.place !== '')
            this.instance.settings().setSetting('openPlace', this.attributes.place);
    }

    async requestOpen(options: IOpenOptions = { path: '' }) {

        let progNotif = new Notify({
            title: _('Opening'),
            duration: 0
        });

        let deactivated = false;
        try {
            let stream = this.instance.open(options);
            for await (let progress of stream) {

                progNotif.set({
                    title: progress.title,
                    progress: [ progress.p, progress.n ],
                    cancel: progress.cancel,
                });
                this.trigger('notification', progNotif);

                if ( ! deactivated) {
                    deactivated = true;
                    this.set('activated', false);
                }
            }
            if ( ! deactivated)
                this.set('activated', false);

            let status = await stream;
            let iid = status.url.match(/([a-z0-9-]+)\/$/)[1];
            if (this.instance.attributes.blank
                    && this.instance.dataSetModel().attributes.edited === false)
                host.navigate(iid);
            else
                host.openWindow(iid);

        }
        catch (e) {
            if (deactivated)
                this.set('activated', true);

            if (e instanceof CancelledError)
                {} // do nothing
            else if (e instanceof UserFacingError)
                this._notify(e);
            else
                this._notify({ message: _('Unable to open'), cause: e.message, type: 'error' });
        }
        finally {
            progNotif.dismiss();
        }
    }

    requestImport(options: IImportOptions) {
        let deactivated = false;
        let deactivate = () => {
            if ( ! deactivated) {
                this.set('activated', false);
                deactivated = true;
            }
        };

        this.instance.import(options.paths)
            .then(deactivate, undefined, deactivate);
    }

    externalRequestSave() {

        if (this.get('activated'))
            throw 'This method can only be called from outside of backstage.';

        let rej: Function;
        let prom = new Promise((resolve, reject) => {
            this._savePromiseResolve = resolve;
            rej = reject;
        }).then(() => {
            this._savePromiseResolve = null;
        });

        this.requestSave().catch(() => {
            this.set('activated', true);
            this.set('operation', 'saveAs');
            this.once('change:activated', () => {
                if (this._savePromiseResolve !== null) {
                    this._savePromiseResolve = null;
                    rej();
                }
            });
        });

        return prom;
    }

    setSavingState(saving) {
        let $button = document.querySelector<HTMLElement>('.silky-bs-fslist-browser-save-button');
        if ( ! $button)
            return;

        let $saveIcon = $button.querySelector<HTMLElement>('.silky-bs-flist-save-icon');
        if (saving) {
            tarp.show('saving', false, 0, 299);
            $button.classList.add('disabled-div');
            $saveIcon.classList.add('saving-file');
        }
        else {
            tarp.hide('saving');
            $button.classList.remove('disabled-div');
            $saveIcon.classList.remove('saving-file');
        }
    }

    async requestSave(options: ISaveOptions | null = null) {

        if (options === null) {
            if (this.instance.attributes.saveFormat) {
                // saveFormat is typically either empty, or 'jamovi'
                // empty means the user hasn't saved it as a .omv file yet, and
                // they need to be prompted where to save.
                // saveFormat can have other values when the data set is loaded
                // from an url, and it needs to be saved back to that url in a
                // particular format
                // it follows that when saveFormat isn't empty, the saveAs
                // shouldn't appear either on save, or on save failure
                options = { path: this.instance.attributes.path, overwrite: true };
            }
            else {
                // shouldn't get here
                throw undefined;
            }
        }

        try {
            this.setSavingState(true);
            // instance.save() itself triggers notifications about the save
            // being successful (if you were wondering why it's not here.)
            let status = await this.instance.save(options);
            this.setSavingState(false);
            if (this._savePromiseResolve !== null)
                this._savePromiseResolve();
            this.set('activated', false);
            this.trigger('saved');

            if (status.download) {
                let source = path.basename(status.path);
                let target = path.basename(options.path);
                let url = `dl/${ source }?filename=${ target }`;
                await host.triggerDownload(url);
            }
        }
        catch (e) {
            this.setSavingState(false);
            throw e;
        }

    }

    _determineSavePath(wdType: WDType) {
        let filePath = this.instance.get('path');
        if (filePath && ! isUrl(filePath))
            return filePath;

        let root = this.instance.settings().getSetting(wdType + 'WorkingDir', this._wdData[wdType].defaultPath);
        return path.join(root, this.instance.get('title') + '.omv');
    }

    _settingsChanged(event) {
        if ('recents' in event.changed)
            this._recentsListModel.set('items', event.changed.recents);
    }

    recentsModel() {
        return this._recentsListModel;
    }

    progressHandler(evt) {
        console.log(evt);
    }

    completeHandler(evt) {
        console.log('complete');
    }

    _notify(error) {
        let notification = new Notify({
            title: error.message,
            message: error.cause,
            duration: 3000,
            type: 'error',
        });
        this.trigger('notification', notification);
    }
}

export class BackstageView  extends EventDistributor {
    //className: 'backstage',
    model: BackstageModel;
    main: BackstageChoices;
    ops: NodeListOf<HTMLElement>;
    opPanel: HTMLElement;
    menuSelection: SelectionLoop;

    constructor(model: BackstageModel) {
        super();

        //this.el = el;
        this.model = model;

        this.addEventListener('preferredWidthChanged', (event: CustomEvent<string>) => {
            this.style.width = event.detail;
        });

        this.setEventMap({
            //'click .silky-bs-back-button' : this.deactivate,
            'keydown' : this._keypressHandle
        });

        this.main = new BackstageChoices(this.model, this ); 
        this.main.classList.add('silky-bs-main');

        let focusToken = focusLoop.addFocusLoop(this, { exitSelector: '.jmv-ribbon-tab[data-tabname="file"]', level: 1, modal: true, allowKeyPaths: true, exitKeys: ['Escape'] } );
        focusToken.on('focusleave', (event) => {
            if (focusLoop.focusMode === 'shortcuts' && focusLoop.shortcutPath.startsWith('F') && focusLoop.shortcutPath.length > 1)
                event.cancel = true;
            else
                this.deactivate();
        });
        
    }

    connectedCallback() {
        this.model.on("change:activated", this._activationChanged, this);
        this.model.on('change:operation', this._opChanged, this);
        this.model.on('change:place',     this._placeChanged, this);
        this.model.on('change:ops',       this.render, this);
        this.model.on('change:dialogMode', this._dialogModeChanged, this);

        this.render();
    }

    disconnectedCallback() {
        this.model.off("change:activated", this._activationChanged, this);
        this.model.off('change:operation', this._opChanged, this);
        this.model.off('change:place',     this._placeChanged, this);
        this.model.off('change:ops',       this.render, this);
        this.model.off('change:dialogMode', this._dialogModeChanged, this);
    }

    _dialogModeChanged() {
        let recents = this.querySelector<HTMLElement>('.silky-bs-op-recents-main');
        if (this.model.get('dialogMode'))
            recents.style.display = 'none';
        else
            recents.style.display = '';
    }

    _keypressHandle(event) {
        if (event.metaKey || event.ctrlKey || event.altKey)
            return;

        switch(event.key) {
            case 'Escape':
                //this.deactivate(true);
                break;
        }
    }

    setPlace(op, place) {
        //this.model.set('op', op.name);

        if ('action' in place)
            place.action();

        if ('view' in place) {
            this.model.set('lastSelectedPlace', place.name);
            this.model.set('place', place.name);
        }
    }

    clickOp(event) {
        this.model.set('operation', event.target.getAttribute('data-op'));
    }

    clickPlace(event) {
        let opName = event.target.getAttribute('data-op');
        let placeName = event.target.getAttribute('data-place');
        let placeInfo = this.model.getPlace(opName, placeName);

        this.setPlace(placeInfo.op, placeInfo.place);
        setTimeout(function () {
            event.target.focus();
        }, 250);

    }

    clickRecent(event) {
        const filePath = event.target.getAttribute('data-path');
        const fileName = event.target.getAttribute('data-name');
        const recentsModel = this.model.recentsModel();
        const options = { path: filePath, title: fileName, type: FSItemType.File };
        recentsModel.requestOpen(options);
    }

    render() {
        this.innerHTML = '';

        this.classList.add('silky-bs');

        let html = '';

        html += '<div class="silky-bs-op silky-bs-op-panel" role="presentation">';
        html += '    <div class="silky-bs-header">';
        html += '        <div class="silky-bs-back">';
        html += `            <div  role="menuitem" aria-label="${_('Close file menu')}" class="silky-bs-back-button bs-menu-list-item bs-menu-action" tabindex="-1" shortcut-key="B"><div></div></div>`;
        html += '        </div>';
        html += '        <div class="silky-bs-logo"></div>';
        html += '    </div>';
        html += '</div>';

        this.opPanel = HTML.parse(html);

        let backButton = this.opPanel.querySelector<HTMLElement>('.silky-bs-back-button');
        let stcOptions: IShortcutTokenOptions = { key: 'Escape', path: 'F', action: event => this.deactivate(), label: backButton.getAttribute('aria-label') };
        //if (params.shortcutPosition)
        //    stcOptions.position = params.shortcutPosition;
        focusLoop.applyShortcutOptions(backButton, stcOptions);

        this.append(this.opPanel);

        this.menuSelection = new selectionLoop('bs-menu', this.opPanel);
        this.menuSelection.on('selected-index-changed', (data) => {
            if (data.target.hasAttribute('data-path'))
                this.clickRecent(data);
            if (data.target.classList.contains('silky-bs-back-button'))
                this.deactivate(data.withMouse);
            else if (data.target.hasAttribute('data-place'))
                this.clickPlace(data);
            else if (data.target.hasAttribute('data-op'))
                this.clickOp(data);
        });

        this.append(this.main);

        let opList = HTML.parse(`<div class="silky-bs-op-list" role="group" aria-label="${_('File menu items')}"></div>`);

        let currentOp = null;
        for (let i = 0; i < this.model.attributes.ops.length; i++) {
            let op = this.model.attributes.ops[i];
            let selected = (op.name === this.model.attributes.operation);
            if (selected)
                currentOp = op;

            let labelId = focusLoop.getNextAriaElementId('label');
            let opElement = HTML.parse(`<div class="silky-bs-menu-item" data-op="${s6e(op.name)}-item" role="none"></div>`);
            let opTitle = HTML.parse(`<div id="${labelId}" class="silky-bs-op-button bs-menu-list-item" role="menuitem" tabindex="-1" data-op="${s6e(op.name)}">${ s6e(op.title) }</div>`);
            opElement.append(opTitle)
            if (op.action)
                opTitle.classList.add('bs-menu-action');
            if (op.shortcutKey) {
                focusLoop.applyShortcutOptions(opTitle, {
                    key: op.shortcutKey.toUpperCase(),
                    path: 'F',
                    action: this.clickOp.bind(this),
                    position: { x: '9%', y: '27%' },
                    label: s6e(op.title)
                });
            }
            if (i === 0)
                this.menuSelection.highlightElement(opTitle);

            if ('places' in op) {
                let opPlaces = HTML.parse(`<div class="silky-bs-op-places" role="group" aria-label="${ s6e(op.title) }"></div>`);
                for (let place of op.places) {
                    opPlaces.append(HTML.parse(`<div class="icon" data-op="${s6e(op.name)}" data-place="${ s6e(place.name) }" role="none"></div>`));
                    let opPlace = HTML.parse(`<div class="silky-bs-op-place bs-menu-list-item" ignore-focus-size tabindex="-1" data-op="${s6e(op.name)}" data-place="${ s6e(place.name) }" role="menuitem" aria-label="${ s6e(place.title) }">${ s6e(place.title) }</div>`);
                    if (place.action)
                        opPlace.classList.add('bs-menu-action');
                    if (place.shortcutKey) {
                        focusLoop.applyShortcutOptions(opPlace, {
                            key: place.shortcutKey.toUpperCase(),
                            path: `F${op.shortcutKey.split('-')[0].toUpperCase()}`,
                            action: this.clickPlace.bind(this),
                            position: { x: '12%', y: '25%' },
                            label: s6e(place.title)
                        });
                    }
                    opPlaces.append(opPlace);
                }
                opElement.append(opPlaces);
            }

            //op.$el = opElement;
            opList.append(opElement);
        }
        this.opPanel.append(opList);

        if ( ! OneDriveView) {
            this.opPanel.append(HTML.parse('<div class="silky-bs-op-separator"></div>'));

            let recentsLabelId = focusLoop.getNextAriaElementId('label');
            let opElement = HTML.parse(`<div class="silky-bs-op-recents-main" role="group" aria-label="${'Recently opened files'}"></div>`);
            if (this.model.get('dialogMode'))
                opElement.style.display = 'none';
            else
                opElement.style.display = '';

            opElement.append(HTML.parse(`<label id="${recentsLabelId}" class="silky-bs-op-header" data-op="Recent">${_('Recent')}</label>`));

            this.opPanel.append(opElement);

            let recentsModel = this.model.recentsModel();
            let recentsList = new FSEntryListView(recentsModel);
            recentsList.classList.add('silky-bs-op-recents');
            recentsList.setAttribute('role', 'presentation');
            opElement.append(recentsList)

            let items = recentsList.querySelectorAll<HTMLElement>('.silky-bs-fslist-entry');
            for (let item of items) {
                item.addEventListener('shortcut-action', (event) => {
                    this.clickRecent(event);
                });
            }
        }

        //this.browseInvoker = this.el.querySelector('.silky-bs-place-invoker');
        this.ops = this.querySelectorAll<HTMLElement>('.silky-bs-menu-item');

        this._opChanged();
    }

    activate(fromMouse=false) {
        this.activeStateChanging = true;
        this.classList.add('activated');

        tarp.show('backstage', true, 0.3).then(
            undefined,
            () => this.deactivate(true));

        this.model.set('activated', true);

        document.body.querySelectorAll('.app-dragable').forEach(el => el.classList.add('ignore'));
        document.getElementById('main').setAttribute('aria-hidden', 'true');
        document.querySelector('.jmv-ribbon-tab.file-tab').setAttribute('aria-expanded', 'true');

        this.menuSelection.selectElement(this.opPanel.querySelector('.silky-bs-back-button'), false, true);

        setTimeout(() => {
            focusLoop.enterFocusLoop(this, { withMouse: fromMouse });
            // fix chrome render issue - force redraw
            this.opPanel.style.zIndex = '1';
        }, 200);
        this.activeStateChanging = false;
    }

    deactivate(fromMouse=false) {
        if (this.deactivating)
            return;
        // fix chrome render issue - reset for future force redraw
        this.opPanel.style.zIndex = 'auto';
        this.deactivating = true;
        this.activeStateChanging = true;

        tarp.hide('backstage');
        this.classList.remove('activated');
        this.classList.remove('activated-sub');

        this.model.set('activated', false);

        this._hideSubMenus();

        this.model.set('operation', '');
        this.model.set('place', '');
        this.style.width = '';

        document.body.querySelectorAll('.app-dragable').forEach(el => el.classList.remove('ignore'));
        document.getElementById('main').setAttribute('aria-hidden', 'false');
        document.querySelector('.jmv-ribbon-tab.file-tab').setAttribute('aria-expanded', 'false');

        
        focusLoop.leaveFocusLoop(this, fromMouse);
        if (fromMouse)
            focusLoop.setFocusMode('default');

        this.deactivating = false;
        this.activeStateChanging = false;
    }

    _activationChanged() {
        if ( ! this.activeStateChanging) {
            if (this.model.get('activated'))
                this.activate(true);
            else
                this.deactivate(true);
        }
    }

    _hideSubMenus() {
        if (this.ops) {
            for (let op of this.ops) {
                //op.querySelector('.silky-bs-op-button').setAttribute('tabindex', '0');
                let subOps = op.querySelector<HTMLElement>('.silky-bs-op-places');
                if (subOps) {
                    subOps.style.height = '';
                    subOps.style.opacity = '';
                    subOps.style.visibility = '';
                }
            }
        }
    }

    _placeChanged() {
        let currentOp = this.model.getCurrentOp();
        let currentPlace = this.model.getCurrentPlace();
        for (let op of this.ops) {
            let places = op.querySelectorAll<HTMLElement>('.silky-bs-op-place');
            for (let place of places) {
                place.classList.remove('selected-place');

                if (currentPlace && 'view' in currentPlace && place.dataset.op === currentOp.name && place.dataset.place === currentPlace.name ) {
                    place.classList.add('selected-place');
                    this.menuSelection.selectElement(place, false, false);
                    op.querySelector('.silky-bs-op-button').setAttribute('tabindex', '0');
                }
            }
        }
    }

    _opChanged() {

        for (let op of this.ops)
            op.classList.remove('selected');

        this._hideSubMenus();

        let operation = this.model.get('operation');

        let op = null;
        for (let opObj of this.model.attributes.ops) {
            if (opObj.name === operation) {
                op = opObj;
                break;
            }
        }

        const mode = this.model.instance.settings().getSetting('mode', 'normal');

        if (mode === 'cloud') {

            let logo = this.querySelector<HTMLElement>('.silky-bs-logo');
            if (op !== null) {
                logo.innerText = op.title;
                logo.classList.add('ops-title');
            }
            else {
                logo.innerText = '';
                logo.classList.remove('ops-title');
            }
        }

        //let $op = this.$ops.filter('[data-op="' + operation + '-item"]');
        let hasPlaces = false;
        if (operation) {
            let opEl = Array.from(this.ops).filter(el => 
                el.getAttribute('data-op') === `${operation}-item`
            )[0];
            opEl.querySelector('.silky-bs-op-button').removeAttribute('tabindex');//.addClass('bs-menu-item-ignore');
            let subOps = opEl.querySelector<HTMLElement>('.silky-bs-op-places');
            if (subOps) {
                let contents = subOps.querySelectorAll<HTMLElement>('.silky-bs-op-place');
                let height = 0;
                for(let place of contents) {
                    height += place.offsetHeight;
                }
                subOps.style.height = `${height}px`;
                subOps.style.opacity = '1';
                subOps.style.visibility = 'visible';
            }

            hasPlaces = op !== null && op.places !== undefined;

            if (hasPlaces)
                opEl.classList.add('selected');
        }

        if (operation && this.model.get('activated') && hasPlaces)
            this.classList.add('activated-sub');
        else
            this.classList.remove('activated-sub');

        setTimeout(() => {
            focusLoop.updateShortcuts({ silent: true });
        }, 200);
    }
}

export class BackstageChoices extends EventDistributor {

    model: BackstageModel;
    parent: any;
    current: BackstagePanelView;
    initalised = false;

    constructor(model, parent) {
        super();

        this.model = model;
        this.parent = parent;
    }

    connectedCallback() {
        this.model.on('change:place', this._placeChanged, this);

        this.innerHTML = '';
        this.append(HTML.create('div', { class: "silky-bs-choices-list" }));
        this._placeChanged();
    }

    disconnectedCallback() {
        this.model.off('change:place', this._placeChanged);
    }

    _placeChanged() {

        let place = this.model.getCurrentPlace();

        let old = this.current;
        if (old) {
            old.classList.remove('fade-in');
            old.remove();
        }
        if (place === null)
            return;

        if ('action' in place)
            place.action();

        if (place.model) {
            place.model.set('title', place.title);
            this.current = place.view;
            this.append(this.current);

            if (this.current.preferredWidth)
                this.parent.style.width = this.current.preferredWidth();
            else
                this.parent.style.width = '';

            if (this.current.setShortcutPath) {
                let op = this.model.getCurrentOp();
                let shortcutPath = 'F' + op.shortcutKey.toUpperCase();
                if (place.shortcutKey)
                    shortcutPath += place.shortcutKey.toUpperCase();
                this.current.setShortcutPath(shortcutPath);
                if (op.places.length === 1)
                    focusLoop.updateShortcuts( { shortcutPath: shortcutPath });
            }

            setTimeout(() => {
                this.current.classList.add('fade-in');
            }, 0);
        }

        if (place.view instanceof FSEntryBrowserView) {
            if (this.model.hasCurrentDirectory(place.model.attributes.wdType) === false) {
                if (place.model.attributes.wdType === 'thispc') {
                    let filePath = this.model._determineSavePath('main');
                    this.model.setCurrentDirectory('main', path.dirname(filePath));
                }
                else {
                    this.model.setCurrentDirectory(place.model.attributes.wdType, '', null, place.model.writeOnly);  // empty string requests default path
                }
            }
            else if (this.current.getAttribute('wdtype') === place.model.attributes.wdType)
                this.current.classList.remove('wd-changing');
        }
    }
}

customElements.define('jmv-choices', BackstageChoices);
customElements.define('jmv-backstage', BackstageView);

