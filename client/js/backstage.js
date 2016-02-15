var SilkyView = require('./view')
var _ = require('underscore')
var $ = require('jquery')
var Backbone = require('backbone')
Backbone.$ = $

var FSEntryListModel = Backbone.Model.extend({
    defaults: {
        items : [ ]
    },
    requestOpen : function(path) {
        this.trigger('dataSetOpenRequested', path)
    }
})

var FSEntryListView = SilkyView.extend({

    initialize : function() {
        if ( ! this.model)
            this.model = new FSEntryListModel()

        this.model.on('change:items', this._render, this)
        this._render()
    },
    events : {
        'click .silky-bs-fslist-entry' : '_itemClicked'
    },
    _render : function() {

        this.$el.addClass('silky-bs-fslist')

        var items = this.model.get('items')

        var html = ''

        for (var i = 0; i < items.length; i++) {
            var item = items[i]

            var name = item.name
            var path = item.path
            var location = item.location

            if (location.startsWith('{{Documents}}'))
                location = location.replace('{{Documents}}', 'Documents')

            html += '<div class="silky-bs-fslist-entry">'
            html += '   <div class="silky-bs-fslist-entry-icon"><span class="mif-file-text"></span></div>'
            html += '   <div class="silky-bs-fslist-entry-group">'
            html += '       <div class="silky-bs-fslist-entry-name">' + name + '</div>'
            html += '       <div class="silky-bs-fslist-entry-location">' + location + '</div>'
            html += '       <div class="silky-bs-fslist-entry-path">' + path + '</div>'
            html += '   </div>'
            html += '</div>'
        }

        this.$el.html(html)
        this.$items = this.$el.find('.silky-bs-fslist-entry')
    },
    _itemClicked : function(event) {
        var target = event.currentTarget
        var path = $(target).find('.silky-bs-fslist-entry-path').text()
        this.model.requestOpen(path)
    }
})

var BackstageModel = Backbone.Model.extend({
    defaults: {
        activated : false,
        task : "",
        taskProgress : 0,
        operation : 'open',
        place : 'recent',
        settings : null
    },
    initialize : function() {
        this.on('change:settings', this._settingsChanged, this)

        this._recentsListModel = new FSEntryListModel()
        this._recentsListModel.on('dataSetOpenRequested', this.requestOpen, this)
    },
    uploadFile: function(file) {

        var data = new FormData()
        data.append('file', file)

        var url = this.get("hostBaseUrl") + "/upload"

        var self = this

        $.ajax({
            url : url,
            type: 'POST',
            data: data,
            xhr: function() {
                var xhr = $.ajaxSettings.xhr()
                xhr.upload.addEventListener("progress", self.progressHandler)
                return xhr
            },
            processData: false,
            contentType: false,
            cache: false
        })
    },
    requestOpen: function(path) {
		this.trigger('dataSetOpenRequested', { path : path })
    },
    notifyDataSetLoaded : function() {
        this.trigger('dataSetLoaded')
    },
    _settingsChanged : function() {
        var settings = this.attributes.settings
        this._recentsListModel.set('items', settings.recents)
    },
    recentsModel : function() {
        return this._recentsListModel
    },
    progressHandler : function(evt) {
        console.log(evt)
    },
    completeHandler: function(evt) {
        console.log('complete')
    }
})

