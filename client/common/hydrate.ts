'use strict';

import { determFormat } from "./formatting";
import { format } from "./formatting";

const ALPHABET = 'abcdefghijklmnopqrstuvwxyz';

interface IRawCell {
    value: string | number;
    footnotes: Array<string>;
    symbols: Array<string>;
    align: 'l' | 'c' | 'r';
}

export interface ICell {
    content: string;
    align: 'l' | 'c' | 'r';
    colSpan?: number;
    rowSpan?: number;
    sups?: Array<string>;
}

export interface IRow {
    type: 'superTitle' | 'title' | 'body' | 'footnote';
    cells: Array<ICell | null>;
}

export interface IImage {
    type: 'image';
    title?: string;
    path: string;
    width: number;
    height: number;
    address: string;
}

export interface IPreformatted {
    type: 'preformatted';
    title?: string;
    content: string;
    syntax: boolean;
}

export interface IHTML {
    type: 'html';
    title?: string;
    content: string;
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

export type IElement = IGroup | ITable | IImage | IText | IPreformatted | IHTML;
type IOptionValues = { [ name: string ]: any };
type IAddress = Array<string>;


export function hydrate(pb: any, address: IAddress = [], values: IOptionValues = {}, top: boolean = false, analysisId?: number): IElement {
    analysisId = analysisId || 0;
    const elements = hydrateElement(pb, address, values, [], top, analysisId);
    if (elements === null)
        return null;
    return elements[0];
}

function hydrateText(top: boolean, values: IOptionValues, cursor: IAddress): IText | null {
    const name = `results/${ cursor.join('/') }/${ top ? 'topText' : 'bottomText' }`;
    const value = values[name];
    if (value) {
        const { ops } = value;
        const chunks = new Array(ops.length);

        for (let [i, x] of ops.entries()) {
            let content = x.insert;
            let chunk: ITextChunk;
            if (content.formula) {
                const attributes = x.attributes || {};
                attributes.formula = true;
                chunk = { content: content.formula, attributes };
            }
            else {
                if (content === '\n' && x.attributes && i > 0) {
                    // quill does some unusual things where it attaches
                    // formatting information to a subsequent chunk
                    // we split off the last line of the previous chunk
                    // and attach it to this chunk
                    const prev = chunks[i - 1];
                    const prevPieces = prev.content.split('\n');
                    const lastLine = prevPieces[prevPieces.length - 1];
                    prevPieces[prevPieces.length - 1] = '';
                    prev.content = prevPieces.join('\n');
                    chunks[i-1] = prev;
                    content = lastLine + content;
                }
                if (x.attributes)
                    chunk = { content, attributes: x.attributes };
                else
                    chunk = { content }
            }
            chunks[i] = chunk;
        }

        // move new lines from beginning of chunks, to end of previous chunks
        // not technically necessary, but does make exports a bit neater
        for (let [i, x] of chunks.entries()) {
            if (i == 0)
                continue;
            let thisChunk = x;
            if (thisChunk.content.startsWith('\n')) {
                let prevChunk = chunks[i-1];
                while (thisChunk.content.length > 0 && thisChunk.content.startsWith('\n')) {
                    prevChunk.content += '\n';
                    thisChunk.content = thisChunk.content.substring(1);
                }
            }
        }

        // remove empty chunks
        const noEmpty = chunks.filter(chunk => chunk.content.length > 0 || chunk.attributes);

        return { type: 'text', chunks: noEmpty };
    }
    else {
        return null;
    }
}

function hydrateElement(pb: any, target: IAddress, values: IOptionValues, cursor: Array<string>, top: boolean, analysisId: number): Array<IElement> {

    cursor = [... cursor];  // clone

    const before = hydrateText(true, values, cursor);
    const after = hydrateText(false, values, cursor);

    const elements = [];
    if (before)
        elements.push(before);

    if (pb.group) {
        if (target.length > 0) {
            const name = target.shift();
            cursor.push(name);
            for (let elementPB of pb.group.elements) {
                if (elementPB.name === name)
                    return hydrateElement(elementPB, target, values, cursor, top, analysisId);
            }
            throw Error('Address not valid');
        }
        const group = hydrateGroup(pb, target, values, cursor, top, analysisId);
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
                    return hydrateElement(elementPB, target, values, cursor, top, analysisId);
            }
            throw Error('Address not valid');
        }
        const array = hydrateArray(pb, target, values, cursor, top, analysisId);
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

