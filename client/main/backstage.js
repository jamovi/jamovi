//
// Copyright (C) 2016 Jonathon Love
//

'use strict';

const SilkyView = require('./view');
const $ = require('jquery');
const Backbone = require('backbone');
const path = require('path');
Backbone.$ = $;

const tarp = require('./utils/tarp');
const pathtools = require('./utils/pathtools');
const Notify = require('./notification');

const host = require('./host');
const ActionHub = require('./actionhub');
const { s6e } = require('../common/utils');
const focusLoop = require('../common/focusloop');
const selectionLoop = require('../common/selectionloop');

const JError = require('./errors').JError;
const CancelledError = require('./errors').CancelledError;


function crc16(s) {
    if (s.length === 0)
        return 0;
    let crc = 0xFFFF;
    let n = s.length;
    let sum = 0;
    let x = 0;
    let j = 0;
    for (let i = 0; i < n; i++) {
        j = s.charCodeAt(i);
        sum += ((i + 1) * j);
        x = ((crc >> 8) ^ j) & 0xFF;
        x ^= x >> 4;
        crc = ((crc << 8) ^ (x << 12) ^ (x << 5) ^ x) & 0xFFFF;
    }
    return crc;
}

function isUrl(s) {
    return s.startsWith('https://') || s.startsWith('http://');
}

const FSEntryListModel = Backbone.Model.extend({
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
    requestOpen : function(filePath, title, type) {
        this.trigger('dataSetOpenRequested', filePath, title, type, this.get('wdType'));
    },
    requestImport : function(paths) {
        this.trigger('dataSetImportRequested', paths, FSItemType.File, this.get('wdType'));
    },
    requestSave : function(filePath, type) {
        this.trigger('dataSetSaveRequested', filePath, type, this.get('wdType'));
    },
    requestExport : function(filePath, type) {
        this.trigger('dataSetExportRequested', filePath, type, this.get('wdType'));
    },
    requestBrowse : function(list, type, filename) {
        this.trigger('browseRequested', list, type, filename, this.get('wdType'));
    }
});

