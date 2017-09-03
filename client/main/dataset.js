//
// Copyright (C) 2016 Jonathon Love
//

'use strict';

const _ = require('underscore');
const $ = require('jquery');
const Backbone = require('backbone');
Backbone.$ = $;

const ByteBuffer = require('bytebuffer');

const DataSetModel = Backbone.Model.extend({

    initialize() {
    },
    defaults : {
        hasDataSet : false,
        columns    : [ ],
        rowCount : 0,
        vRowCount : 0,
        columnCount : 0,
        vColumnCount : 0,
        coms : null,
        instanceId : null,
        editingVar : null,
        varEdited : false,
        edited : false,
        formula : '',
        formulaMessage : '',
    },
    setup(infoPB) {

        if (infoPB.hasDataSet) {

            this.set('edited', infoPB.edited);

            let schemaPB = infoPB.schema;
            let columns = Array(schemaPB.columns.length);

            for (let i = 0; i < schemaPB.columns.length; i++) {
                let columnPB = schemaPB.columns[i];
                let column = { };
                this._readColumnPB(column, columnPB);
                columns[i] = column;
            }

            this.attributes.columns  = columns;
            this.attributes.rowCount = infoPB.schema.rowCount;
            this.attributes.vRowCount = infoPB.schema.vRowCount;
            this.attributes.columnCount = infoPB.schema.columnCount;
            this.attributes.vColumnCount = infoPB.schema.vColumnCount;

            this.set('hasDataSet', true);
            this.trigger('dataSetLoaded');
        }
    },
    getColumnById(id) {
        for (let column of this.attributes.columns) {
            if (column === undefined)
                continue;
            if (column.id === id)
                return column;
        }
    },
    getColumn(indexOrName) {
        if (typeof(indexOrName) === 'number') {
            return this.attributes.columns[indexOrName];
        }
        else {
            for (let column of this.attributes.columns) {
                if (column.name === indexOrName)
                    return column;
            }
        }
        return undefined;
    },
    insertRows(rowStart, rowEnd) {

        let coms = this.attributes.coms;

        let datasetPB = new coms.Messages.DataSetRR();
        datasetPB.op = coms.Messages.GetSet.INS_ROWS;
        datasetPB.rowStart = rowStart;
        datasetPB.rowEnd = rowEnd;

        let request = new coms.Messages.ComsMessage();
        request.payload = datasetPB.toArrayBuffer();
        request.payloadType = 'DataSetRR';
        request.instanceId = this.attributes.instanceId;

        return coms.send(request).then(response => {

            let datasetPB = coms.Messages.DataSetRR.decode(response.payload);
            if (datasetPB.incSchema) {

                this.set('rowCount', datasetPB.schema.rowCount);
                this.set('vRowCount', datasetPB.schema.vRowCount);
                this.set('columnCount', datasetPB.schema.columnCount);
                this.set('vColumnCount', datasetPB.schema.vColumnCount);

                let changed = Array(datasetPB.schema.columns.length);
                let changes = Array(datasetPB.schema.columns.length);

                for (let i = 0; i < datasetPB.schema.columns.length; i++) {
                    let columnPB = datasetPB.schema.columns[i];
                    let id = columnPB.id;
                    let column = this.getColumnById(id);

                    // dps might have changed
                    this._readColumnPB(column, columnPB);

                    changed[i] = columnPB.name;
                    changes[i] = { id: id, dataChanged: true };
                }

                this.trigger('columnsChanged', { changed, changes });
            }

        });
    },
    deleteRows(rowStart, rowEnd) {

        let coms = this.attributes.coms;

        let datasetPB = new coms.Messages.DataSetRR();
        datasetPB.op = coms.Messages.GetSet.DEL_ROWS;
        datasetPB.rowStart = rowStart;
        datasetPB.rowEnd = rowEnd;

        let request = new coms.Messages.ComsMessage();
        request.payload = datasetPB.toArrayBuffer();
        request.payloadType = 'DataSetRR';
        request.instanceId = this.attributes.instanceId;

        return coms.send(request).then(response => {

            let datasetPB = coms.Messages.DataSetRR.decode(response.payload);
            if (datasetPB.incSchema) {

                this.set('rowCount', datasetPB.schema.rowCount);
                this.set('vRowCount', datasetPB.schema.vRowCount);
                this.set('columnCount', datasetPB.schema.columnCount);
                this.set('vColumnCount', datasetPB.schema.vColumnCount);

                let changed = Array(datasetPB.schema.columns.length);
                let changes = Array(datasetPB.schema.columns.length);

                for (let i = 0; i < datasetPB.schema.columns.length; i++) {
                    let columnPB = datasetPB.schema.columns[i];
                    let id = columnPB.id;
                    let column = this.getColumnById(id);
                    this._readColumnPB(column, columnPB);

                    changed[i] = columnPB.name;
                    changes[i] = {
                        id: id,
                        columnTypeChanged: false,
                        measureTypeChanged: true,
                        levelsChanged: true,
                        nameChanged: false,
                        dataChanged: true,
                        created: false,
                    };
                }

                this.trigger('columnsChanged', { changed, changes });
            }
        });
    },
    insertColumn(index) {

        let coms = this.attributes.coms;

        let datasetPB = new coms.Messages.DataSetRR();
        datasetPB.op = coms.Messages.GetSet.INS_COLS;
        datasetPB.columnStart = index;
        datasetPB.columnEnd = index;

        let request = new coms.Messages.ComsMessage();
        request.payload = datasetPB.toArrayBuffer();
        request.payloadType = 'DataSetRR';
        request.instanceId = this.attributes.instanceId;

        return coms.send(request).then(response => {

            let datasetPB = coms.Messages.DataSetRR.decode(response.payload);
            if (datasetPB.incSchema) {

                this.set('rowCount', datasetPB.schema.rowCount);
                this.set('vRowCount', datasetPB.schema.vRowCount);
                this.set('columnCount', datasetPB.schema.columnCount);
                this.set('vColumnCount', datasetPB.schema.vColumnCount);

                let viewport = this.attributes.viewport;

                if (viewport.left <= index && viewport.right >= index)
                    viewport.right++;

                let columns = this.attributes.columns;
                let column = { };
                this._readColumnPB(column, datasetPB.schema.columns[0]);
                columns.splice(index, 0, column);

                for (let i = index; i < columns.length; i++)
                    columns[i].index = i;

                // add the cells, this should be in DataSetViewModel
                let cells = new Array(viewport.bottom - viewport.top + 1).fill(null);
                this.attributes.cells.splice(column.index - viewport.left, 0, cells);

                this.trigger('columnsInserted', { index: index });

                let changed = Array(datasetPB.schema.columns.length);
                let changes = Array(datasetPB.schema.columns.length);

                for (let i = 0; i < datasetPB.schema.columns.length; i++) {
                    let columnPB = datasetPB.schema.columns[i];
                    let id = columnPB.id;
                    let column = this.getColumnById(id);
                    this._readColumnPB(column, columnPB);

                    changed[i] = columnPB.name;
                    changes[i] = {
                        id: id,
                        name: columnPB.name,
                        index: index,
                        created: true,
                        dataChanged: true };
                }

                this.trigger('columnsChanged', { changed, changes });
            }

        });
    },
    deleteColumns(start, end) {

        let coms = this.attributes.coms;

        let datasetPB = new coms.Messages.DataSetRR();
        datasetPB.op = coms.Messages.GetSet.DEL_COLS;
        datasetPB.columnStart = start;
        datasetPB.columnEnd = end;

        let request = new coms.Messages.ComsMessage();
        request.payload = datasetPB.toArrayBuffer();
        request.payloadType = 'DataSetRR';
        request.instanceId = this.attributes.instanceId;

        return coms.send(request).then(response => {

            let nDeleted = end - start + 1;
            let changed = Array(nDeleted);
            let changes = Array(nDeleted);

            for (let i = 0; i < nDeleted; i++) {
                let column = this.attributes.columns[start + i];
                changed[i] = column.name;
                changes[i] = { id: column.id, name: column.name, index: column.index, deleted: true };
            }

            let before = this.attributes.columns.slice(0, start);
            let after = this.attributes.columns.slice(end + 1);
            for (let i = 0; i < after.length; i++)
                after[i].index = start + i;

            this.attributes.columns = before.concat(after);

            let viewport = this.attributes.viewport;

            if (start > viewport.right) {  // to the right of the view
                // do nothing
            }
            else if (end < viewport.left) {  // to the left of the view
                viewport.left  -= nDeleted;
                viewport.right -= nDeleted;
            }
            else if (start >= viewport.left && end >= viewport.right) {
                // overlapping the left side of the view
                viewport.right = start - 1;
            }
            else if (start <= viewport.left && end <= viewport.right) {
                // overlapping the right side of the view
                viewport.left = end + 1 - nDeleted;
                viewport.right -= nDeleted;
            }
            else if (start >= viewport.left && end <= viewport.right) {
                // contained in the view
                viewport.right -= nDeleted;
            }
            else {
                // starting before the view, extending after
                viewport.right -= nDeleted;
                viewport.left = viewport.right + 1;
            }

            this.set('edited', true);

            let datasetPB = coms.Messages.DataSetRR.decode(response.payload);
            if (datasetPB.incSchema) {

                this.set('rowCount', datasetPB.schema.rowCount);
                this.set('vRowCount', datasetPB.schema.vRowCount);
                this.set('columnCount', datasetPB.schema.columnCount);
                this.set('vColumnCount', datasetPB.schema.vColumnCount);

                for (let columnPB of datasetPB.schema.columns) {
                    let id = columnPB.id;
                    let column = this.getColumnById(id);
                    this._readColumnPB(column, columnPB);

                    changed.push(columnPB.name);
                    changes.push({
                        id: id,
                        name: columnPB.name,
                        dataChanged: true });
                }
            }

            this.trigger('columnsDeleted', { start: start, end: end });
            this.trigger('columnsChanged', { changed, changes });
        });
    },
    changeColumn(id, values) {

        let column = this.getColumnById(id);

        let coms = this.attributes.coms;

        let columnPB = new coms.Messages.DataSetSchema.ColumnSchema();
        columnPB.id = id;
        columnPB.measureType = DataSetModel.parseMeasureType(values.measureType);

        if (values.name === '')
            values.name = genColName(column.index);

        let nameChanged = (values.name !== column.name);
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

        if ('columnType' in values)
            columnPB.columnType = DataSetModel.parseColumnType(values.columnType);
        else
            columnPB.columnType = DataSetModel.parseColumnType(column.columnType);

        if ('autoMeasure' in values)
            columnPB.autoMeasure = values.autoMeasure;
        else
            columnPB.autoMeasure = column.autoMeasure;

        if ('dps' in values)
            columnPB.dps = values.dps;
        else
            columnPB.dps = column.dps;

        if ('formula' in values)
            columnPB.formula = values.formula;
        else
            columnPB.formula = column.formula;

        if (values.measureType !== 'continuous' && values.levels) {
            columnPB.hasLevels = true;
            for (let i = 0; i < values.levels.length; i++) {
                let level = values.levels[i];
                let levelPB = new coms.Messages.VariableLevel();
                if (values.measureType === 'nominal' || values.measureType === 'ordinal') {
                    levelPB.value = level.value;
                    levelPB.label = level.label;
                    levelPB.importValue = '';
                    columnPB.levels.push(levelPB);
                }
                else {
                    levelPB.value = i;
                    levelPB.label = level.label;
                    levelPB.importValue = level.importValue;
                    columnPB.levels.push(levelPB);
                }
            }
        }

        let datasetPB = new coms.Messages.DataSetRR();
        datasetPB.op = coms.Messages.GetSet.SET;
        datasetPB.incSchema = true;
        datasetPB.schema = new coms.Messages.DataSetSchema();
        datasetPB.schema.columns.push(columnPB);

        let request = new coms.Messages.ComsMessage();
        request.payload = datasetPB.toArrayBuffer();
        request.payloadType = 'DataSetRR';
        request.instanceId = this.attributes.instanceId;

        return coms.send(request).then(response => {
            let datasetPB = coms.Messages.DataSetRR.decode(response.payload);
            if (datasetPB.incSchema) {

                let changed = Array(datasetPB.schema.columns.length);
                let changes = Array(datasetPB.schema.columns.length);
                let nCreated = 0;

                for (let i = 0; i < datasetPB.schema.columns.length; i++) {
                    let columnPB = datasetPB.schema.columns[i];
                    let id = columnPB.id;
                    let column = this.getColumnById(id);

                    let newName = columnPB.name;

                    let created;
                    let oldName;
                    let oldColumnType;

                    if (column !== undefined) {
                        created = false;
                        oldName = column.name;
                        oldColumnType = column.columnType;
                        this._readColumnPB(column, columnPB);
                    }
                    else {
                        created = true;
                        oldName = columnPB.name;
                        oldColumnType = 0;
                        column = { };
                        nCreated++;
                        this._readColumnPB(column, columnPB);
                        this.attributes.columns[column.index] = column;
                    }

                    changed[i] = columnPB.name;
                    changes[i] = {
                        id: id,
                        name: column.name,
                        index: column.index,
                        oldName: oldName,
                        columnTypeChanged: column.columnType !== oldColumnType,
                        measureTypeChanged: true,
                        levelsChanged: true,
                        nameChanged: nameChanged,
                        dataChanged: true,
                        created: created,
                    };
                }

                if (nCreated > 0) {
                    this.set('columnCount', this.attributes.columnCount + nCreated);
                    this.set('vColumnCount', this.attributes.vColumnCount + nCreated);
                }

                for (let change of changes) {
                    if (change.created)
                        this.trigger('columnsInserted', { index: change.index });
                }

                this.trigger('columnsChanged', { changed, changes });
            }
        }).catch((error) => {
            console.log(error);
            throw error;
        });
    },
    _readColumnPB(column, columnPB) {
        column.id = columnPB.id;
        column.name = columnPB.name;
        column.index = columnPB.index;
        column.columnType = DataSetModel.stringifyColumnType(columnPB.columnType);
        column.measureType = DataSetModel.stringifyMeasureType(columnPB.measureType);
        column.autoMeasure = columnPB.autoMeasure;
        column.dps = columnPB.dps;
        column.width = columnPB.width;
        column.formula = columnPB.formula;
        column.formulaMessage = columnPB.formulaMessage;

        let levels = null;
        if (columnPB.hasLevels) {
            levels = new Array(columnPB.levels.length);
            for (let i = 0; i < levels.length; i++) {
                let levelPB = columnPB.levels[i];
                if (column.measureType === 'nominaltext') {
                    levels[i] = {
                        label: levelPB.label,
                        value: i,
                        importValue: levelPB.importValue
                    };
                }
                else {
                    levels[i] = {
                        label: levelPB.label,
                        value: levelPB.value,
                        importValue: levelPB.value.toString()
                    };
                }
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
            return 'none';
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


DataSetModel.stringifyColumnType = function(type) {
    switch (type) {
        case 1:
            return 'data';
        case 2:
            return 'computed';
        default:
            return 'none';
    }
};

DataSetModel.parseColumnType = function(str) {
    switch (str) {
        case 'data':
            return 1;
        case 'computed':
            return 2;
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
            cells    : [ ],
            viewport : { left : 0, top : 0, right : -1, bottom : -1 },
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
        this.attributes.viewport = Object.assign({}, viewport);

        this.trigger("viewportChanged");
        this.trigger("viewportReset");

        if (nRows !== 0 && nCols !== 0)
            this.readCells(viewport);
    },
    reshape(left, top, right, bottom) {

        // console.log("reshape : " + JSON.stringify({left:left,top:top,right:right,bottom:bottom}));

        let viewport = this.attributes.viewport;
        let cells = this.attributes.cells;
        let delta = { left: left, top: top, right: right, bottom: bottom };

        let nv = Object.assign({}, viewport);

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

            this.readCells({ left : nv.left, right : viewport.left - 1, top : nv.top, bottom : nv.bottom });
        }
        if (right > 0) {
            for (let i = 0; i < right; i++)
                cells.push(new Array(nRows));

            this.readCells({ left : viewport.right + 1, right : nv.right, top : nv.top, bottom : nv.bottom });
        }
        if (top > 0) {
            for (let i = 0; i < innerNCols; i++) {
                for (let j = 0; j < top; j++)
                    cells[i].unshift(".");
            }

            this.readCells({ left : innerLeft, right : innerRight, top : nv.top, bottom : viewport.top });
        }
        if (bottom > 0) {
            for (let i = 0; i < innerNCols; i++) {
                for (let j = 0; j < bottom; j++)
                    cells[i].push(".");
            }

            this.readCells({ left : innerLeft, right : innerRight, top : viewport.bottom, bottom : nv.bottom });
        }

        this.attributes.viewport = nv;
        this.attributes.cells = cells;

        this.trigger("viewportChanged");
    },
    readCells(viewport) {
        this.requestCells(viewport).then(cells => {
            this.setCells(viewport, cells);
        }).done();
    },
    _parseCells(response) {

        let columns = response.data;

        let rowStart    = response.rowStart;
        let columnStart = response.columnStart;
        let rowEnd      = response.rowEnd;
        let columnEnd   = response.columnEnd;

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

        return cells;
    },
    requestCells(viewport) {

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
            let dsrrPB = coms.Messages.DataSetRR.decode(response.payload);
            let cells = this._parseCells(dsrrPB);
            return cells;
        });
    },
    changeCells(viewport, cells, cbHtml) {

        let nRows = viewport.bottom - viewport.top + 1;
        let nCols = viewport.right - viewport.left + 1;

        let coms = this.attributes.coms;

        let cellsRequest = new coms.Messages.DataSetRR();
        cellsRequest.op = coms.Messages.GetSet.SET;
        cellsRequest.rowStart    = viewport.top;
        cellsRequest.columnStart = viewport.left;
        cellsRequest.rowEnd      = viewport.bottom;
        cellsRequest.columnEnd   = viewport.right;

        if (typeof(cells) === 'string') {
            // send serialized data
            cellsRequest.incCBData = true;
            cellsRequest.cbText = cells;
            if (cbHtml)
                cellsRequest.cbHtml = cbHtml;
        }
        else if (cells === null) {

            cellsRequest.incData = true;

            if (viewport.top < this.attributes.rowCount &&
                viewport.bottom >= this.attributes.rowCount) {
                    nRows = this.attributes.rowCount - viewport.top + 1;
                    cellsRequest.rowEnd = this.attributes.rowCount - 1;
            }

            if (viewport.left < this.attributes.columnCount &&
                viewport.right >= this.attributes.columnCount) {
                    nCols = this.attributes.columnCount - viewport.left + 1;
                    cellsRequest.columnEnd = this.attributes.columnCount - 1;
            }

            for (let i = 0; i < nCols; i++) {
                let columnPB = new coms.Messages.DataSetRR.ColumnData();

                for (let j = 0; j < nRows; j++) {
                    let cellPB = new coms.Messages.DataSetRR.ColumnData.CellValue();
                    cellPB.o = coms.Messages.SpecialValues.MISSING;
                    cellPB.type = 'o';
                    columnPB.values.push(cellPB);
                }

                cellsRequest.data.push(columnPB);
            }
        }
        else {

            cellsRequest.incData = true;

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
        }

        let request = new coms.Messages.ComsMessage();
        request.payload = cellsRequest.toArrayBuffer();
        request.payloadType = 'DataSetRR';
        request.instanceId = this.attributes.instanceId;

        return coms.send(request).then(response => {

            let datasetPB = coms.Messages.DataSetRR.decode(response.payload);

            let viewport = {
                top:    datasetPB.rowStart,
                bottom: datasetPB.rowEnd,
                left:   datasetPB.columnStart,
                right:  datasetPB.columnEnd };

            nCols = viewport.right - viewport.left + 1;

            let changes = [ ];
            let changed = [ ];
            let nCreated = 0;

            if (datasetPB.incSchema) {
                changes = Array(datasetPB.schema.columns.length);
                changed = Array(datasetPB.schema.columns.length);

                for (let i = 0; i < datasetPB.schema.columns.length; i++) {
                    let columnPB = datasetPB.schema.columns[i];
                    let id = columnPB.id;
                    let column = this.getColumnById(id);
                    let newName = columnPB.name;

                    let created = false;
                    let oldName;
                    let oldColumnType;
                    if (column !== undefined) {
                        oldName = column.name;
                        oldColumnType = column.columnType;
                        this._readColumnPB(column, columnPB);
                    }
                    else {
                        oldName = columnPB.name;
                        oldColumnType = 0;
                        column = { };
                        created = true;
                        nCreated++;
                        this._readColumnPB(column, columnPB);
                        this.attributes.columns[column.index] = column;
                    }

                    changed[i] = columnPB.name;
                    changes[i] = {
                        id: id,
                        oldName: oldName,
                        name: newName,
                        index: column.index,
                        columnTypeChanged: oldColumnType !== column.columnType,
                        measureTypeChanged: true,
                        levelsChanged: true,
                        nameChanged: oldName !== newName,
                        dataChanged: true,
                        created: created,
                    };
                }
            }

            for (let i = 0; i < nCols; i++) {
                let column = this.attributes.columns[viewport.left + i];
                let name = column.name;
                if ( ! changed.includes(name)) {
                    changed.push(name);
                    changes.push({ id: column.id, oldName: name, dataChanged: true });
                }
            }

            if (nCreated > 0) {
                this.set('columnCount', this.attributes.columnCount + nCreated);
                this.set('vColumnCount', this.attributes.vColumnCount + nCreated);
            }

            if (datasetPB.schema) {
                this.set('rowCount', datasetPB.schema.rowCount);
                this.set('vRowCount', datasetPB.schema.vRowCount);
            }

            for (let change of changes) {
                if (change.created)
                    this.trigger('columnsInserted', { index: change.index });
            }

            this.set('edited', true);
            this.trigger('columnsChanged', { changed, changes });

            let cells = this._parseCells(datasetPB);
            this.setCells(viewport, cells);

            return viewport;
        });

    },
    setCells(viewport, cells) {

        let left   = Math.max(viewport.left,   this.attributes.viewport.left);
        let right  = Math.min(viewport.right,  this.attributes.viewport.right);
        let top    = Math.max(viewport.top,    this.attributes.viewport.top);
        let bottom = Math.min(viewport.bottom, this.attributes.viewport.bottom);

        let inColOffset = left - viewport.left;
        let inRowOffset = top - viewport.top;

        let outColOffset = left - this.attributes.viewport.left;
        let outRowOffset = top - this.attributes.viewport.top;

        let nRows = bottom - top + 1;
        let nCols = right - left + 1;

        for (let i = 0; i < nCols; i++) {

            let inCol  = cells[inColOffset + i];
            let outCol = this.attributes.cells[outColOffset + i];
            let columnInfo = this.attributes.columns[outColOffset + i];
            for (let j = 0; j < nRows; j++) {
                outCol[outRowOffset + j] = inCol[inRowOffset + j];
            }
        }

        this.trigger("cellsChanged", { left: left, top: top, right: right, bottom: bottom });
    },
    _columnsChanged(event) {

        for (let changes of event.changes) {
            if ( ! changes.dataChanged)
                continue;

            let index = this.getColumnById(changes.id).index;
            let viewport = {
                left: index,
                top: this.attributes.viewport.top,
                right: index,
                bottom: this.attributes.viewport.bottom
            };
            this.readCells(viewport);
        }
    }
});

const genColName = function(index) {
    let alph = [
            'A','B','C','D','E','F','G','H','I',
            'J','K','L','M','N','O','P','Q','R',
            'S','T','U','V','W','X','Y','Z'
        ];

    let value = '';
    let c = index;
    do {
        let i = c % alph.length;
        value = alph[i] + value;
        c -= i;
        c /= alph.length;
        c -= 1;
    }
    while (c >= 0);

    return value;
};


module.exports = DataSetViewModel;
