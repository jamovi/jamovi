//
// Copyright (C) 2016 Jonathon Love
//

'use strict';

var SilkyView = require('./view');
const keyboardJS = require('keyboardjs');
var _ = require('underscore');
var $ = require('jquery');
var Backbone = require('backbone');
Backbone.$ = $;

var host = require('./host');

var FSEntryListModel = Backbone.Model.extend({
    defaults: {
        items : [ ],
        clickProcess : "open"
    },
    requestOpen : function(path, type) {
        this.trigger('dataSetOpenRequested', path, type);
    },
    requestSave : function(path, type) {
        this.trigger('dataSetSaveRequested', path, type);
    }
});

var FSEntryListView = SilkyView.extend({

    initialize : function() {
        if ( ! this.model)
            this.model = new FSEntryListModel();

        this.model.on('change:items', this._render, this);
        this.model.on('change:directory', this._render, this);
        this._render();
    },
    _normalisePath: function(path) {
        var normPath = path;
        if (path.startsWith('{{Documents}}'))
            normPath = path.replace('{{Documents}}', 'Documents');
        else if (path.startsWith('{{Desktop}}'))
            normPath = path.replace('{{Desktop}}', 'Desktop');
        else if (path.startsWith('{{Home}}'))
            normPath = path.replace('{{Home}}', 'Home');
        else if (path.startsWith('{{Root}}'))
            normPath = path.replace('{{Root}}', 'This PC');
        else if (path.startsWith('{{Examples}}'))
            normPath = path.replace('{{Examples}}', 'Examples');

        normPath = normPath.replace(/\/$/, "");
        return normPath;
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
            var location = item.location ? this._normalisePath(item.location) : '';
            location = location.replace(/\//g, ' \uFE65 ');

            html += '<div class="silky-bs-fslist-entry" data-path="' + path + '">';
            html += '   <div class="silky-bs-fslist-entry-icon"></div>';
            html += '   <div class="silky-bs-fslist-entry-group">';
            html += '       <div class="silky-bs-fslist-entry-name">' + name + '</div>';
            html += '       <div class="silky-bs-fslist-entry-location">' + location + '</div>';
            html += '   </div>';
            html += '</div>';
        }

        this.$el.html(html);
        this.$items = this.$el.find('.silky-bs-fslist-entry');
    },
    _itemClicked : function(event) {
        var target = event.currentTarget;
        var path = $(target).attr('data-path');
        console.log(path);
        this.model.requestOpen(path, 1);
    }
});

