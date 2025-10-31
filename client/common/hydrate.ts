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
    items: Array<IGroup | ITable | IImage>;
}

export type IElement = IGroup | ITable | IImage;


export interface ITable {
    type: 'table',
    title: string,
    rows: Array<IRow>,
    nCols: number,
}

export function hydrate(pb: any, address: Array<string> = []): IElement | null {

    if (pb.group) {
        if (address.length > 0) {
            const name = address.shift();
            for (let elementPB of pb.group.elements) {
                if (elementPB.name === name)
                    return hydrate(elementPB, address);
            }
            throw Error('Address not valid');
        }
        return hydrateGroup(pb);
    }
    if (pb.array) {
        if (address.length > 0) {
            const name = address.shift();
            for (let elementPB of pb.array.elements) {
                if (elementPB.name === name)
                    return hydrate(elementPB, address);
            }
            throw Error('Address not valid');
        }
        return hydrateArray(pb);
    }
    if (address.length > 0)
        throw Error('Address not valid');
    if (pb.table)
        return hydrateTable(pb);
    if (pb.image)
        return hydrateImage(pb);
    return null;
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

function extractValues(tablePB: any): Array<Array<IRawCell>> {
    const nCols = tablePB.table.columns.length;
    const nRows = tablePB.table.columns[0].length;
    const cols = new Array(nCols);
    const footnotes = [ ];
    for (let i = 0; i < nCols; i++) {
        const columnPB = tablePB.table.columns[i];
        const align = {'text': 'l', 'integer': 'r', 'number': 'r'}[columnPB.type.toLowerCase()]
        cols[i] = tablePB.table.columns[i].cells.map((v) => extractValue(v, align));
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

    const nCols = tablePB.table.columns.length;
    const columnsPB = tablePB.table.columns;
    const columnNames = columnsPB.map((columnPB) => columnPB.name);

    let superTitles: Array<ICell | null> = new Array(nCols).fill(null);
    let hasSuperTitles = false;

    for (let i = 0; i < nCols; i++) {
        const column = tablePB.table.columns[i];
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

    const rawCellsByColumn = extractValues(tablePB);
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

    const columns = tablePB.table.columns.map((column) => {
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

function hydrateArray(arrayPB: any): IGroup | null {
    if (arrayPB.array.elements.length === 0)
        return null;
    return {
        type: 'group',
        title: arrayPB.title,
        items: hydrateElements(arrayPB.array.elements),
    }
}

function hydrateGroup(groupPB: any): IGroup | null {
    if (groupPB.group.elements.length === 0)
        return null;
    return {
        type: 'group',
        title: groupPB.title,
        items: hydrateElements(groupPB.group.elements),
    }
}

function hydrateElements(elementsPB: Array<any>): Array<IElement> {
    const items = [ ]
    for (const itemPB of elementsPB) {
        if ([0, 2].includes(itemPB.visible)) {
            const item = hydrate(itemPB);
            if (item !== null)
                items.push(item);
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

