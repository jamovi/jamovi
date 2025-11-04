'use strict';

import { determFormat } from "./formatting";
import { format } from "./formatting";

const ALPHABET = 'abcdefghijklmnopqrstuvwxyz';

interface IRawCell {
    value: string | number;
    footnotes: Array<string>;
    align: 'l' | 'c' | 'r';
}

export interface ICell {
    content: string;
    align: 'l' | 'c' | 'r';
    span?: number;
    sups?: Array<string>;
}

export interface IRow {
    type: 'superTitle' | 'title' | 'body' | 'footnote';
    cells: Array<ICell | null>;
}

export interface IImage {
    type: 'image',
    path: string;
    width: number;
    height: number;
}

export interface IGroup {
    type: 'group',
    title?: string;
    items: Array<IElement>;
}

export interface ITable {
    type: 'table',
    title: string,
    rows: Array<IRow>,
    nCols: number,
}

export interface ITextChunk {
    content: string,
    attributes?: { [name: string]: any };
}

export interface IText {
    type: 'text',
    chunks: Array<ITextChunk>,
}

export type IElement = IGroup | ITable | IImage | IText;
type IOptionValues = { [ name: string ]: any };
type IAddress = Array<string>;


export function hydrate(pb: any, address: IAddress = [], values: IOptionValues = {}): IElement {
    return hydrateElement(pb, address, values, [])[0];
}

function hydrateText(pb: any, top: boolean, values: IOptionValues, cursor: IAddress): IText | null {
    const name = `results/${ cursor.join('/') }/${ top ? 'topText' : 'bottomText' }`;
    const value = values[name];
    if (value) {
        const { ops } = value;
        const chunks: Array<ITextChunk> = ops.map((x) => {
            const value = x.insert;
            let chunk: ITextChunk;
            if (value.formula) {
                const attributes = x.attributes || {};
                attributes.formula = true;
                chunk = { content: value.formula, attributes };
            }
            else {
                if (x.attributes)
                    chunk = { content: value, attributes: x.attributes };
                else
                    chunk = { content: value }
            }
            return chunk;
        });
        return { type: 'text', chunks };
    }
    else {
        return null;
    }
}

function hydrateElement(pb: any, target: IAddress, values: IOptionValues, cursor: Array<string>): Array<IElement> {

    cursor = [... cursor];  // clone

    const before = hydrateText(pb, true, values, cursor);
    const after = hydrateText(pb, false, values, cursor);

    const elements = [];
    if (before)
        elements.push(before);

    if (pb.group) {
        if (target.length > 0) {
            const name = target.shift();
            cursor.push(name);
            for (let elementPB of pb.group.elements) {
                if (elementPB.name === name)
                    return hydrateElement(elementPB, target, values, cursor);
            }
            throw Error('Address not valid');
        }
        const group = hydrateGroup(pb, target, values, cursor);
        if (group) {
            // if there's text at the top of the group, we move it down into
            // the body of the group
            if (before)
                elements.shift();
            elements.push(group);
            if (before)
                group.items.unshift(before);
        }
    }
    else if (pb.array) {
        if (target.length > 0) {
            const name = target.shift();
            cursor.push(name);
            for (let elementPB of pb.array.elements) {
                if (elementPB.name === name)
                    return hydrateElement(elementPB, target, values, cursor);
            }
            throw Error('Address not valid');
        }
        const array = hydrateArray(pb, target, values, cursor);
        if (array) {
            // if there's text at the top of the group, we move it down into
            // the body of the group
            if (before)
                elements.shift();
            elements.push(array);
            if (before)
                array.items.unshift(before);
        }
    }
    if (target.length > 0)
        throw Error('Address not valid');

    if (pb.table) {
        const table = hydrateTable(pb);
        elements.push(table)
    }
    if (pb.image) {
        const image = hydrateImage(pb);
        elements.push(image);
    }

    if (after)
        elements.push(after);

    if (elements.length === 0)
        return null;

    return elements;
}