var FSEntryBrowserView = SilkyView.extend({

    initialize : function() {
        this._selectedIndex = -1;

        if ( ! this.model)
            this.model = new FSEntryListModel();

        this.model.on('change:items', this._render, this);
        this.model.on('change:dirInfo', this._render, this);

        this.$el.addClass('silky-bs-fslist');
        this._createHeader();
        this._render();
    },
    _normalisePath: function(path) {
        var normPath = path;
        if (path.startsWith('{{Documents}}'))
            normPath = path.replace('{{Documents}}', 'Documents');
        else if (path.startsWith('{{Desktop}}'))
            normPath = path.replace('{{Desktop}}', 'Desktop');
        else if (path.startsWith('{{Home}}'))
            normPath = path.replace('{{Home}}', 'Home');
        else if (path.startsWith('{{Root}}'))
            normPath = path.replace('{{Root}}', 'This PC');
        else if (path.startsWith('{{Examples}}'))
            normPath = path.replace('{{Examples}}', 'Examples');

        normPath = normPath.replace(/\/$/, "");
        return normPath;
    },
    events : {
        'click .silky-bs-fslist-item' : '_itemClicked',
        'dblclick .silky-bs-fslist-item' : '_itemDoubleClicked',
        'click .silky-bs-fslist-browser-back-button' : '_backClicked',
        'click .silky-bs-fslist-browser-save-button' : '_saveClicked',
        'change .silky-bs-fslist-browser-save-filetype' : '_saveTypeChanged',
        'focus .silky-bs-fslist-browser-save-name' : '_nameGotFocus',
        'focus .silky-bs-fslist-browser-save-filetype' : '_focusChanged'
    },
    _saveTypeChanged : function() {
        var selected = this.$el.find('option:selected');
        this.filterExtension = selected.data('extension');
        this._render();
    },
    _nameGotFocus: function(event) {
        keyboardJS.setContext('save_name_textbox');
        this._selected = false;
        if (this._selectedIndex !== -1) {
            this.$items[this._selectedIndex].removeClass("silky-bs-fslist-selected-item");
            this._selectedIndex = -1;
        }
    },
    _focusChanged: function(event) {
        keyboardJS.setContext('');
        this._selected = false;
        if (this._selectedIndex !== -1) {
            this.$items[this._selectedIndex].removeClass("silky-bs-fslist-selected-item");
            this._selectedIndex = -1;
        }
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
    _createHeader: function() {
        var html = '';
        html += '<div class="silky-bs-fslist-header">';
        html += '   <div class="silky-bs-fslist-path-browser">';
        html += '       <div class="silky-bs-fslist-browser-back-button"><span class="mif-arrow-up"></span></div>';
        html += '       <div class="silky-bs-fslist-browser-location-icon silky-bs-flist-item-folder-browse-icon"></div>';
        html += '       <div class="silky-bs-fslist-browser-location" style="flex: 1 1 auto; height=18px; border-width: 0px; background-color: inherit"></div>';
        html += '   </div>';
        if (this.model.clickProcess === "save") {
            html += '   <div class="silky-bs-fslist-save-options" style="display: flex; flex-flow: row nowrap;">';
            html += '       <div style="flex: 1 1 auto;">';
            html += '           <input class="silky-bs-fslist-browser-save-name" type="text" placeholder="Enter file name here" />';
            html += '           <div class="silky-bs-fslist-browser-save-filetype">';
            html += '               <select class="silky-bs-fslist-browser-save-filetype-inner">';
            html += '                   <option data-extension="osilky" selected>Silky File (*.osilky)</option>';
            //html += '                 <option data-extension="jasp">Silky File2 (*.silky)</option>';
            html += '               </select>';
            html += '           </div>';
            html += '       </div>';
            html += '       <div class="silky-bs-fslist-browser-save-button" style="display: flex; flex: 0 0 auto;">';
            html += '           <div class="silky-bs-flist-save-icon"></div>';
            html += '           <span>Save</span>';
            html += '       </div>';
            html += '   </div>';
        }
        html += '</div>';
        this.$header = $(html);
        this.$el.append(this.$header);

        this.$itemsList = $('<div class="silky-bs-fslist-items" style="flex: 1 1 auto; overflow-x: hidden; overflow-y: auto; height:100%"></div>');
        this.$el.append(this.$itemsList);

        if (this.model.clickProcess === "save") {
            this.filterExtension = "osilky";
            var self = this;
            setTimeout(function () {
                self.$header.find('.silky-bs-fslist-browser-save-name').focus();
                keyboardJS.setContext('save_name_textbox');
                keyboardJS.bind('', event => self._nameBoxFocused(event));
            }, 50);
        }
    },
    _nameBoxFocused: function(event) {

        if (event.metaKey || event.ctrlKey || event.altKey)
            return;

        switch(event.key) {
            case 'Enter':
                this._saveClicked(event);
                event.preventDefault();
                break;
        }
    },
    _render : function() {

        var items = this.model.get('items');
        var dirInfo = this.model.get('dirInfo');

        var path = null;
        if (_.isUndefined(dirInfo) === false)
            path = this._normalisePath(dirInfo.path).replace(/\//g, ' \uFE65 ');

        this.$header.find(".silky-bs-fslist-browser-location").text(path);

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

            if (itemType === 1 && this.filterExtension && name.endsWith('.' + this.filterExtension) === false)
                continue;

            html += '<div class="silky-bs-fslist-item">';
            html += '   <div class="silky-bs-flist-item-icon">';
            if (itemType === 1) { //file
                if (name.endsWith(".csv"))
                    html += '       <div class="silky-bs-flist-icon silky-bs-flist-item-csv-icon"></div>';
                else
                    html += '       <span class="mif-file-empty"></span>';
            }
            else if (itemType === 2) //folder
                html += '       <div class="silky-bs-flist-icon silky-bs-flist-item-folder-icon"></div>';
            else if (itemType === 4) //special folder
                html += '       <div class="silky-bs-flist-icon silky-bs-flist-item-folder-special-icon"></div>';
            else if (itemType === 3) //drive
                html += '       <span class="mif-drive"></span>';
            html += '   </div>';
            html += '   <div class="silky-bs-fslist-entry-name">' + name + '</div>';
            html += '</div>';

            var $item = $(html);
            $item.data('name', name);
            $item.data('path', itemPath);
            $item.data('type', itemType);
            $item.data('index', this.$items.length);
            this.$itemsList.append($item);
            this.$items.push($item);
        }

        if (this.$items.length === 0)
            this.$itemsList.append("<span>No recognised data files were found.</span>");
    },
    _itemClicked : function(event) {
        var $target = $(event.currentTarget);
        var itemType = $target.data('type');
        var itemPath = $target.data('path');
        if (itemType !== 1 || this.model.clickProcess === "open")
            this.model.requestOpen(itemPath, itemType);
        else {
            if (!this._selected) {
                keyboardJS.setContext('save_file_browser');
                if (!this._keyboardSetup) {
                    keyboardJS.bind('', event => this._focusKeyPress(event));
                    this._keyboardSetup = true;
                }
            }

            if (this._selectedIndex !== -1)
                this.$items[this._selectedIndex].removeClass("silky-bs-fslist-selected-item");

            this._selectedIndex = $target.data('index');
            var name = $target.data('name');
            $target.addClass("silky-bs-fslist-selected-item");

            this.$header.find('.silky-bs-fslist-browser-save-name').val(name);
            this._selected = true;
        }
    },
    _focusKeyPress: function(event) {

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
                if (this._selectedIndex !== -1) {
                    var $target = this.$items[this._selectedIndex];
                    var itemType = $target.data('type');
                    var itemPath = $target.data('path');
                    if (itemType === 1 && this.model.clickProcess === "save")
                        this.model.requestSave(itemPath, itemType);
                }
                event.preventDefault();
                break;
        }
    },
    incrementSelection: function() {
        if (this._selectedIndex !== -1 && this._selectedIndex !== this.$items.length - 1){
            this.$items[this._selectedIndex].removeClass("silky-bs-fslist-selected-item");
            this._selectedIndex += 1;
            this.$items[this._selectedIndex].addClass("silky-bs-fslist-selected-item");

            var offset = this.$items[this._selectedIndex].position();
            var height = this.$items[this._selectedIndex].height();
            if (offset.top + height > this.$itemsList.height()) {
                var r = this.$itemsList.scrollTop() + (offset.top + height - this.$itemsList.height() + 1);
                this.$itemsList.animate({scrollTop: r}, 100);
            }
        }
    },
    decrementSelection: function() {
        if (this._selectedIndex > 0){
            this.$items[this._selectedIndex].removeClass("silky-bs-fslist-selected-item");
            this._selectedIndex -= 1;
            this.$items[this._selectedIndex].addClass("silky-bs-fslist-selected-item");

            var offset = this.$items[this._selectedIndex].position();
            if (offset.top < 0)
                this.$itemsList.animate({scrollTop: this.$itemsList.scrollTop() + offset.top}, 100);
        }
    },
    _itemDoubleClicked : function(event) {
        var $target = $(event.currentTarget);
        var itemType = $target.data('type');
        var itemPath = $target.data('path');
        if (itemType === 1 && this.model.clickProcess === "save")
            this.model.requestSave(itemPath, itemType);
    },
    _saveClicked : function(event) {
        var dirInfo = this.model.get('dirInfo');
        if (_.isUndefined(dirInfo) === false) {
            var name = this.$header.find(".silky-bs-fslist-browser-save-name").val();
            if (this.filterExtension && name.endsWith('.' + this.filterExtension) === false)
                name = name + '.' + this.filterExtension;
            var path = dirInfo.path + '/' + name;
            this.model.requestSave(path, 1);
            var items = this.model.get('items');
            items.push({ name: name, path: path, type: 1 });
            this._render();
        }
    },
    _backClicked : function(event) {
        var dirInfo = this.model.get('dirInfo');
        if (_.isUndefined(dirInfo) === false) {
            var path = dirInfo.path;
            path = this._calcBackDirectory(path, dirInfo.type);
            this._goToFolder(path);
        }
    },
    _goToFolder: function(path) {
        this.model.requestOpen(path, 2);
    },
    _calcBackDirectory: function(path, type) {
        var index = -1;
        if (path.length > 0 && path !== '/') {
            index = path.lastIndexOf("/");
            if (index !== -1 && index === path.length - 1)
                index = path.lastIndexOf("/", path.length - 2);
        }

        if (index === -1)
            return "{{Root}}";

        return path.substring(0, index);
    }
});


