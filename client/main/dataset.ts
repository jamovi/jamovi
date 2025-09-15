'use strict';

import { EventMap } from "../common/eventmap";
import Coms, { QQ } from "./coms";
import { Block, IAreaSelection, ISelection, RowBlock } from "./selection";

enum TransformAction {
    CREATE = 0,
    UPDATE = 1,
    REMOVE = 2,
}

export enum MeasureType {
    NONE = 'none',
    NOMINAL = 'nominal',
    ORDINAL = 'ordinal',
    CONTINUOUS = 'continuous',
    ID = 'id',
}

export enum DataType {
    NO_DATA_TYPE = 'none',
    INTEGER = 'integer',
    DECIMAL = 'decimal',
    TEXT = 'text'
}

export interface Transform {
    action: TransformAction;
    id: number;
    name: string;
    description: string;
    formula: string[];
    formulaMessage: string[];
    colourIndex: number;
    measureType: MeasureType;
    suffix: string;
}

interface RowRange {
    index: number;
    count: number;
}

enum ColumnAction {
    MODIFY = 0,
    REMOVE = 1,
    INSERT = 2,
}

export enum ColumnType {
    NONE = 'none',
    DATA = 'data',
    COMPUTED = 'computed',
    RECODED = 'recoded',
    FILTER = 'filter',
    OUTPUT = 'output',
}

export interface VariableLevel {
    label: string;
    value: number;
    importValue: string;
    pinned: boolean;
}

interface ColumnCellRange {
    start: number;
    end: number;
}

interface DatasetRowBlock {
    rowStart: number;
    count: number;
}

interface DatasetChange {
    dIndex: number;
    created: boolean;
    deleted: boolean;
    columnType: ColumnType;
    columnTypeChanged: boolean;
    measureTypeChanged: boolean;
    dataTypeChanged: boolean;
    levelNameChanges: any[];
    formulaChanged: boolean;
    nameChanged: boolean;
    hiddenChanged: boolean;
}

export interface ProcessedDatasetRR {
    rowData: { rowsDeleted: DatasetRowBlock[], rowsInserted: DatasetRowBlock[] };
    cellsChanged: any;
    dataWrite: { data: Block[] };
    insertData: { ids: number[], indices: any };
    data: { changed: string[], changes: DatasetChange[] };
}

export type ColumnEvent = { ids: number[], indices: {dIndex: number, index: number}[] };

export type ColumnActiveChangedEvent = { start: number, end: number, dStart: number, dEnd: number, value: any };

export interface Column {
    id: number;
    name: string;
    index: number;
    dIndex: number;
    action: ColumnAction;
    columnType: ColumnType;
    dataType: DataType;
    measureType: MeasureType;
    autoMeasure: boolean;
    width: number;
    hasLevels: boolean;
    levels: VariableLevel[];
    dps: number;
    importName: string;
    formula: string;
    formulaMessage: string;
    description: string;
    hidden: boolean;
    active: boolean;
    filterNo: number;
    trimLevels: boolean;
    transform: number;
    parentId: number;
    editedCellRanges: ColumnCellRange[];
    dataChanged: boolean;
    missingValues: string[];
    outputAnalysisId: number;
}

export interface Viewport {
    top: number;
    bottom: number;
    left: number;
    right: number;
}

interface DataSetModelData {
    hasDataSet : boolean,
    columns    : Column[ ],
    rowNums    : any[ ],
    transforms : Transform[ ],
    rowCount : number,
    vRowCount : number,
    columnCount : number,
    vColumnCount : number,
    tColumnCount : number,
    removedRowRanges: RowRange[],
    coms : Coms,
    instanceId : string | null,
    editingVar : number[] | null,
    varEdited : boolean,
    filtersVisible: boolean,
    edited : boolean,
    formula : string,
    formulaMessage : string,
    changesCount: number,
    changesPosition: number,
    deletedRowCount: number,
    addedRowCount: number,
    editedCellCount: number,
    rowCountExFiltered: number
}

class DataSetModel<M extends DataSetModelData> extends EventMap<M> {
    columnsById: Map<number, Column>;

    static stringifyMeasureType = function(type: number): MeasureType {
        switch (type) {
            case 2:
                return MeasureType.NOMINAL;
            case 3:
                return MeasureType.ORDINAL;
            case 4:
                return MeasureType.CONTINUOUS;
            case 5:
                return MeasureType.ID;
            default:
                return MeasureType.NONE;
        }
    };

    static parseMeasureType = function(str: MeasureType): number {
        switch (str) {
            case MeasureType.NOMINAL:
                return 2;
            case MeasureType.ORDINAL:
                return 3;
            case MeasureType.CONTINUOUS:
                return 4;
            case MeasureType.ID:
                return 5;
            default:
                return 0;
        }
    };

    static stringifyColumnType = function(type: number): ColumnType {
        switch (type) {
            case 1:
                return ColumnType.DATA;
            case 2:
                return ColumnType.COMPUTED;
            case 3:
                return ColumnType.RECODED;
            case 4:
                return ColumnType.FILTER;
            case 5:
                return ColumnType.OUTPUT;
            case 0:
                return ColumnType.NONE;
            default:
                return ColumnType.NONE;
        }
    };

    static parseColumnType = function(str: ColumnType): number {
        switch (str) {
            case ColumnType.DATA:
                return 1;
            case ColumnType.COMPUTED:
                return 2;
            case ColumnType.RECODED:
                return 3;
            case ColumnType.FILTER:
                return 4;
            case ColumnType.OUTPUT:
                return 5;
            case ColumnType.NONE:
                return 0;
            default:
                return 1;
        }
    };

    static stringifyDataType = function(type: number): DataType {
        switch (type) {
            case 1:
                return DataType.INTEGER;
            case 2:
                return DataType.DECIMAL;
            case 3:
                return DataType.TEXT;
            default:
                return DataType.INTEGER;
        }
    };

    static parseDataType = function(str: DataType): number {
        switch (str) {
            case DataType.INTEGER:
                return 1;
            case DataType.DECIMAL:
                return 2;
            case DataType.TEXT:
                return 3;
            default:
                return 1;
        }
    };

    constructor(coms: Coms, extra: Omit<M, keyof DataSetModelData>) {
        super(Object.assign({
            hasDataSet : false,
            columns    : [ ],
            rowNums    : [ ],
            transforms : [ ],
            rowCount : 0,
            vRowCount : 0,
            columnCount : 0,
            vColumnCount : 0,
            tColumnCount : 0,
            removedRowRanges: [ ],
            coms : coms,
            instanceId : null,
            editingVar : null,
            varEdited : false,
            filtersVisible: true,
            edited : false,
            formula : '',
            formulaMessage : '',
            changesCount: 0,
            changesPosition: -1,
            deletedRowCount: 0,
            addedRowCount: 0,
            editedCellCount: 0,
            rowCountExFiltered: 0
        }, extra) as M);
    }

    filtersHidden() {
        this.set({ 'filtersVisible': false } as Partial<M>);
        return this.get('filtersVisible') === false;
    }

    filterCount(onlyActive?: boolean): number {
        let c = 0;
        let columns = this.attributes.columns;
        for (let i = 0; i < columns.length; i++) {
            let column = columns[i];
            if (column.columnType === ColumnType.FILTER) {
                if ( ! onlyActive || column.active)
                    c += 1;
            }
            else
                break;
        }
        return c;
    }

    visibleRealColumnCount(): number {
        let vCount = this.get('vColumnCount');  // visible columns (including virtual columns)
        let tCount = this.get('tColumnCount');  // total columns (including virtual columns)
        let rCount = this.get('columnCount');   // real columns (excluding virtual columns)

        return vCount - (tCount - rCount);
    }

    visibleRowCount(): number {
        if (this.get('filtersVisible'))
            return this.get('rowCount');
        else
            return this.get('rowCountExFiltered');
    }

    clearEditingVar() {
        this.set('editingVar', null);
    }