const FSEntryListView = SilkyView.extend({

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

            let html = `<div class="silky-bs-fslist-entry bs-menu-list-item" data-path="${s6e(filePath)}" tabindex="-1">`;
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

const FSItemType = {
    File: 0,
    Folder: 1,
    Drive: 2,
    SpecialFolder: 3
};

const FSEntryBrowserView = SilkyView.extend({

    initialize : function() {
        this._selectedIndices = [];
        this._baseSelectionIndex = -1;
        this.multiMode = false;

        if ( ! this.model)
            this.model = new FSEntryListModel();

        this.model.on('change:items change:dirInfo change:status', this._render, this);
        this.model.on('change:suggestedPath', this._suggestedChanged, this);

        this.$el.addClass('silky-bs-fslist');
        this._createHeader();
        this._render();
    },
    events : {
        'dblclick .silky-bs-fslist-item' : '_itemDoubleClicked',
        'click .silky-bs-fslist-browser-check-button' : '_toggleMultiMode',
        'click .silky-bs-fslist-browser-back-button' : '_backClicked',
        'click .silky-bs-fslist-browser-save-button' : '_saveClicked',
        'keydown .silky-bs-fslist-browser-save-name' : '_nameKeypressHandle',
        'change .silky-bs-fslist-browser-save-filetype' : '_saveTypeChanged',
        'change .silky-bs-fslist-browser-save-name' : '_nameChanged',
        'keyup .silky-bs-fslist-browser-save-name' : '_nameChanged',
        'paste .silky-bs-fslist-browser-save-name' : '_nameChanged',
        'focus .silky-bs-fslist-browser-save-name' : '_nameGotFocus',
        'focus .silky-bs-fslist-browser-save-filetype' : '_focusChanged',
        'click .silky-bs-fslist-browse-button' : '_manualBrowse',
        'keydown .silky-bs-fslist-items' : '_keyPressHandle',
        'focus .silky-bs-fslist-items' : '_listFocus',
        'pointerdown .silky-bs-fslist-items' : '_listPointerDown',
        'keydown .silky-bs-fslist-browser-import-name' : '_importNameKeypressHandle',
        'click .silky-bs-fslist-browser-import-button' : '_importClicked',
        'change .silky-bs-fslist-browser-import-name' : '_importNameChanged',
        'keyup .silky-bs-fslist-browser-import-name' : '_importNameChanged',
        'paste .silky-bs-fslist-browser-import-name' : '_importNameChanged',
        'focus .silky-bs-fslist-browser-import-name' : '_nameGotFocus',
        'focus .silky-bs-fslist-browser-import-filetype' : '_focusChanged',
        'input .search' : '_searchChanged',
        'keydown .search' : '_searchKeyDown'
    },
    _suggestedChanged: function(event) {
        let $saveName = this.$el.find('.silky-bs-fslist-browser-save-name');
        if ($saveName.length > 0) {
            let filePath = this.model.attributes.suggestedPath;
            if (filePath) {
                let extension = path.extname(filePath);
                filePath = s6e(path.basename(filePath, extension));
            }
            else
                filePath = '';

            $saveName.val(filePath);

            let $button = this.$el.find('.silky-bs-fslist-browser-save-button');
            if (filePath)
                $button.removeClass('disabled-div');
            else
                $button.addClass('disabled-div');
        }
    },
    _listPointerDown: function(event) {
        this._clickedItem = document.elementFromPoint(event.pageX, event.pageY);
        this._clickedItem = this._clickedItem.closest('.silky-bs-fslist-item');
        if (this._clickedItem)
            this.clickItem(this._clickedItem, event.ctrlKey, event.shiftKey);
    },
    _listFocus: function (event) {
        if (this._clickedItem) {
            this._clickedItem = null;
            return;
        }
        let selectedIndex = this._selectedIndices.length > 0 ? this._selectedIndices[0] : ((this.$items && this.$items.length > 0) ? 0 : -1);
        if (selectedIndex >= 0 && selectedIndex < this.$items.length){
            this.clearSelection();
            this._selectedIndices = [selectedIndex];
            this._baseSelectionIndex = -1;
            this.$items[selectedIndex].addClass('silky-bs-fslist-selected-item');
            this.$items[selectedIndex].find('.jmv-bs-fslist-checkbox').prop( 'checked', true );
            this._selected = true;

            let offset = this.$items[selectedIndex].position();
            if (offset.top < 0)
                this.$itemsList.animate({scrollTop: this.$itemsList.scrollTop() + offset.top}, 100);
        }
    },
    _setSelection: function($target) {
        if (this._selectedIndices.length > 0)
            this.clearSelection();
        this._selectedIndices.push($target.data('index'));
        $target.addClass('silky-bs-fslist-selected-item');
        $target.find('.jmv-bs-fslist-checkbox').prop( 'checked', true );
    },
    _searchChanged: function(event) {
        this._render();
        this.$itemsList.scrollTop(0);
    },
    _saveTypeChanged : function() {
        let selected = this.$el.find('option:selected');
        this.filterExtensions = selected.data('extensions');
        this._render();
    },
    _validExtension : function(ext) {
        let extOptions = this.$el.find('.silky-bs-fslist-browser-save-filetype option');
        for (let i = 0; i < extOptions.length; i++) {
            let exts = $(extOptions[i]).data('extensions');
            for (let j = 0; j < exts.length; j++) {
                if (('.' + exts[j]) === ext)
                    return i;
            }
        }
        return -1;
    },
    _nameGotFocus: function(event) {
        this.clearSelection();
    },
    _focusChanged: function(event) {
        this.clearSelection();
    },
    _orderItems: function(orderby, direction, items) {

        if (items.length <= 1)
            return;

        if (orderby === 'type') {
            for (let i = 0; i < items.length - 1; i++) {
                let item1 = items[i];
                let item2 = items[i + 1];
                if ((direction === 0 && item1[orderby] > item2[orderby]) || (direction === 1 && item1[orderby] < item2[orderby])) {
                    items[i] = item2;
                    items[i+1] = item1;
                    if (i > 1)
                        i -= 2;
                }
            }
        }
    },
    setShortcutPath: function(path) {
        if (this.shortcutPath !== path) {
            this.shortcutPath = path;
            let $shortcutKeyElements = this.$el.find('[shortcut-key]');
            for (let i = 0; i < $shortcutKeyElements.length; i++) {
                let element = $shortcutKeyElements[i];
                focusLoop.applyShortcutOptions(element, { path: this.shortcutPath });
            }
            focusLoop.updateShortcuts({ silent: true});
        }
    },
    _manualBrowse: function(event) {
        let filename = '';
        let type = 'open';
        if (this.model.clickProcess === 'save' || this.model.clickProcess === 'export') {
            type = 'save';
            filename = this.$header.find('.silky-bs-fslist-browser-save-name').val().trim();
        }
        else if (this.model.clickProcess === 'import')
            type = 'import';

        this.model.requestBrowse(this.model.fileExtensions, type, filename);
    },
    _createFileTypeSelector: function() {
        let html = '';
        html += '           <div class="silky-bs-fslist-browser-save-filetype">';
        html += '               <select class="silky-bs-fslist-browser-save-filetype-inner">';
        for (let i = 0; i < this.model.fileExtensions.length; i++) {
            let exts = this.model.fileExtensions[i].extensions;
            let desc = this.model.fileExtensions[i].description === undefined ? this.model.fileExtensions[i].name : this.model.fileExtensions[i].description;
            let selected = '';
            if (i === 0)
                selected = 'selected';
            html += "                   <option data-extensions='" + JSON.stringify(exts) + "' " + selected + " value=" + i + ">" + desc + "</option>";
        }
        html += '               </select>';
        html += '           </div>';
        return html;
    },
    _createFooter: function() {
        let isSaving = this.model.clickProcess === 'save' || this.model.clickProcess === 'export';
        let multiSelect = this.model.get('multiselect');

        let html = '';
        html += '<div class="silky-bs-fslist-footer">';

        if (isSaving === false) {
            html += this._createFileTypeSelector();
            let extension = null;

            if (multiSelect) {
                html += '   <div class="silky-bs-fslist-import-options hidden" style="display: flex; flex-flow: row nowrap;">';
                html += `       <input class="silky-bs-fslist-browser-import-name" type="text" placeholder="${_('Enter file name here')}" />`;
                html += '       <div class="silky-bs-fslist-browser-import-button" style="display: flex; flex: 0 0 auto;">';
                html += '           <div class="silky-bs-flist-import-icon"></div>';
                html += `           <span>${_('Import')}</span>`;
                html += '       </div>';
                html += '   </div>';
            }
        }

        html += '</div>';
        this.$footer = $(html);

        this.$el.append(this.$footer);
    },
    _createHeader: function() {
        let html = '';
        if ( ! host.isElectron)
            html = '<div class="place-title">' + this.model.attributes.title + '</div>';
        html += '<div class="silky-bs-fslist-header">';


        let isSaving = this.model.clickProcess === 'save' || this.model.clickProcess === 'export';

        /////////////////////////////////////////////////////
        let extension = null;

        if (isSaving) {
            html += '   <div class="silky-bs-fslist-save-options" style="display: flex; flex-flow: row nowrap;">';
            html += '       <div style="flex: 1 1 auto;">';

            let filePath = this.model.attributes.suggestedPath;
            let insert = '';
            if (filePath) {
                extension = path.extname(filePath);
                insert = ' value="' + s6e(path.basename(filePath, extension)) + '"';
            }

            html += `           <input class="silky-bs-fslist-browser-save-name" type="text" placeholder="${_('Enter file name here')}" ${insert} />`;

            html += this._createFileTypeSelector();
            html += '       </div>';
            html += '       <div class="silky-bs-fslist-browser-save-button' + s6e(filePath ? '' : " disabled-div") + '" style="display: flex; flex: 0 0 auto;">';
            html += '           <div class="silky-bs-flist-save-icon"></div>';
            if (this.model.clickProcess === 'save')
                html += `           <span>${_('Save')}</span>`;
            else if (this.model.clickProcess === 'export')
                html += `           <span>${_('Export')}</span>`;
            html += '       </div>';
            html += '   </div>';
        }

        ////////////////////////////////////////////////

        if ( ! this.model.writeOnly) {
            html += '   <div class="silky-bs-fslist-path-browser">';
            if (this.model.get('multiselect'))
                html += '       <button class="silky-bs-fslist-browser-check-button"></button>';
            html += '       <button class="silky-bs-fslist-browser-back-button"><span class="mif-arrow-up"></span></button>';
            html += '       <div class="silky-bs-fslist-browser-location" style="flex: 1 1 auto;"></div>';

            if (this.model.attributes.browseable) {

                html += '       <button class="silky-bs-fslist-browse-button">';
                html += '           <div class="silky-bs-fslist-browser-location-icon silky-bs-flist-item-folder-browse-icon"></div>';
                html += `           <span>${_('Browse')}</span>`;
                html += '       </button>';
            }

            html += '   </div>';
        }

        html += '</div>';
        this.$header = $(html);

        let $multiMode = this.$header.find('.silky-bs-fslist-browser-check-button');
        if ($multiMode.length > 0)
            focusLoop.applyShortcutOptions($multiMode[0], { key: 'C', action: this._toggleMultiMode.bind(this) });

        let $back = this.$header.find('.silky-bs-fslist-browser-back-button');
        if ($back.length > 0)
            focusLoop.applyShortcutOptions($back[0], { key: 'B', position: { x: '20%', y: '25%' }, action: this._backClicked.bind(this), blocking: true });

        let $browse = this.$header.find('.silky-bs-fslist-browse-button');
        if ($browse.length > 0)
            focusLoop.applyShortcutOptions($browse[0], { key: 'E', action: this._manualBrowse.bind(this) });

        let $saveName = this.$header.find('.silky-bs-fslist-browser-save-name');
        if ($saveName.length > 0)
            focusLoop.applyShortcutOptions($saveName[0], { key: 'F' });

        if (focusLoop.inAccessibilityMode() === false)
            this.$header.find('.silky-bs-fslist-browser-save-name').focus(function() { $(this).select(); } );

        this.$el.append(this.$header);

        if ( ! isSaving) {
            let searchHtml = `<div class="searchbox">
                            <div class="image"></div>
                            <input class="search" type="text"></input>
                        </div>`;
            this.$el.append(searchHtml);

            let $search = this.$el.find('.searchbox > .search');
            if ($search.length > 0)
                focusLoop.applyShortcutOptions($search[0], { key: 'S', position: { x: '5%', y: '50%' } });
        }

        this.$itemsList = $('<div class="silky-bs-fslist-items" style="flex: 1 1 auto; overflow: auto; height:100%" tabindex="0"></div>');
        this.$el.append(this.$itemsList);

        if (focusLoop.inAccessibilityMode() === false && (this.model.clickProcess === 'save' || this.model.clickProcess === 'export')) {
            setTimeout(() => {
                this.$header.find('.silky-bs-fslist-browser-save-name').focus();
            }, 400);
        }

        if (this.model.attributes.extensions) {
            this.filterExtensions = this.model.fileExtensions[0].extensions;

            this._createFooter();

            let extValue = this._validExtension(extension);
            if (extValue != -1)
                this.$el.find('.silky-bs-fslist-browser-save-filetype-inner').val(extValue);
        }
    },
    _nameKeypressHandle: function(event) {

        if (event.metaKey || event.ctrlKey || event.altKey)
            return;

        switch(event.key) {
            case 'Enter':
                this._saveClicked(event);
                event.preventDefault();
                break;
        }
    },
    _importNameKeypressHandle: function(event) {

        if (event.metaKey || event.ctrlKey || event.altKey)
            return;

        switch(event.key) {
            case 'Enter':
                this._importClicked(event);
                event.preventDefault();
                break;
        }
    },
    createAlphaNumericTag: function(prefix, id) {
        if (id <= 9) {
            return prefix + id;
        }

        id -= 9;

        let s = '', t;
        while (id > 0) {
            t = (id - 1) % 26;
            s = String.fromCharCode(65 + t) + s;
            id = (id - t)/26 | 0;
        }
        return prefix + s;

    },
    _render : function() {

        if (this.model.writeOnly) {
            this.$itemsList.empty();
            this.clearSelection();
            return;
        }

        let items = this.model.get('items');
        let dirInfo = this.model.get('dirInfo');
        let status = this.model.get('status');

        let filePath = null;
        if (dirInfo !== undefined)
            filePath = pathtools.normalise(dirInfo.path).replace(/\//g, ' \uFE65 ');

        this.$header.find('.silky-bs-fslist-browser-location').text(filePath);

        let searchValue = '';
        let $search = this.$el.find('.searchbox > input');
        if ($search.length > 0) {
            searchValue = $search.val().trim();
            if (focusLoop.inAccessibilityMode() === false) {
                setTimeout(() => {
                    $search.focus();
                }, 250);
            }
        }

        let html = '';
        this._orderItems('type', 1, items);
        this.$items = [];
        this.$itemsList.empty();

        if (status === 'error') {
            let errorMessage = this.model.get('error');
            this.$itemsList.append(`<span>${ s6e(errorMessage) }</span>`);
        }
        else if (status === 'loading') {
            this.$itemsList.append(`
                <div class="indicator-box">
                    <div class="loading-indicator"></div>
                    <span>Loading directory information...</span>
                </div>
            `);
        }
        else if (status === 'ok') {

            if (searchValue !== '') {
                if (isUrl(searchValue)) {
                    try {
                        let url = new URL(searchValue);
                        let name = path.basename(decodeURIComponent(url.pathname));
                        let description = _('An online data set hosted by {hostname}', { hostname : decodeURIComponent(url.hostname) });

                        items = [{
                            name: name,
                            path: searchValue,
                            type: FSItemType.File,
                            isExample: false,
                            tags: [_('Online data set')],
                            description: description,
                            isUrl: true,
                            skipExtensionCheck: true,
                        }];

                    } catch (e) {
                        // do nothing
                    }
                }
            }

            let itemIndex = 0;
            for (let i = 0; i < items.length; i++) {
                html = '';
                let item = items[i];

                let name = item.name;
                let lname = name.toLowerCase();
                let itemPath = item.path;
                let itemType = item.type;

                if ( ! item.isUrl && searchValue !== '') {
                    let lsearchValue = searchValue.toLowerCase();
                    if (lname.includes(lsearchValue) === false) {
                        if ( ! item.description || item.description.toLowerCase().includes(lsearchValue) === false) {
                            let found = false;
                            for (let tag of item.tags) {
                                if (tag.toLowerCase().startsWith(lsearchValue)) {
                                    found = true;
                                    break;
                                }
                            }
                            if ( ! found)
                                continue;
                        }
                    }
                }

                if (itemType === FSItemType.File
                        && ! item.isExample
                        && ! (item.skipExtensionCheck || this._hasValidExtension(name)))
                    continue;


                html += `<div class="silky-bs-fslist-item">`;
                if (itemType === FSItemType.File)
                    html += '<input class="jmv-bs-fslist-checkbox' + (this.multiMode ? '' : ' hidden') + '" type="checkbox">';
                html += '   <div class="silky-bs-flist-item-icon">';
                if (itemType === FSItemType.File) { //file
                    if (item.isExample) // examples don't have extensions
                        html += '       <div class="silky-bs-flist-icon silky-bs-flist-item-csv-icon"></div>';
                    else if (lname.endsWith('.omv'))
                        html += '       <div class="silky-bs-flist-icon silky-bs-flist-item-omv-icon"></div>';
                    else if (lname.endsWith('.omt'))
                        html += '       <div class="silky-bs-flist-icon silky-bs-flist-item-omt-icon"></div>';
                    else if (lname.endsWith('.pdf'))
                        html += '       <span class="mif-file-pdf"></span>';
                    else if (lname.endsWith('.htm') || name.endsWith('.html'))
                        html += '       <span class="mif-file-empty"></span>';
                    else
                        html += '       <div class="silky-bs-flist-icon silky-bs-flist-item-csv-icon"></div>';
                }
                else if (itemType === FSItemType.Folder) //folder
                    html += '       <div class="silky-bs-flist-icon silky-bs-flist-item-folder-icon"></div>';
                else if (itemType === FSItemType.SpecialFolder) //special folder
                    html += '       <div class="silky-bs-flist-icon silky-bs-flist-item-folder-special-icon"></div>';
                else if (itemType === FSItemType.Drive) //drive
                    html += '       <span class="mif-drive"></span>';
                html += '   </div>';

                if (item.description || item.tags || item.license) {
                    html += '   <div class="silky-bs-fslist-entry-group">';
                    html += '       <div class="silky-bs-fslist-entry-name">' + name + '</div>';
                    html += '       <div class="silky-bs-fslist-entry-meta">';
                    if (item.description) {
                        html += `<span class="description">${ s6e(item.description) }</span>`;
                    }
                    if (item.tags) {
                        html += '<div class="tags">';
                        for (let tag of item.tags) {
                            let hue = crc16(tag) % 360;
                            html += `<div class="tag" style="background-color: hsl(${ hue }, 70%, 45%); border-color: hsl(${ hue }, 70%, 45%);">${ s6e(tag) }</div>`;
                        }
                        html += '</div>';
                    }
                    if (item.license) {
                        html += `<div class="license">Licensed ${ s6e(item.license) }</div>`;
                    }
                    html += '       </div>';
                    html += '   </div>';
                }
                else {
                    html += `   <div class="silky-bs-fslist-entry-name">${ s6e(name) }</div>`;
                }

                html += '</div>';

                let $item = $(html);
                let sct = this.createAlphaNumericTag('Q', ++itemIndex);
                focusLoop.applyShortcutOptions($item[0], {
                    key: sct,
                    path: this.shortcutPath,
                    action: this._itemClicked.bind(this),
                    blocking: itemType !== FSItemType.File,
                    position: { x: '0%', y: '0%', internal: true }
                });

                $item.data('name', name);
                $item.data('path', itemPath);
                $item.data('type', itemType);
                $item.data('index', this.$items.length);
                this.$itemsList.append($item);
                this.$items.push($item);
            }

            if (this.$items.length === 0) {
                this.clearSelection();
                this.$itemsList.append(`<span>${_('No recognised data files were found.')}</span>`);
            }
            else
                this._setSelection(this.$items[0]);
        }
        focusLoop.updateShortcuts({ shortcutPath: this.shortcutPath, silent: true});
    },
    _getSelectedPaths : function() {
        let paths = [];
        for (let i of this._selectedIndices)
            paths.push(this.$items[i].data('path'));
        return paths;
    },
    _setMultiMode : function(value) {
        if (value !== this.multiMode) {
            let $button = this.$header.find('.silky-bs-fslist-browser-check-button');
            if (this.multiMode) {
                this.multiMode = false;
                $button.removeClass('on');
                this.$itemsList.find('.jmv-bs-fslist-checkbox').addClass('hidden');
                this.$footer.find('.silky-bs-fslist-import-options').addClass('hidden');
                this.clearSelection();
            }
            else {
                this.multiMode = true;
                this.$itemsList.find('.jmv-bs-fslist-checkbox').removeClass('hidden');
                this.$footer.find('.silky-bs-fslist-import-options').removeClass('hidden');
                $button.addClass('on');
            }
        }
    },
    _toggleMultiMode : function() {
        this._setMultiMode( ! this.multiMode);
    },
    clickItem: function (target, ctrlKey, shiftKey) {
        let $target = $(target);
        let fromChecked = $target.hasClass('silky-bs-fslist-selected-item') !== $target.find('.jmv-bs-fslist-checkbox').prop('checked');
        let multiSelect = this.model.get('multiselect');
        let modifier = ctrlKey || shiftKey || fromChecked;

        let itemType = $target.data('type');
        let itemPath = $target.data('path');
        let itemTitle = $target.data('name');
        if (itemType !== FSItemType.File || this.model.clickProcess === 'open') {
            this.clearSelection();
            this.model.requestOpen(itemPath, itemTitle, itemType);
            focusLoop.updateShortcuts({ shortcutPath: this.shortcutPath });
        }
        else if (itemType === FSItemType.File && this.model.clickProcess === 'import') {
            if (multiSelect && this._selectedIndices.length > 0 && modifier) {
                let index = $target.data('index');
                if (ctrlKey || fromChecked) {
                    let ii = this._selectedIndices.indexOf(index);
                    if (ii != -1) {
                        this.$items[index].removeClass('silky-bs-fslist-selected-item');
                        this.$items[index].find('.jmv-bs-fslist-checkbox').prop('checked', false);
                        this._selectedIndices.splice(ii, 1);
                    }
                    else {
                        this._selectedIndices.push($target.data('index'));
                        $target.addClass('silky-bs-fslist-selected-item');
                        $target.find('.jmv-bs-fslist-checkbox').prop('checked', true);
                    }
                    this._baseSelectionIndex = -1;
                }
                else if (shiftKey) {
                    for (let i of this._selectedIndices) {
                        this.$items[i].removeClass('silky-bs-fslist-selected-item');
                        this.$items[i].find('.jmv-bs-fslist-checkbox').prop('checked', false);
                    }

                    let indices = [];
                    let start = this._baseSelectionIndex == -1 ? this._selectedIndices[this._selectedIndices.length - 1] : this._baseSelectionIndex;
                    for (let i = start; i !== index; i = i + ((index > start) ? 1 : -1)) {
                        indices.push(i);
                        this.$items[i].addClass('silky-bs-fslist-selected-item');
                        this.$items[i].find('.jmv-bs-fslist-checkbox').prop('checked', true);
                    }
                    indices.push($target.data('index'));
                    $target.addClass('silky-bs-fslist-selected-item');
                    $target.find('.jmv-bs-fslist-checkbox').prop('checked', true);
                    this._selectedIndices = indices;
                    this._baseSelectionIndex = this._selectedIndices[0];
                }
            }
            else {
                if (this._selectedIndices.length > 0)
                    this.clearSelection();
                this._selectedIndices.push($target.data('index'));
                $target.addClass('silky-bs-fslist-selected-item');
                $target.find('.jmv-bs-fslist-checkbox').prop('checked', true);
            }

            if ((multiSelect === false || modifier === false) && this.multiMode === false) {
                let paths = this._getSelectedPaths();
                this.model.requestImport(paths);
                this.$footer.find('.silky-bs-fslist-import-options').addClass('hidden');
                this._setMultiMode(false);
                this.$itemsList.find('.jmv-bs-fslist-checkbox').addClass('hidden');
            }
            else {
                let name = '';
                if (this._selectedIndices.length > 0) {
                    name = this.$items[this._selectedIndices[0]].data('name');
                    if (this._selectedIndices.length > 1) {
                        name = '"' + name + '"';
                        for (let i = 1; i < this._selectedIndices.length; i++)
                            name = name + ' "' + this.$items[this._selectedIndices[i]].data('name') + '"';
                    }
                }
                this.$footer.find('.silky-bs-fslist-browser-import-name').val(name);
                this._importNameChanged();
                this._selected = true;
                this._setMultiMode(true);
            }
        }
        else {
            if (this._selectedIndices.length > 0) {
                for (let i of this._selectedIndices) {
                    this.$items[i].removeClass('silky-bs-fslist-selected-item');
                    this.$items[i].find('.jmv-bs-fslist-checkbox').prop('checked', false);
                }
            }

            this._selectedIndices = [$target.data('index')];
            this._baseSelectionIndex = -1;
            let name = $target.data('name');
            $target.addClass('silky-bs-fslist-selected-item');
            $target.find('.jmv-bs-fslist-checkbox').prop('checked', true);

            this.$header.find('.silky-bs-fslist-browser-save-name').val(name);
            this._nameChanged();
            this._selected = true;
        }
    },
    _itemClicked : function(event) {
        this.clickItem(event.currentTarget, event.ctrlKey || event.metaKey, event.shiftKey);
    },
    _keyPressHandle : function(event) {
        if (event.metaKey || event.ctrlKey || event.altKey)
            return;

        switch(event.key) {
            case 'ArrowUp':
                this.decrementSelection();
                event.preventDefault();
                event.stopPropagation();
                break;
            case 'ArrowDown':
                this.incrementSelection();
                event.preventDefault();
                event.stopPropagation();
                break;
            case 'Enter':
                if (this._selectedIndices.length > 0) {
                    let $target = this.$items[this._selectedIndices[0]];
                    let itemType = $target.data('type');
                    let itemPath = $target.data('path');
                    let itemTitle = $target.data('name');
                    if (itemType !== FSItemType.File || this.model.clickProcess === 'open')
                        this.model.requestOpen(itemPath, itemTitle, itemType);
                    else if (itemType === FSItemType.File && this.model.clickProcess === 'import')
                        this.model.requestImport(this._getSelectedPaths());
                    else if (itemType === FSItemType.File && this.model.clickProcess === 'save')
                        this.model.requestSave(itemPath, itemType);
                    else if (itemType === FSItemType.File && this.model.clickProcess === 'export')
                        this.model.requestExport(itemPath, itemType);
                }
                event.preventDefault();
                event.stopPropagation();
                break;
        }
    },
    clearSelection: function() {
        for (let i of this._selectedIndices) {
            if (this.$items[i]) {
                this.$items[i].removeClass('silky-bs-fslist-selected-item');
                this.$items[i].find('.jmv-bs-fslist-checkbox').prop( 'checked', false );
            }
        }
        this._selectedIndices = [];
        this._baseSelectionIndex = -1;
        if (this.$footer)
            this.$footer.find('.silky-bs-fslist-browser-import-name').val('');
        this._selected = false;
    },

    incrementSelection: function() {
        let selectedIndex = this._selectedIndices.length > 0 ? this._selectedIndices[0] : (this.$items.length > 0 ? 0 : -1);
        if (selectedIndex !== -1 && selectedIndex !== this.$items.length - 1){
            this.clearSelection();
            selectedIndex += 1;
            this._selectedIndices = [selectedIndex];
            this._baseSelectionIndex = -1;
            this.$items[selectedIndex].addClass('silky-bs-fslist-selected-item');
            this.$items[selectedIndex].find('.jmv-bs-fslist-checkbox').prop( 'checked', true );
            this._selected = true;

            let offset = this.$items[selectedIndex].position();
            let height = this.$items[selectedIndex].height();
            if (offset.top + height > this.$itemsList.height()) {
                let r = this.$itemsList.scrollTop() + (offset.top + height - this.$itemsList.height() + 1);
                this.$itemsList.animate({scrollTop: r}, 100);
            }
        }
    },
    decrementSelection: function() {
        let selectedIndex = this._selectedIndices.length > 0 ? this._selectedIndices[0] : (this.$items.length > 0 ? 0 : -1);
        if (selectedIndex > 0){
            this.clearSelection();
            selectedIndex -= 1;
            this._selectedIndices = [selectedIndex];
            this._baseSelectionIndex = -1;
            this.$items[selectedIndex].addClass('silky-bs-fslist-selected-item');
            this.$items[selectedIndex].find('.jmv-bs-fslist-checkbox').prop( 'checked', true );
            this._selected = true;

            let offset = this.$items[selectedIndex].position();
            if (offset.top < 0)
                this.$itemsList.animate({scrollTop: this.$itemsList.scrollTop() + offset.top}, 100);
        }
    },
    _itemDoubleClicked : function(event) {
        let $target = $(event.currentTarget);
        let itemType = $target.data('type');
        let itemPath = $target.data('path');
        let itemTitle = $target.data('name');
        if (itemType === FSItemType.File)
            this._setMultiMode(false);
        if (itemType !== FSItemType.File || this.model.clickProcess === 'open')
            this.model.requestOpen(itemPath, itemTitle, itemType);
        else if (itemType === FSItemType.File && this.model.clickProcess === 'import')
            this.model.requestImport([itemPath]);
        else if (itemType === FSItemType.File && this.model.clickProcess === 'save')
            this.model.requestSave(itemPath, itemType);
        else if (itemType === FSItemType.File && this.model.clickProcess === 'export')
            this.model.requestExport(itemPath, itemType);
    },
    _nameChanged : function(event) {
        let $button = this.$header.find('.silky-bs-fslist-browser-save-button');
        let name = this.$header.find('.silky-bs-fslist-browser-save-name').val().trim();
        if (name === '')
            $button.addClass('disabled-div');
        else
            $button.removeClass('disabled-div');

    },
    _importNameChanged : function(event) {
        let $button = this.$footer.find('.silky-bs-fslist-browser-import-button');
        let name = this.$footer.find('.silky-bs-fslist-browser-import-name').val().trim();
        if (name === '')
            $button.addClass('disabled-div');
        else
            $button.removeClass('disabled-div');

    },
    _hasValidExtension : function(name) {
        let found = true;
        if (this.filterExtensions) {
            found = false;
            for (let extIndex = 0; extIndex < this.filterExtensions.length; extIndex++) {
                if (name.toLowerCase().endsWith('.' + this.filterExtensions[extIndex])) {
                    found = true;
                    break;
                }
            }
        }
        return found;
    },
    _saveClicked : function(event) {
        let dirInfo = this.model.get('dirInfo');
        let writeOnly = this.model.writeOnly;
        if (dirInfo !== undefined) {
            let name = this.$header.find('.silky-bs-fslist-browser-save-name').val().trim();
            if (name === '')
                return;

            if (this._hasValidExtension(name) === false)
                name = name + '.' + this.filterExtensions[0];

            let filePath = dirInfo.path + '/' + name;

            if (this.model.clickProcess === 'save')
                this.model.requestSave(filePath, FSItemType.File);
            else if (this.model.clickProcess === 'export')
                this.model.requestExport(filePath, FSItemType.File);
        }
    },
    _importClicked : function(event) {
        if (this._selectedIndices.length > 0)
            this.model.requestImport(this._getSelectedPaths());
        else {
            let dirInfo = this.model.get('dirInfo');
            if (dirInfo !== undefined) {
                let name = this.$footer.find('.silky-bs-fslist-browser-import-name').val().trim();
                if (name === '')
                    return;

                this.model.requestImport([ dirInfo.path + '/' + name ]);
            }
        }
    },
    _backClicked : function(event) {
        let dirInfo = this.model.get('dirInfo');
        if (dirInfo !== undefined) {
            let filePath = dirInfo.path;
            filePath = this._calcBackDirectory(filePath, dirInfo.type);
            this._goToFolder(filePath);
            this.clearSelection();
        }
        focusLoop.updateShortcuts({ shortcutPath: this.shortcutPath });
    },
    _goToFolder: function(dirPath) {
        this.model.requestOpen(dirPath, null, FSItemType.Folder);
    },
    _calcBackDirectory: function(filePath, type) {
        let index = -1;
        if (filePath.length > 0 && filePath !== '/') {
            index = filePath.lastIndexOf("/");
            if (index !== -1 && index === filePath.length - 1)
                index = filePath.lastIndexOf("/", filePath.length - 2);
        }

        if (index <= 0) {
            if (this.model.attributes.wdType === 'temp')
                return '{{Temp}}';

            if (this.model.attributes.wdType === 'examples')
                return '{{Examples}}';

            return '{{Root}}';
        }

        return filePath.substring(0, index);
    }
});

const InDevelopmentView = SilkyView.extend({
    initialize : function() {
        this.render();
    },
    render: function() {
        this.$el.addClass('silky-under-development');
        this.$el.append(`<div class="silky-development-title">${ s6e(this.model.title) }</div>`);
        this.$el.append(`<div class="silky-development-msg">${ s6e(this.model.msg) }</div>`);
    }
});

const BackstageModel = Backbone.Model.extend({
    defaults: {
        activated : false,
        task : '',
        taskProgress : 0,
        operation : '',
        place : '',
        lastSelectedPlace : '',
        settings : null,
        ops : [ ],
        dialogMode : false
    },
    initialize : function(args) {

        this.instance = args.instance;

        this.instance.settings().on('change:recents',
            (event) => this._settingsChanged(event));
        this.instance.settings().on('change:examples',
            (event) => this._settingsChanged(event));
        this.instance.settings().on('change:mode',
            (event) => {
                this.set('ops', this.createOps());
            });

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

    },
    showDialog: async function(type, options) {
        this.set('dialogMode', true);
        this._dialogPath = null;
        this._dialogExportListModel.fileExtensions = options.filters;

        let _oldOps = this.get('ops');

        let _ops = [ ];
        if ( ! host.isElectron) {
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
                            name: 'thisdevice', title: _('Download'), shortcutKey: 'd', model: this._dialogExportListModel, view: FSEntryBrowserView,
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
                            name: 'thispc', title: _('This PC'),  shortcutKey: 'd', model: this._dialogExportListModel, view: FSEntryBrowserView,
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
        await new Promise((resolve) => {
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
    },
    createOps: function() {
        let mode = this.instance.settings().getSetting('mode', 'normal');

        let open_thispc = null;
        let import_thispc = null;
        let saveAs = null;
        let export_thispc = null;

        if ( ! host.isElectron) {
            return [
                {
                    name: 'new',
                    title: _('New'),
                    shortcutKey: 'n',
                    action: () => { this.requestOpen(''); }
                },
                {
                    name: 'open',
                    title: _('Open'),
                    shortcutKey: 'o',
                    action: () => {
                        /*let place = this.instance.settings().getSetting('openPlace', 'thispc');
                        if (place === 'thispc') {
                            let filePath = this._determineSavePath('main');
                            return this.setCurrentDirectory('main', path.dirname(filePath)).then(() => {
                                this.attributes.place = place;
                            });
                        }
                        else
                            this.attributes.place = place;*/
                    },
                    places: [
                        /*{ name: 'thispc', title: _('jamovi Cloud'), model: this._pcListModel, view: FSEntryBrowserView },*/
                        { name: 'examples', title: _('Data Library'), shortcutKey: 'l', model: this._examplesListModel, view: FSEntryBrowserView },
                        { name: 'thisdevice', title: _('This Device'), shortcutKey: 'd', action: () => { this.tryBrowse(this._pcListModel.fileExtensions, 'open'); } }
                    ]
                },
                // {
                //     name: 'import',
                //     title: _('Import'),
                //     places: [
                //         /*{ name: 'thispc', title: _('jamovi Cloud'),  model: this._pcImportListModel, view: FSEntryBrowserView  },*/
                //         { name: 'thisdevice', title: _('This Device'), action: () => { this.tryBrowse(this._pcImportListModel.fileExtensions, 'import'); } }
                //     ]
                // },
                {
                    name: 'saveAs',
                    title: _('Save As'),
                    shortcutKey: 'a',
                    action: () => {
                        let place = this.instance.settings().getSetting('openPlace', 'thispc');
                        if (place === 'thispc') {
                            let filePath = this._determineSavePath('main');
                            this._pcSaveListModel.set('suggestedPath', filePath);
                            return this.setCurrentDirectory('main', path.dirname(filePath));
                        }
                    },
                    places: [
                        /*{ name: 'thispc', title: _('jamovi Cloud'), separator: true, model: this._pcSaveListModel, view: FSEntryBrowserView },*/
                        {
                            name: 'thisdevice', title: _('Download'), shortcutKey: 'd', model: this._deviceSaveListModel, view: FSEntryBrowserView,
                            action: () => {
                                this._deviceSaveListModel.set('suggestedPath', this.instance.get('title'));
                            }
                        }
                    ]
                },
                {
                    name: 'export',
                    title: _('Export'),
                    shortcutKey: 'e',
                    places: [
                        /*{
                            name: 'thispc', title: _('jamovi Cloud'), separator: true, model: this._pcExportListModel, view: FSEntryBrowserView,
                            action: () => {
                                this._pcExportListModel.suggestedPath = this.instance.get('title');
                            }
                        },*/
                        {
                            name: 'thisdevice', title: _('Download'), shortcutKey: 'd', model: this._deviceExportListModel, view: FSEntryBrowserView,
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
                    action: () => { this.requestOpen(''); }
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
                        { name: 'thispc', title: _('This PC'), shortcutKey: 'p', model: this._pcListModel, view: FSEntryBrowserView },
                        { name: 'examples', title: _('Data Library'), shortcutKey: 'l', model: this._examplesListModel, view: FSEntryBrowserView }
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
                        { name: 'thispc', title: _('This PC'), shortcutKey: 'p', model: this._pcImportListModel, view: FSEntryBrowserView }
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
                        { name: 'thispc', title: _('This PC'), shortcutKey: 'p', separator: true, model: this._pcSaveListModel, view: FSEntryBrowserView }
                    ]
                },
                {
                    name: 'export',
                    title: _('Export'),
                    shortcutKey: 'e',
                    places: [
                        {
                            name: 'thispc', title: _('This PC'), shortcutKey: 'p', separator: true, model: this._pcExportListModel, view: FSEntryBrowserView,
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
    },

    addToWorkingDirData: function(model) {
        let wdType = model.attributes.wdType;
        if (this._wdData[wdType].models === undefined) {
            let wdTypeData = this._wdData[wdType];
            wdTypeData.wd =  wdTypeData.fixed ? wdTypeData.defaultPath : this.instance.settings().getSetting(wdType + 'WorkingDir', wdTypeData.defaultPath);
            wdTypeData.models = [ ];
            wdTypeData.path = '';
            wdTypeData.initialised = false;
            wdTypeData.wd = '';
            if ( ! wdTypeData.fixed) {
                this.instance.settings().on('change:' + wdType + 'WorkingDir', (event) => {
                    this._wdData[wdType].defaultPath = this.instance.settings().getSetting(wdType + 'WorkingDir', wdTypeData.defaultPath);
                });
            }
        }
        this._wdData[wdType].models.push(model);
    },
    tryBrowse: async function(list, type, filename) {

        let filters = [];
        for (let i = 0; i < list.length; i++) {
            let desc = list[i].description === undefined ? list[i].name : list[i].description;
            filters.push({ name: desc, extensions: list[i].extensions });
        }

        let osPath = '';
        if (host.isElectron) {
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
                let file = result.files[0];
                this.requestOpen(file);
            }
        }
        else if (type === 'import') {

            let result = await host.showOpenDialog({
                filters: filters,
                multiple: true,
                defaultPath: path.join(osPath, '')
            });

            if ( ! result.cancelled)
                this.requestImport(result.files);
        }
        else if (type === 'save') {

            let result = await host.showSaveDialogExternal({
                filters : filters,
                defaultPath: path.join(osPath, filename),
            });

            if ( ! result.cancelled) {
                this.requestSave(result.file, { overwrite: true }).catch((e) => {
                    if ( ! this.instance.attributes.saveFormat) {
                        this.set('activated', true);
                        this.set('operation', 'saveAs');
                    }
                });
            }
        }
    },
    getOp: function(opName) {
        return this.attributes.ops.find(o => o.name === opName);
    },
    getPlace: function(opName, placeName) {
        let op = this.getOp(opName);
        if (op) {
            let place = op.places.find(p => p.name === placeName);
            if (place)
                return { op, place };
        }
    },
    getCurrentOp: function() {
        let names = this.attributes.ops.map(o => o.name);
        let index = names.indexOf(this.attributes.operation);

        if (index !== -1)
            return this.attributes.ops[index];
        else
            return null;
    },
    getCurrentPlace: function() {

        let op = this.getCurrentOp();
        if (op === null)
            return null;

        let names = op.places.map(o => o.name);
        let index = names.indexOf(this.attributes.place);

        if (index === -1)
            index = 0;

        if (this._opChanged) {
            while (index < op.places.length && op.places[index].view === InDevelopmentView)
                index += 1;

            if (index >= op.places.length)
                index = 0;
            else
                this.attributes.place = op.places[index].name;

            this._opChanged = false;
        }

        return op.places[index];
    },
    tryOpen: function(filePath, title, type, wdType) {
        if (type === FSItemType.File)
            this.requestOpen(filePath, title);
        else if (type === FSItemType.Folder || type === FSItemType.Drive || type === FSItemType.SpecialFolder) {
            wdType = wdType === undefined ? 'main' : wdType;
            this.setCurrentDirectory(wdType, filePath, type)
                .done();
        }
    },
    tryImport: function(paths, type, wdType) {
        this.requestImport(paths);
    },
    async trySave(filePath, type) {
        try {
            await this.requestSave(filePath);
        }
        catch (e) {
            if ( ! this.instance.attributes.saveFormat) {
                this.set('activated', true);
                this.set('operation', 'saveAs');
            }
        }
    },
    async tryExport(filePath, type) {
        try {
            await this.requestSave(filePath, { export: true });
        }
        catch(e) {
            this.set('activated', true);
            this.set('operation', 'export');
        }
    },
    dialogExport: function(filePath, type) {
        this._dialogPath = filePath;
        this.set('activated', false);
    },
    dialogBrowse: async function(list, type, filename) {

        let filters = [];
        for (let i = 0; i < list.length; i++) {
            let desc = list[i].description === undefined ? list[i].name : list[i].description;
            filters.push({ name: desc, extensions: list[i].extensions });
        }

        let osPath = '';
        if (host.isElectron) {
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
    },
    setCurrentDirectory: function(wdType, dirPath, type, writeOnly=false) {
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
            let resolved = Promise.resolve();
            resolved.done = function(){};
            return resolved;
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
    },
    hasCurrentDirectory: function(wdType) {
        return this._wdData[wdType].initialised;
    },
    _opChanged: function() {

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
    },
    _placeChanged : function() {
        if (this.attributes.place !== '')
            this.instance.settings().setSetting('openPlace', this.attributes.place);
    },
    async requestOpen(filePath, title) {

        let progNotif = new Notify({
            title: _('Opening'),
            duration: 0
        });

        let deactivated = false;
        try {

            let options = { };
            if (title)
                options.title = title;
            let stream = this.instance.open(filePath, options);
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
                ; // do nothing
            else if (e instanceof JError)
                this._notify(e);
            else
                this._notify({ message: _('Unable to open'), cause: e.message, type: 'error' });
        }
        finally {
            progNotif.dismiss();
        }
    },
    requestImport: function(paths) {
        let deactivated = false;
        let deactivate = () => {
            if ( ! deactivated) {
                this.set('activated', false);
                deactivated = true;
            }
        };

        this.instance.import(paths)
            .then(deactivate, undefined, deactivate);
    },
    externalRequestSave: function(filePath, options) {

        // can be called as externalRequestSave(filePath, overwrite), externalRequestSave(filePath), externalRequestSave(), externalRequestSave(overwrite)

        // if filePath is not specified then the current opened path is used. If overwrite is not specified it defaults to false.
        // if overwrite is false and the specified file already exists a popup asks for overwrite.
        // if overwrite is true and the specified file already exists the file is overwritten.

        if (this.get('activated'))
            throw 'This method can only be called from outside of backstage.';

        if (this.instance.attributes.path)
            return this.requestSave(this.instance.attributes.path, { overwrite: true });

        let rej;
        let prom = new Promise((resolve, reject) => {
            this._savePromiseResolve = resolve;
            rej = reject;
        }).then(() => {
            this._savePromiseResolve = null;
        });

        this.requestSave(filePath, options).catch(() => {
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
    },
    setSavingState: function(saving) {
        let $button = $(document).find('.silky-bs-fslist-browser-save-button');
        if ( ! $button)
            return;

        let $saveIcon = $button.find('.silky-bs-flist-save-icon');
        if (saving) {
            tarp.show('saving', false, 0, 299);
            $button.addClass('disabled-div');
            $saveIcon.addClass('saving-file');
        }
        else {
            tarp.hide('saving');
            $button.removeClass('disabled-div');
            $saveIcon.removeClass('saving-file');
        }
    },
    async requestSave(filePath, options) {

        if ( ! options)
            options = { };

        if ( ! host.isElectron)
            options.export = true;

        // if filePath is not specified then the current opened path is used.
        // if overwrite is false and the specified file already exists a popup asks for overwrite.
        // if overwrite is true and the specified file already exists the file is overwritten.

        if ( ! filePath) {
            if (this.instance.attributes.saveFormat) {
                // saveFormat is typically either empty, or 'jamovi'
                // empty means the user hasn't saved it as a .omv file yet, and
                // they need to be prompted where to save.
                // saveFormat can have other values when the data set is loaded
                // from an url, and it needs to be saved back to that url in a
                // particular format
                // it follows that when saveFormat isn't empty, the saveAs
                // shouldn't appear either on save, or on save failure
                options.overwrite = true;
            }
            else
                throw undefined;
        }

        try {
            this.setSavingState(true);
            // instance.save() itself triggers notifications about the save
            // being successful (if you were wondering why it's not here.)
            let status = await this.instance.save(filePath, options);
            this.setSavingState(false);
            if (this._savePromiseResolve !== null)
                this._savePromiseResolve();
            this.set('activated', false);
            this.trigger('saved');

            if ( ! host.isElectron) {
                let source = path.basename(status.path);
                let target = path.basename(filePath);
                let url = `dl/${ source }?filename=${ target }`;
                await host.triggerDownload(url);
            }
        }
        catch (e) {
            this.setSavingState(false);
            throw e;
        }

    },
    _determineSavePath: function(wdType) {
        let filePath = this.instance.get('path');
        if (filePath && ! isUrl(filePath))
            return filePath;

        let root = this.instance.settings().getSetting(wdType + 'WorkingDir', this._wdData[wdType].defaultPath);
        return path.join(root, this.instance.get('title') + '.omv');
    },
    _settingsChanged : function(event) {
        if ('recents' in event.changed)
            this._recentsListModel.set('items', event.changed.recents);
    },
    recentsModel : function() {
        return this._recentsListModel;
    },
    progressHandler : function(evt) {
        console.log(evt);
    },
    completeHandler: function(evt) {
        console.log('complete');
    },
    _notify(error) {
        let notification = new Notify({
            title: error.message,
            message: error.cause,
            duration: 3000,
            type: 'error',
        });
        this.trigger('notification', notification);
    },
});

const BackstageView = SilkyView.extend({
    className: 'backstage',
    initialize: function() {
        let focusToken = focusLoop.addFocusLoop(this.$el[0], { level: 1, modal: true } );
        focusToken.on('focusleave', (event) => {
            if (focusLoop.focusMode === 'shortcuts' && focusLoop.shortcutPath.startsWith('F'))
                event.cancel = true;
            else
                this.deactivate();
        });
        this.model.on("change:activated", this._activationChanged, this);
        this.model.on('change:operation', this._opChanged, this);
        this.model.on('change:place',     this._placeChanged, this);
        this.model.on('change:ops',       this.render, this);
        this.model.on('change:dialogMode', this._dialogModeChanged, this);
    },
    _dialogModeChanged: function() {
        let $recents = this.$el.find('.silky-bs-op-recents-main');
        if (this.model.get('dialogMode'))
            $recents.hide();
        else
            $recents.show();
    },
    events: {
        //'click .silky-bs-back-button' : 'deactivate',
        'keydown' : '_keypressHandle'
    },
    _keypressHandle: function(event) {
        if (event.metaKey || event.ctrlKey || event.altKey)
            return;

        switch(event.key) {
            case 'Escape':
                //this.deactivate(true);
                break;
        }
    },
    setPlace: function(op, place) {
        this.model.set('op', op.name);

        if ('action' in place)
            place.action();

        if ('view' in place) {
            this.model.set('lastSelectedPlace', place.name);
            this.model.set('place', place.name);
        }
    },
    clickOp: function(event) {
        this.model.set('operation', event.target.getAttribute('data-op'));
    },
    clickPlace: function(event) {
        let opName = event.target.getAttribute('data-op');
        let placeName = event.target.getAttribute('data-place');
        let placeInfo = this.model.getPlace(opName, placeName);

        this.setPlace(placeInfo.op, placeInfo.place);
        setTimeout(function () {
            event.target.focus();
        }, 250);

    },
    clickRecent: function(event) {
        let filePath = event.target.getAttribute('data-path');
        let fileName = event.target.getAttribute('data-name');
        let recentsModel = this.model.recentsModel();
        recentsModel.requestOpen(filePath, fileName, FSItemType.File);
    },
    render: function() {
        this.$el.empty();

        this.$el.addClass('silky-bs');

        let html = '';

        html += '<div class="silky-bs-op silky-bs-op-panel" role="menu">';
        html += '    <div class="silky-bs-header">';
        html += '        <div class="silky-bs-back">';
        html += '            <div class="silky-bs-back-button bs-menu-list-item bs-menu-action" tabindex="-1"><div></div></div>';
        html += '        </div>';
        html += '        <div class="silky-bs-logo"></div>';
        html += '    </div>';
        html += '</div>';

        this.$opPanel = $(html);
        this.$opPanel.appendTo(this.$el);

        this.menuSelection = new selectionLoop('bs-menu', this.$opPanel[0]);
        this.menuSelection.on('selected-index-changed', (data) => {

            if (data.target.hasAttribute('data-path'))
                this.clickRecent(data);
            if (data.target.classList.contains('silky-bs-back-button'))
                this.deactivate(data.withMouse);
                //focusLoop.leaveFocusLoop(this.$el[0], data.withMouse);
            else if (data.target.hasAttribute('data-place'))
                this.clickPlace(data);
            else if (data.target.hasAttribute('data-op'))
                this.clickOp(data);
        });

        $('<div class="silky-bs-main"></div>').appendTo(this.$el);

        let $opList = $('<div class="silky-bs-op-list"></div>');

        let currentOp = null;
        for (let i = 0; i < this.model.attributes.ops.length; i++) {
            let op = this.model.attributes.ops[i];
            let selected = (op.name === this.model.attributes.operation);
            if (selected)
                currentOp = op;

            let $op = $(`<div class="silky-bs-menu-item" data-op="${ s6e(op.name) }-item"></div>`);
            let $opTitle = $(`<div class="silky-bs-op-button bs-menu-list-item" tabindex="-1" data-op="${s6e(op.name)}">${ s6e(op.title) }</div>`).appendTo($op);
            if (op.shortcutKey) {
                focusLoop.applyShortcutOptions($opTitle[0], {
                    key: op.shortcutKey.toUpperCase(),
                    path: 'F',
                    action: this.clickOp.bind(this),
                    position: { x: '9%', y: '27%' }
                });
            }
            if (i === 0)
                this.menuSelection.highlightElement($opTitle[0]);

            if ('places' in op) {
                let $opPlaces = $('<div class="silky-bs-op-places"></div>');
                for (let place of op.places) {
                    let $opPlace = $(`<div class="silky-bs-op-place bs-menu-list-item" tabindex="-1" data-op="${s6e(op.name)}" data-place="${ s6e(place.name) }">${ s6e(place.title) }</div>`);
                    if (place.shortcutKey) {
                        focusLoop.applyShortcutOptions($opPlace[0], {
                            key: place.shortcutKey.toUpperCase(),
                            path: `F${op.shortcutKey.split('-')[0].toUpperCase()}`,
                            action: this.clickPlace.bind(this),
                            position: { x: '12%', y: '25%' }
                        });
                    }
                    $opPlaces.append($opPlace);
                }
                $opPlaces.appendTo($op);
            }

            op.$el = $op;
            $opList.append($op);
        }
        this.$opPanel.append($opList);

        this.$opPanel.append($('<div class="silky-bs-op-separator"></div>'));

        let $op = $('<div class="silky-bs-op-recents-main"></div>');
        if (this.model.get('dialogMode'))
            $op.hide();
        else
            $op.show();

        let $opTitle = $(`<div class="silky-bs-op-header" data-op="Recent">${_('Recent')}</div>`).appendTo($op);
        let $recentsBody = $('<div class="silky-bs-op-recents"></div>').appendTo($op);
        $op.appendTo(this.$opPanel);

        let recentsModel = this.model.recentsModel();
        let recentsView = new FSEntryListView({el: $recentsBody, model: recentsModel});

        $recentsBody.find('.silky-bs-fslist-entry').on('shortcut-action', this.clickRecent.bind(this));

        this.$browseInvoker = this.$el.find('.silky-bs-place-invoker');
        this.$ops = this.$el.find('.silky-bs-menu-item');

        this._opChanged();

        if (this.main)
            this.main.close();

        this.main = new BackstageChoices({ el: '.silky-bs-main', model : this.model });
    },
    activate : function(fromMouse) {
        this.activeStateChanging = true;
        this.$el.addClass('activated');

        tarp.show('backstage', true, 0.3).then(
            undefined,
            () => this.deactivate(true));

        this.model.set('activated', true);

        $('body').find('.app-dragable').addClass('ignore');
        $('#main').attr('aria-hidden', true);
        $('.jmv-ribbon-tab.file-tab').attr('aria-expanded', true);

        setTimeout(() => {
            focusLoop.enterFocusLoop(this.$el[0], { withMouse: fromMouse });
        }, 200);
        this.activeStateChanging = false;
    },
    deactivate : function(fromMouse) {

        this.activeStateChanging = true;
        tarp.hide('backstage');
        this.$el.removeClass('activated');
        this.$el.removeClass('activated-sub');

        this.model.set('activated', false);

        this._hideSubMenus();

        this.model.set('operation', '');
        this.model.set('place', '');

        $('body').find('.app-dragable').removeClass('ignore');
        $('#main').attr('aria-hidden', false);
        $('.jmv-ribbon-tab.file-tab').attr('aria-expanded', false);

        focusLoop.leaveFocusLoop(this.$el[0], fromMouse);
        this.activeStateChanging = false;
    },
    _activationChanged : function() {
        if ( ! this.activeStateChanging) {
            if (this.model.get('activated'))
                this.activate(true);
            else
                this.deactivate(true);
        }
    },
    _hideSubMenus : function() {
        if (this.$ops) {
            let $opsButton = this.$ops.find('.silky-bs-op-button').attr('tabindex', '0');//removeClass('bs-menu-item-ignore');
            let $subOps = this.$ops.find('.silky-bs-op-places');
            for (let i = 0; i < $subOps.length; i++) {
                $($subOps[i]).css('height', '');
                $subOps.css('opacity', '');
                $subOps.css('visibility', '');
            }
        }
    },
    _placeChanged : function() {
        let $places = this.$ops.find('.silky-bs-op-place');

        let op = this.model.getCurrentOp();
        let place = this.model.getCurrentPlace();
        if (place === null)
            $places.removeClass('selected-place');
        else if ('view' in place) {
            $places.removeClass('selected-place');

            let $place = this.$ops.find(`[data-place="${ s6e(place.name) }"][data-op="${ s6e(op.name) }"]`);

            $place.addClass('selected-place');

            this.menuSelection.selectElement($place[0], 'internal', true);
        }
    },
    _opChanged : function() {

        this.$ops.removeClass('selected');
        this._hideSubMenus();

        let operation = this.model.get('operation');

        let op = null;
        for (let opObj of this.model.attributes.ops) {
            if (opObj.name === operation) {
                op = opObj;
                break;
            }
        }

        if ( ! host.isElectron) {

            let $logo = this.$el.find('.silky-bs-logo');
            if (op !== null) {
                $logo.text(op.title);
                $logo.addClass('ops-title');
            }
            else {
                $logo.text('');
                $logo.removeClass('ops-title');
            }
        }

        let $op = this.$ops.filter('[data-op="' + operation + '-item"]');
        let $opsButton = $op.find('.silky-bs-op-button').attr('tabindex', null);//.addClass('bs-menu-item-ignore');
        let $subOps = $op.find('.silky-bs-op-places');
        let $contents = $subOps.contents();
        let height = 0;
        for(let i = 0; i < $contents.length; i++) {
            height += $contents[i].offsetHeight;
        }
        $subOps.css('height', height);
        $subOps.css('opacity', 1);
        $subOps.css('visibility', 'visible');

        let hasPlaces = op !== null && op.places !== undefined;

        if (hasPlaces)
            $op.addClass('selected');

        if (operation && this.model.get('activated') && hasPlaces)
            this.$el.addClass('activated-sub');
        else
            this.$el.removeClass('activated-sub');

        setTimeout(() => {
            focusLoop.updateShortcuts({ silent: true });
        }, 200);
    }
});

const BackstageChoices = SilkyView.extend({
    className: 'silky-bs-choices',

    close: function() {
        this.remove();
        this.unbind();
        this.model.off('change:place', this._placeChanged);
    },

    initialize : function() {

        this.model.on('change:place', this._placeChanged, this);

        let html = '';

        html += '<div class="silky-bs-choices-list"></div>';
        html += '<div class="silky-bs-choices-list" style="display: none ;"></div>';

        this.$el.html(html);

        this.$choices = this.$el.find('.silky-bs-choices-list');
        this.$current = $(this.$choices[0]);
        this.$waiting = $(this.$choices[1]);

        this._placeChanged();
    },
    _placeChanged : function() {

        let place = this.model.getCurrentPlace();

        let  old = this.current;
        let $old = this.$current;

        if (place === null) {
            if ($old)
                $old.removeClass('fade-in');
            if (old)
                setTimeout(function() { old.remove(); }, 200);
            return;
        }

        if (place.model) {
            if ($old)
                $old.removeClass('fade-in');
            this.$current = $('<div class="silky-bs-choices-list" style="width:500px; height:100%;"></div>');
            this.$current.appendTo(this.$el);
            if (this.current)
                this.current.close();

            place.model.set('title', place.title);
            this.current = new place.view({ el: this.$current, model: place.model });

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
                this.$current.addClass('fade-in');
            }, 0);
        }

        if (place.view === FSEntryBrowserView) {
            if (this.model.hasCurrentDirectory(place.model.attributes.wdType) === false) {
                if (place.model.attributes.wdType === 'thispc') {
                    let filePath = this.model._determineSavePath('main');
                    this.model.setCurrentDirectory('main', path.dirname(filePath)).done();
                }
                else
                    this.model.setCurrentDirectory(place.model.attributes.wdType, '', null, place.model.writeOnly).done();  // empty string requests default path
            }
            else if (this.$current.attr('wdtype') === place.model.attributes.wdType)
                this.$current.removeClass('wd-changing');
        }

        if (old) {
            setTimeout(function() {
                old.remove();
            }, 200);
        }

        if ('action' in place)
            place.action();
    }
});

module.exports = { View: BackstageView, Model: BackstageModel };