var BackstageModel = Backbone.Model.extend({
    defaults: {
        activated : false,
        task : '',
        taskProgress : 0,
        operation : 'open',
        place : 'recent',
        lastSelectedPlace : 'recent',
        settings : null,
        ops : [ ],
    },
    initialize : function(args) {

        this.instance = args.instance;

        this.on('change:settings', this._settingsChanged, this);
        this.on('change:operation', this._opChanged, this);

        this._recentsListModel = new FSEntryListModel();
        this._recentsListModel.on('dataSetOpenRequested', this.tryOpen, this);

        this._examplesListModel = new FSEntryListModel();
        this._examplesListModel.on('dataSetOpenRequested', this.tryOpen, this);

        this._pcListModel = new FSEntryListModel();
        this._pcListModel.clickProcess = "open";
        this._pcListModel.on('dataSetOpenRequested', this.tryOpen, this);

        this._pcSaveListModel = new FSEntryListModel();
        this._pcSaveListModel.clickProcess = "save";
        this._pcSaveListModel.on('dataSetOpenRequested', this.tryOpen, this);
        this._pcSaveListModel.on('dataSetSaveRequested', this.trySave, this);

        this.attributes.ops = [
            {
                name: 'new',
                title: 'New',
                action: () => { this.requestOpen(''); }
            },
            {
                name: 'open',
                title: 'Open',
                places: [
                    { name: 'recent', title: 'Recent', model: this._recentsListModel, view: FSEntryListView, separator: true },
                    { name: 'thispc', title: 'This PC', model: this._pcListModel, view: FSEntryBrowserView },
                    { name: 'osf',    title: 'OSF' },
                    { name: 'examples', title: 'Examples', model: this._examplesListModel, view: FSEntryListView, separator: true },
                    { name: 'browse', title: 'Browse' }
                ]
            },
            /*{
                name: 'save',
                title: 'Save',
                //action: () => { this.requestOpen(''); }
            },*/
            {
                name: 'saveAs',
                title: 'Save As',
                places: [
                    { name: 'thispc', title: 'This PC', model: this._pcSaveListModel, view: FSEntryBrowserView },
                    { name: 'osf',    title: 'OSF', separator: true },
                    { name: 'browse', title: 'Browse' },
                ]
            }
        ];
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
        var names = _.pluck(op.places, 'name');
        var index = names.indexOf(this.attributes.place);

        if (index === -1)
            index = 0;

        return op.places[index];
    },
    tryOpen: function(path, type) {
        if (type === 1)
            this.requestOpen(path);
        else if (type === 2 || type === 3 || type === 4)
            this.setCurrentDirectory(path, type);
    },
    trySave: function(path, type) {
        this.requestSave(path);
    },
    setCurrentDirectory: function(path, type) {
        this.instance.browse(path).then(response => {
            this._pcListModel.set('error', response.errorMessage);
            this._pcListModel.set('items', response.contents);
            this._pcListModel.set('dirInfo', { path: path, type: type } );

            this._pcSaveListModel.set('error', response.errorMessage);
            this._pcSaveListModel.set('items', response.contents);
            this._pcSaveListModel.set('dirInfo', { path: path, type: type } );

            this._hasCurrentDirectory = true;
        });
    },
    hasCurrentDirectory: function() {
        return _.isUndefined(this._hasCurrentDirectory) ? false : this._hasCurrentDirectory;
    },
    _opChanged: function() {

        var op = this.getCurrentOp();

        if ('places' in op) {
            var names = _.pluck(op.places, 'name');
            var index = names.indexOf(this.attributes.lastSelectedPlace);

            if (index === -1)
                index = names.indexOf(this.attributes.place);

            if (index === -1)
                index = 0;

            var place = op.places[index].name;
            var old = this.attributes.place;

            if (old) {
                this.attributes.place = place;
                var self = this;
                setTimeout(function() {
                    //self.attributes.place = old;
                    //self.set('place', place);
                    self.trigger('change:place');
                }, 0);
            }
        }

        if ('action' in op)
            op.action();
    },
    uploadFile: function(file) {

        var data = new FormData();
        data.append('file', file);

        var url = this.get("hostBaseUrl") + "upload";

        var self = this;

        $.ajax({
            url : url,
            type: 'POST',
            data: data,
            xhr: function() {
                var xhr = $.ajaxSettings.xhr();
                xhr.upload.addEventListener("progress", self.progressHandler);
                return xhr;
            },
            processData: false,
            contentType: false,
            cache: false
        });
    },
    requestOpen: function(path) {
        this.instance.open(path)
            .then(() => this.set('activated', false));
    },
    requestSave: function(path) {
        this.instance.save(path)
            .then(() => this.set('activated', false));
    },
    _settingsChanged : function() {
        var settings = this.attributes.settings;
        this._recentsListModel.set('items', settings.recents);
        this._examplesListModel.set('items', settings.examples);
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
    className: "backstage",
    initialize: function() {
        this.render();
        this.model.on("change:activated", this._activationChanged, this);
        this.model.on('change:operation', this._opChanged, this);
    },
    events: {
        'click .silky-bs-back-button' : 'deactivate'
    },
    render: function() {

        this.$el.hide();
        this.$el.addClass("silky-bs");

        var html = '';

        html += '<div class="silky-bs-op silky-bs-op-panel">';
        html += '    <div class="silky-bs-back-button"><span class="mif-arrow-left"></span></div>';
        html += '</div>';

        this.$opPanel = $(html);
        this.$opPanel.appendTo(this.$el);

        $('<div class="silky-bs-main"></div>').appendTo(this.$el);

        var currentOp = null;
        for (let i = 0; i < this.model.attributes.ops.length; i++) {
            let op = this.model.attributes.ops[i];
            let selected = (op.name === this.model.attributes.operation);
            if (selected)
                currentOp = op;
            let $op = $('<div class="silky-bs-op-button" data-op="' + op.name + '" ' + (selected ? 'data-selected' : '') + '">' + op.title + '</div>');
            op.$el = $op;
            $op.on('click', op, _.bind(this._opClicked, this));
            $op.appendTo(this.$opPanel);
        }

        this.$browseInvoker = this.$el.find('.silky-bs-place-invoker');
        this.$ops = this.$el.find('.silky-bs-op-button');

        this._opChanged();

        if ('places' in currentOp)
            this.main = new BackstagePlaces({ el: ".silky-bs-main", model: this.model });
    },
    activate : function() {

        this.$el.fadeIn(100);

        var width = this.$opPanel.outerWidth();
        this.$opPanel.css("left", -width);
        this.$opPanel.show();
        this.$opPanel.animate({left:0}, 200);

        if (this.main)
            this.main.$el.css("margin-left", width + 32);

        this.model.set('activated', true);
    },
    deactivate : function() {

        this.$el.fadeOut(200);

        var width = this.$opPanel.outerWidth();
        this.$opPanel.animate({left:-width}, 200);

        this.model.set('activated', false);

        var self = this;
        setTimeout(function () {
            var ops = self.model.attributes.ops;
            for (let i = 0; i < ops.length; i++) {
                if ('places' in ops[i]) {
                    self.model.set('operation', ops[i].name);
                    self.model.set('place', ops[i].places[0].name);
                    break;
                }
            }

        }, 100);
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
    _opChanged : function() {

        this.$ops.removeClass('selected');

        var operation = this.model.get('operation');
        var $op = this.$ops.filter('[data-op="' + operation + '"]');
        $op.addClass('selected');
    }
});

var BackstagePlaces = SilkyView.extend({
    className: "silky-bs-places",
    events: {
        'click  .silky-bs-place[data-place="browse"]'  : '_browseClicked',
        'change .silky-bs-browse-invoker' : '_fileUpload',
    },
    initialize: function() {
        _.bindAll(this, '_opChanged');

        this.model.on('change:operation', this._opChanged, this);
        this.model.on('change:place',     this._placeChanged, this);

        this.$el.addClass("silky-bs-mid");

        var ops = this.model.attributes.ops;

        for (let i = 0; i < ops.length; i++) {

            let op = ops[i];
            if (!('places' in op))
                continue;

            let html = '';

            html += '<div class="silky-bs-places-panel" data-op="' + op.name + '" style="display: none;">';
            html += '    <h1 class="silky-bs-title">' + op.title + '</h1>';
            html += '    <div class="silky-bs-places">';
            html += '    </div>';
            html += '</div>';

            var $placesPanel = $(html);
            this.$el.append($placesPanel);
            var $places = $placesPanel.find('.silky-bs-places');

            for (var j = 0; j < op.places.length; j++) {
                let place = op.places[j];
                var $place = $('<div class="silky-bs-place" data-place="' + place.name + '">' + place.title + '</div>');
                $places.append($place);
                if (place.separator)
                    $places.append($('<div class="silky-bs-place-separator"></div>'));
                $place.on('click', place, _.bind(this._placeClicked, this));
            }
        }

        var $choices = $('<div class="silky-bs-choices"></div>');
        this.$el.append($choices);

        this.$title = this.$el.find('.silky-bs-title');
        this.$ops = this.$el.find('.silky-bs-places-panel');
        this.$places = this.$el.find('.silky-bs-place');

        this._opChanged();
        this._placeChanged();

        this.$choices = this.$el.find('.silky-bs-choices');
        this._choices = new BackstageChoices({ el: this.$choices, model : this.model });
    },
    _opChanged : function() {
        var op = this.model.get('operation');
        var $current = this.$ops.filter('[data-op="' + op + '"]');
        var $off = this.$ops.filter(':not([data-op="' + op + '"])');

        $off.fadeOut(200);
        $off.removeAttr('data-selected');

        $current.fadeIn(200);
        $current.attr('data-selected', '');

        this.$current = $current;
    },
    _placeChanged : function() {

        this.$places.removeAttr('data-selected');
        var place = this.model.get('place');
        var $place = this.$current.find('[data-place="' + place + '"]');
        $place.attr('data-selected', '');
    },
    _placeClicked: function(event) {
        var place = event.data;
        this.model.set('lastSelectedPlace', place.name);
        this.model.set('place', place.name);
    },
    _browseClicked : function() {

        if (host.isElectron) {

            var remote = window.require('electron').remote;
            var dialog = remote.dialog;

            var self = this;

            if (this.model.get('operation') === 'open') {

                let filters = [
                    { name: 'Data files', extensions: ['osilky', 'csv', 'txt', 'jasp']},
                    { name: 'Silky', extensions: ['osilky'] },
                    { name: 'CSV', extensions: ['csv', 'txt'] },
                    { name: 'JASP', extensions: ['jasp'] },
                ];

                dialog.showOpenDialog({ filters: filters, properties: [ 'openFile' ]}, function(fileNames) {
                    if (fileNames)
                        self._fileSelectedToOpen(fileNames[0]);
                });
            }
            else if (this.model.get('operation') === 'saveAs') {

                let filters = [
                    { name: 'Silky', extensions: ['osilky'] },
                ];

                dialog.showSaveDialog({ filters : filters }, function(fileName) {
                    if (fileName)
                        self._fileSelectedToSave(fileName);
                });
            }
        }
        else {

            this.$browseInvoker.click();
        }
    },
    _fileUpload : function(evt) {
        var file = evt.target.files[0];
        this.model.uploadFile(file);
    },
    _fileSelectedToOpen : function(path) {
        path = path.replace(/\\/g, '/');
        this.model.requestOpen(path);
    },
    _fileSelectedToSave : function(path) {
        path = path.replace(/\\/g, '/');
        this.model.requestSave(path);
    }
});

var BackstageChoices = SilkyView.extend({
    className: "silky-bs-choices",
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

        if (place.model) {
            this.$current = $('<div class="silky-bs-choices-list" style="display: none ; width:100%; height:100%"></div>');
            this.$current.appendTo(this.$el);
            this.current = new place.view({ el: this.$current, model: place.model });
            this.$current.fadeIn(200);
        }

        if (place.name === 'thispc' && this.model.hasCurrentDirectory() === false)
            this.model.setCurrentDirectory('{{Documents}}');

        if (old) {
            $old.fadeOut(200);
            setTimeout(function() { old.remove(); }, 200);
        }
    }
});

module.exports.View = BackstageView;
module.exports.Model = BackstageModel;