    getDisplayedEditingColumns(): Column[] | null {
        let ids = this.get('editingVar');
        if (ids === null)
            return null;

        let columns: Column[] = [];
        for (let id of ids) {
            let column = this.getColumnById(id);
            if (column && column.hidden === false)
                columns.push(column);
        }
        return columns;
    }

    getEditingColumns(displayOnly? : boolean): Column[] | null {
        let ids = this.get('editingVar');
        if (ids === null)
            return null;

        let columns: Column[] = [];
        for (let id of ids) {
            let column = this.getColumnById(id);
            if (column && !(column.hidden && displayOnly))
                columns.push(column);
        }
        return columns;
    }

    setup(infoPB): void {

        if (infoPB.hasDataSet) {

            this.set('edited', infoPB.edited);

            let schemaPB = infoPB.schema;
            let columns: Column[] = Array(schemaPB.columns.length);

            this.columnsById = new Map();
            let dIndex = 0;
            for (let i = 0; i < schemaPB.columns.length; i++) {
                let columnPB = schemaPB.columns[i];
                let column = this._readColumnPB(columnPB);
                
                if (column.hidden)
                    column.dIndex = -1;
                else {
                    column.dIndex = dIndex;
                    dIndex += 1;
                }

                columns[i] = column;
                this.columnsById.set(column.id, column);
            }

            this.attributes.columns  = columns;
            this.attributes.rowCount = infoPB.schema.rowCount;
            this.attributes.vRowCount = infoPB.schema.vRowCount;
            this.attributes.columnCount = infoPB.schema.columnCount;
            this.attributes.vColumnCount = infoPB.schema.vColumnCount;
            this.attributes.tColumnCount = infoPB.schema.tColumnCount;
            this.attributes.deletedRowCount = infoPB.schema.deletedRowCount;
            this.attributes.addedRowCount = infoPB.schema.addedRowCount;
            this.attributes.editedCellCount = infoPB.schema.editedCellCount;
            this.attributes.rowCountExFiltered = infoPB.schema.rowCountExFiltered;
            this.attributes.filtersVisible = infoPB.schema.filtersVisible;

            let removedRowRanges = new Array(infoPB.schema.removedRowRanges.length);
            for (let i = 0; i < removedRowRanges.length; i++) {
                let rangePB = infoPB.schema.removedRowRanges[i];
                removedRowRanges[i] = { index: rangePB.index, count: rangePB.count };
            }
            this.attributes.removedRowRanges = removedRowRanges;

            let transforms: Transform[] = Array(schemaPB.transforms.length);
            for (let i = 0; i < schemaPB.transforms.length; i++) {
                let transformPB = schemaPB.transforms[i];
                let transform = this._readTransformPB(transformPB);
                transforms[i] = transform;
            }
            this.attributes.transforms  = transforms;

            this.set('changesCount', infoPB.changesCount);
            this.set('changesPosition', infoPB.changesPosition);
            this.set('hasDataSet', true);
            this.trigger('dataSetLoaded');
        }
    }

    getColumnById(id: number): Column {
        return this.columnsById.get(id);
    }

    getTransformById(id: number): Transform {
        for (let transform of this.attributes.transforms) {
            if (transform.id === id)
                return transform;
        }
    }

    getFirstEmptyColumn(): Column {
        return this.getColumn(this.get('columnCount'));
    }

    getColumn(index: number, isDisplayIndex?: boolean): Column | null {
        if (isDisplayIndex) {
            if (index > -1) {
                for (let i = index; i < this.attributes.columns.length; i++) {
                    let column = this.attributes.columns[i];
                    if (column.dIndex === index)
                        return column;
                }
            }
            return null;
        }
        else
            return this.attributes.columns[index];
    }

    insertRows(ranges: { rowStart: number, rowCount: number}[]): QQ.Promise<any> {

        let coms = this.attributes.coms;

        let datasetPB = new coms.Messages.DataSetRR();
        datasetPB.op = coms.Messages.GetSet.SET;
        for (let range of ranges) {
            let rowData = new coms.Messages.DataSetRR.RowData();
            rowData.rowStart = range.rowStart;
            rowData.rowCount = range.rowCount;
            rowData.action = coms.Messages.DataSetRR.RowData.RowDataAction.INSERT;
            datasetPB.rows.push(rowData);
        }

        let request = new coms.Messages.ComsMessage();
        request.payload = datasetPB.toArrayBuffer();
        request.payloadType = 'DataSetRR';
        request.instanceId = this.attributes.instanceId;

        return coms.send(request).then(response => {
            let datasetPB = coms.Messages.DataSetRR.decode(response.payload);
            this._processDatasetRR(datasetPB);
        });
    }

    deleteRows(rowRanges: { rowStart: number, rowCount: number}[]) {

        let coms = this.attributes.coms;

        let datasetPB = new coms.Messages.DataSetRR();
        datasetPB.op = coms.Messages.GetSet.SET;
        for (let range of rowRanges) {
            let rowData = new coms.Messages.DataSetRR.RowData();
            rowData.rowStart = range.rowStart;
            rowData.rowCount = range.rowCount;
            rowData.action = coms.Messages.DataSetRR.RowData.RowDataAction.REMOVE;
            datasetPB.rows.push(rowData);
        }

        let request = new coms.Messages.ComsMessage();
        request.payload = datasetPB.toArrayBuffer();
        request.payloadType = 'DataSetRR';
        request.instanceId = this.attributes.instanceId;

        return coms.send(request).then(response => {
            let datasetPB = coms.Messages.DataSetRR.decode(response.payload);
            this._processDatasetRR(datasetPB);
        });
    }

    indexToDisplayIndex(index: number): number {
        let columns = this.attributes.columns;
        return columns[index].dIndex;
    }

    indexFromDisplayIndex(dIndex: number): number {
        for (let i = dIndex; i < this.attributes.columns.length; i++) {
            let column = this.attributes.columns[i];
            if (column.dIndex === dIndex)
                return column.index;
        }
        throw 'Column display index out of range.';
    }

    insertColumn(columns: Column[] | Column, isDisplayIndex?: boolean) {

        if (Array.isArray(columns) === false)
            columns = [columns];

        let coms = this.attributes.coms;
        let datasetPB = new coms.Messages.DataSetRR();
        datasetPB.op = coms.Messages.GetSet.SET;
        datasetPB.schema = new coms.Messages.DataSetSchema();
        datasetPB.incSchema = true;
        datasetPB.schema.filtersVisible = this.get('filtersVisible');

        for (let properties of columns) {

            let params = Object.assign({}, properties);

            if (params === null)
                params = { };

            if (params.index < 0 || params.index === undefined)
                throw 'Insert index is not defined';

            if (isDisplayIndex)
                params.index = this.indexFromDisplayIndex(params.index);

            if (params.autoMeasure === undefined)
                params.autoMeasure = true;

            if (params.filterNo === undefined)
                params.filterNo = -1;

            if (params.active === undefined)
                params.active = true;

            if (params.transform === undefined)
                params.transform = 0;

            if (params.parentId === undefined)
                params.parentId = 0;

            if (params.trimLevels === undefined)
                params.trimLevels = true;

            if (params.missingValues === undefined)
                params.missingValues = [];

            let columnType = params.columnType;
            if (columnType === undefined)
                throw 'Column type not specified';
            params.columnType = DataSetModel.parseColumnType(columnType || ColumnType.NONE);

            if (params.measureType === undefined)
                params.measureType = columnType === ColumnType.COMPUTED ? MeasureType.CONTINUOUS : MeasureType.NOMINAL;
            params.measureType = DataSetModel.parseMeasureType(params.measureType);

            let dataType = params.dataType;
            if (dataType === undefined) {
                if (params.measureType == MeasureType.ID)
                    dataType = DataType.TEXT;
                else
                    dataType = DataType.INTEGER;
            }
            params.dataType = DataSetModel.parseDataType(dataType);

            let columnPB = new coms.Messages.DataSetSchema.ColumnSchema();
            for (let prop in params)
                columnPB[prop] = params[prop];

            columnPB.action = coms.Messages.DataSetSchema.ColumnSchema.Action.INSERT;
            datasetPB.schema.columns.push(columnPB);
        }

        let request = new coms.Messages.ComsMessage();
        request.payload = datasetPB.toArrayBuffer();
        request.payloadType = 'DataSetRR';
        request.instanceId = this.attributes.instanceId;

        return coms.send(request).then(response => {
            let datasetPB = coms.Messages.DataSetRR.decode(response.payload);
            let events = this._processDatasetRR(datasetPB);
            if (events !== null) {
                if (this.attributes.editingVar !== null)
                    this.set('editingVar', events.insertData.ids);

                return events.insertData;
            }
        });
    }

