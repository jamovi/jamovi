
var _ = require('underscore')
var $ = require('jquery')
var Backbone = require('backbone')
Backbone.$ = $

var BackstageModel = require('./backstage').Model
var ProtoBuf = require('protobufjs')

var ProgressModel = Backbone.Model.extend({
    defaults : {
        task     : '',
        progress : 0,
        complete : true    
    }
})

var DataSetModel = Backbone.Model.extend({

    initialize: function() {
        this.on('change:viewport', this._retrieveRows, this)
    },
    defaults : {
        hasDataSet : false,
        columns    : [ ],
        cells      : [ ],
        viewport   : { left : 0, top : 0, right : -1, bottom : -1}
    },
    setNew : function(info) {
    
        this.attributes.columns  = info.schema.fields
        this.attributes.rowCount = info.rowCount
        this.attributes.columnCount = info.columnCount
        
        this.set('hasDataSet', true)
        this.trigger('dataSetLoaded')
    },
    _retrieveRows : function() {
        this._instance.retrieveCells(this.attributes.viewport)
    },
    setParent: function(instance) {
        this._instance = instance
    }
})

var ResultsModel = Backbone.Model.extend({

    createAnalysis : function(name) {
        
        console.log('analysis created: ' + name)
        this.trigger("analysisSelected", name)
    }

})

var Instance = Backbone.Model.extend({

    initialize: function() {
    
        _.bindAll(this, 'receiveMessage', 'retrieveCells', '_retrieveCellsEvent', '_requestCells', '_retrieveSettingsEvent')

        this.transId = 0
        this.command = ''
        this.seqNo = 0
        
        this._dataSetModel = new DataSetModel()
        this._dataSetModel.setParent(this)
        
        this._progressModel = new ProgressModel()
        
        this._backstageModel = new BackstageModel()
        this._backstageModel.on('dataSetOpenRequested', this._openDataSetRequest, this)
        
        this._resultsModel = new ResultsModel()
        
    },
    defaults : {
        host : ''
    },
    progressModel : function() {
    
        return this._progressModel
    },
    dataSetModel : function() {
    
        return this._dataSetModel
    },
    backstageModel: function() {
    
        return this._backstageModel    
    },
    resultsModel : function() {
        
        return this._resultsModel
    },
    _openDataSetRequest : function(params) {
    
        var self = this

        this.open(params.path).then(function() {
            self._backstageModel.notifyDataSetLoaded()
        })
    },
    receiveMessage : function(event) {
    
        var self = this
    
        return new Promise(function(resolve, reject) {

            var reader = new FileReader()
            reader.onloadend = function() { resolve(reader.result) }
            reader.error = reject
            reader.readAsArrayBuffer(event.data)
            
        }).then(function(arrayBuffer) {

            var response = self._coms.Response.decode(arrayBuffer)
            switch (response.params) {
                case 'open':
                    self._openEvent(response.open)
                    break
                case 'info':
                    self._retrieveInfoEvent(response.info)
                    break
                case 'cells':
                    self._retrieveCellsEvent(response.cells)
                    break
                case 'settings':
                    self._retrieveSettingsEvent(response.settings)
                    break
                default:
                    console.log('unrecognized response')
                    console.log(response)
                    break
            }
        })
    
    },
    connect  : function() {
       
        var host = this.get('host')
        var self = this

        Promise.all([
            new Promise(function(resolve, reject) {

                ProtoBuf.loadProtoFile('http://' + host + '/proto', function(err, builder) {
                    if (err) {
                        reject(err)
                    }
                    else {
                        self._builder = builder
                        self._coms = builder.build()
                        resolve()
                    }
                })
            }),
            new Promise(function(resolve, reject) {
            
                self._ws = new WebSocket('ws://' + host + '/coms')
        
                self._ws.onopen = function() {
                    console.log('opened!')
                    resolve()
                }
                self._ws.onerror = reject
                self._ws.onmessage = self.receiveMessage
                self._ws.onclose = function(msg) {
                    console.log('websocket closed!')
                    console.log(msg)
                }
            })
        ]).then(function() {
        
            return self.retrieveSettings()
            
        }).then(function() {

            return self.retrieveInfo()
            
        }).catch(function(err) {
            
            console.log('error ' + err)
        })
        
    },
    open : function(path) {
    
        var params  = new this._coms.OpenReqParams(path)
        var request = new this._coms.Request()
        request.open = params

        return this._send(request)
    },
    retrieveInfo : function() {
    
        var params  = new this._coms.InfoReqParams()
        var request = new this._coms.Request()
        request.info = params
    
        return this._send(request)
    },
    retrieveCells : function(viewport) {
    
        this._viewport = viewport
        this._requestCells()
    },
    retrieveSettings : function() {
    
        var params = new this._coms.SettingsReqParams()
        var request = new this._coms.Request()
        request.settings = params
        
        return this._send(request)
    },
    _retrieveSettingsEvent : function(settings) {
        
        this._backstageModel.set('settings', settings)
        
        if (this._notifySuccess)
            this._notifySuccess()
        this._notifySuccess = null
        this._notifyFailure = null
    },
    _requestCells : function() {
    
        var params = new this._coms.CellsReqParams()
        params.rowStart    = this._viewport.top
        params.columnStart = this._viewport.left
        params.rowEnd      = this._viewport.bottom
        params.columnEnd   = this._viewport.right
        
        var request = new this._coms.Request()
        request.cells = params
        
        return this._send(request)    
    },
    _retrieveCellsEvent : function(params) {
        
        var columns = params.columns

        var rowStart    = params.reqParams.get('rowStart')
        var columnStart = params.reqParams.get('columnStart')
        var rowEnd      = params.reqParams.get('rowEnd')
        var columnEnd   = params.reqParams.get('columnEnd')
        
        var viewport = this._viewport

        if (rowStart != viewport.top || columnStart != viewport.left || rowEnd != viewport.bottom || columnEnd != viewport.right)
            return

        var columnCount = columnEnd - columnStart + 1
        var rowCount    = rowEnd    - rowStart + 1

        var cells = Array(columnCount)
        
        for (var colNo = 0; colNo < columnCount; colNo++) {
        
            var column = columns[colNo]
            var values = column.get(column['cells']).values         
            
            cells[colNo] = values
        }
        
        this._dataSetModel.set('cells', cells)
        
        if (this._notifySuccess)
            this._notifySuccess()
        this._notifySuccess = null
        this._notifyFailure = null
    },
    _retrieveInfoEvent : function(params) {
    
        if (params.hasDataSet)
            this._dataSetModel.setNew(params)
        
        if (this._notifySuccess)
            this._notifySuccess()
        this._notifySuccess = null
        this._notifyFailure = null
    },
    _openEvent : function(params) {
    
        var complete = (params.status === this._coms.Status.COMPLETE)
    
        this._progressModel.set("task",     params.progress_task)
        this._progressModel.set("progress", params.progress)
        this._progressModel.set("complete", complete)
        
        if (complete) {
            if (this._notifySuccess)
                this._notifySuccess()
            this._notifySuccess = null
            this._notifyFailure = null
            
            this.retrieveInfo()
        }
    },
    _send : function(request) {
    
        this.transId++

        request.id = this.transId
        this._ws.send(request.toArrayBuffer())
        
        var self = this
        
        return new Promise(function(resolve, reject) {
            self._notifySuccess = resolve
            self._notifyFailure = reject
        })
    }
})

module.exports = Instance