var BackstageView = SilkyView.extend({
	className: "backstage",
	initialize: function() {
		this.render()
		this.model.on("dataSetLoaded", this.deactivate, this)
		this.model.on('change:operation', this._operationChanged, this)
	},
	events: {
		'click .silky-bs-back-button' : 'deactivate',
        'click .silky-bs-open-button' : '_openClicked',
        'click .silky-bs-save-button' : '_saveClicked',
        'click .silky-bs-save-as-button' : '_saveAsClicked'
	},
	render: function() {

		this.$el.hide()
		this.$el.addClass("silky-bs")

		var html = ''
		+ '<div class="silky-bs-op silky-bs-op-panel" style="display: none;">'
		+ '	<div class="silky-bs-back-button"><span class="mif-arrow-left"></span></div>'
		+ '	<div class="silky-bs-op-button silky-bs-open-button selected" >Open</div>'
		+ '	<div class="silky-bs-op-button silky-bs-save-button">Save</div>'
		+ '	<div class="silky-bs-op-button silky-bs-save-as-button">Save As</div>'
		+ '</div>'
		+ '<div class="silky-bs-main"></div>'

		this.$el.html(html)
		this.$op = this.$el.find(".silky-bs-op-panel")
        this.$browseInvoker = this.$el.find('.silky-bs-place-invoker')

        this.$operationButtons = this.$el.find('.silky-bs-op-button')
        this.$openButton    = this.$el.find('.silky-bs-open-button')
        this.$saveButton    = this.$el.find('.silky-bs-save-button')
        this.$saveAsButton  = this.$el.find('.silky-bs-save-as-button')

		this.main = new BackstagePlaces({ el: ".silky-bs-main", model: this.model })
	},
	activate : function() {

		this.$el.fadeIn(100)

		var width = this.$op.outerWidth()
		this.$op.css("left", -width)
		this.$op.show()
		this.$op.animate({left:0}, 200)

		this.main.$el.css("margin-left", width + 32)

		this.model.set('activated', true)
	},
	deactivate : function() {

		this.$el.fadeOut(200)

		var width = this.$op.outerWidth()
		this.$op.animate({left:-width}, 200)

		this.model.set('activated', false)
	},
	_openClicked : function() {
	    this.model.set('operation', 'open')
	},
	_saveClicked : function() {
	    this.model.set('operation', 'save')
	},
	_saveAsClicked : function() {
	    this.model.set('operation', 'saveAs')
	},
	_operationChanged : function() {

	    this.$operationButtons.removeClass('selected')

	    var operation = this.model.get('operation')

	    switch (operation) {
	        case 'open':
	            this.$openButton.addClass('selected')
	            break
	        case 'save':
	            this.$saveButton.addClass('selected')
	            break
	        case 'saveAs':
	            this.$saveAsButton.addClass('selected')
	            break
	    }
	}
})