    _updateDisplayIndices(): void {
        let _dIndex = 0;
        let columns = this.attributes.columns;
        for (let i = 0; i < columns.length; i++) {
            if (columns[i].hidden === false) {
                columns[i].dIndex = _dIndex;
                _dIndex += 1;
            }
            else
                columns[i].dIndex = -1;
        }
    }

    toggleFilterVisibility() {

        let coms = this.attributes.coms;

        let datasetPB = new coms.Messages.DataSetRR();
        datasetPB.op = coms.Messages.GetSet.SET;
        datasetPB.incSchema = true;
        datasetPB.schema = new coms.Messages.DataSetSchema();
        let setTo = ! this.get('filtersVisible');
        datasetPB.schema.filtersVisible = setTo;

        let request = new coms.Messages.ComsMessage();
        request.payload = datasetPB.toArrayBuffer();
        request.payloadType = 'DataSetRR';
        request.instanceId = this.attributes.instanceId;

        return coms.send(request).then(response => {
            let datasetPB = coms.Messages.DataSetRR.decode(response.payload);
            this._processDatasetRR(datasetPB);
        });
    }

    deleteColumn(id: number) {
        return this.deleteColumns([id]);
    }

    deleteColumns(ids: number[]) {

        let coms = this.attributes.coms;

        let datasetPB = new coms.Messages.DataSetRR();
        datasetPB.op = coms.Messages.GetSet.SET;
        datasetPB.incSchema = true;
        datasetPB.schema = new coms.Messages.DataSetSchema();
        datasetPB.schema.filtersVisible = this.get('filtersVisible');

        for (let id of ids) {
            let columnPB = new coms.Messages.DataSetSchema.ColumnSchema();
            columnPB.id = id;
            columnPB.action = coms.Messages.DataSetSchema.ColumnSchema.Action.REMOVE;
            datasetPB.schema.columns.push(columnPB);
        }

        let request = new coms.Messages.ComsMessage();
        request.payload = datasetPB.toArrayBuffer();
        request.payloadType = 'DataSetRR';
        request.instanceId = this.attributes.instanceId;

        return coms.send(request).then(response => {
            let datasetPB = coms.Messages.DataSetRR.decode(response.payload);
            let events = this._processDatasetRR(datasetPB);

            this.set('edited', true);
            if (this.attributes.editingVar !== null) {
                let editingIds = this.attributes.editingVar.slice();
                let firstDIndex = -1;
                let firstColumnType = null;
                for (let change of events.data.changes) {
                    if (change.deleted) {
                        if (firstDIndex === -1) {
                            firstDIndex = change.dIndex;
                            firstColumnType = change.columnType;
                        }
                        let i = editingIds.indexOf(change.id);
                        if (i !== -1)
                            editingIds.splice(i, 1);
                    }
                }
                if (editingIds.length > 0)
                    this.set('editingVar', editingIds);
                else {
                    let column = this.getColumn(Math.min(firstDIndex, this.visibleRealColumnCount() - 1), true);
                    if ( ! column)
                        this.set('editingVar', null);
                    else {
                        let column2 = this.getColumn(column.dIndex - 1, true);
                        if (column2 && column.columnType !== firstColumnType && column2.columnType === firstColumnType)
                            this.set('editingVar', [column2.id]);
                        else
                            this.set('editingVar', [column.id]);
                    }
                }
            }
        });
    }

    changeColumn(id: number, values: Partial<Column>) {
        let column = this.getColumnById(id);
        return this.changeColumns([{ index: column.index, id: id, values: values }]);
    }

    changeColumns(pairs: {index: number, id: number, values: Partial<Column>}[]) {

        let coms = this.attributes.coms;
        let datasetPB = new coms.Messages.DataSetRR();
        datasetPB.op = coms.Messages.GetSet.SET;
        datasetPB.incSchema = true;
        datasetPB.schema = new coms.Messages.DataSetSchema();
        datasetPB.schema.filtersVisible = this.get('filtersVisible');

        for (let pair of pairs) {
            let id = pair.id;
            let values = pair.values;

            let column = this.getColumnById(id);

            let columnPB = new coms.Messages.DataSetSchema.ColumnSchema();
            columnPB.action = coms.Messages.DataSetSchema.ColumnSchema.Action.MODIFY;
            columnPB.id = id;

            if ('name' in values)
                columnPB.name = values.name;
            else
                columnPB.name = column.name;

            if ('dataType' in values)
                columnPB.dataType = DataSetModel.parseDataType(values.dataType);
            else
                columnPB.dataType = DataSetModel.parseDataType(column.dataType);

            if ('measureType' in values)
                columnPB.measureType = DataSetModel.parseMeasureType(values.measureType);
            else
                columnPB.measureType = DataSetModel.parseMeasureType(column.measureType);

            if ('description' in values)
                columnPB.description = values.description;
            else
                columnPB.description = column.description;

            if ('width' in values)
                columnPB.width = values.width;
            else
                columnPB.width = column.width;

            if ('hidden' in values)
                columnPB.hidden = values.hidden;
            else
                columnPB.hidden = column.hidden;

            if ('active' in values)
                columnPB.active = values.active;
            else
                columnPB.active = column.active;

            if ('filterNo' in values)
                columnPB.filterNo = values.filterNo;
            else
                columnPB.filterNo = column.filterNo;

            if ('trimLevels' in values)
                columnPB.trimLevels = values.trimLevels;
            else
                columnPB.trimLevels = column.trimLevels;

            if ('transform' in values)
                columnPB.transform = values.transform;
            else
                columnPB.transform = column.transform;

            if ('parentId' in values)
                columnPB.parentId = values.parentId;
            else
                columnPB.parentId = column.parentId;

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

            if ('missingValues' in values)
                columnPB.missingValues = values.missingValues;
            else
                columnPB.missingValues = column.missingValues;

            if (values.measureType !== MeasureType.CONTINUOUS && values.levels) {
                columnPB.hasLevels = true;
                for (let i = 0; i < values.levels.length; i++) {
                    let level = values.levels[i];
                    let levelPB = new coms.Messages.VariableLevel();
                    if (values.dataType === DataType.TEXT) {
                        levelPB.value = i;
                        levelPB.label = level.label;
                        levelPB.importValue = level.importValue;
                        levelPB.pinned = level.pinned;
                    }
                    else {
                        levelPB.value = level.value;
                        levelPB.label = level.label;
                        levelPB.importValue = level.importValue;
                        levelPB.pinned = level.pinned;
                    }
                    columnPB.levels.push(levelPB);
                }
            }

            datasetPB.schema.columns.push(columnPB);
        }

        let request = new coms.Messages.ComsMessage();
        request.payload = datasetPB.toArrayBuffer();
        request.payloadType = 'DataSetRR';
        request.instanceId = this.attributes.instanceId;

        return coms.send(request).then(response => {
            let datasetPB = coms.Messages.DataSetRR.decode(response.payload);
            this._processDatasetRR(datasetPB);
        }).catch((error) => {
            console.log(error);
            throw error;
        });
    }