    // append results objects to elements: table, image, preformatted or HTML
    if (pb.table) {
        const table = hydrateTable(pb);
        elements.push(table)
    }
    else if (pb.image) {
        const image = hydrateImage(pb, target, cursor, analysisId);
        elements.push(image);
    }
    else if (pb.preformatted) {
        const preformatted = hydratePreformatted(pb);
        elements.push(preformatted);
    }
    else if (pb.html) {
        const html = hydrateHTML(pb);
        elements.push(html);
    }

    if (after)
        elements.push(after);

    if (elements.length === 0)
        return null;

    return elements;
}


function hydrateArray(arrayPB: any, target: IAddress, values: IOptionValues, cursor: IAddress, top: boolean, analysisId: number): IGroup | null {
    if (arrayPB.array.elements.length === 0)
        return null;
    const items = hydrateElements(arrayPB.array.elements, target, values, cursor, top, analysisId);
    if (items === null)
        return null;
    return {
        type: 'group',
        title: arrayPB.title,
        items,
    }
}

function hydrateGroup(groupPB: any, target: IAddress, values: IOptionValues, cursor: IAddress, top: boolean, analysisId: number): IGroup | null {

    let title: string = groupPB.title;
    if (top && cursor.length === 0) {
        title = values['results//heading'] || title;
        return { type: 'group', title, items: [] };
    }

    const items = hydrateElements(groupPB.group.elements, target, values, cursor, top, analysisId);
    if (items === null)
        return null;
    return { type: 'group', title, items };
}

function hydrateElements(elementsPB: Array<any>, target: IAddress, values: IOptionValues, cursor: IAddress, top: boolean, analysisId: number): Array<IElement> | null {
    const items = [ ]
    for (const itemPB of elementsPB) {
        const itemCursor = [...cursor, itemPB.name];
        if ([0, 2].includes(itemPB.visible)) {
            const elem = hydrateElement(itemPB, target, values, itemCursor, top, analysisId);
            if (elem !== null) {
                for (const item of elem)
                    items.push(item);
            }
        }
    }
    if (items.length === 0)
        return null;
    return items;
}

function hydrateImage(imagePB: any, target: IAddress, cursor: IAddress, analysisId: number): IImage {
    return {
        type: 'image',
        title: imagePB.title,
        path: null,
        width: imagePB.image.width,
        height: imagePB.image.height,
        address: [ analysisId.toString(), ...cursor, ...target].join('/'),
    };
}

function hydratePreformatted(preformattedPB: any): IPreformatted {
    return {
        type: 'preformatted',
        title: preformattedPB.title,
        content: preformattedPB.preformatted,
        syntax: preformattedPB.name == 'syntax',
    };
}

function hydrateHTML(htmlPB: any): IHTML {
    return {
        type: 'html',
        title: htmlPB.title,
        content: htmlPB.html.content,
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
    return { value, footnotes: cellPB.footnotes, symbols: cellPB.symbols, align };
}

function extractValues(columnsPB: any): Array<Array<IRawCell>> {
    const nCols = columnsPB.length;
    const cols = new Array(nCols);

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
            const indices: Array<number> = [];
            for (let fn of cell.footnotes) {
                let index = footnotes.indexOf(fn);
                if (index == -1) {
                    index = footnotes.length;
                    footnotes.push(fn);
                }
                indices.push(index);
            }
            const symbols = cell.symbols || [];
            const sups = indices.map(i => ALPHABET[i]);
            const finalSups = [...symbols, ...sups];
            const finalCell: ICell = {
                content: format2(cell.value, fmt),
                align: cell.align,
            };
            if (finalSups.length > 0)
                finalCell.sups = finalSups;
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
    let lastSuperTitle: ICell | null = null;

    for (let i = 0; i < nCols; i++) {
        const column = columnsPB[i];
        if (column.superTitle) {
            if (i == 0 || lastSuperTitle === null || lastSuperTitle.content !== column.superTitle) {
                lastSuperTitle = superTitles[i] = { content: column.superTitle, colSpan: 1, align: 'c' };
                hasSuperTitles = true;
            }
            else {
                lastSuperTitle.colSpan += 1;
            }
        }
        else {
            lastSuperTitle = null;
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
    const formatsByColumn = rawCellsByColumn.map((x, i) => determFormat(x, columnsPB[i].type, columnsPB[i].format, undefined));
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
            cells: [ { content: fn, colSpan: nCols, sups: [sup], align: 'l' } ]
        })
    }

    for (let i = 0; i < tablePB.table.notes.length; i++) {
        const note = tablePB.table.notes[i].note;
        rows.push({
            type: 'footnote',
            cells: [ { content: note, colSpan: nCols, sups: ['note'], align: 'l' } ]
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

