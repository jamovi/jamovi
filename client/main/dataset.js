
'use strict';

var _ = require('underscore');
var $ = require('jquery');
var Backbone = require('backbone');
Backbone.$ = $;

var DataSetModel = Backbone.Model.extend({

    initialize: function() {
    },
    defaults : {
        hasDataSet : false,
        columns    : [ ],
        rowCount : 0,
        columnCount : 0,
        coms : null,
        instanceId : null,
        editingVar : null
    },
    setNew : function(info) {

        this.attributes.columns  = info.columns;
        this.attributes.rowCount = info.rowCount;
        this.attributes.columnCount = info.columnCount;

        this.set('hasDataSet', true);
        this.trigger('dataSetLoaded');
    }
});

var DataSetViewModel = DataSetModel.extend({

    initialize : function() {
    },
    defaults : function() {
        return _.extend({
            cells      : [ ],
            viewport   : { left : 0, top : 0, right : -1, bottom : -1}
        }, DataSetModel.prototype.defaults);
    },
    valueAt : function(rowNo, colNo) {
        let viewport = this.attributes.viewport;
        if (rowNo >= viewport.top &&
            rowNo <= viewport.bottom &&
            colNo >= viewport.left &&
            colNo <= viewport.right) {

            return this.attributes.cells[colNo - viewport.left][rowNo - viewport.top];
        }

        return null;
    },
    setViewport : function(viewport) {

        var nCols = viewport.right - viewport.left + 1;
        var nRows = viewport.bottom - viewport.top + 1;

        var cells = Array(nCols);

        for (var i = 0; i < nCols; i++) {
            var column = new Array(nRows);

            for (var j = 0; j < nRows; j++)
                column[j] = "" + (viewport.left + i) + ", " + (viewport.top + j);

            cells[i] = column;
        }

        this.attributes.cells = cells;
        this.attributes.viewport = viewport;

        this.trigger("viewportChanged");
        this.trigger("viewportReset");

        this._requestCells(viewport);
    },
    reshape : function(left, top, right, bottom) {

        // console.log("reshape : " + JSON.stringify({left:left,top:top,right:right,bottom:bottom}));

        var viewport = this.attributes.viewport;
        var cells = this.attributes.cells;
        var delta = { left: left, top: top, right: right, bottom: bottom };

        var i, j, column;

        var nv = _.clone(viewport);

        nv.left  -= left;
        nv.right += right;
        nv.top   -= top;
        nv.bottom += bottom;

        var nRows = nv.bottom - nv.top + 1;
        var nCols = nv.right - nv.left + 1;

        var innerLeft  = Math.max(viewport.left,  nv.left);
        var innerRight = Math.min(viewport.right, nv.right);
        var innerNCols = innerRight - innerLeft + 1;

        var requests = [ ];

        for (i = 0; i > left; i--)
            cells.shift();
        for (i = 0; i > right; i--)
            cells.pop();

        if (top < 0) {
            for (i = 0; i < cells.length; i++) {
                column = cells[i];
                for (j = 0; j > top; j--)
                    column.shift();
            }
        }
        if (bottom < 0) {
            for (i = 0; i < cells.length; i++) {
                column = cells[i];
                for (j = 0; j > bottom; j--)
                    column.pop();
            }
        }

        if (left > 0) {
            for (i = 0; i < left; i++)
                cells.unshift(new Array(nRows));

            this._requestCells({ left : nv.left, right : viewport.left - 1, top : nv.top, bottom : nv.bottom });
        }
        if (right > 0) {
            for (i = 0; i < right; i++)
                cells.push(new Array(nRows));

            this._requestCells({ left : viewport.right + 1, right : nv.right, top : nv.top, bottom : nv.bottom });
        }
        if (top > 0) {
            for (i = 0; i < innerNCols; i++) {
                for (j = 0; j < top; j++)
                    cells[i].unshift(".");
            }

            this._requestCells({ left : innerLeft, right : innerRight, top : nv.top, bottom : viewport.top });
        }
        if (bottom > 0) {
            for (i = 0; i < innerNCols; i++) {
                for (j = 0; j < bottom; j++)
                    cells[i].push(".");
            }

            this._requestCells({ left : innerLeft, right : innerRight, top : viewport.bottom, bottom : nv.bottom });
        }

        this.attributes.viewport = nv;
        this.attributes.cells = cells;

        this.trigger("viewportChanged");
    },
    _requestCells : function(viewport) {

        var self = this;
        var coms = this.attributes.coms;

        var cellsRequest = new coms.Messages.CellsRequest();
        cellsRequest.rowStart    = viewport.top;
        cellsRequest.columnStart = viewport.left;
        cellsRequest.rowEnd      = viewport.bottom;
        cellsRequest.columnEnd   = viewport.right;

        var request = new coms.Messages.ComsMessage();
        request.payload = cellsRequest.toArrayBuffer();
        request.payloadType = "CellsRequest";
        request.instanceId = this.attributes.instanceId;

        return coms.send(request).then(function(response) {

            var cellsResponse = coms.Messages.CellsResponse.decode(response.payload);

            var columns = cellsResponse.columns;

            var rowStart    = cellsResponse.request.get('rowStart');
            var columnStart = cellsResponse.request.get('columnStart');
            var rowEnd      = cellsResponse.request.get('rowEnd');
            var columnEnd   = cellsResponse.request.get('columnEnd');

            var viewport = { left : columnStart, top : rowStart, right : columnEnd, bottom : rowEnd };

            var columnCount = columnEnd - columnStart + 1;
            var rowCount    = rowEnd    - rowStart + 1;

            var cells = new Array(columnCount);

            for (var colNo = 0; colNo < columnCount; colNo++) {

                var column = columns[colNo];
                var values = column.get(column.cells).values;

                cells[colNo] = values;
            }

            self.setCells(viewport, cells);

            return cells;

        }).catch(function(err) {

            console.log(err);
        });
    },
    setCells : function(viewport, cells) {

        var left   = Math.max(viewport.left,   this.attributes.viewport.left);
        var right  = Math.min(viewport.right,  this.attributes.viewport.right);
        var top    = Math.max(viewport.top,    this.attributes.viewport.top);
        var bottom = Math.min(viewport.bottom, this.attributes.viewport.bottom);

        var inColOffset = viewport.left - left;
        var inRowOffset = viewport.top  - top;

        var outColOffset = left - this.attributes.viewport.left;
        var outRowOffset = top - this.attributes.viewport.top;

        var i, j;
        var nRows = bottom - top + 1;
        var nCols = right - left + 1;

        for (i = 0; i < nCols; i++) {

            var inCol  = cells[inColOffset + i];
            var outCol = this.attributes.cells[outColOffset + i];

            for (j = 0; j < nRows; j++) {
                outCol[outRowOffset + j] = inCol[inRowOffset + j];
            }

        }

        this.trigger("cellsChanged", { left: left, top: top, right: right, bottom: bottom });
    }
});

module.exports = { DataSetModel : DataSetModel, DataSetViewModel : DataSetViewModel };
