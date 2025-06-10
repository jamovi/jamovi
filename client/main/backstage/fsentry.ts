import pathtools from '../utils/pathtools';
import { s6e } from '../../common/utils';
import focusLoop from '../../common/focusloop';
import { EventMap, EventDistributor } from '../../common/eventmap';
import type { IExtensionGroup } from '../host';
import { HTMLElementCreator as HTML }  from '../../common/htmlelementcreator';

export enum FSItemType {
    File = 0,
    Folder = 1,
    Drive = 2,
    SpecialFolder = 3
};

export type WDType  = 'main' | 'thispc' | 'examples' | 'temp' | 'onedrive'

export interface IOpenOptions {
    path: string;
    title?: string;
    type?: FSItemType;
    wdType?: WDType;
}

export interface ISaveOptions {
    path: string;
    export?: boolean;
    overwrite?: boolean;
    name?: string;
    part?: string;
    format?: string;
}

export interface IImportOptions {
    paths: Array<string>;
}


export type IBrowseType = 'save' | 'open' | 'import';

export interface IBrowseOptions {
    list: Array<any>;
    type: IBrowseType;
    filename?: string;
}

export function isUrl(s) {
    return s.startsWith('https://') || s.startsWith('http://');
}

export interface IFSItem {
    name: string,
    path: string,
    type: FSItemType,
    isExample: boolean,
    tags: string[],
    description: string,
    isUrl: boolean,
    skipExtensionCheck: boolean,
    location?: string,
    license?: string
}

export interface IFSEntryModel {
    title: string,
    items : IFSItem[],
    error: string,
    browseable: boolean,
    extensions: boolean,
    multiselect: boolean,
    wdType: WDType,
    status: 'ok' | 'loading' | 'error',
    suggestedPath: string,
    suggestedTitle: string,
    dirInfo: { path: string, type: FSItemType }
}

export interface IBackstagePanelView {
    preferredWidth?: () => void,
    setShortcutPath?: (shortcutPath: string) => void
}

export type BackstagePanelView = EventDistributor & IBackstagePanelView;

export type clickProcessType = 'open' | 'import' | 'save' | 'export' | null;

export class FSEntryListModel extends EventMap<IFSEntryModel> {
    clickProcess: clickProcessType = null;
    writeOnly = false;
    fileExtensions: IExtensionGroup[];

    constructor() {
        super({
            title: null,
            items : [ ],
            error: '',
            browseable: true,
            extensions: true,
            multiselect: false,
            wdType: 'main',
            status: 'loading',
            suggestedPath: null,
            suggestedTitle: null,
            dirInfo: undefined
        });
    }
   
    requestOpen(options: IOpenOptions) {
        options.wdType = this.get('wdType');
        this.trigger('dataSetOpenRequested', options);
    }

    requestImport(options: IImportOptions) {
        this.trigger('dataSetImportRequested', options);
    }

    requestSave(options: ISaveOptions) {
        this.trigger('dataSetSaveRequested', options);
    }

    requestExport(options: ISaveOptions) {
        options.export = true;
        this.trigger('dataSetExportRequested', options);
    }

    requestBrowse(options: IBrowseOptions) {
        this.trigger('browseRequested', options);
    }

    cancel() {
        this.trigger('cancel', null);
    }
}

export class FSEntryListView extends EventDistributor {
    model: FSEntryListModel;

    constructor(model: FSEntryListModel) {
        super();
        this.model = model;
    }

    connectedCallback() {
        this.model.on('change:items', this._render, this);
        this.model.on('change:directory', this._render, this);
        
        this.innerHTML = '';
        this._render();
    }

    disconnectedCallback() {
        this.model.off('change:items', this._render, this);
        this.model.off('change:directory', this._render, this);
    }

    _render() {

        this.innerHTML = '';
        this.classList.add('silky-bs-fslist');

        let items = this.model.get('items');

        for (let i = 0; i < items.length; i++) {
            let item = items[i];

            let name = item.name;
            let filePath = item.path;
            let location = '';

            if (item.location) {
                location = pathtools.normalise(item.location);
                location = location.replace(/\//g, ' \uFE65 ');
            }
            else if (item.description) {
                location = item.description;
            }

            let labelId = focusLoop.getNextAriaElementId('label');
            let html = `<div role="menuitem" aria-labelledby="${labelId}" class="silky-bs-fslist-entry bs-menu-list-item" data-path="${s6e(filePath)}" tabindex="-1">`;
            if (name.endsWith('.omv'))
                html += '    <div class="silky-bs-fslist-entry-icon silky-bs-flist-item-omv-icon"></div>';
            else if (name.endsWith('.omt'))
                html += '    <div class="silky-bs-fslist-entry-icon silky-bs-flist-item-omt-icon"></div>';
            else
                html += '   <div class="silky-bs-fslist-entry-icon"></div>';
            html += `   <div id="${labelId}" class="silky-bs-fslist-entry-group">`;
            html += '       <div class="silky-bs-fslist-entry-name">' + s6e(name) + '</div>';
            html += '       <div class="silky-bs-fslist-entry-meta">' + s6e(location) + '</div>';
            html += '   </div>';
            html += '</div>';

            let itemElement = HTML.parse(html);
            focusLoop.applyShortcutOptions(itemElement, {
                key: `${i + 1}`,
                path: `F`,
                position: { x: '13%', y: '27%' },
                action: (event) => {
                    const target = event.currentTarget;
                    const filePath = target.getAttribute('data-path');
                    const fileName = target.getAttribute('data-name');
                    const options: IOpenOptions = { path: filePath, title: fileName, type: FSItemType.File };
                    this.model.requestOpen(options);
                }
            });

            this.append(itemElement);
        }
    }
}

customElements.define('jmv-filelist', FSEntryListView);


