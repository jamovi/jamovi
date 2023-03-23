import SilkyView from '../view';
import $ from 'jquery';
import pathtools from '../utils/pathtools';
import { s6e } from '../../common/utils';
import focusLoop from '../../common/focusloop';
import * as path from 'path';

import { FSEntryListModel } from './fsentry';
import { FSItemType } from './fsentry';
import { isUrl } from './fsentry';

import host from '../host';


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

export const FSEntryBrowserView = SilkyView.extend({

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
            this.$items[selectedIndex].attr('aria-selected', 'true');
            this.$items[selectedIndex].find('.jmv-bs-fslist-checkbox').prop( 'checked', true );
            this._selected = true;

            let offset = this.$items[selectedIndex].position();
            if (offset.top < 0)
                this.$itemsList.animate({ scrollTop: this.$itemsList.scrollTop() + offset.top }, 100);
            this.updateActiveDescendant();
        }
    },
    _setSelection: function($target) {
        if (this._selectedIndices.length > 0)
            this.clearSelection();
        this._selectedIndices.push($target.data('index'));
        $target.addClass('silky-bs-fslist-selected-item');
        $target.attr('aria-selected', 'true');
        $target.find('.jmv-bs-fslist-checkbox').prop('checked', true);
        this.updateActiveDescendant();
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
    _createBody() {

        let isSaving = this.model.clickProcess === 'save' || this.model.clickProcess === 'export';

        let itemListId = focusLoop.getNextAriaElementId('list');

        if ( ! isSaving) {
            let searchHtml = `<div class="searchbox">
                            <div class="image"></div>
                            <input class="search" type="search" aria-label="${_('Search files')}" aria-controls="${itemListId}"></input>
                        </div>`;
            this.$el.append(searchHtml);

            let $search = this.$el.find('.searchbox > .search');
            if ($search.length > 0)
                focusLoop.applyShortcutOptions($search[0], { key: 'S', position: { x: '5%', y: '50%' } });
        }

        this.$itemsList = $(`<div id="${itemListId}" role="list" aria-multiselectable="false" class="silky-bs-fslist-items" style="flex: 1 1 auto; overflow: auto; height:100%" tabindex="0"></div>`);
        this.$el.append(this.$itemsList);
    },
    _createHeader() {
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

        this._createBody();

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


                let itemId = focusLoop.getNextAriaElementId('listitem');
                html += `<div id="${itemId}" class="silky-bs-fslist-item" role="listitem">`;
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
                this.$itemsList.attr('aria-multiselectable', 'false');
                this.$itemsList.find('.jmv-bs-fslist-checkbox').addClass('hidden');
                this.$footer.find('.silky-bs-fslist-import-options').addClass('hidden');
                this.clearSelection();
            }
            else {
                this.multiMode = true;
                this.$itemsList.attr('aria-multiselectable', 'true');
                this.$itemsList.find('.jmv-bs-fslist-checkbox').removeClass('hidden');
                this.$footer.find('.silky-bs-fslist-import-options').removeClass('hidden');
                $button.addClass('on');
            }
        }
    },
    _toggleMultiMode : function() {
        this._setMultiMode( ! this.multiMode);
    },
    updateActiveDescendant() {
        if (this._selectedIndices.length > 0) {
            let $activeItem = this.$items[this._selectedIndices[this._selectedIndices.length - 1]];
            this.$itemsList.attr('aria-activedescendant', $activeItem.attr('id'));
        }
        else
            this.$itemsList.attr('aria-activedescendant', '');
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
                        this.$items[index].attr('aria-selected', 'false');
                        this.$items[index].find('.jmv-bs-fslist-checkbox').prop('checked', false);
                        this._selectedIndices.splice(ii, 1);
                    }
                    else {
                        this._selectedIndices.push($target.data('index'));
                        $target.addClass('silky-bs-fslist-selected-item');
                        $target.attr('aria-selected', 'true');
                        $target.find('.jmv-bs-fslist-checkbox').prop('checked', true);
                    }
                    this._baseSelectionIndex = -1;
                }
                else if (shiftKey) {
                    for (let i of this._selectedIndices) {
                        this.$items[i].removeClass('silky-bs-fslist-selected-item');
                        this.$items[i].attr('aria-selected', 'false');
                        this.$items[i].find('.jmv-bs-fslist-checkbox').prop('checked', false);
                    }

                    let indices = [];
                    let start = this._baseSelectionIndex == -1 ? this._selectedIndices[this._selectedIndices.length - 1] : this._baseSelectionIndex;
                    for (let i = start; i !== index; i = i + ((index > start) ? 1 : -1)) {
                        indices.push(i);
                        this.$items[i].addClass('silky-bs-fslist-selected-item');
                        this.$items[i].attr('aria-selected', 'true');
                        this.$items[i].find('.jmv-bs-fslist-checkbox').prop('checked', true);
                    }
                    indices.push($target.data('index'));
                    $target.addClass('silky-bs-fslist-selected-item');
                    $target.attr('aria-selected', 'true');
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
                $target.attr('aria-selected', 'true');
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
                    this.$items[i].attr('aria-selected', 'false');
                    this.$items[i].find('.jmv-bs-fslist-checkbox').prop('checked', false);
                }
            }

            this._selectedIndices = [$target.data('index')];
            this._baseSelectionIndex = -1;
            let name = $target.data('name');
            $target.addClass('silky-bs-fslist-selected-item');
            $target.attr('aria-selected', 'true');
            $target.find('.jmv-bs-fslist-checkbox').prop('checked', true);

            this.$header.find('.silky-bs-fslist-browser-save-name').val(name);
            this._nameChanged();
            this._selected = true;
        }
        this.updateActiveDescendant();
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
                this.$items[i].find('.jmv-bs-fslist-checkbox').prop('checked', false);
                this.$items[i].attr('aria-selected', 'false');
            }
        }
        this._selectedIndices = [];
        this._baseSelectionIndex = -1;
        if (this.$footer)
            this.$footer.find('.silky-bs-fslist-browser-import-name').val('');
        this._selected = false;
        this.updateActiveDescendant();
    },

    incrementSelection: function() {
        let selectedIndex = this._selectedIndices.length > 0 ? this._selectedIndices[this._selectedIndices.length - 1] : (this.$items.length > 0 ? 0 : -1);
        if (selectedIndex !== -1 && selectedIndex !== this.$items.length - 1){
            this.clearSelection();
            selectedIndex += 1;
            this._selectedIndices = [selectedIndex];
            this._baseSelectionIndex = -1;
            this.$items[selectedIndex].addClass('silky-bs-fslist-selected-item');
            this.$items[selectedIndex].attr('aria-selected', 'true');
            this.$items[selectedIndex].find('.jmv-bs-fslist-checkbox').prop( 'checked', true );
            this._selected = true;

            let offset = this.$items[selectedIndex].position();
            let height = this.$items[selectedIndex].height();
            if (offset.top + height > this.$itemsList.height()) {
                let r = this.$itemsList.scrollTop() + (offset.top + height - this.$itemsList.height() + 1);
                this.$itemsList.animate({scrollTop: r}, 100);
            }
            this.updateActiveDescendant();
        }
    },
    decrementSelection: function() {
        let selectedIndex = this._selectedIndices.length > 0 ? this._selectedIndices[this._selectedIndices.length - 1] : (this.$items.length > 0 ? 0 : -1);
        if (selectedIndex > 0){
            this.clearSelection();
            selectedIndex -= 1;
            this._selectedIndices = [selectedIndex];
            this._baseSelectionIndex = -1;
            this.$items[selectedIndex].addClass('silky-bs-fslist-selected-item');
            this.$items[selectedIndex].attr('aria-selected', 'true');
            this.$items[selectedIndex].find('.jmv-bs-fslist-checkbox').prop( 'checked', true );
            this._selected = true;

            let offset = this.$items[selectedIndex].position();
            if (offset.top < 0)
                this.$itemsList.animate({ scrollTop: this.$itemsList.scrollTop() + offset.top }, 100);
            this.updateActiveDescendant();
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