    _processTransformData(datasetPB) {
        if (datasetPB.incSchema) {

            let changed = Array(datasetPB.schema.transforms.length);
            let changes = Array(datasetPB.schema.transforms.length);
            let nCreated = 0;
            let nDeleted = 0;

            for (let i = 0; i < datasetPB.schema.transforms.length; i++) {
                let transformPB = datasetPB.schema.transforms[i];
                let id = transformPB.id;
                let transform = this.getTransformById(id);
                let deleted = transformPB.action === 2 && transform !== undefined;

                if (deleted) {
                    for (let j = 0; j < this.attributes.transforms.length; j++) {
                        if (transform.id === this.attributes.transforms[j].id) {
                            changed[i] = transform.name;
                            changes[i] = {
                                id: id,
                                name: transform.name,
                                deleted: true,
                            };
                            this.attributes.transforms.splice(j, 1);
                            break;
                        }
                    }
                    nDeleted += 1;
                }
                else {
                    let newName = transformPB.name;
                    let created;
                    let oldName;
                    let oldMessage;
                    let oldMeasureType;
                    if (transform !== undefined) {
                        created = false;
                        oldName = transform.name;
                        oldMessage = transform.formulaMessage;
                        oldMeasureType = transform.measureType;
                        this._readTransformPB(transformPB, transform);
                    }
                    else {
                        created = true;
                        oldName = transformPB.name;
                        oldMessage = '';
                        oldMeasureType = '';
                        nCreated++;
                        transform = this._readTransformPB(transformPB);
                        this.attributes.transforms.push(transform);
                    }
                    let nameChanged = (oldName !== transformPB.name);

                    changed[i] = transformPB.name;
                    changes[i] = {
                        id: id,
                        name: transform.name,
                        oldName: oldName,
                        nameChanged: nameChanged,
                        created: created,
                        formulaMessageChanged: transform.formulaMessage !== oldMessage,
                        measureTypeChanged: transform.measureType !== oldMeasureType,
                    };
                }
            }

            return { changed, changes };
        }
        return null;
    }

    _processRowData(datasetPB) {
        let coms = this.attributes.coms;
        let data = { rowsDeleted: [], rowsInserted: [] };
        for (let i = 0; i < datasetPB.rows.length; i++) {
            let blockPB = datasetPB.rows[i];
            if (blockPB.action === coms.Messages.DataSetRR.RowData.RowDataAction.REMOVE) {
                data.rowsDeleted.push({ rowStart: blockPB.rowStart, count: blockPB.rowCount });
            }
            else if (blockPB.action === coms.Messages.DataSetRR.RowData.RowDataAction.INSERT) {
                data.rowsInserted.push({ rowStart: blockPB.rowStart, count: blockPB.rowCount });
            }
        }
        return data;
    }

    onProcessDatasetRR_incSchema?(changes): void;

    onProcessDatasetRR_incData?(outputData, datasetPB): void;

