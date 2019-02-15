//
// Copyright (C) 2016 Jonathon Love
//

'use strict';

const SilkyView = require('./view');
const keyboardJS = require('keyboardjs');
const _ = require('underscore');
const $ = require('jquery');
const Backbone = require('backbone');
const Path = require('path');
Backbone.$ = $;

const tarp = require('./utils/tarp');
const pathtools = require('./utils/pathtools');

const host = require('./host');
const ActionHub = require('./actionhub');

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

const FSEntryListModel = Backbone.Model.extend({
    defaults: {
        items : [ ],
        error: '',
        browseable: true,
        extensions: true,
        multiselect: false,
        wdType: 'main'
    },
    requestOpen : function(path, type) {
        this.trigger('dataSetOpenRequested', path, type, this.get('wdType'));
    },
    requestImport : function(paths) {
        this.trigger('dataSetImportRequested', paths, FSItemType.File, this.get('wdType'));
    },
    requestSave : function(path, type) {
        this.trigger('dataSetSaveRequested', path, type, this.get('wdType'));
    },
    requestExport : function(path, type) {
        this.trigger('dataSetExportRequested', path, type, this.get('wdType'));
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
    events : {
        'click .silky-bs-fslist-entry' : '_itemClicked'
    },
    _render : function() {

        this.$el.addClass('silky-bs-fslist');

        var items = this.model.get('items');

        var html = '';

        for (var i = 0; i < items.length; i++) {
            var item = items[i];

            var name = item.name;
            var path = item.path;
            var location = '';

            if (item.location) {
                location = pathtools.normalise(item.location);
                location = location.replace(/\//g, ' \uFE65 ');
            }
            else if (item.description) {
                location = item.description;
            }

            html += '<div class="silky-bs-fslist-entry" data-path="' + path + '">';
            if (name.endsWith('.omv'))
                html += '    <div class="silky-bs-fslist-entry-icon silky-bs-flist-item-omv-icon"></div>';
            else
                html += '   <div class="silky-bs-fslist-entry-icon"></div>';
            html += '   <div class="silky-bs-fslist-entry-group">';
            html += '       <div class="silky-bs-fslist-entry-name">' + name + '</div>';
            html += '       <div class="silky-bs-fslist-entry-meta">' + location + '</div>';
            html += '   </div>';
            html += '</div>';
        }

        this.$el.html(html);
        this.$items = this.$el.find('.silky-bs-fslist-entry');
    },
    _itemClicked : function(event) {
        var target = event.currentTarget;
        var path = $(target).attr('data-path');
        this.model.requestOpen(path, FSItemType.File);
    }
});

var FSItemType = {
    File: 0,
    Folder: 1,
    Drive: 2,
    SpecialFolder: 3
};

var FSEntryBrowserView = SilkyView.extend({

    initialize : function() {
        this._selectedIndices = [];
        this._baseSelectionIndex = -1;
        this.multiMode = false;

        if ( ! this.model)
            this.model = new FSEntryListModel();

        this.model.on('change:items', this._render, this);
        this.model.on('change:dirInfo', this._render, this);

        this.$el.addClass('silky-bs-fslist');
        this.$el.attr('tabindex', 0);
        this._createHeader();
        this._render();
    },
    events : {
        'click .silky-bs-fslist-item' : '_itemClicked',
        'dblclick .silky-bs-fslist-item' : '_itemDoubleClicked',
        'click .silky-bs-fslist-browser-check-button' : '_toggleMultiMode',
        'click .silky-bs-fslist-browser-back-button' : '_backClicked',
        'click .silky-bs-fslist-browser-save-button' : '_saveClicked',
        'keydown .silky-bs-fslist-browser-save-name' : '_keyPressHandle',
        'change .silky-bs-fslist-browser-save-filetype' : '_saveTypeChanged',
        'change .silky-bs-fslist-browser-save-name' : '_nameChanged',
        'keyup .silky-bs-fslist-browser-save-name' : '_nameChanged',
        'paste .silky-bs-fslist-browser-save-name' : '_nameChanged',
        'focus .silky-bs-fslist-browser-save-name' : '_nameGotFocus',
        'focus .silky-bs-fslist-browser-save-filetype' : '_focusChanged',
        'click .silky-bs-fslist-browse-button' : '_manualBrowse',
        'keydown' : '_keyPressHandle',
        'keydown .silky-bs-fslist-browser-import-name' : '_importNameKeypressHandle',
        'click .silky-bs-fslist-browser-import-button' : '_importClicked',
        'change .silky-bs-fslist-browser-import-name' : '_importNameChanged',
        'keyup .silky-bs-fslist-browser-import-name' : '_importNameChanged',
        'paste .silky-bs-fslist-browser-import-name' : '_importNameChanged',
        'focus .silky-bs-fslist-browser-import-name' : '_nameGotFocus',
        'focus .silky-bs-fslist-browser-import-filetype' : '_focusChanged'
    },
    _saveTypeChanged : function() {
        var selected = this.$el.find('option:selected');
        this.filterExtensions = selected.data('extensions');
        this._render();
    },
    _validExtension : function(ext) {
        var extOptions = this.$el.find('.silky-bs-fslist-browser-save-filetype option');
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
            for (var i = 0; i < items.length - 1; i++) {
                var item1 = items[i];
                var item2 = items[i + 1];
                if ((direction === 0 && item1[orderby] > item2[orderby]) || (direction === 1 && item1[orderby] < item2[orderby])) {
                    items[i] = item2;
                    items[i+1] = item1;
                    if (i > 1)
                        i -= 2;
                }
            }
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
            let desc = this.model.fileExtensions[i].description;
            let selected = '';
            if (i === 0)
                selected = 'selected';
            html += "                   <option data-extensions='" + JSON.stringify(exts) + "' " + selected + " value=" + i + ">" + desc + "</option>";
        }
        //html += '                   <option data-extensions="[jasp]" value=".jasp">JASP File (.jasp)</option>';
        html += '               </select>';
        html += '           </div>';
        return html;
    },
    _createFooter: function() {
        let isSaving = this.model.clickProcess === 'save' || this.model.clickProcess === 'export';
        let multiSelect = this.model.get('multiselect');

        var html = '';
        html += '<div class="silky-bs-fslist-footer">';

        if (isSaving === false) {
            html += this._createFileTypeSelector();
            var extension = null;

            if (multiSelect) {
                html += '   <div class="silky-bs-fslist-import-options hidden" style="display: flex; flex-flow: row nowrap;">';
                html += '       <input class="silky-bs-fslist-browser-import-name" type="text" placeholder="Enter file name here" />';
                html += '       <div class="silky-bs-fslist-browser-import-button" style="display: flex; flex: 0 0 auto;">';
                html += '           <div class="silky-bs-flist-import-icon"></div>';
                html += '           <span>Import</span>';
                html += '       </div>';
                html += '   </div>';
            }
        }

        html += '</div>';
        this.$footer = $(html);

        this.$el.append(this.$footer);
    },
    _createHeader: function() {
        var html = '';
        html += '<div class="silky-bs-fslist-header">';


        let isSaving = this.model.clickProcess === 'save' || this.model.clickProcess === 'export';

        /////////////////////////////////////////////////////
        var extension = null;

        if (isSaving) {
            html += '   <div class="silky-bs-fslist-save-options" style="display: flex; flex-flow: row nowrap;">';
            html += '       <div style="flex: 1 1 auto;">';

            var path = this.model.suggestedPath;
            var insert = '';
            if (path) {
                extension = Path.extname(path);
                insert = ' value="' + Path.basename(path, extension) + '"';
            }

            html += '           <input class="silky-bs-fslist-browser-save-name" type="text" placeholder="Enter file name here"' + insert + ' />';

            html += this._createFileTypeSelector();
            html += '       </div>';
            html += '       <div class="silky-bs-fslist-browser-save-button' + (path ? '' : " disabled-div") + '" style="display: flex; flex: 0 0 auto;">';
            html += '           <div class="silky-bs-flist-save-icon"></div>';
            if (this.model.clickProcess === 'save')
                html += '           <span>Save</span>';
            else if (this.model.clickProcess === 'export')
                html += '           <span>Export</span>';
            html += '       </div>';
            html += '   </div>';
        }

        ////////////////////////////////////////////////

        html += '   <div class="silky-bs-fslist-path-browser">';
        if (this.model.get('multiselect'))
            html += '       <div class="silky-bs-fslist-browser-check-button"></div>';
        html += '       <div class="silky-bs-fslist-browser-back-button"><span class="mif-arrow-up"></span></div>';
        html += '       <div class="silky-bs-fslist-browser-location" style="flex: 1 1 auto;"></div>';

        if (this.model.attributes.browseable && host.isElectron) {
            html += '       <div class="silky-bs-fslist-browse-button">';
            html += '           <div class="silky-bs-fslist-browser-location-icon silky-bs-flist-item-folder-browse-icon"></div>';
            html += '           <span>Browse</span>';
            html += '       </div>';
        }

        html += '   </div>';

        html += '</div>';
        this.$header = $(html);
        this.$header.find('.silky-bs-fslist-browser-save-name').focus(function() { $(this).select(); } );

        this.$el.append(this.$header);

        this.$itemsList = $('<div class="silky-bs-fslist-items" style="flex: 1 1 auto; overflow-x: hidden; overflow-y: auto; height:100%"></div>');
        this.$el.append(this.$itemsList);

        if (this.model.clickProcess === 'save' || this.model.clickProcess === 'export') {
            setTimeout(() => {
                this.$header.find('.silky-bs-fslist-browser-save-name').focus();
            }, 50);
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
    _render : function() {

        var items = this.model.get('items');
        var dirInfo = this.model.get('dirInfo');

        var path = null;
        if (dirInfo !== undefined)
            path = pathtools.normalise(dirInfo.path).replace(/\//g, ' \uFE65 ');

        this.$header.find('.silky-bs-fslist-browser-location').text(path);

        var html = '';
        this._orderItems('type', 1, items);
        this.$items = [];
        this.$itemsList.empty();

        for (var i = 0; i < items.length; i++) {
            html = '';
            var item = items[i];

            var name = item.name;
            var itemPath = item.path;
            var itemType = item.type;

            if (itemType === FSItemType.File && ! item.isExample && ! this._hasValidExtension(name))
                continue;

            html += '<div class="silky-bs-fslist-item">';
            if (itemType === FSItemType.File)
                html += '<input class="jmv-bs-fslist-checkbox' + (this.multiMode ? '' : ' hidden') + '" type="checkbox">';
            html += '   <div class="silky-bs-flist-item-icon">';
            if (itemType === FSItemType.File) { //file
                if (item.isExample) // examples don't have extensions
                    html += '       <div class="silky-bs-flist-icon silky-bs-flist-item-csv-icon"></div>';
                else if (name.endsWith('.csv'))
                    html += '       <div class="silky-bs-flist-icon silky-bs-flist-item-csv-icon"></div>';
                else if (name.endsWith('.omv'))
                    html += '       <div class="silky-bs-flist-icon silky-bs-flist-item-omv-icon"></div>';
                else if (name.endsWith('.pdf'))
                    html += '       <span class="mif-file-pdf"></span>';
                else
                    html += '       <span class="mif-file-empty"></span>';
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
                    html += '<span class="description">' + item.description + '</span>';
                }
                if (item.tags) {
                    html += '<div class="tags">';
                    for (let tag of item.tags) {
                        let hue = crc16(tag) % 360;
                        html += '<div class="tag" style="background-color: hsl(' + hue + ', 70%, 45%); border-color: hsl(' + hue + ', 70%, 45%);">' + tag + '</div>';
                    }
                    html += '</div>';
                }
                if (item.license) {
                    html += '<div class="license">Licensed ' + item.license + '</div>';
                }
                html += '       </div>';
                html += '   </div>';
            }
            else {
                html += '   <div class="silky-bs-fslist-entry-name">' + name + '</div>';
            }

            html += '</div>';

            var $item = $(html);
            $item.data('name', name);
            $item.data('path', itemPath);
            $item.data('type', itemType);
            $item.data('index', this.$items.length);
            this.$itemsList.append($item);
            this.$items.push($item);
        }

        let errorMessage = this.model.get('error');
        if (errorMessage !== '')
            this.$itemsList.append("<span>" + errorMessage + "</span>");
        else if (this.$items.length === 0)
            this.$itemsList.append("<span>No recognised data files were found.</span>");
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
    _itemClicked : function(event) {
        let $target = $(event.currentTarget);
        let fromChecked = $target.hasClass('silky-bs-fslist-selected-item') !== $target.find('.jmv-bs-fslist-checkbox').prop("checked");
        let multiSelect = this.model.get('multiselect');
        let modifier = event.ctrlKey || event.metaKey || event.shiftKey || fromChecked;

        var itemType = $target.data('type');
        var itemPath = $target.data('path');
        if (itemType !== FSItemType.File || this.model.clickProcess === 'open') {
            this.clearSelection();
            this.model.requestOpen(itemPath, itemType);
        }
        else if (itemType === FSItemType.File && this.model.clickProcess === 'import') {
            if (multiSelect && this._selectedIndices.length > 0 && modifier) {
                let index = $target.data('index');
                if (event.ctrlKey || event.metaKey || fromChecked) {
                    let ii = this._selectedIndices.indexOf(index);
                    if (ii != -1) {
                        this.$items[index].removeClass('silky-bs-fslist-selected-item');
                        this.$items[index].find('.jmv-bs-fslist-checkbox').prop( "checked", false );
                        this._selectedIndices.splice(ii, 1);
                    }
                    else {
                        this._selectedIndices.push($target.data('index'));
                        $target.addClass('silky-bs-fslist-selected-item');
                        $target.find('.jmv-bs-fslist-checkbox').prop( "checked", true );
                    }
                    this._baseSelectionIndex = -1;
                }
                else if (event.shiftKey) {
                    for (let i of this._selectedIndices) {
                        this.$items[i].removeClass('silky-bs-fslist-selected-item');
                        this.$items[i].find('.jmv-bs-fslist-checkbox').prop( "checked", false );
                    }

                    let indices = [];
                    let start = this._baseSelectionIndex == -1 ? this._selectedIndices[this._selectedIndices.length - 1] : this._baseSelectionIndex;
                    for (let i = start; i !== index; i = i + ((index > start) ? 1 : -1)) {
                        indices.push(i);
                        this.$items[i].addClass('silky-bs-fslist-selected-item');
                        this.$items[i].find('.jmv-bs-fslist-checkbox').prop( "checked", true );
                    }
                    indices.push($target.data('index'));
                    $target.addClass('silky-bs-fslist-selected-item');
                    $target.find('.jmv-bs-fslist-checkbox').prop( "checked", true );
                    this._selectedIndices = indices;
                    this._baseSelectionIndex = this._selectedIndices[0];
                }
            }
            else {
                if (this._selectedIndices.length > 0)
                    this.clearSelection();
                this._selectedIndices.push($target.data('index'));
                $target.addClass('silky-bs-fslist-selected-item');
                $target.find('.jmv-bs-fslist-checkbox').prop( "checked", true );
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
                    this.$items[i].find('.jmv-bs-fslist-checkbox').prop( "checked", false );
                }
            }

            this._selectedIndices = [$target.data('index')];
            this._baseSelectionIndex = -1;
            var name = $target.data('name');
            $target.addClass('silky-bs-fslist-selected-item');
            $target.find('.jmv-bs-fslist-checkbox').prop( "checked", true );

            this.$header.find('.silky-bs-fslist-browser-save-name').val(name);
            this._nameChanged();
            this._selected = true;
        }
    },
    _keyPressHandle : function(event) {
        if (event.metaKey || event.ctrlKey || event.altKey)
            return;

        switch(event.key) {
            case 'ArrowUp':
                this.decrementSelection();
                event.preventDefault();
                break;
            case 'ArrowDown':
                this.incrementSelection();
                event.preventDefault();
                break;
            case 'Enter':
                if (this._selectedIndices.length > 0) {
                    var $target = this.$items[this._selectedIndices[0]];
                    var itemType = $target.data('type');
                    var itemPath = $target.data('path');
                    if (itemType !== FSItemType.File || this.model.clickProcess === 'open')
                        this.model.requestOpen(itemPath, itemType);
                    else if (itemType === FSItemType.File && this.model.clickProcess === 'import')
                        this.model.requestImport(this._getSelectedPaths());
                    else if (itemType === FSItemType.File && this.model.clickProcess === 'save')
                        this.model.requestSave(itemPath, itemType);
                    else if (itemType === FSItemType.File && this.model.clickProcess === 'export')
                        this.model.requestExport(itemPath, itemType);
                }
                event.preventDefault();
                break;
        }
    },
    clearSelection: function() {
        for (let i of this._selectedIndices) {
            this.$items[i].removeClass('silky-bs-fslist-selected-item');
            this.$items[i].find('.jmv-bs-fslist-checkbox').prop( "checked", false );
        }
        this._selectedIndices = [];
        this._baseSelectionIndex = -1;
        if (this.$footer)
            this.$footer.find('.silky-bs-fslist-browser-import-name').val('');
        this._selected = false;
    },
    incrementSelection: function() {
        let selectedIndex = this._selectedIndices.length > 0 ? this._selectedIndices[0] : -1;
        if (selectedIndex !== -1 && selectedIndex !== this.$items.length - 1){
            this.clearSelection();
            selectedIndex += 1;
            this._selectedIndices = [selectedIndex];
            this._baseSelectionIndex = -1;
            this.$items[selectedIndex].addClass('silky-bs-fslist-selected-item');
            this.$items[selectedIndex].find('.jmv-bs-fslist-checkbox').prop( "checked", true );
            this._selected = true;

            var offset = this.$items[selectedIndex].position();
            var height = this.$items[selectedIndex].height();
            if (offset.top + height > this.$itemsList.height()) {
                var r = this.$itemsList.scrollTop() + (offset.top + height - this.$itemsList.height() + 1);
                this.$itemsList.animate({scrollTop: r}, 100);
            }
        }
    },
    decrementSelection: function() {
        let selectedIndex = this._selectedIndices.length > 0 ? this._selectedIndices[0] : -1;
        if (selectedIndex > 0){
            this.clearSelection();
            selectedIndex -= 1;
            this._selectedIndices = [selectedIndex];
            this._baseSelectionIndex = -1;
            this.$items[selectedIndex].addClass('silky-bs-fslist-selected-item');
            this.$items[selectedIndex].find('.jmv-bs-fslist-checkbox').prop( "checked", true );
            this._selected = true;

            var offset = this.$items[selectedIndex].position();
            if (offset.top < 0)
                this.$itemsList.animate({scrollTop: this.$itemsList.scrollTop() + offset.top}, 100);
        }
    },
    _itemDoubleClicked : function(event) {
        var $target = $(event.currentTarget);
        var itemType = $target.data('type');
        var itemPath = $target.data('path');
        if (itemType === FSItemType.File)
            this._setMultiMode(false);
        if (itemType !== FSItemType.File || this.model.clickProcess === 'open')
            this.model.requestOpen(itemPath, itemType);
        else if (itemType === FSItemType.File && this.model.clickProcess === 'import')
            this.model.requestImport([itemPath]);
        else if (itemType === FSItemType.File && this.model.clickProcess === 'save')
            this.model.requestSave(itemPath, itemType);
        else if (itemType === FSItemType.File && this.model.clickProcess === 'export')
            this.model.requestExport(itemPath, itemType);
    },
    _nameChanged : function(event) {
        let $button = this.$header.find('.silky-bs-fslist-browser-save-button');
        var name = this.$header.find('.silky-bs-fslist-browser-save-name').val().trim();
        if (name === '')
            $button.addClass('disabled-div');
        else
            $button.removeClass('disabled-div');

    },
    _importNameChanged : function(event) {
        let $button = this.$footer.find('.silky-bs-fslist-browser-import-button');
        var name = this.$footer.find('.silky-bs-fslist-browser-import-name').val().trim();
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
        var dirInfo = this.model.get('dirInfo');
        if (dirInfo !== undefined) {
            var name = this.$header.find('.silky-bs-fslist-browser-save-name').val().trim();
            if (name === '')
                return;

            if (this._hasValidExtension(name) === false)
                name = name + '.' + this.filterExtensions[0];
            var path = dirInfo.path + '/' + name;
            if (this.model.clickProcess === 'save')
                this.model.requestSave(path, FSItemType.File);
            else if (this.model.clickProcess === 'export')
                this.model.requestExport(path, FSItemType.File);
        }
    },
    _importClicked : function(event) {
        if (this._selectedIndices.length > 0)
            this.model.requestImport(this._getSelectedPaths());
        else {
            var dirInfo = this.model.get('dirInfo');
            if (dirInfo !== undefined) {
                var name = this.$footer.find('.silky-bs-fslist-browser-import-name').val().trim();
                if (name === '')
                    return;

                this.model.requestImport([ dirInfo.path + '/' + name ]);
            }
        }
    },
    _backClicked : function(event) {
        var dirInfo = this.model.get('dirInfo');
        if (dirInfo !== undefined) {
            var path = dirInfo.path;
            path = this._calcBackDirectory(path, dirInfo.type);
            this._goToFolder(path);
            this.clearSelection();
        }
    },
    _goToFolder: function(path) {
        this.model.requestOpen(path, FSItemType.Folder);
    },
    _calcBackDirectory: function(path, type) {
        var index = -1;
        if (path.length > 0 && path !== '/') {
            index = path.lastIndexOf("/");
            if (index !== -1 && index === path.length - 1)
                index = path.lastIndexOf("/", path.length - 2);
        }

        if (index === -1) {
            if (this.model.attributes.wdType === 'examples')
                return '{{Examples}}';

            return '{{Root}}';
        }

        return path.substring(0, index);
    }
});

var InDevelopmentView = SilkyView.extend({
    initialize : function() {
        this.render();
    },
    render: function() {
        this.$el.addClass('silky-under-development');
        this.$el.append('<div class="silky-development-title">' + this.model.title + '</div>');
        this.$el.append('<div class="silky-development-msg">' + this.model.msg + "</div>");
    }
});

var BackstageModel = Backbone.Model.extend({
    defaults: {
        activated : false,
        task : '',
        taskProgress : 0,
        operation : '',
        place : '',
        lastSelectedPlace : '',
        settings : null,
        ops : [ ],
    },
    initialize : function(args) {

        this.instance = args.instance;
        this._hasCurrentDirectory = false;

        this.instance.settings().on('change:recents',
            (event) => this._settingsChanged(event));
        this.instance.settings().on('change:examples',
            (event) => this._settingsChanged(event));

        this._wdData = {
            main: { defaultPath: '{{Documents}}' },
            examples: { defaultPath: '{{Examples}}' }
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
            { description: 'Data files', extensions: [
                'omv', 'csv', 'txt', 'sav', 'zsav', 'por',
                'rdata', 'rds', 'dta', 'sas7bdat', 'xpt', 'jasp',
            ]},
            { description: 'jamovi files (.omv)', extensions: ['omv'] },
            { description: 'CSV (Comma delimited) (.csv, .txt)', extensions: ['csv', 'txt'] },
            { description: 'SPSS files (.sav, .zsav, .por)', extensions: ['sav', 'zsav', 'por'] },
            { description: 'R data files (.RData, .RDS)', extensions: ['rdata', 'rds'] },
            { description: 'Stata files (.dta)', extensions: ['dta'] },
            { description: 'SAS files (.xpt, .sas7bdat)', extensions: ['xpt', 'sas7bdat'] },
            { description: 'JASP files (.jasp)', extensions: ['jasp'] },
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
        this._pcSaveListModel.suggestedPath = null;
        this._pcSaveListModel.fileExtensions = [ { extensions: ['omv'], description: "jamovi file (.omv)" } ];
        this._pcSaveListModel.on('dataSetOpenRequested', this.tryOpen, this);
        this._pcSaveListModel.on('dataSetSaveRequested', this.trySave, this);
        this._pcSaveListModel.on('browseRequested', this.tryBrowse, this);
        this.addToWorkingDirData(this._pcSaveListModel);

        this._pcExportListModel = new FSEntryListModel();
        this._pcExportListModel.clickProcess = 'export';
        this._pcExportListModel.suggestedPath = null;
        this._pcExportListModel.fileExtensions = [
            { extensions: ['csv'], description: 'CSV (Comma delimited) (.csv)' },
            { extensions: ['rds'], description: 'R object (.rds)' },
            { extensions: ['RData'], description: 'R object (.RData)' },
            { extensions: ['sav'], description: 'SPSS sav (.sav)' },
            // { extensions: ['por'], description: 'SPSS portable (.por)' },  // crashes?!
            { extensions: ['sas7bdat'], description: 'SAS 7bdat (.sas7bdat)' },
            { extensions: ['xpt'], description: 'SAS xpt (.xpt)' },
            { extensions: ['dta'], description: 'Stata (.dta)' },
        ];
        this._pcExportListModel.on('dataSetExportRequested', this.tryExport, this);
        this._pcExportListModel.on('dataSetOpenRequested', this.tryOpen, this);
        this._pcExportListModel.on('browseRequested', this.tryBrowse, this);
        this.addToWorkingDirData(this._pcExportListModel);

        this._savePromiseResolve = null;

        ActionHub.get('save').on('request', () => this.requestSave(this.instance.get('path'), true));

        this.attributes.ops = [
            {
                name: 'new',
                title: 'New',
                action: () => { this.requestOpen(''); }
            },
            {
                name: 'open',
                title: 'Open',
                action: () => {
                    let place = this.instance.settings().getSetting('openPlace', 'thispc');
                    if (place === 'thispc') {
                        let path = this._determineSavePath();
                        return this.setCurrentDirectory('main', Path.dirname(path)).then(() => {
                            this.attributes.place = place;
                        });
                    }
                    else
                        this.attributes.place = place;
                },
                places: [
                    { name: 'thispc', title: 'This PC', model: this._pcListModel, view: FSEntryBrowserView },
                    { name: 'examples', title: 'Data Library', model: this._examplesListModel, view: FSEntryBrowserView },
                ]
            },
            {
                name: 'import',
                title: 'Import',
                action: () => {
                    let place = this.instance.settings().getSetting('openPlace', 'thispc');
                    if (place === 'thispc') {
                        let path = this._determineSavePath();
                        return this.setCurrentDirectory('main', Path.dirname(path)).then(() => {
                            this.attributes.place = place;
                        });
                    }
                    else
                        this.attributes.place = place;
                },
                places: [
                    { name: 'thispc', title: 'This PC', model: this._pcImportListModel, view: FSEntryBrowserView }]
            },
            {
                name: 'save',
                title: 'Save',
                action: () => {
                    this.requestSave(this.instance.get('path'), true);
                }
            },
            {
                name: 'saveAs',
                title: 'Save As',
                action: () => {
                    let path = this._determineSavePath();
                    return this.setCurrentDirectory('main', Path.dirname(path)).then(() => {
                        this._pcSaveListModel.suggestedPath = path;
                    });
                },
                places: [
                    { name: 'thispc', title: 'This PC', separator: true, model: this._pcSaveListModel, view: FSEntryBrowserView },
                ]
            },
            {
                name: 'export',
                title: 'Export',
                places: [
                    {
                        name: 'dataExport',
                        title: 'Data',
                        separator: true,
                        action: () => {
                            this._pcExportListModel.fileExtensions = [ { extensions: ['csv'], description: 'CSV (Comma delimited) (.csv)' },
                            { extensions: ['rds'], description: 'R object (.rds)' },
                            { extensions: ['RData'], description: 'R object (.RData)' },
                            { extensions: ['sav'], description: 'SPSS sav (.sav)' },
                            // { extensions: ['por'], description: 'SPSS portable (.por)' },  // crashes?!
                            { extensions: ['sas7bdat'], description: 'SAS 7bdat (.sas7bdat)' },
                            // { extensions: ['xpt'], description: 'SAS xpt (.xpt)' },  // crashes on open
                            { extensions: ['dta'], description: 'Stata (.dta)' }, ];
                        },
                        model: this._pcExportListModel,
                        view: FSEntryBrowserView
                    },
                    //{ name: 'excelDoc',    title: 'As Excel document', separator: true, model: { title: "Exporting to an Excel document is under development", msg: "Support for exporting your data to other formats is coming soon!" }, view: InDevelopmentView },
                    {
                        name: 'resultsExport',
                        title: 'Results',
                        action: () => {
                            this._pcExportListModel.fileExtensions = [ { extensions: ['pdf'], description: "Portable Document Format (.pdf)" }, { extensions: ['html', 'htm'], description: "Web Page (.html, .htm)" } ];
                        },
                        model: this._pcExportListModel,
                        view: FSEntryBrowserView
                    },
                    //{ name: 'browse', title: 'Browse', action: () => { this._browse('export'); } }
                ]
            }
        ];
    },
    addToWorkingDirData: function(model) {
        let wdType = model.attributes.wdType;
        if (this._wdData[wdType].models === undefined) {
            let wdTypeData = this._wdData[wdType];
            wdTypeData.wd =  this.instance.settings().getSetting(wdType + 'WorkingDir', wdTypeData.defaultPath);
            wdTypeData.models = [ ];
            wdTypeData.path = '';
            wdTypeData.initialised = false;
            wdTypeData.wd = '';
            this.instance.settings().on('change:' + wdType + 'WorkingDir', (event) => {
                this._wdData[wdType].defaultPath = this.instance.settings().getSetting(wdType + 'WorkingDir', wdTypeData.defaultPath);
            });
        }
        this._wdData[wdType].models.push(model);
    },
    tryBrowse: function(list, type, filename) {
        if (host.isElectron) {

            var remote = window.require('electron').remote;
            let browserWindow = remote.getCurrentWindow();
            var dialog = remote.dialog;

            let filters = [];
            for (let i = 0; i < list.length; i++)
                filters.push({ name: list[i].description, extensions: list[i].extensions });
            let osPath = this._wdData.main.oswd;

            if (type === 'open') {

                dialog.showOpenDialog(browserWindow, { filters: filters, properties: [ 'openFile' ], defaultPath: Path.join(osPath, '') }, (fileNames) => {
                    if (fileNames) {
                        let path = fileNames[0].replace(/\\/g, '/');
                        this.requestOpen(path);
                    }
                });
            }
            else if (type === 'import') {

                dialog.showOpenDialog(browserWindow, {
                    filters: filters,
                    properties: [ 'openFile', 'multiSelections' ],
                    defaultPath: Path.join(osPath, '') },
                    (fileNames) => {
                        if (fileNames) {
                            let paths = fileNames.map(x => x.replace(/\\/g, '/'));
                            this.requestImport(paths);
                        }
                    });
            }
            else if (type === 'save') {

                dialog.showSaveDialog(browserWindow, { filters : filters, defaultPath: Path.join(osPath, filename) }, (fileName) => {
                    if (fileName) {
                        fileName = fileName.replace(/\\/g, '/');
                        this.requestSave(fileName, true);
                    }
                });
            }
        }
        else {
            this.trigger("browse_invoker");
        }
    },
    getCurrentOp: function() {
        var names = _.pluck(this.attributes.ops, 'name');
        var index = names.indexOf(this.attributes.operation);

        if (index !== -1)
            return this.attributes.ops[index];
        else
            return null;
    },
    getCurrentPlace: function() {

        var op = this.getCurrentOp();
        if (op === null)
            return null;

        var names = _.pluck(op.places, 'name');
        var index = names.indexOf(this.attributes.place);

        if (index === -1)
            index = 0;

        return op.places[index];
    },
    tryOpen: function(path, type, wdType) {
        if (type === FSItemType.File)
            this.requestOpen(path);
        else if (type === FSItemType.Folder || type === FSItemType.Drive || type === FSItemType.SpecialFolder) {
            wdType = wdType === undefined ? 'main' : wdType;
            this.setCurrentDirectory(wdType, path, type)
                .done();
        }
    },
    tryImport: function(paths, type, wdType) {
        this.requestImport(paths);
    },
    trySave: function(path, type) {
        this.requestSave(path);
    },
    tryExport: function(path, type) {
        this.requestExport(path);
    },
    setCurrentDirectory: function(wdType, path, type) {
        if (path === '')
            path = this._wdData[wdType].defaultPath;

        let promise = this.instance.browse(path);
        promise = promise.then(response => {
            let path = response.path;
            let wdData = this._wdData[wdType];
            this.instance.settings().setSetting(wdType + 'WorkingDir', path);
            wdData.path = path;
            wdData.oswd = response.osPath;
            for (let model of wdData.models) {
                model.set('error', '');
                model.set('items', response.contents);
                model.set('dirInfo', { path: path, type: type } );
            }
            wdData.initialised = true;
        }, (error) => {

            if (path === '')
                path = '/';

            let wdData = this._wdData[wdType];
            wdData.path = path;
            wdData.oswd = path;
            for (let model of wdData.models) {
                model.set('error', `${error.message} (${error.cause})`);
                model.set('items', [ ]);
                model.set('dirInfo', { path: path, type: FSItemType.Folder } );
            }

            wdData.initialised = true;
        });
        return promise;
    },
    hasCurrentDirectory: function(wdType) {
        return this._wdData[wdType].initialised;
    },
    _opChanged: function() {

        var op = this.getCurrentOp();
        if (op === null)
            return;

        let promise = null;
        if ('action' in op)
            promise = op.action();

        if ( ! promise)
            promise = Promise.resolve();

        promise.then(() => {
            if ('places' in op) {
                var names = _.pluck(op.places, 'name');
                var index = names.indexOf(this.attributes.lastSelectedPlace);

                if (index === -1)
                    index = names.indexOf(this.attributes.place);

                if (index === -1)
                    index = 0;

                var place = op.places[index].name;
                var old = this.attributes.place;

                this.attributes.place = place;
                setTimeout(() => {
                    this.trigger('change:place');
                }, 0);
            }
        });

        if (promise.done)  // if Q promise
            promise.done();
    },
    _placeChanged : function() {
        if (this.attributes.place !== '')
            this.instance.settings().setSetting('openPlace', this.attributes.place);
    },
    uploadFile: function(file) {

        var data = new FormData();
        data.append('file', file);

        var url = this.get('hostBaseUrl') + 'upload';

        $.ajax({
            url : url,
            type: 'POST',
            data: data,
            xhr: () => {
                var xhr = $.ajaxSettings.xhr();
                xhr.upload.addEventListener('progress', this.progressHandler);
                return xhr;
            },
            processData: false,
            contentType: false,
            cache: false
        });
    },
    requestOpen: function(path) {
        let deactivated = false;
        let deactivate = () => {
            if ( ! deactivated) {
                this.set('activated', false);
                deactivated = true;
            }
        };
        this.instance.open(path)
            .then(deactivate, undefined, deactivate);
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
    externalRequestSave: function(path, overwrite) {

        // can be called as externalRequestSave(path, overwrite), externalRequestSave(path), externalRequestSave(), externalRequestSave(overwrite)

        // if path is not specified then the current opened path is used. If overwrite is not specified it defaults to false.
        // if overwrite is false and the specified file already exists a popup asks for overwrite.
        // if overwrite is true and the specified file already exists the file is overwritten.

        if (this.get('activated'))
            throw 'This method can only be called from outside of backstage.';

        if (this.instance.attributes.path)
            return this.requestSave(this.instance.attributes.path, true);

        let rej;
        let prom = new Promise((resolve, reject) => {
            this._savePromiseResolve = resolve;
            rej = reject;
        }).then(() => {
            this._savePromiseResolve = null;
        });

        this.requestSave(path, overwrite).catch(() => {
            this.once('change:activated', () => {
                if (this._savePromiseResolve !== null) {
                    this._savePromiseResolve = null;
                    rej();
                }
            });
        });

        return prom;
    },
    requestExport: function(path, overwrite) {
        let options = { export: true };
        this.setSavingState(true);
        this.instance.save(path, options, overwrite)
            .then(() => {
                this.setSavingState(false);
                this.setCurrentDirectory('main', Path.dirname(path));
                this.set('activated', false);
            }).catch(() => {
                this.setSavingState(false);
                this.set('activated', true);
                this.set('operation', 'export');
            });
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
    requestSave: function(path, overwrite) {

        // can be called as requestSave(path, overwrite), requestSave(path), requestSave(), requestSave(overwrite)

        // if path is not specified then the current opened path is used. If overwrite is not specified it defaults to false.
        // if overwrite is false and the specified file already exists a popup asks for overwrite.
        // if overwrite is true and the specified file already exists the file is overwritten.

        if (overwrite === undefined && typeof path === 'boolean') {
            overwrite = path;
            path = null;
        }

        return new Promise((resolve, reject) => {
            if ( ! path) {
                this.set('activated', true);
                this.set('operation', 'saveAs');
                reject();
                return;
            }

            this.setSavingState(true);
            this.instance.save(path, undefined, overwrite)
                .then(() => {
                    this.setSavingState(false);
                    if (this._savePromiseResolve !== null)
                        this._savePromiseResolve();
                    this.set('activated', false);
                    this.trigger('saved');
                    resolve();
                }).catch(error => {
                    this.setSavingState(false);
                    this.set('activated', true);
                    this.set('operation', 'saveAs');
                    reject(error);
                });
        });
    },
    _determineSavePath: function() {
        let path = this.instance.get('path');
        if (path)
            return path;

        path = this.instance.get('importPath');
        if (path) {
            if (path.endsWith('.omv'))
                return path;
            else
                return Path.join(Path.dirname(path), Path.basename(path, Path.extname(path)) + '.omv');
        }

        let base = this.instance.settings().getSetting('mainWorkingDir', '{{Documents}}');
        return Path.join(base, this.instance.get('title') + '.omv');
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
    }
});

var BackstageView = SilkyView.extend({
    className: 'backstage',
    initialize: function() {
        this.$el.attr('tabindex', 0);
        this.render();
        this.model.on("change:activated", this._activationChanged, this);
        this.model.on('change:operation', this._opChanged, this);
        this.model.on('change:place',     this._placeChanged, this);
    },
    events: {
        'click .silky-bs-back-button div' : 'deactivate',
        'keydown' : '_keypressHandle'
    },
    _keypressHandle: function(event) {
        if (event.metaKey || event.ctrlKey || event.altKey)
            return;

        switch(event.key) {
            case 'Escape':
                this.deactivate();
                break;
        }
    },
    render: function() {

        this.$el.addClass('silky-bs');

        var html = '';

        html += '<div class="silky-bs-op silky-bs-op-panel">';
        html += '    <div class="silky-bs-header">';
        html += '        <div class="silky-bs-back">';
        html += '            <div class="silky-bs-back-button"><div></div></div>';
        html += '        </div>';
        html += '        <div class="silky-bs-logo"></div>';
        html += '    </div>';
        html += '</div>';

        this.$opPanel = $(html);
        this.$opPanel.appendTo(this.$el);

        $('<div class="silky-bs-main"></div>').appendTo(this.$el);

        let createCallback = (place, op) => {
            return (event) => {
                this.model.set('op', op.name);

                if ('action' in place)
                    place.action();

                if ('view' in place) {
                    this.model.set('lastSelectedPlace', place.name);
                    this.model.set('place', place.name);
                }
            };
        };

        let $opList = $('<div class="silky-bs-op-list"></div>');
        var currentOp = null;
        for (let i = 0; i < this.model.attributes.ops.length; i++) {
            let op = this.model.attributes.ops[i];
            let selected = (op.name === this.model.attributes.operation);
            if (selected)
                currentOp = op;

            let $op = $('<div class="silky-bs-menu-item" data-op="' + op.name + '-item"></div>');
            let $opTitle = $('<div class="silky-bs-op-button" data-op="' + op.name + '">' + op.title + '</div>').appendTo($op);



            if ('places' in op) {
                let $opPlaces = $('<div class="silky-bs-op-places"></div>');
                for (let place of op.places) {
                    let $opPlace = $('<div class="silky-bs-op-place" data-op="' + place.name + '"' + '>' + place.title + '</div>');
                    $opPlace.on('click', createCallback(place, op));
                    $opPlaces.append($opPlace);

                }
                $opPlaces.appendTo($op);
            }

            op.$el = $op;
            $op.on('click', op, _.bind(this._opClicked, this));
            $opList.append($op);
        }
        this.$opPanel.append($opList);

        this.$opPanel.append($('<div class="silky-bs-op-separator"></div>'));

        // this.$opPanel.append($('<div class="silky-bs-op-button" data-op="' + 'Examples' + '" ' + '>' + 'Examples' + '</div>'));

        let $op = $('<div class="silky-bs-op-recents-main"></div>');
        let $opTitle = $('<div class="silky-bs-op-header" data-op="' + 'Recent' + '" ' + '>' + 'Recent' + '</div>').appendTo($op);
        let $recentsBody = $('<div class="silky-bs-op-recents"></div>').appendTo($op);
        $op.appendTo(this.$opPanel);

        let recentsModel = this.model.recentsModel();
        let recentsView = new FSEntryListView({el: $recentsBody, model: recentsModel});


        this.$browseInvoker = this.$el.find('.silky-bs-place-invoker');
        this.$ops = this.$el.find('.silky-bs-menu-item');

        this._opChanged();

        //if ('places' in currentOp)
        //    this.main = new BackstagePlaces({ el: ".silky-bs-main", model: this.model });
        this.main = new BackstageChoices({ el: '.silky-bs-main', model : this.model });
    },
    activate : function() {

        keyboardJS.pause();
        this.$el.addClass('activated');

        tarp.show('backstage', true, 0.3).then(
            undefined,
            () => this.deactivate());

        this.model.set('activated', true);

        $('body').find('.app-dragable').addClass('ignore');

        setTimeout(() => {
            this.$el.focus();
        }, 0);
    },
    deactivate : function() {

        keyboardJS.resume();
        tarp.hide('backstage');
        this.$el.removeClass('activated');
        this.$el.removeClass('activated-sub');

        this.model.set('activated', false);

        this._hideSubMenus();

        this.model.set('operation', '');
        this.model.set('place', '');

        $('body').find('.app-dragable').removeClass('ignore');
    },
    _activationChanged : function() {
        if (this.model.get('activated'))
            this.activate();
        else
            this.deactivate();
    },
    _opClicked : function(event) {
        var op = event.data;
        this.model.set('operation', op.name);
    },
    _hideSubMenus : function() {
        if (this.$ops) {
            let $subOps = this.$ops.find('.silky-bs-op-places');
            for (let i = 0; i < $subOps.length; i++) {
                $($subOps[i]).css('height', '');
                $subOps.css('opacity', '');
            }
        }
    },
    _placeChanged : function() {
        let $places = this.$ops.find('.silky-bs-op-place');

        var place = this.model.getCurrentPlace();
        if (place === null)
            $places.removeClass('selected-place');
        else if ('view' in place) {
            $places.removeClass('selected-place');

            var $place = this.$ops.find('[data-op="' + place.name + '"]');

            $place.addClass('selected-place');
        }
    },
    _opChanged : function() {

        this.$ops.removeClass('selected');
        this._hideSubMenus();

        var operation = this.model.get('operation');
        var $op = this.$ops.filter('[data-op="' + operation + '-item"]');
        let $subOps = $op.find('.silky-bs-op-places');
        let $contents = $subOps.contents();
        let height = 0;
        for(let i = 0; i < $contents.length; i++) {
            height += $contents[i].offsetHeight;
        }
        $subOps.css('height', height);
        $subOps.css('opacity', 1);
        $op.addClass('selected');

        if (operation && this.model.get('activated'))
            this.$el.addClass('activated-sub');
        else
            this.$el.removeClass('activated-sub');
    }
});

var BackstageChoices = SilkyView.extend({
    className: 'silky-bs-choices',
    initialize : function() {

        this.model.on('change:place', this._placeChanged, this);

        var html = '';

        html += '<div class="silky-bs-choices-list"></div>';
        html += '<div class="silky-bs-choices-list" style="display: none ;"></div>';

        this.$el.html(html);

        this.$choices = this.$el.find('.silky-bs-choices-list');
        this.$current = $(this.$choices[0]);
        this.$waiting = $(this.$choices[1]);

        this._placeChanged();

        //this._recentList = new FSEntryListView({ el : this.$recentList, model : this.model.recentsModel() });
    },
    _placeChanged : function() {

        var place = this.model.getCurrentPlace();

        var  old = this.current;
        var $old = this.$current;

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
            this.current = new place.view({ el: this.$current, model: place.model });
            setTimeout(() => {
                this.$current.addClass('fade-in');
            }, 0);
        }

        if (place.view === FSEntryBrowserView && this.model.hasCurrentDirectory(place.model.attributes.wdType) === false) {
            if (place.model.attributes.wdType === 'thispc') {
                let path = this.model._determineSavePath();
                this.model.setCurrentDirectory('main', Path.dirname(path)).done();
            }
            else
                this.model.setCurrentDirectory(place.model.attributes.wdType, '').done();  // empty string requests default path
        }

        if (old) {
            //$old.fadeOut(200);
            setTimeout(function() { old.remove(); }, 200);
        }

        if ('action' in place)
            place.action();
    }
});

module.exports.View = BackstageView;
module.exports.Model = BackstageModel;