function hydrateArray(arrayPB: any, target: IAddress, values: IOptionValues, cursor: IAddress): IGroup | null {
    if (arrayPB.array.elements.length === 0)
        return null;
    return {
        type: 'group',
        title: arrayPB.title,
        items: hydrateElements(arrayPB.array.elements, target, values, cursor),
    }
}

function hydrateGroup(groupPB: any, target: IAddress, values: IOptionValues, cursor: IAddress): IGroup | null {
    if (groupPB.group.elements.length === 0)
        return null;
    return {
        type: 'group',
        title: groupPB.title,
        items: hydrateElements(groupPB.group.elements, target, values, cursor),
    }
}

function hydrateElements(elementsPB: Array<any>, target: IAddress, values: IOptionValues, cursor: IAddress): Array<IElement> {
    const items = [ ]
    for (const itemPB of elementsPB) {
        cursor = [...cursor, itemPB.name];
        if ([0, 2].includes(itemPB.visible)) {
            const elem = hydrateElement(itemPB, target, values, cursor);
            if (elem !== null) {
                for (const item of elem)
                    items.push(item);
            }
        }
    }
    return items;
}

function hydrateImage(imagePB: any): IImage {
    return {
        type: 'image',
        path: imagePB.image.filePath,
        width: imagePB.image.width,
        height: imagePB.image.height,
    };
}


function transpose(columns: Array<Array<ICell>>): Array<Array<ICell>> {
    if ( ! Array.isArray(columns) || columns.length === 0)
        return [];
    return Array.from(
        { length: columns[0].length },
        (_, rowIdx) => columns.map(col => col[rowIdx])
    );
}

function extractValue(cellPB: any, align: 'l' | 'c' | 'r'): IRawCell | null {
    let value = cellPB[cellPB.cellType];
    if (cellPB.cellType === 'o') {
        if (value === 1)
            value = 'NaN';
        else
            value = '.';
    }
    return { value, footnotes: cellPB.footnotes, align };
}

function extractValues(columnsPB: any): Array<Array<IRawCell>> {
    const nCols = columnsPB.length;
    const nRows = columnsPB[0].length;
    const cols = new Array(nCols);
    const footnotes = [ ];
    for (let i = 0; i < nCols; i++) {
        const columnPB = columnsPB[i];
        const align = {'text': 'l', 'integer': 'r', 'number': 'r'}[columnPB.type.toLowerCase()]
        cols[i] = columnsPB[i].cells.map((v) => extractValue(v, align));
    }
    return cols;
}

function format2(value: string | number, fmt: any): string {
    if (typeof value === 'string')
        return value;
    else
        return format(value, fmt);
}

function transmogrify(rawCells: Array<Array<IRawCell>>, formats: Array<any>): [ Array<Array<ICell>>, Array<string> ] {
    const footnotes: Array<string> = [];
    const finalCells: Array<Array<ICell>> = rawCells.map((col, colNo) => {
        const fmt = formats[colNo];
        return col.map((cell) => {
            if ( ! cell || cell.value === '')
                return null;
            let indices: Array<number> | undefined;
            for (let fn of cell.footnotes) {
                let index = footnotes.indexOf(fn);
                if (index == -1) {
                    index = footnotes.length;
                    footnotes.push(fn);
                }
                if ( ! indices)
                    indices = [ index ];
                else
                    indices.push(index);
            }
            const finalCell: ICell = {
                content: format2(cell.value, fmt),
                align: cell.align,
            }
            if (indices)
                finalCell.sups = indices.map(i => ALPHABET[i])
            return finalCell;
        });
    })
    return [ finalCells, footnotes ];
}

function foldTitles(row: Array<ICell>, columnNames: Array<string>): Array<ICell> {
    const columnNamesDone = new Set();
    const columnTitles: Array<ICell> = [ ];

    for (let i = 0; i < columnNames.length; i++) {
        let columnName = columnNames[i];
        const m = columnName.match(/^(.*)\[(.*)\]$/);
        if (m)
            columnName = m[1];

        if ( ! columnNamesDone.has(columnName)) {
            columnTitles.push(row[i]);
            columnNamesDone.add(columnName);
        }
    }

    return columnTitles;
}