    _processDatasetRR(datasetPB) {
        let coms = this.attributes.coms;
        this.set( { changesCount: datasetPB.changesCount, changesPosition: datasetPB.changesPosition } as Partial<M>);

        let outputData: ProcessedDatasetRR = { };
        outputData.rowData = this._processRowData(datasetPB);

        let changed = [];
        let changes = [];
        let nCreated = 0;
        let nHidden = 0;
        let nVisible = 0;
        let nDeleted = 0;
        let nvDeleted = 0;
        let nvCreated = 0;
        let columns = this.attributes.columns;

        if (datasetPB.incSchema) {
            this.set('filtersVisible', datasetPB.schema.filtersVisible);

            changed = Array(datasetPB.schema.columns.length);
            changes = Array(datasetPB.schema.columns.length);
            // sort so that column removals happen first and the events after
            // are sorted to support inserts... as in highest index inserts are done first
            datasetPB.schema.columns.sort((a,b) => {
                let aRemoved = a.action === this.attributes.coms.Messages.DataSetSchema.ColumnSchema.Action.REMOVE;
                let bRemoved = b.action === this.attributes.coms.Messages.DataSetSchema.ColumnSchema.Action.REMOVE;
                if (aRemoved !== bRemoved) {
                    if (aRemoved === true)
                        return -1;
                    else
                        return 1;
                }
                return a.index - b.index;
            });

            for (let i = 0; i < datasetPB.schema.columns.length; i++) {
                let columnPB = datasetPB.schema.columns[i];
                let id = columnPB.id;
                let column = this.getColumnById(id);
                let deleted = columnPB.action === this.attributes.coms.Messages.DataSetSchema.ColumnSchema.Action.REMOVE;

                if (deleted) {
                    if (column === undefined)
                        continue;
                    changed[i] = column.name;
                    changes[i] = { id: column.id, name: column.name, columnType: column.columnType, index: column.index, dIndex: column.dIndex, deleted: true };
                    this.columnsById.delete(id);
                    this.attributes.columns.splice(column.index, 1);
                    for (let j = column.index; j < this.attributes.columns.length; j++)
                        this.attributes.columns[j].index = j;
                    nDeleted += 1;
                    nvDeleted += column.hidden ? 0 : 1;
                }
                else {
                    let newName = columnPB.name;
                    let levelChanges = this._determineLevelLabelChanges(column, columnPB);
                    let missingValuesChanged = this._determineMissingValuesChange(column, columnPB);
                    let created = column === undefined;
                    let dpsChanged = false;
                    let oldName;
                    let oldDescription;
                    let oldColumnType;
                    let oldMeasureType;
                    let oldDataType;
                    let oldMessage;
                    let oldTransform;
                    let oldParentId;
                    let oldFormula;
                    let hiddenChanged = false;
                    let activeChanged = false;
                    let oldDIndex = -1;

                    if ( ! created) {
                        oldName = column.name;
                        oldDescription = column.description;
                        oldColumnType = column.columnType;
                        oldMessage = column.formulaMessage;
                        oldDIndex = column.dIndex;
                        oldMeasureType = column.measureType;
                        oldDataType = column.dataType;
                        oldFormula = column.formula;
                        let oldHidden = column.hidden;
                        let oldActive = column.active;
                        let oldDPS = column.dps;
                        oldTransform = column.transform;
                        oldParentId = column.parentId;
                        this._readColumnPB(columnPB, column);
                        hiddenChanged = oldHidden !== column.hidden;
                        activeChanged = oldActive !== column.active;
                        dpsChanged = oldDPS !== column.dps;
                    }
                    else {
                        oldName = columnPB.name;
                        oldDescription = columnPB.description;
                        oldTransform = 0;
                        oldParentId = 0;
                        oldColumnType = 0;
                        oldMeasureType = 0;
                        oldMessage = '';
                        oldFormula = '';
                        nCreated++;
                        column = this._readColumnPB(columnPB);
                        nvCreated += column.hidden ? 0 : 1;
                        this.columnsById.set(column.id, column);
                        columns.splice(column.index, 0, column);
                        for (let i = column.index + 1; i < columns.length; i++)
                            columns[i].index = i;
                    }
                    let nameChanged = (oldName !== columnPB.name);
                    let descriptionChanged = (oldDescription !== columnPB.description);

                    changed[i] = columnPB.name;
                    changes[i] = {
                        id: id,
                        name: column.name,
                        columnType: oldColumnType,
                        index: column.index,
                        dIndex: oldDIndex,
                        oldName: oldName,
                        transformChanged: oldTransform !== column.transform,
                        parentIdChanged: oldParentId !== column.parentId,
                        hiddenChanged: hiddenChanged,
                        activeChanged: activeChanged,
                        columnTypeChanged: column.columnType !== oldColumnType,
                        measureTypeChanged: column.measureType !== oldMeasureType,
                        dataTypeChanged: column.dataType !== oldDataType,
                        levelsChanged: levelChanges.names.length > 0 || levelChanges.order,
                        missingValuesChanged: missingValuesChanged,
                        formulaChanged: column.formula !== oldFormula,
                        levelNameChanges: levelChanges.names,
                        nameChanged: nameChanged,
                        descriptionChanged: descriptionChanged,
                        dpsChanged: dpsChanged,
                        dataChanged: columnPB.dataChanged,
                        created: created,
                        formulaMessageChanged: column.formulaMessage !== oldMessage,
                    };

                    if (hiddenChanged) {
                        if (column.hidden)
                            nHidden += 1;
                        else
                            nVisible += 1;
                    }
                }
            }

            if (nCreated > 0 || nVisible > 0 || nHidden > 0 || nDeleted > 0) {
                if (nCreated > 0 || nDeleted > 0) {
                    this.set('columnCount', this.attributes.columnCount + nCreated - nDeleted);
                    this.set('tColumnCount', this.attributes.tColumnCount + nCreated - nDeleted);
                }

                this.set('vColumnCount', this.attributes.vColumnCount + nvCreated + nVisible - nvDeleted - nHidden);
            }

            if (datasetPB.schema) {
                this.set('rowCount', datasetPB.schema.rowCount);
                this.set('vRowCount', datasetPB.schema.vRowCount);
                this.set('deletedRowCount', datasetPB.schema.deletedRowCount);
                this.set('addedRowCount', datasetPB.schema.addedRowCount);
                this.set('editedCellCount', datasetPB.schema.editedCellCount);
                this.set('rowCountExFiltered', datasetPB.schema.rowCountExFiltered);

                let removedRowRanges = new Array(datasetPB.schema.removedRowRanges.length);
                for (let i = 0; i < removedRowRanges.length; i++) {
                    let rangePB = datasetPB.schema.removedRowRanges[i];
                    removedRowRanges[i] = { index: rangePB.index, count: rangePB.count };
                }
                this.set('removedRowRanges', removedRowRanges);
            }

            if (nCreated > 0 || nVisible > 0 || nHidden > 0 || nDeleted > 0)
                this._updateDisplayIndices();

            

            if (this.onProcessDatasetRR_incSchema)
                this.onProcessDatasetRR_incSchema(changes);
        }

        if (datasetPB.incData) {
            this.set('edited', true);
        
            if (this.onProcessDatasetRR_incData)
                this.onProcessDatasetRR_incData(outputData, datasetPB);
        }

        if (nDeleted > 0) {
            let deletedIds = [];
            let deletedIndices = { };
            for (let change of changes) {
                if (change.deleted) {
                    deletedIds.push(change.id);
                    deletedIndices[change.id] = { dIndex: change.dIndex, index: change.index };
                }
            }
            this.trigger('columnsDeleted', { ids: deletedIds, indices: deletedIndices });
        }

        let refresh = false;

        if (nHidden > 0) {
            let hiddenIds = [];
            let hiddenIndices = { };
            for (let change of changes) {
                if (change.hiddenChanged && this.attributes.columns[change.index].hidden === true) {
                    hiddenIds.push(change.id);
                    hiddenIndices[change.id] = { dIndex: change.dIndex, index: change.index };
                }
            }
            this.trigger('columnsHidden', { ids: hiddenIds, indices: hiddenIndices } );
            refresh = true;
        }

        let transformEvent = this._processTransformData(datasetPB);

        if (nVisible > 0) {
            let visibleIds = [];
            let visibleIndices = { };
            for (let change of changes) {
                if (change.hiddenChanged && this.attributes.columns[change.index].hidden === false) {
                    visibleIds.push(change.id);
                    visibleIndices[change.id] = { dIndex: this.indexToDisplayIndex(change.index), index: change.index };
                }
            }
            this.trigger('columnsVisible', { ids: visibleIds, indices: visibleIndices });
            refresh = true;
        }

        if (nCreated > 0) {
            let createdIds = [];
            let createdIndices = { };
            for (let change of changes) {
                if (change.created) {
                    createdIds.push(change.id);
                    createdIndices[change.id] = { dIndex: this.indexToDisplayIndex(change.index), index: change.index };
                }
            }
            this.trigger('columnsInserted', { ids: createdIds, indices: createdIndices });
            outputData.insertData = { ids: createdIds, indices: createdIndices };
        }

        let activeChangeRanges = this._clumpPropertyChanges(changes, 'active', true);
        activeChangeRanges = activeChangeRanges.concat(this._clumpPropertyChanges(changes, 'active', false));

        if (activeChangeRanges.length > 0) {
            for (let range of activeChangeRanges)
                this.trigger('columnsActiveChanged', { start: range.start, end: range.end, dStart: range.dStart, dEnd: range.dEnd, value: range.value });
        }

        if (datasetPB.incData) {
            for (let block of datasetPB.data) {
                for (let c = 0; c < block.columnCount; c++) {
                    let column = this.getColumn(block.columnStart + c, true);
                    let name = column.name;
                    if ( ! changed.includes(name)) {
                        changed.push(name);
                        changes.push({ id: column.id, columnType: column.columnType, index: column.index, oldName: name, dataChanged: true });
                    }
                    else {
                        for (let data of changes) {
                            if (data.id === column.id) {
                                data.dataChanged = true;
                                break;
                            }
                        }
                    }
                }
            }
        }

        if (changed.length > 0) {
            this.trigger('columnsChanged', { changed, changes });
            outputData.data = { changed, changes };
        }

        if (transformEvent !== null && transformEvent.changes.length > 0) {
            for (let change of transformEvent.changes) {
                if (change.deleted)
                    this.trigger('transformRemoved', { id: change.id });
                else if (change.created)
                    this.trigger('transformAdded', { id: change.id });
            }

            this.trigger('transformsChanged', transformEvent);
        }

        for (let rowsDeleted of outputData.rowData.rowsDeleted) {
            this.trigger('rowsDeleted', rowsDeleted);
            refresh = true;
        }
        for (let rowsInserted of outputData.rowData.rowsInserted) {
            this.trigger('rowsInserted', rowsInserted);
            refresh = true;
        }

        if (datasetPB.filtersChanged)
            refresh = true;

        if (outputData.cellsChanged)
            this.trigger('cellsChanged', outputData.cellsChanged);

        if (refresh)
            this.trigger('refreshView');

        return outputData;
    }

    _clumpPropertyChanges(changes, property: string, value) {
        let valueRanges = [];
        let hIndex = -1;
        for (let change of changes) {

            let hasChanged = change[property + 'Changed'];
            let pValue = null;
            if (hasChanged === undefined) {
                hasChanged = true;
                pValue = change[property];
            }
            else if (hasChanged)
                pValue = this.attributes.columns[change.index][property];

            if (hasChanged && pValue === value) {
                if (hIndex === -1 || change.index > valueRanges[hIndex].end + 1) {
                    let range = { start: change.index, end: change.index, value: value };
                    if (change.dIndex !== undefined) {
                        range.dStart = change.dIndex;
                        range.dEnd = change.dIndex;
                    }

                    valueRanges.push( range );
                    hIndex += 1;
                }
                else if (change.index === valueRanges[hIndex].end + 1) {
                    valueRanges[hIndex].end = change.index;
                    valueRanges[hIndex].dEnd = change.dIndex;
                }
            }
        }
        return valueRanges;
    }

    _determineLevelLabelChanges(column, columnPB) {
        let orderChanged = false;
        let levelNameChanges = [];
        if (column && column.levels && Array.isArray(column.levels)) {
            let levelLabels = {};
            for (let li = 0; li < column.levels.length; li++) {
                levelLabels[column.levels[li].importValue] = column.levels[li].label;
            }

            if (columnPB && columnPB.levels && Array.isArray(columnPB.levels)) {
                orderChanged = columnPB.levels.length !== column.levels.length;
                for (let li = 0; li < columnPB.levels.length; li++) {
                    if (orderChanged === false)
                        orderChanged = column.levels[li].importValue !== columnPB.levels[li].importValue;

                    let oldLabel = levelLabels[columnPB.levels[li].importValue];
                    if (oldLabel !== undefined && oldLabel !== columnPB.levels[li].label)
                        levelNameChanges.push({oldLabel: oldLabel, newLabel: columnPB.levels[li].label});
                }
            }
        }

        return { names: levelNameChanges, order: orderChanged };
    }

    _determineMissingValuesChange(column, columnPB) {
        if ( ! (columnPB && columnPB.missingValues && Array.isArray(columnPB.missingValues) &&
            column && column.missingValues && Array.isArray(column.missingValues)))
            return true;

        if (column.missingValues.length !== columnPB.missingValues.length)
            return true;

        for (let li = 0; li < column.missingValues.length; li++) {
            let missingValue = column.missingValues[li];
            for (let pi = 0; pi < columnPB.missingValues.length; pi++) {
                if (missingValue != columnPB.missingValues[pi])
                    return true;
            }
        }

        return false;
    }

