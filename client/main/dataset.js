//
// Copyright (C) 2016 Jonathon Love
//

'use strict';

const _ = require('underscore');
const $ = require('jquery');
const Backbone = require('backbone');
Backbone.$ = $;

const DataSetModel = Backbone.Model.extend({

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
    setup : function(info) {

        this.attributes.columns  = info.columns;
        this.attributes.rowCount = info.rowCount;
        this.attributes.columnCount = info.columnCount;

        this.set('hasDataSet', true);
        this.trigger('dataSetLoaded');
    },
    getColumn : function(indexOrName) {
        if (typeof(indexOfName) === 'number') {
            return this.attributes.columns[indexOrName];
        }
        else {
            for (let column of this.attributes.columns) {
                if (column.name === indexOrName)
                    return column;
            }
        }
        return null;
    },
    indexOfColumn : function(columnOrName) {

        let columns = this.attributes.columns;

        if (typeof(columnOrName) === 'string') {
            for (let i = 0; i < columns.length; i++) {
                if (columns[i].name === columnOrName)
                    return i;
            }
        }
        else {
            for (let i = 0; i < columns.length; i++) {
                if (columns[i] === columnOrName)
                    return i;
            }
        }

        return -1;
    },
    changeColumn : function(name, values) {

        let column = this.getColumn(name);

        let coms = this.attributes.coms;

        let field = new coms.Messages.DataSetSchema.Field();
        field.name = column.name;
        field.measureType = DataSetModel.parseMeasureType(values.type);

        if (values.type === 'nominaltext') {
            for (let i = 0; i < values.levels.length; i++) {
                let level = values.levels[i];
                let pbLevel = new coms.Messages.VariableLevel();
                pbLevel.value = i;
                pbLevel.label = level.label;
                field.levels.push(pbLevel);
            }
        }

        let schema = new coms.Messages.DataSetSchema();
        schema.fields.push(field);

        let info = new coms.Messages.InfoRequest();
        info.op = coms.Messages.GetSet.SET;
        info.schema = schema;

        let request = new coms.Messages.ComsMessage();
        request.payload = info.toArrayBuffer();
        request.payloadType = 'InfoRequest';
        request.instanceId = this.attributes.instanceId;

        coms.send(request).then(response => {
            column.measureType = values.type;
            column.levels = values.levels;
            this.trigger('columnsChanged', {
                columns: [ name ],
                levelsChanged: true,
                measureTypeChanged: true,
                dataChanged: true,
            });
        });
    },
});

DataSetModel.stringifyMeasureType = function(type) {
    switch (type) {
        case 1:
            return 'nominaltext';
        case 2:
            return 'nominal';
        case 3:
            return 'ordinal';
        case 4:
            return 'continuous';
        default:
            return 'misc';
    }
};

DataSetModel.parseMeasureType = function(str) {
    switch (str) {
        case 'nominaltext':
            return 1;
        case 'nominal':
            return 2;
        case 'ordinal':
            return 3;
        case 'continuous':
            return 4;
        default:
            return 0;
    }
};

