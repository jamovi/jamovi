//
// Copyright (C) 2016 Jonathon Love
//

'use strict';

const _ = require('underscore');
const $ = require('jquery');
const Backbone = require('backbone');
Backbone.$ = $;

const DataSetModel = Backbone.Model.extend({

    initialize() {
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
    setup(infoPB) {

        if (infoPB.hasDataSet) {

            let schemaPB = infoPB.schema;
            let columns = Array(schemaPB.columns.length);

            for (let i = 0; i < schemaPB.columns.length; i++) {

                let columnPB = schemaPB.columns[i];
                let column = { };

                column.name = columnPB.name;
                column.id = columnPB.id;
                column.measureType = DataSetModel.stringifyMeasureType(columnPB.measureType);
                column.autoMeasure = columnPB.autoMeasure;
                column.dps = columnPB.dps;
                column.width = columnPB.width;

                let levels = null;
                if (columnPB.hasLevels) {
                    levels = new Array(columnPB.levels.length);
                    for (let i = 0; i < levels.length; i++) {
                        let levelPB = columnPB.levels[i];
                        levels[i] = {
                            label: levelPB.label,
                            value: levelPB.value,
                        };
                    }
                }
                column.levels = levels;

                columns[i] = column;
            }

            this.attributes.columns  = columns;
            this.attributes.rowCount = infoPB.rowCount;
            this.attributes.columnCount = infoPB.columnCount;

            this.set('hasDataSet', true);
            this.trigger('dataSetLoaded');
        }
    },
    getColumnById(id) {
        for (let column of this.attributes.columns) {
            if (column.id === id)
                return column;
        }
    },
    getColumn(indexOrName) {
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
    indexOfColumnById(id) {
        let columns = this.attributes.columns;
        for (let i = 0; i < columns.length; i++) {
            if (columns[i].id === id)
                return i;
        }
        return -1;
    },
    indexOfColumn(columnOrName) {

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
    changeColumn(id, values) {

        let column = this.getColumnById(id);

        let coms = this.attributes.coms;

        let columnPB = new coms.Messages.DataSetSchema.ColumnSchema();
        columnPB.id = id;
        columnPB.measureType = DataSetModel.parseMeasureType(values.measureType);

        let nameChanged = values.name !== column.name;
        let oldName = column.name;

        let testName = values.name;
        if (nameChanged) {
            let names = this.attributes.columns.map((column) => { return column.name; } );
            let i = 2;
            while (names.includes(testName) && testName !== oldName)
                testName = values.name + ' (' + i++ + ')';
        }
        let newName = testName;

        columnPB.name = newName;

        if ('autoMeasure' in values)
            columnPB.autoMeasure = values.autoMeasure;
        else
            columnPB.autoMeasure = column.autoMeasure;

        if ('dps' in values)
            columnPB.dps = values.dps;
        else
            columnPB.dps = column.dps;

        if (values.measureType !== 'continuous' && values.levels) {
            columnPB.hasLevels = true;
            for (let i = 0; i < values.levels.length; i++) {
                let level = values.levels[i];
                let levelPB = new coms.Messages.VariableLevel();
                if (values.measureType === 'nominal' || values.measureType === 'ordinal') {
                    let value = parseInt(level.label);
                    if ( ! isNaN(value)) {
                        levelPB.value = value;
                        levelPB.label = level.label;
                        columnPB.levels.push(levelPB);
                    }
                }
                else {
                    levelPB.value = i;
                    levelPB.label = level.label;
                    columnPB.levels.push(levelPB);
                }
            }
        }

        let datasetPB = new coms.Messages.DataSetRR();
        datasetPB.op = coms.Messages.GetSet.SET;
        datasetPB.incSchema = true;
        datasetPB.schema.push(columnPB);

        let request = new coms.Messages.ComsMessage();
        request.payload = datasetPB.toArrayBuffer();
        request.payloadType = 'DataSetRR';
        request.instanceId = this.attributes.instanceId;

        return coms.send(request).then(response => {
            let datasetPB = coms.Messages.DataSetRR.decode(response.payload);
            if (datasetPB.incSchema) {

                let changed = Array(datasetPB.schema.length);
                let changes = Array(datasetPB.schema.length);

                for (let i = 0; i < datasetPB.schema.length; i++) {
                    let columnPB = datasetPB.schema[i];
                    let id = columnPB.id;
                    let column = this.getColumnById(id);
                    this._readColumnPB(columnPB, column);
                    changed[i] = columnPB.name;
                    changes[i] = {
                        id: id,
                        oldName: oldName,
                        levelsChanged: true,
                        measureTypeChanged: true,
                        nameChanged: nameChanged,
                        dataChanged: true
                    };
                }

                this.trigger('columnsChanged', { changed, changes });
            }
        });
    },
    _readColumnPB(columnPB, column) {
        column.measureType = DataSetModel.stringifyMeasureType(columnPB.measureType);
        column.autoMeasure = columnPB.autoMeasure;
        column.name = columnPB.name;
        column.dps = columnPB.dps;
        let levels = null;
        if (columnPB.hasLevels) {
            levels = new Array(columnPB.levels.length);
            for (let i = 0; i < levels.length; i++) {
                let levelPB = columnPB.levels[i];
                levels[i] = {
                    label: levelPB.label,
                    value: levelPB.value,
                };
            }
        }
        column.levels = levels;
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

    initialize() {
        this.on('columnsChanged', event => this._columnsChanged(event));
    },
    defaults() {
        return _.extend({
            cells      : [ ],
            viewport   : { left : 0, top : 0, right : -1, bottom : -1}
        }, DataSetModel.prototype.defaults);
    },
    valueAt(rowNo, colNo) {
        let viewport = this.attributes.viewport;
        if (rowNo >= viewport.top &&
            rowNo <= viewport.bottom &&
            colNo >= viewport.left &&
            colNo <= viewport.right) {

            return this.attributes.cells[colNo - viewport.left][rowNo - viewport.top];
        }

        return null;
    },
    setViewport(viewport) {

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
    reshape(left, top, right, bottom) {

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
    _requestCells(viewport) {

        let coms = this.attributes.coms;

        let cellsRequest = new coms.Messages.DataSetRR();
        cellsRequest.incData = true;
        cellsRequest.rowStart    = viewport.top;
        cellsRequest.columnStart = viewport.left;
        cellsRequest.rowEnd      = viewport.bottom;
        cellsRequest.columnEnd   = viewport.right;

        let request = new coms.Messages.ComsMessage();
        request.payload = cellsRequest.toArrayBuffer();
        request.payloadType = "DataSetRR";
        request.instanceId = this.attributes.instanceId;

        return coms.send(request).then(response => {

            let cellsResponse = coms.Messages.DataSetRR.decode(response.payload);

            let columns = cellsResponse.data;

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
                let values = Array(column.values.length);

                for (let i = 0; i < column.values.length; i++) {
                    let inValue = column.values[i];
                    let outValue;
                    if (inValue.type === 'o')
                        outValue = null;
                    else
                        outValue = inValue[inValue.type];
                    values[i] = outValue;
                }

                cells[colNo] = values;
            }

            this.setCells(viewport, cells);

            return cells;

        });
    },
    changeCells(viewport, cells) {

        let nRows = viewport.bottom - viewport.top + 1;
        let nCols = viewport.right - viewport.left + 1;

        let coms = this.attributes.coms;

        let cellsRequest = new coms.Messages.DataSetRR();
        cellsRequest.op = coms.Messages.GetSet.SET;
        cellsRequest.incData = true;
        cellsRequest.rowStart    = viewport.top;
        cellsRequest.columnStart = viewport.left;
        cellsRequest.rowEnd      = viewport.bottom;
        cellsRequest.columnEnd   = viewport.right;

        for (let i = 0; i < nCols; i++) {

            let inCells = cells[i];
            let columnType = this.attributes.columns[viewport.left + i].measureType;
            let columnPB = new coms.Messages.DataSetRR.ColumnData();

            for (let j = 0; j < nRows; j++) {
                let outValue = new coms.Messages.DataSetRR.ColumnData.CellValue();
                let inValue = inCells[j];
                if (inValue === null) {
                    outValue.o = coms.Messages.SpecialValues.MISSING;
                    outValue.type = 'o';
                }
                else if (typeof(inValue) === 'string') {
                    outValue.s = inValue;
                    outValue.type = 's';
                }
                else if (Math.floor(inValue) === inValue) {
                    outValue.i = inValue;
                    outValue.type = 'i';
                }
                else {
                    outValue.d = inValue;
                    outValue.type = 'd';
                }
                columnPB.values.push(outValue);
            }

            cellsRequest.data.push(columnPB);
        }

        let request = new coms.Messages.ComsMessage();
        request.payload = cellsRequest.toArrayBuffer();
        request.payloadType = "DataSetRR";
        request.instanceId = this.attributes.instanceId;

        return coms.send(request).then(response => {

            let datasetPB = coms.Messages.DataSetRR.decode(response.payload);
            let changes = [ ];
            let changed = [ ];

            if (datasetPB.incSchema) {
                changes = Array(datasetPB.schema.length);
                changed = Array(datasetPB.schema.length);
                for (let i = 0; i < datasetPB.schema.length; i++) {
                    let columnPB = datasetPB.schema[i];
                    let id = columnPB.id;
                    let column = this.getColumnById(id);
                    this._readColumnPB(columnPB, column);
                    changed[i] = columnPB.name;
                    changes[i] = {
                        id: id,
                        oldName: columnPB.name,
                        levelsChanged: true,
                        measureTypeChanged: true,
                        nameChanged: false,
                        dataChanged: true
                    };
                }
            }

            this.setCells(viewport, cells);

            for (let i = 0; i < nCols; i++) {
                let column = this.attributes.columns[viewport.left + i];
                let name = column.name;
                if ( ! changed.includes(name)) {
                    changed.push(name);
                    changes.push({ id: column.id, oldName: name, dataChanged: true });
                }
            }

            this.trigger('columnsChanged', { changed, changes });
        });

    },
    setCells(viewport, cells) {

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
    _columnsChanged(event) {

        for (let changes of event.changes) {
            if (changes.dataChanged === false)
                continue;

            let index = this.indexOfColumnById(changes.id);
            let viewport = {
                left: index,
                top: this.attributes.viewport.top,
                right: index,
                bottom: this.attributes.viewport.bottom
            };
            this._requestCells(viewport);
        }
    }
});

module.exports = { DataSetModel : DataSetModel, DataSetViewModel : DataSetViewModel };