var BackstagePlaces = SilkyView.extend({
	className: "silky-bs-places",
	events: {
        'click  .silky-bs-browse'  : '_browseClicked',
        'change .silky-bs-browse-invoker' : '_fileUpload',
        'click  .silky-bs-recent'  : '_recentClicked',
        'click  .silky-bs-osf'     : '_osfClicked',
        'click  .silky-bs-this-pc' : '_thisPCClicked'
	},
	initialize: function() {
	    _.bindAll(this, '_operationChanged')

	    this.model.on('change:operation', this._operationChanged, this)
	    this.model.on('change:place',     this._placeChanged, this)

		this.$el.addClass("silky-bs-mid")

		var html = ''
		+ '<div class="silky-bs-places-panel silky-bs-places-panel-open">'
		+ '    <h1 class="silky-bs-title">Open</h1>'
		+ '    <div class="silky-bs-places">'
		+ '        <div class="silky-bs-place silky-bs-recent selected"><span class="mif-list2"></span>Recent</div>'
		+ '        <div class="silky-bs-place silky-bs-this-pc"><span class="mif-display"></span>This PC</div>'
		+ '        <div class="silky-bs-place silky-bs-osf">OSF</input></div>'
		+ '        <hr>'
        + '        <div class="silky-bs-place silky-bs-browse"><span class="mif-folder-open"></span>Browse</div>'
        + '        <input class="silky-bs-browse-invoker" type="file" accept=".csv" style="display: none"></input>'
        + '    </div>'
        + '</div>'
		+ '<div class="silky-bs-places-panel silky-bs-places-panel-save" style="display: none">'
		+ '    <h1 class="silky-bs-title">Save As</h1>'
		+ '    <div class="silky-bs-places">'
		+ '        <div class="silky-bs-place silky-bs-this-pc"><span class="mif-display"></span>This PC</div>'
		+ '        <div class="silky-bs-place silky-bs-osf">OSF</input></div>'
		+ '        <hr>'
        + '        <div class="silky-bs-place silky-bs-browse"><span class="mif-folder-open"></span>Browse</div>'
        + '        <input class="silky-bs-browse-invoker" type="file" accept=".csv" style="display: none"></input>'
        + '    </div>'
        + '</div>'
        + '<div class="silky-bs-choices"></div>'

		this.$el.html(html)
		this.$title = this.$el.find('.silky-bs-title')

		this.$open = this.$el.find('.silky-bs-places-panel-open')
		this.$save = this.$el.find('.silky-bs-places-panel-save')

		this.$places = this.$el.find('.silky-bs-place')
		this.$recent = this.$el.find('.silky-bs-recent')
		this.$osf    = this.$el.find('.silky-bs-osf')
		this.$thisPC = this.$el.find('.silky-bs-this-pc')

		this.$choices = this.$el.find('.silky-bs-choices')
		this._choices = new BackstageChoices({ el: this.$choices, model : this.model })
	},
	_operationChanged : function() {
        switch (this.model.get('operation')) {
            case 'open':
                this.$save.fadeOut(200)
                this.$open.fadeIn(200)
                break
            case 'saveAs':
                this.$open.fadeOut(200)
                this.$save.fadeIn(200)
                break
            default:
                this.$open.fadeOut(200)
                this.$save.fadeOut(200)
        }
	},
    _placeChanged : function() {

        this.$places.removeClass('selected')

        switch (this.model.get('place')) {
            case 'recent':
                this.$recent.addClass('selected')
                break
            case 'OSF':
                this.$osf.addClass('selected')
                break
            case 'thisPC':
                this.$thisPC.addClass('selected')
                break
        }
    },
    _browseClicked : function() {

        if (window.inElectron) {

            var remote = window.require('remote')  // window.require prevents browserfy replacement
            var dialog = remote.require('dialog')

            var self = this

            dialog.showOpenDialog({ properties: [ 'openFile' ]}, function(fileNames) {
                if (fileNames)
                    self._fileSelected(fileNames[0])
            })
        }
        else {

            this.$browseInvoker.click()
        }
    },
    _fileUpload : function(evt) {
        var file = evt.target.files[0]
        this.model.uploadFile(file)
    },
    _fileSelected : function(path) {
		path = path.replace(/\\/g, '/')
        this.model.requestOpen(path)
    },
    _recentClicked : function() {
        this.model.set('place', 'recent')
    },
    _osfClicked : function() {
        this.model.set('place', 'OSF')
    },
    _thisPCClicked : function() {
        this.model.set('place', 'thisPC')
    }
})

var BackstageChoices = SilkyView.extend({
	className: "silky-bs-choices",
	initialize : function() {

	    this.model.on('change:place', this._placeChanged, this)

	    var html = ''

	    html += '<div class="silky-bs-choices-choice silky-bs-choices-recentlist"></div>'
	    html += '<div class="silky-bs-choices-choice silky-bs-choices-thispc" style="display: none ;"></div>'

	    this.$el.html(html)

        this.$choices    = this.$el.find('.silky-bs-choices-choice')
	    this.$recentList = this.$el.find('.silky-bs-choices-recentlist')
	    this.$thisPC     = this.$el.find('.silky-bs-choices-thispc')

		this._recentList = new FSEntryListView({ el : this.$recentList, model : this.model.recentsModel() })
	},
	_placeChanged : function() {

	    var place = this.model.get('place')

	    switch (place) {
	        case 'recent':
                this.$choices.fadeOut(200)
	            this.$recentList.fadeIn(200)
	            break
	        default:
	            this.$choices.fadeOut(200)
	            break
	    }
	}
})

module.exports.View = BackstageView
module.exports.Model = BackstageModel
