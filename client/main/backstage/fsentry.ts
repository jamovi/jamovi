
import SilkyView from '../view';
import $ from 'jquery';
import Backbone from 'backbone';
import pathtools from '../utils/pathtools';
import { s6e } from '../../common/utils';
import focusLoop from '../../common/focusloop';

Backbone.$ = $;

export const FSItemType = {
    File: 0,
    Folder: 1,
    Drive: 2,
    SpecialFolder: 3
};

export interface IOpenOptions {
    path: string;
    title?: string;
    type?: number;
    wdType?: string;
}

export interface ISaveOptions {
    path: string;
    export?: boolean;
    overwrite?: boolean;
    name?: string;
    part?: string;
}

export interface IImportOptions {
    paths: Array<string>;
}

export interface IBrowseOptions {
    list: Array<any>;
    type: 'save' | 'open' | 'import';
    filename?: string;
}

export function isUrl(s) {
    return s.startsWith('https://') || s.startsWith('http://');
}

export const FSEntryListModel = Backbone.Model.extend({
    defaults: {
        items : [ ],
        error: '',
        browseable: true,
        extensions: true,
        multiselect: false,
        wdType: 'main',
        status: 'loading',
        suggestedPath: null,
        suggestedTitle: null
    },
    requestOpen : function(options: IOpenOptions) {
        options.wdType = this.get('wdType');
        this.trigger('dataSetOpenRequested', options);
    },
    requestImport : function(options: IImportOptions) {
        this.trigger('dataSetImportRequested', options);
    },
    requestSave : function(options: ISaveOptions) {
        this.trigger('dataSetSaveRequested', options);
    },
    requestExport : function(options: ISaveOptions) {
        options.export = true;
        this.trigger('dataSetExportRequested', options);
    },
    requestBrowse : function(options: IBrowseOptions) {
        this.trigger('browseRequested', options);
    },
    cancel() {
        this.trigger('cancel', null);
    }
});

export const FSEntryListView = SilkyView.extend({

    initialize : function() {
        if ( ! this.model)
            this.model = new FSEntryListModel();

        this.model.on('change:items', this._render, this);
        this.model.on('change:directory', this._render, this);
        this._render();
    },
    _render : function() {

        this.$el.empty();
        this.$el.addClass('silky-bs-fslist');

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

            let html = `<div role="menuitem" class="silky-bs-fslist-entry bs-menu-list-item" data-path="${s6e(filePath)}" tabindex="-1">`;
            if (name.endsWith('.omv'))
                html += '    <div class="silky-bs-fslist-entry-icon silky-bs-flist-item-omv-icon"></div>';
            else if (name.endsWith('.omt'))
                html += '    <div class="silky-bs-fslist-entry-icon silky-bs-flist-item-omt-icon"></div>';
            else
                html += '   <div class="silky-bs-fslist-entry-icon"></div>';
            html += '   <div class="silky-bs-fslist-entry-group">';
            html += '       <div class="silky-bs-fslist-entry-name">' + s6e(name) + '</div>';
            html += '       <div class="silky-bs-fslist-entry-meta">' + s6e(location) + '</div>';
            html += '   </div>';
            html += '</div>';

            let $item = $(html);
            focusLoop.applyShortcutOptions($item[0], {
                key: `${i + 1}`,
                path: `F`,
                position: { x: '13%', y: '27%' },
                action: (event) => {
                    const target = event.currentTarget;
                    const filePath = $(target).attr('data-path');
                    const fileName = $(target).attr('data-name');
                    const options: IOpenOptions = { path: filePath, title: fileName, type: FSItemType.File };
                    this.model.requestOpen(options);
                }
            });

            this.$el.append($item);
        }

        this.$items = this.$el.find('.silky-bs-fslist-entry');
    }
});


