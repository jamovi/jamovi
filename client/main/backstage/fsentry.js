
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
        suggestedPath: null
    },
    requestOpen : function(filePath, title, type, options={}) {
        this.trigger('dataSetOpenRequested', filePath, title, type, this.get('wdType'), options);
    },
    requestImport : function(paths) {
        this.trigger('dataSetImportRequested', paths, FSItemType.File, this.get('wdType'));
    },
    requestSave : function(filePath, type, options={}) {
        this.trigger('dataSetSaveRequested', filePath, type, this.get('wdType'), options);
    },
    requestExport : function(filePath, type, options={}) {
        this.trigger('dataSetExportRequested', filePath, type, this.get('wdType'), options);
    },
    requestBrowse : function(list, type, filename) {
        this.trigger('browseRequested', list, type, filename, this.get('wdType'));
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
                    let target = event.currentTarget;
                    let filePath = $(target).attr('data-path');
                    let fileName = $(target).attr('data-name');
                    this.model.requestOpen(filePath, fileName, FSItemType.File);
                }
            });

            this.$el.append($item);
        }

        this.$items = this.$el.find('.silky-bs-fslist-entry');
    }
});