function fold(cells: Array<Array<ICell>>, columnNames: Array<string>): Array<Array<ICell | null>> {
    const foldedColumnNames = new Set();
    const subRowNames = new Set();

    for (let name of columnNames) {
        const m = name.match(/^(.*)\[(.*)\]$/);
        if (m) {
            foldedColumnNames.add(m[1]);
            subRowNames.add(m[2]);
        }
        else {
            foldedColumnNames.add(name);
        }
    }
    if (subRowNames.size < 1)
        return cells;

    const nFoldsInRow = subRowNames.size;
    const nRows = cells[0].length * nFoldsInRow;
    const nCols = foldedColumnNames.size;

    const foldedCells: Array<Array<ICell | null>> = Array.from(
        { length: nCols },
        () => Array.from(
            { length: nRows },
            () => null));

    const rowNames = [ ... subRowNames ];
    const newColumnNames = [ ... foldedColumnNames ];
    const lookup = { };

    for (let name of columnNames) {
        const m = name.match(/^(.*)\[(.*)\]$/);
        let rowOffset, colNo;
        if (m) {
            colNo = newColumnNames.indexOf(m[1]);
            rowOffset = rowNames.indexOf(m[2]);
        }
        else {
            colNo = newColumnNames.indexOf(name);
            rowOffset = 1;
        }
        lookup[name] = { rowOffset, colNo };
    }

    for (let i = 0; i < cells.length; i++) {
        const columnName = columnNames[i];
        const address = lookup[columnName];
        for (let j = 0; j < cells[i].length; j++) {
            foldedCells[address.colNo][j * nFoldsInRow + address.rowOffset] = cells[i][j];
        }
    }

    return foldedCells;
}

function hydrateTable(tablePB: any): ITable {

    const columnsPB = tablePB.table.columns.filter((cPB) => [0, 2].includes(cPB.visible));
    const columnNames = columnsPB.map((columnPB) => columnPB.name);
    const nCols = columnsPB.length;

    let superTitles: Array<ICell | null> = new Array(nCols).fill(null);
    let hasSuperTitles = false;

    for (let i = 0; i < nCols; i++) {
        const column = columnsPB[i];
        if (column.superTitle) {
            if (i == 0 || superTitles[i-1] === null || superTitles[i-1].content !== column.superTitle) {
                superTitles[i] = { content: column.superTitle, span: 1, align: 'c' };
                hasSuperTitles = true;
            }
            else {
                superTitles[i] = superTitles[i-1];
                superTitles[i].span += 1;
            }
        }
    }

    superTitles = foldTitles(superTitles, columnNames);

    const rows: Array<IRow> = [];

    if (hasSuperTitles) {
        const row: IRow = {
            type: 'superTitle',
            cells: superTitles,
        }
        rows.push(row);
    }

    let titles: Array<ICell | null> = columnsPB.map((columnPB) => {
        return columnPB.title ? { content: columnPB.title, align: 'c' } : null
    });
    titles = foldTitles(titles, columnNames);

    rows.push({ type: 'title', cells: titles });

    const rawCellsByColumn = extractValues(columnsPB);
    const formatsByColumn = rawCellsByColumn.map((x, i) => determFormat(x, columnsPB[i].type, columnsPB[i].format));
    const [ cellsByColumn, footnotes ] = transmogrify(rawCellsByColumn, formatsByColumn);

    const folded = fold(cellsByColumn, columnNames);

    const cellsByRow = transpose(folded);
    const bodyRows: Array<IRow> = cellsByRow.map(cells => {
        return {
            type: 'body',
            cells,
        };
    })
    rows.push(...bodyRows);

    for (let i = 0; i < footnotes.length; i++) {
        const fn = footnotes[i];
        const sup = ALPHABET[i];
        rows.push({
            type: 'footnote',
            cells: [ { content: fn, span: nCols, sups: [sup], align: 'l' } ]
        })
    }

    const columns = columnsPB.map((column) => {
        return {
            title: column.title,
            rows: rows,
        };
    });

    return {
        type: 'table',
        title: tablePB.title,
        rows,
        nCols: columns.length,
    }
}