const DataSetViewModel = DataSetModel.extend({

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

        let nCols = viewport.right - viewport.left + 1;
        let nRows = viewport.bottom - viewport.top + 1;

        let cells = Array(nCols);

        for (let i = 0; i < nCols; i++) {
            let column = new Array(nRows);

            for (let j = 0; j < nRows; j++)
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

        let viewport = this.attributes.viewport;
        let cells = this.attributes.cells;
        let delta = { left: left, top: top, right: right, bottom: bottom };

        let nv = _.clone(viewport);

        nv.left  -= left;
        nv.right += right;
        nv.top   -= top;
        nv.bottom += bottom;

        let nRows = nv.bottom - nv.top + 1;
        let nCols = nv.right - nv.left + 1;

        let innerLeft  = Math.max(viewport.left,  nv.left);
        let innerRight = Math.min(viewport.right, nv.right);
        let innerNCols = innerRight - innerLeft + 1;

        let requests = [ ];

        for (let i = 0; i > left; i--)
            cells.shift();
        for (let i = 0; i > right; i--)
            cells.pop();

        if (top < 0) {
            for (let i = 0; i < cells.length; i++) {
                let column = cells[i];
                for (let j = 0; j > top; j--)
                    column.shift();
            }
        }
        if (bottom < 0) {
            for (let i = 0; i < cells.length; i++) {
                let column = cells[i];
                for (let j = 0; j > bottom; j--)
                    column.pop();
            }
        }

        if (left > 0) {
            for (let i = 0; i < left; i++)
                cells.unshift(new Array(nRows));

            this._requestCells({ left : nv.left, right : viewport.left - 1, top : nv.top, bottom : nv.bottom });
        }
        if (right > 0) {
            for (let i = 0; i < right; i++)
                cells.push(new Array(nRows));

            this._requestCells({ left : viewport.right + 1, right : nv.right, top : nv.top, bottom : nv.bottom });
        }
        if (top > 0) {
            for (let i = 0; i < innerNCols; i++) {
                for (let j = 0; j < top; j++)
                    cells[i].unshift(".");
            }

            this._requestCells({ left : innerLeft, right : innerRight, top : nv.top, bottom : viewport.top });
        }
        if (bottom > 0) {
            for (let i = 0; i < innerNCols; i++) {
                for (let j = 0; j < bottom; j++)
                    cells[i].push(".");
            }

            this._requestCells({ left : innerLeft, right : innerRight, top : viewport.bottom, bottom : nv.bottom });
        }

        this.attributes.viewport = nv;
        this.attributes.cells = cells;

        this.trigger("viewportChanged");
    },
    _requestCells : function(viewport) {

        let coms = this.attributes.coms;

        let cellsRequest = new coms.Messages.CellsRR();
        cellsRequest.rowStart    = viewport.top;
        cellsRequest.columnStart = viewport.left;
        cellsRequest.rowEnd      = viewport.bottom;
        cellsRequest.columnEnd   = viewport.right;

        let request = new coms.Messages.ComsMessage();
        request.payload = cellsRequest.toArrayBuffer();
        request.payloadType = "CellsRR";
        request.instanceId = this.attributes.instanceId;

        return coms.send(request).then(response => {

            let cellsResponse = coms.Messages.CellsRR.decode(response.payload);

            let columns = cellsResponse.columns;

            let rowStart    = cellsResponse.rowStart;
            let columnStart = cellsResponse.columnStart;
            let rowEnd      = cellsResponse.rowEnd;
            let columnEnd   = cellsResponse.columnEnd;

            let viewport = { left : columnStart, top : rowStart, right : columnEnd, bottom : rowEnd };

            let columnCount = columnEnd - columnStart + 1;
            let rowCount    = rowEnd    - rowStart + 1;

            let cells = new Array(columnCount);

            for (let colNo = 0; colNo < columnCount; colNo++) {

                let column = columns[colNo];
                let values = column.get(column.cells).values;

                cells[colNo] = values;
            }

            this.setCells(viewport, cells);

            return cells;

        }).catch(err => {

            console.log(err);
        });
    },
    changeCells : function(viewport, cells) {

        let nRows = viewport.bottom - viewport.top + 1;
        let nCols = viewport.right - viewport.left + 1;

        let coms = this.attributes.coms;

        let cellsRequest = new coms.Messages.CellsRR();
        cellsRequest.op = coms.Messages.GetSet.SET;
        cellsRequest.rowStart    = viewport.top;
        cellsRequest.columnStart = viewport.left;
        cellsRequest.rowEnd      = viewport.bottom;
        cellsRequest.columnEnd   = viewport.right;

        let filterFloat  = value => value !== null ? value : NaN;
        let filterInt    = value => value !== null ? value : -2147483648;
        let filterString = value => value !== null ? value : '';

        for (let i = 0; i < nCols; i++) {

            let columnType = this.attributes.columns[viewport.left + i].measureType;
            let column = new coms.Messages.CellsRR.Column();

            if (columnType === 'continuous') {
                let doubles = new coms.Messages.CellsRR.Column.Doubles();
                doubles.values = cells[i].map(filterFloat);
                column.doubles = doubles;
            }
            else if (columnType === 'nominal' || columnType === 'ordinal') {
                let ints = new coms.Messages.CellsRR.Column.Ints();
                ints.values = cells[i].map(filterInt);
                column.ints = ints;
            }
            else { // if (columnType === 'nominaltext') {
                let strings = new coms.Messages.CellsRR.Column.Strings();
                strings.values = cells[i].map(filterString);
                column.strings = strings;
            }
            cellsRequest.columns.push(column);
        }

        let request = new coms.Messages.ComsMessage();
        request.payload = cellsRequest.toArrayBuffer();
        request.payloadType = "CellsRR";
        request.instanceId = this.attributes.instanceId;

        return coms.send(request).then(response => {
            this.setCells(viewport, cells);
            let columns = Array(nCols);
            for (let i = 0; i < nCols; i++)
                columns[i] = this.attributes.columns[viewport.left + i].name;

            this.trigger('columnsChanged', {
                columns: columns,
                dataChanged: true });
        });

    },
    setCells : function(viewport, cells) {

        let left   = Math.max(viewport.left,   this.attributes.viewport.left);
        let right  = Math.min(viewport.right,  this.attributes.viewport.right);
        let top    = Math.max(viewport.top,    this.attributes.viewport.top);
        let bottom = Math.min(viewport.bottom, this.attributes.viewport.bottom);

        let inColOffset = viewport.left - left;
        let inRowOffset = viewport.top  - top;

        let outColOffset = left - this.attributes.viewport.left;
        let outRowOffset = top - this.attributes.viewport.top;

        let nRows = bottom - top + 1;
        let nCols = right - left + 1;

        for (let i = 0; i < nCols; i++) {

            let inCol  = cells[inColOffset + i];
            let outCol = this.attributes.cells[outColOffset + i];

            for (let j = 0; j < nRows; j++)
                outCol[outRowOffset + j] = inCol[inRowOffset + j];
        }

        this.trigger("cellsChanged", { left: left, top: top, right: right, bottom: bottom });
    },
    changeColumn : function(name, values) {
        DataSetModel.prototype.changeColumn.call(this, name, values);

        for (let i = 0; i < this.attributes.columns.length; i++) {
            let column = this.attributes.columns[i];
            if (column.name === name) {
                let viewport = {
                    left: i,
                    top: this.attributes.viewport.top,
                    right: i,
                    bottom: this.attributes.viewport.bottom
                };
                this._requestCells(viewport);
                break;
            }
        }
    }
});

module.exports = { DataSetModel : DataSetModel, DataSetViewModel : DataSetViewModel };