    _readColumnPB(columnPB, column?: Column): Column {
        if (column === undefined)
            column = { };

        column.id = columnPB.id;
        column.name = columnPB.name;
        column.index = columnPB.index;
        column.columnType = DataSetModel.stringifyColumnType(columnPB.columnType);
        column.dataType = DataSetModel.stringifyDataType(columnPB.dataType);
        column.measureType = DataSetModel.stringifyMeasureType(columnPB.measureType);
        column.autoMeasure = columnPB.autoMeasure;
        column.dps = columnPB.dps;
        column.width = columnPB.width;
        column.formula = columnPB.formula;
        column.formulaMessage = columnPB.formulaMessage;
        column.description = columnPB.description;
        column.hidden = columnPB.hidden;
        column.active = columnPB.active;
        column.filterNo = columnPB.filterNo;
        column.importName = columnPB.importName;
        column.trimLevels = columnPB.trimLevels;
        column.transform = columnPB.transform;
        column.parentId = columnPB.parentId;
        column.missingValues = columnPB.missingValues;
        column.outputAnalysisId = columnPB.outputAnalysisId;

        let editedCellRanges = new Array(columnPB.editedCellRanges.length);
        for (let i = 0; i < editedCellRanges.length; i++) {
            let rangePB = columnPB.editedCellRanges[i];
            editedCellRanges[i] = { start: rangePB.start, end: rangePB.end };
        }
        column.editedCellRanges = editedCellRanges;

        let levels = null;
        if (columnPB.hasLevels) {
            levels = new Array(columnPB.levels.length);
            for (let i = 0; i < levels.length; i++) {
                let levelPB = columnPB.levels[i];
                if (column.dataType === DataType.TEXT) {
                    levels[i] = {
                        label: levelPB.label,
                        value: i,
                        importValue: levelPB.importValue,
                        pinned: levelPB.pinned
                    };
                }
                else {
                    levels[i] = {
                        label: levelPB.label,
                        value: levelPB.value,
                        importValue: levelPB.value.toString(),
                        pinned: levelPB.pinned
                    };
                }
            }
        }
        column.levels = levels;

        return column;
    }

    _readTransformPB(transformPB, transform?: Transform): Transform {
        if (transform === undefined)
            transform = { };

        transform.id = transformPB.id;
        transform.name = transformPB.name;
        transform.description = transformPB.description;
        transform.suffix = transformPB.suffix;
        transform.formula = transformPB.formula;
        transform.formulaMessage = transformPB.formulaMessage;
        transform.colourIndex = transformPB.colourIndex;
        transform.measureType = DataSetModel.stringifyMeasureType(transformPB.measureType);

        return transform;
    }

    setTransforms(pairs: { id: number, values: Partial<Transform>}[]) {

        let coms = this.attributes.coms;
        let datasetPB = new coms.Messages.DataSetRR();
        datasetPB.op = coms.Messages.GetSet.SET;
        datasetPB.noUndo = true;
        datasetPB.incSchema = true;
        datasetPB.schema = new coms.Messages.DataSetSchema();
        datasetPB.schema.filtersVisible = this.get('filtersVisible');

        let countAdded = 0;

        for (let pair of pairs) {
            let id = pair.id;
            let values = pair.values;

            let transform = this.getTransformById(id);
            let newTransform = transform === undefined;

            let transformPB = new coms.Messages.DataSetSchema.TransformSchema();
            if (newTransform) {
                transformPB.id = 0;
                transformPB.action = 0; // action: 0 - CREATE, 1 - UPDATE, 2 - REMOVE
            }
            else {
                transformPB.id = id;
                transformPB.action = 1; // action: 0 - CREATE, 1 - UPDATE, 2 - REMOVE
            }

            if ('name' in values)
                transformPB.name = values.name;
            else if ( ! newTransform)
                transformPB.name = transform.name;
            else
                transformPB.name = '';

            if ('description' in values)
                transformPB.description = values.description;
            else if ( ! newTransform)
                transformPB.description = transform.description;
            else
                transformPB.description = '';

            if ('suffix' in values)
                transformPB.suffix = values.suffix;
            else if ( ! newTransform)
                transformPB.suffix = transform.suffix;
            else
                transformPB.suffix = '';

            if ('colourIndex' in values)
                transformPB.colourIndex = values.colourIndex;
            else if ( ! newTransform)
                transformPB.colourIndex = transform.colourIndex;
            else
                transformPB.colourIndex = 0;

            if ('measureType' in values)
                transformPB.measureType = DataSetModel.parseMeasureType(values.measureType);
            else if ( ! newTransform)
                transformPB.measureType = DataSetModel.parseMeasureType(transform.measureType);
            else
                transformPB.measureType = DataSetModel.parseMeasureType(MeasureType.NONE);

            if ('formula' in values)
                transformPB.formula = values.formula;
            else if ( ! newTransform)
                transformPB.formula = transform.formula;
            else
                transformPB.formula = [ '' ];

            datasetPB.schema.transforms.push(transformPB);
        }

        let request = new coms.Messages.ComsMessage();
        request.payload = datasetPB.toArrayBuffer();
        request.payloadType = 'DataSetRR';
        request.instanceId = this.attributes.instanceId;

        return coms.send(request).then(response => {
            let datasetPB = coms.Messages.DataSetRR.decode(response.payload);
            this._processDatasetRR(datasetPB);
        }).catch((error) => {
            console.log(error);
            throw error;
        });
    }

    removeTransforms(ids: number[]) {

        let coms = this.attributes.coms;
        let datasetPB = new coms.Messages.DataSetRR();
        datasetPB.op = coms.Messages.GetSet.SET;
        datasetPB.incSchema = true;
        datasetPB.schema = new coms.Messages.DataSetSchema();
        datasetPB.schema.filtersVisible = this.get('filtersVisible');

        for (let id of ids) {
            let transformPB = new coms.Messages.DataSetSchema.TransformSchema();
            transformPB.id = id;
            transformPB.action = 2; // action: 0 - CREATE, 1 - UPDATE, 2 - REMOVE

            datasetPB.schema.transforms.push(transformPB);
        }

        let request = new coms.Messages.ComsMessage();
        request.payload = datasetPB.toArrayBuffer();
        request.payloadType = 'DataSetRR';
        request.instanceId = this.attributes.instanceId;

        return coms.send(request).then(response => {
            let datasetPB = coms.Messages.DataSetRR.decode(response.payload);
            this._processDatasetRR(datasetPB);
        }).catch((error) => {
            console.log(error);
            throw error;
        });
    }

    undo() {
        let coms = this.attributes.coms;
        let datasetPB = new coms.Messages.DataSetRR();
        datasetPB.op = coms.Messages.GetSet.UNDO;

        let request = new coms.Messages.ComsMessage();
        request.payload = datasetPB.toArrayBuffer();
        request.payloadType = 'DataSetRR';
        request.instanceId = this.attributes.instanceId;

        return coms.send(request).then(response => {
            let datasetPB = coms.Messages.DataSetRR.decode(response.payload);
            return this._processDatasetRR(datasetPB);
        }).catch((error) => {
            console.log(error);
            throw error;
        });
    }

    redo() {
        let coms = this.attributes.coms;
        let datasetPB = new coms.Messages.DataSetRR();
        datasetPB.op = coms.Messages.GetSet.REDO;

        let request = new coms.Messages.ComsMessage();
        request.payload = datasetPB.toArrayBuffer();
        request.payloadType = 'DataSetRR';
        request.instanceId = this.attributes.instanceId;

        return coms.send(request).then(response => {
            let datasetPB = coms.Messages.DataSetRR.decode(response.payload);
            return this._processDatasetRR(datasetPB);
        }).catch((error) => {
            console.log(error);
            throw error;
        });
    }

    columnTypeLabel(type: ColumnType | number): string {
        switch (type) {
            case ColumnType.DATA:
            case 1:
                return _('Data');
            case ColumnType.COMPUTED:
            case 2:
                return _('Computed');
            case ColumnType.RECODED:
            case 3:
                return _('Transformed');
            case ColumnType.FILTER:
            case 4:
                return _('Filter');
            case ColumnType.OUTPUT:
            case 5:
                return _('Output');
            case ColumnType.NONE:
            case 0:
                return _('None');
            default:
                return _('None');
        }
    }
}

type DataSetViewModelData = {
    cells: Cell[][];
    filtered: any;
    viewport: Viewport;
};

interface Cell {
    value: any;
    missing: boolean;
}

class DataSetViewModel extends DataSetModel<DataSetViewModelData & DataSetModelData> { 

    constructor(coms: Coms) {
        super(coms, {
            cells    : [ ],
            filtered : [ ],
            viewport : { left : 0, top : 0, right : -1, bottom : -1 }
        })
        this.on('columnsChanged', event => this._columnsChanged(event));
    }

    override onProcessDatasetRR_incSchema(changes): void {
        let old = this.attributes.viewport;
        let viewport = Object.assign({}, this.attributes.viewport);

        for (let change of changes) {
            if (change.deleted) {
                if (change.dIndex !== -1) {
                    if (change.dIndex <= old.left) {  // to the left of the view
                        viewport.left  -= 1;
                        viewport.right -= 1;
                    }
                    else if (change.dIndex >= old.left && change.dIndex <= old.right) {     // contained in the view
                        viewport.right -= 1;
                    }
                }
            }
            else if (change.hiddenChanged || change.created) {
                let column = this.getColumnById(change.id);
                if (column.hidden) {
                    if (change.created) {
                        // do nothing
                    }
                    else if (change.dIndex > old.right) {  // to the right of the view
                        // do nothing
                    }
                    else if (change.dIndex < old.left) {  // to the left of the view
                        viewport.left  -= 1;
                        viewport.right -= 1;
                    }
                    else {
                        viewport.right -= 1;
                    }
                }
                else {
                    if (column.dIndex > viewport.right) {  // to the right of the view
                        // do nothing
                    }
                    else if (column.dIndex < viewport.left) {
                        viewport.left  += 1;
                        viewport.right += 1;
                    }
                    else {
                        viewport.right += 1;
                        let cells = new Array(viewport.bottom - viewport.top + 1).fill(null);
                        this.attributes.cells.splice(column.dIndex - viewport.left, 0, cells);
                    }
                }
            }
        }

        if (viewport.left < 0)
            viewport.left = 0;

        this.attributes.viewport = viewport;
    }

    override onProcessDatasetRR_incData(outputData, datasetPB): void {
        let dataInfo = this._parseCells(datasetPB);
        outputData.cellsChanged = this.setCells(dataInfo, true);

        outputData.dataWrite = dataInfo;
    }

    valueAt(rowNo, colNo) {
        let viewport = this.attributes.viewport;
        if (rowNo >= viewport.top &&
            rowNo <= viewport.bottom &&
            colNo >= viewport.left &&
            colNo <= viewport.right) {

            let cell = this.attributes.cells[colNo - viewport.left][rowNo - viewport.top];
            if (cell)
                return cell.value;
        }

        return null;
    }

    setViewport(viewport: Viewport) {

        let nCols = viewport.right - viewport.left + 1;
        let nRows = viewport.bottom - viewport.top + 1;

        let cells = new Array(nCols);

        for (let i = 0; i < nCols; i++)
            cells[i] = new Array(nRows);

        this.attributes.cells = cells;
        this.attributes.filtered = new Array(nRows).fill(null);
        this.attributes.rowNums = new Array(nRows).fill('');
        this.attributes.viewport = Object.assign({}, viewport);

        this.trigger("viewportChanged");
        this.trigger("viewportReset");

        if (nRows !== 0 && nCols !== 0)
            this.readCells(viewport);
    }

    reshape(left: number, top: number, right: number, bottom: number) {

        // console.log("reshape : " + JSON.stringify({left:left,top:top,right:right,bottom:bottom}));

        let viewport = this.attributes.viewport;
        let cells = this.attributes.cells;
        let filtered = this.attributes.filtered;
        let rowNums = this.attributes.rowNums;
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
            for (let j = 0; j > top; j--) {
                filtered.shift();
                rowNums.shift();
            }
        }
        if (bottom < 0) {
            for (let i = 0; i < cells.length; i++) {
                let column = cells[i];
                for (let j = 0; j > bottom; j--)
                    column.pop();
            }
            for (let j = 0; j > bottom; j--) {
                filtered.pop();
                rowNums.pop();
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
                    cells[i].unshift({value: ".", missing: false});
            }
            for (let j = 0; j < top; j++) {
                filtered.unshift(null);
                rowNums.unshift(null);
            }

            this.readCells({ left : innerLeft, right : innerRight, top : nv.top, bottom : viewport.top });
        }
        if (bottom > 0) {
            for (let i = 0; i < innerNCols; i++) {
                for (let j = 0; j < bottom; j++)
                    cells[i].push({value: ".", missing: false});
            }
            for (let j = 0; j < bottom; j++) {
                filtered.push(null);
                rowNums.push(null);
            }

            this.readCells({ left : innerLeft, right : innerRight, top : viewport.bottom === -1 ? 0 : viewport.bottom, bottom : nv.bottom });
        }

        this.attributes.viewport = nv;
        this.attributes.cells = cells;

        this.trigger("viewportChanged");
    }

    readCells(viewport: IAreaSelection) {
        this.requestCells(viewport).then(dataInfo => {
            this.setCells(dataInfo);
        }).done();
    }

    _parseCells(response) {
        let data = new Array(response.data.length);
        for (let i = 0; i < data.length; i++) {
            let blockPB = response.data[i];
            let values = Array(blockPB.columnCount);

            for (let c = 0; c < blockPB.columnCount; c++) {
                values[c] = Array(blockPB.rowCount);
                for (let r = 0; r < blockPB.rowCount; r++) {
                    let cellPB = null;
                    if (blockPB.clear === false)
                        cellPB = blockPB.values[(c*blockPB.rowCount) + r];

                    if (cellPB === null || cellPB.type === 'o') {
                        values[c][r] = { value: null, missing: false };
                    }
                    else {
                        let value = cellPB[cellPB.type];
                        values[c][r] = { value: value, missing: cellPB.missing };
                    }

                }
            }

            let block = {
                rowStart: blockPB.rowStart,
                columnStart: blockPB.columnStart,
                rowCount: blockPB.rowCount,
                columnCount: blockPB.columnCount,
                values: values,
            };
            data[i] = block;
        }

        let filterData = [ ];
        let rowNums = [ ];

        for (let rowBlockPB of response.rows) {
            if (rowBlockPB.action === this.attributes.coms.Messages.DataSetRR.RowData.RowDataAction.MODIFY) {

                let rowStart = rowBlockPB.rowStart;
                let rowCount = rowBlockPB.rowCount;

                let values = rowBlockPB.filterData.toBuffer();
                values = new Int8Array(values);
                values = Array.from(values);
                values = values.map(v => v ? true : false);

                filterData.push({ rowStart, rowCount, values });

                if (rowBlockPB.rowNums.length > 0) {
                    values = rowBlockPB.rowNums;
                }
                else {
                    values = new Array(rowCount);
                    for (let i = 0; i < values.length; i++)
                        values[i] = rowStart + i;
                }

                rowNums.push({ rowStart, rowCount, values });
            }
        }

        return { data, filterData, rowNums };
    }

    requestCells(viewport: IAreaSelection) {
        let coms = this.attributes.coms;
        let cellsRequest = new coms.Messages.DataSetRR();
        cellsRequest.incData = true;

        let blockPB = new coms.Messages.DataSetRR.DataBlock();
        blockPB.rowStart = viewport.top;
        blockPB.rowCount = viewport.bottom - viewport.top + 1;
        blockPB.columnStart = viewport.left;
        blockPB.columnCount = viewport.right - viewport.left + 1;
        cellsRequest.data.push(blockPB);

        let request = new coms.Messages.ComsMessage();
        request.payload = cellsRequest.toArrayBuffer();
        request.payloadType = "DataSetRR";
        request.instanceId = this.attributes.instanceId;

        return coms.send(request).then(response => {
            let dsrrPB = coms.Messages.DataSetRR.decode(response.payload);
            let data = this._parseCells(dsrrPB);
            return data;
        });
    }

    changeCells(data: string | Block[], cbHtml?, selection?: IAreaSelection, selectionList?: IAreaSelection[]) {
        let coms = this.attributes.coms;
        let cellsRequest = new coms.Messages.DataSetRR();
        cellsRequest.op = coms.Messages.GetSet.SET;
        cellsRequest.incData = true;

        if (typeof(data) === 'string') {
            let createBlock = (sel: IAreaSelection) => {
                let blockPB = new coms.Messages.DataSetRR.DataBlock();
                blockPB.columnStart = sel.left;
                blockPB.rowStart = sel.top;
                blockPB.rowCount = sel.bottom - sel.top + 1;
                blockPB.columnCount = sel.right - sel.left + 1;
                // send serialized data
                blockPB.incCBData = true;
                blockPB.cbText = data;
                if (cbHtml)
                    blockPB.cbHtml = cbHtml;
                cellsRequest.data.push(blockPB);
            };
            createBlock(selection);
            for (let childSelection of selectionList) {
                createBlock(childSelection);
            }
        }
        else {
            for (let block of data) {
                let blockPB = new coms.Messages.DataSetRR.DataBlock();
                blockPB.rowStart = block.rowStart;
                blockPB.rowCount = block.rowCount;
                blockPB.columnStart = block.columnStart;
                blockPB.columnCount = block.columnCount;
                let isClear = true;
                if (block.clear === false) {
                    for (let inCells of block.values) {
                        for (let j = 0; j < block.rowCount; j++) {
                            let outValue = new coms.Messages.DataSetRR.DataBlock.CellValue();
                            let inValue = inCells[j];
                            if (inValue === null) {
                                outValue.o = coms.Messages.SpecialValues.MISSING;
                                outValue.type = 'o';
                            }
                            else if (typeof(inValue) === 'string') {
                                outValue.s = inValue;
                                outValue.type = 's';
                                isClear = false;
                            }
                            else if (Math.floor(inValue) === inValue
                                && inValue <= 2147483647
                                && inValue >= -2147483648) {

                                outValue.i = inValue;
                                outValue.type = 'i';
                                isClear = false;
                            }
                            else {
                                outValue.d = inValue;
                                outValue.type = 'd';
                                isClear = false;
                            }
                            blockPB.values.push(outValue);
                        }
                    }
                }
                blockPB.clear = isClear;
                if (blockPB.clear)
                    blockPB.values = [];
                cellsRequest.data.push(blockPB);
            }
        }

        let request = new coms.Messages.ComsMessage();
        request.payload = cellsRequest.toArrayBuffer();
        request.payloadType = 'DataSetRR';
        request.instanceId = this.attributes.instanceId;

        return coms.send(request).then(response => {

            let datasetPB = coms.Messages.DataSetRR.decode(response.payload);
            let events = this._processDatasetRR(datasetPB);
            return events.dataWrite;

        });

    }

    _getViewPortUnion(block) {
        let viewTop = this.attributes.viewport.top;
        let viewBottom = this.attributes.viewport.bottom;
        let viewLeft = this.attributes.viewport.left;
        let viewRight = this.attributes.viewport.right;

        let rowCheck = () => {
            if (block.rowStart > viewBottom)
                return null;

            let blockRowEnd = block.rowStart + block.rowCount - 1;
            if (blockRowEnd < viewTop)
                return null;

            if (block.rowStart >= viewTop && blockRowEnd <= viewBottom)
                return { blockRowStart: 0, viewRowStart: block.rowStart - viewTop, rowCount: block.rowCount };

            if (block.rowStart <= viewTop && blockRowEnd >= viewBottom)
                return { blockRowStart: viewTop - block.rowStart, viewRowStart: 0, rowCount: viewBottom - viewTop + 1 };

            if (block.rowStart < viewTop)
                return { blockRowStart: viewTop - block.rowStart, viewRowStart: 0, rowCount: blockRowEnd - viewTop + 1 };

            if (blockRowEnd > viewBottom)
                return { blockRowStart: 0, viewRowStart: block.rowStart - viewTop, rowCount: viewBottom - block.rowStart + 1 };

            throw "shouldn't get here";
        };

        let check = rowCheck();
        if (check !== null && block.columnStart !== undefined) {
            if (block.columnStart > viewRight)
                return null;

            let columnEnd = block.columnStart + block.columnCount - 1;
            if (columnEnd < viewLeft)
                return null;

            let count = block.columnCount;
            if (block.columnStart >= viewLeft && columnEnd <= viewRight)
                return Object.assign({ blockColumnStart: 0, viewColumnStart: block.columnStart - viewLeft, columnCount: count }, check);

            if (block.columnStart < viewLeft && columnEnd > viewRight)
                return Object.assign({ blockColumnStart: viewLeft - block.columnStart, viewColumnStart: 0, columnCount: viewLeft - viewRight + 1 }, check);

            if (block.columnStart < viewLeft)
                return Object.assign({ blockColumnStart: viewLeft - block.columnStart, viewColumnStart: 0, columnCount: block.columnBottom - viewLeft + 1 }, check);

            if (columnEnd > viewRight)
                return Object.assign({ blockColumnStart: 0, viewColumnStart: block.columnStart - viewLeft, columnCount: viewRight - block.columnStart + 1 }, check);

            return null;
        }

        return check;
    }

    setCells(dataInfo, silent?: boolean) {
        let filterData = dataInfo.filterData;
        let data = dataInfo.data;
        let rowNumss = dataInfo.rowNums;

        let viewPort = this.attributes.viewport;
        let changedCells = [];
        for (let block of data) {
            let union = this._getViewPortUnion(block);
            if (union !== null) {
                for (let c = 0; c < union.columnCount; c++) {
                    let colIndex = union.viewColumnStart + c;
                    let columnCells = this.attributes.cells[colIndex];
                    let blockCells =  block.values[union.blockColumnStart + c];
                    for (let r = 0; r < union.rowCount; r++) {
                        let rowIndex = union.viewRowStart + r;
                        columnCells[rowIndex] = blockCells[union.blockRowStart + r];
                        changedCells.push({ colIndex: colIndex, rowIndex: rowIndex });
                    }
                }
            }
        }

        for (let filterRange of filterData) {
            let union = this._getViewPortUnion(filterRange);
            if (union !== null) {
                for (let r = 0; r < union.rowCount; r++)
                    this.attributes.filtered[union.viewRowStart + r] = filterRange.values[union.blockRowStart + r];
            }
        }

        let rhChanged = [ ];

        for (let rowNums of rowNumss) {
            let union = this._getViewPortUnion(rowNums);
            if (union !== null) {
                for (let r = 0; r < union.rowCount; r++) {
                    let index = union.viewRowStart + r;
                    let value = rowNums.values[union.blockRowStart + r];
                    this.attributes.rowNums[index] = value;
                    rhChanged.push(index);
                }
            }
        }

        if ( ! silent) {
            if (rhChanged)
                this.trigger('rhChanged', rhChanged);
            this.trigger('cellsChanged', changedCells);
        }

        return changedCells;
    }

    _columnsChanged(event) {

        for (let changes of event.changes) {
            if ( ! changes.dataChanged && ! changes.missingValuesChanged)
                continue;

            let column = this.getColumnById(changes.id);
            if (column.hidden)
                continue;

            let index = column.dIndex;
            let viewport = {
                left: index,
                top: this.attributes.viewport.top,
                right: index,
                bottom: this.attributes.viewport.bottom
            };
            this.readCells(viewport);
        }
    }
};

export default DataSetViewModel;
