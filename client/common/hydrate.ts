'use strict';

import { I18n } from './i18n';
import { determFormat } from './formatting';
import { format } from './formatting';

const currI18n = new I18n;
const ALPHABET = 'abcdefghijklmnopqrstuvwxyz';

interface IRawCell {
    value: string | number;
    footnotes: Array<string>;
    symbols: Array<string>;
    align: 'l' | 'c' | 'r';
}

interface IRawColumn {
    cells: Array<IRawCell>;
    combineBelow: boolean;
}

export interface ICell {
    content: string;
    align: 'l' | 'c' | 'r';
    colSpan?: number;
    rowSpan?: number;
    sups?: Array<string>;
}

interface IColumn {
    cells: Array<ICell | null>;
    combineBelow: boolean;
}

export interface IRow {
    type: 'superTitle' | 'title' | 'body' | 'footnote';
    cells: Array<ICell | null>;
}

export interface ITable {
    type: 'table';
    title: string;
    rows: Array<IRow>;
    nCols: number;
    refs?: Array<string>;
}

export interface IImage {
    type: 'image';
    title?: string;
    path: string | null;
    width: number;
    height: number;
    address: string;
    refs?: Array<string>;
}

export interface IPreformatted {
    type: 'preformatted';
    title?: string;
    content: string;
    syntax: boolean;
    refs?: Array<string>;
}

export interface ITextChunk {
    content: string;
    attributes?: { [name: string]: any };
}

export interface IText {
    type: 'text';
    chunks: Array<ITextChunk>;
    refs?: Array<string>;
}

export interface IGroup {
    type: 'group';
    title?: string;
    items: Array<IElement>;
    refs?: Array<string>;
}

export type IElement = IGroup | ITable | IImage | IText | IPreformatted;
type IOptionValues = { [ name: string ]: any };
type IAddress = Array<string>;

export function hydrate(pb: any, address: IAddress = [], values: IOptionValues = {}, top: boolean = false, analysisId?: number): IElement {
    analysisId = analysisId || 0;

    const elements = hydrateElement(pb, address, values, [], top, analysisId);
    if (elements === null) {
        return null;
    }
    return elements[0];
}

function isPara(attr: Object) {
    if (attr) {
        return ['align', 'indent', 'list'].some(n => Object.keys(attr).includes(n));
    }
    else {
        return false;
    }
}

function hydrateText(top: boolean, values: IOptionValues, cursor: IAddress): IText | null {
    const name = `results/${ cursor.join('/') }/${ top ? 'topText' : 'bottomText' }`;
    const value = values[name];

    if (value) {
        const { ops } = value;
        const chunks = [];
        let prevCR = -1;
        let addCR = 0;

        for (let x of ops) {
            let content = x.insert;
            if (content.formula) {
                chunks.push(createChunk(content.formula, { ...x.attributes, ...{ formula: true } }));
                continue
            }
            // if the content of a chunk starts with '\n', we create a new chunk with '\n' and no attributes
            // afterwards, the original content is either shortened (i.e., the leading '\n' is removed) or
            // if the chunk consisted only of '\n', the next chunk is processed
            if (content.includes('\n') && content !== '\n') {
                const splContent = content.split('\n');
                // remove trailing CRs and store their number in addCR
                while (splContent[splContent.length - 1] === '') {
                    splContent.pop();
                    ++addCR;
                }
                for (let i = 0; i < splContent.length; i++) {
                    if (splContent[i] === '') {
                        chunks.push(createChunk('\n'));
                    }
                    else if (i < splContent.length - 1) {
                        chunks.push(createChunk(splContent[i] + '\n'));
                    }
                    else {
                        content = splContent[i];
                        if (addCR > 0) {
                            content = content + '\n';
                            --addCR;
                        }
                    }
                }
            }
            // quill does some unusual things where it attaches formatting information
            // to a subsequent chunk; we are looking for the previous '\n' and attach
            // all paragraph attributes to the chunks in between
            prevCR = chunks.map(c => c.content.includes('\n')).lastIndexOf(true);
            if (isPara(x.attributes) && prevCR > -1) {
                let copyObj = {};
                for (let key of Object.keys(x.attributes)) {
                    if (['align', 'indent', 'list'].includes(key)) {
                        copyObj[key] = x.attributes[key];
                    }
                }
                for (let i = prevCR + 1; i < chunks.length; i++) {
                    chunks[i].attributes = { ...chunks[i].attributes, ...copyObj };
                }
            }
            if (content !== '\n') {
                chunks.push(createChunk(content, x.attributes));
            }
            else {
                chunks[chunks.length - 1].content += '\n';
            }
            while (addCR > 0) {
                chunks.push(createChunk('\n'));
                --addCR;
            }
        }

        return { type: 'text', chunks: chunks };
    }
    else {
        return null;
    }
}

function createChunk(content: string, attr?: Object): ITextChunk {
    if (attr && Object.keys(attr).length > 0) {
        return { content, attributes: attr };
    }
    else {
        return { content };
    }
}

function addRefs(currPB: any): { refs: Array<string> } {
    if (currPB && currPB.refs && currPB.refs.length > 0) {
        return { refs: currPB.refs };
    }
    else {
        return undefined;
    }
}

function hydrateElement(pb: any, target: IAddress, values: IOptionValues, cursor: Array<string>, top: boolean, analysisId: number): Array<IElement> {

    cursor = [... cursor];  // clone

    const before = hydrateText(true, values, cursor);
    const after = hydrateText(false, values, cursor);

    const elements = [];
    if (before) {
        elements.push(before);
    }

    if (pb.group) {
        if (target.length > 0) {
            const name = target.shift();
            cursor.push(name);
            for (let elementPB of pb.group.elements) {
                if (elementPB.name === name) {
                    return hydrateElement(elementPB, target, values, cursor, top, analysisId);
                }
            }
            throw Error('Address not valid');
        }
        const group = hydrateGroup(pb, target, values, cursor, top, analysisId);
        if (group) {
            // if there's text at the top of the group, we move it down into
            // the body of the group
            if (before) {
                elements.shift();
            }
            elements.push(group);
            if (before) {
                group.items.unshift(before);
            }
        }
    }
    else if (pb.array) {
        if (target.length > 0) {
            const name = target.shift();
            cursor.push(name);
            for (let elementPB of pb.array.elements) {
                if (elementPB.name === name) {
                    return hydrateElement(elementPB, target, values, cursor, top, analysisId);
                }
            }
            throw Error('Address not valid');
        }
        const array = hydrateArray(pb, target, values, cursor, top, analysisId);
        if (array) {
            // if there's text at the top of the group, we move it down into
            // the body of the group
            if (before) {
                elements.shift();
            }
            elements.push(array);
            if (before) {
                array.items.unshift(before);
            }
        }
    }
    if (target.length > 0) {
        throw Error('Address not valid');
    }

    // append results objects to elements: table, image, or preformatted
    if (pb.table) {
        const table = hydrateTable(pb);
        elements.push(table);
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
    else if (pb.notice) {
        const notice = hydrateNotice(pb);
        elements.push(notice);
    }

    if (after) {
        elements.push(after);
    }

    if (elements.length === 0) {
        return null;
    }

    return elements;
}

function hydrateArray(arrayPB: any, target: IAddress, values: IOptionValues, cursor: IAddress, top: boolean, analysisId: number): IGroup | null {
    if (arrayPB.array.elements.length === 0) {
        return null;
    }
    const items = hydrateElements(arrayPB.array.elements, target, values, cursor, top, analysisId);
    if (items === null) {
        return null;
    }
    return {
        ...{
            type: 'group',
            title: arrayPB.title,
            items,
        },
        ...addRefs(arrayPB),
    }
}

function hydrateGroup(groupPB: any, target: IAddress, values: IOptionValues, cursor: IAddress, top: boolean, analysisId: number): IGroup | null {
    let title: string = groupPB.title;
    if (top && cursor.length === 0) {
        title = values['results//heading'] || title;
        return { type: 'group', title, items: [] };
    }

    const items = hydrateElements(groupPB.group.elements, target, values, cursor, top, analysisId);
    if (items === null) {
        return null;
    }
    return { type: 'group', title, items };
}

function hydrateElements(elementsPB: Array<any>, target: IAddress, values: IOptionValues, cursor: IAddress, top: boolean, analysisId: number): Array<IElement> | null {
    const items = [ ]
    for (const itemPB of elementsPB) {
        const itemCursor = [...cursor, itemPB.name];
        if ([0, 2].includes(itemPB.visible)) {
            const elem = hydrateElement(itemPB, target, values, itemCursor, top, analysisId);
            if (elem !== null) {
                for (const item of elem) {
                    items.push(item);
                }
            }
        }
    }
    if (items.length === 0) {
        return null;
    }
    return items;
}

function hydrateImage(imagePB: any, target: IAddress, cursor: IAddress, analysisId: number): IImage {
    return {
        ...{
            type: 'image',
            title: imagePB.title,
            path: null,
            width: imagePB.image.width,
            height: imagePB.image.height,
            address: [ analysisId.toString(), ...cursor, ...target].join('/'),
        },
        ...addRefs(imagePB),
    };
}

function hydratePreformatted(preformattedPB: any): IPreformatted {
    return {
        ...{
            type: 'preformatted',
            title: preformattedPB.title,
            content: preformattedPB.preformatted,
            syntax: preformattedPB.name == 'syntax',
        },
        ...addRefs(preformattedPB),
    };
}

function html2Chunks(content: string, title?: string, msgType?: number): IText {
    const parser = new DOMParser();
    let chunks: Array<ITextChunk> = [];
    if (title) {
        chunks.push({ content: title, attributes: { header: 1 } });
    }

    function chunkify(node: Node, prevAttr: { [key: string]: any }) {
        let currAttr: { [key: string]: any } = { ...prevAttr };

        if (node.nodeType === Node.ELEMENT_NODE) {
            const element = node as Element;

            if (['B', 'STRONG'].includes(element.tagName)) {
                currAttr['bold'] = true;
            }
            if (['I', 'EM'].includes(element.tagName)) {
                currAttr['italic'] = true;
            }
            if (['U'].includes(element.tagName)) {
                currAttr['underline'] = true;
            }
            if (['S', 'STRIKE', 'DEL'].includes(element.tagName)) {
                currAttr['strike'] = true;
            }
            if (['CODE', 'PRE'].includes(element.tagName)) {
                currAttr['code-block'] = true;
            }
            if (['SUP', 'SUB'].includes(element.tagName)) {
                currAttr['script'] = element.tagName.replace('SUP', 'super').replace('SUB', 'sub');
            }
            if (['A'].includes(element.tagName)) {
                currAttr['link'] = element.attributes['href'].value;
            }
            if (/H[1-6]/.test(element.tagName)) {
                currAttr['header'] = parseInt(element.tagName.charAt(1));
            }
            if (['UL', 'OL'].includes(element.tagName)) {
                currAttr['list'] = element.tagName.replace('OL', 'ordered').replace('UL', 'bullet');
            }
            if (element.attributes['style']) {
                const attrValues = element.attributes['style'].value.split(';').map(s => s.trim()).filter(s => s.length);
                for (let attrValue of attrValues) {
                    const attrPair = attrValue.split(':');
                    if (attrPair[0] === 'text-align' && attrPair[1] !== 'left') {
                        currAttr['align'] = attrPair[1];
                    }
                    else if (attrPair[0] === 'padding') {
                        const indent = Math.floor(parseInt(attrPair[1].replaceAll('px', '').split(' ')[3]) / 36);
                        if (indent > 0) {
                            currAttr['indent'] = indent;
                        }
                    }
                    else if (attrPair[0] === 'color') {
                        currAttr['color'] = rgb2Hex(attrPair[1]);
                    }
                    else if (attrPair[0] === 'background-color') {
                        currAttr['background'] = rgb2Hex(attrPair[1]);
                    }
                    else {
                        console.log(attrValue);
                    }
                }
            }
        }

        // process child nodes
        if (node.childNodes) {
            for (let child of node.childNodes) {
                if (child.nodeType === Node.TEXT_NODE) {
                    if (child.textContent) {
                        if (Object.keys(currAttr).length > 0) {
                            chunks.push({ content: child.textContent, attributes: currAttr });
                        }
                        else {
                            chunks.push({ content: child.textContent});
                        }
                    }
                } else {
                    chunkify(child, currAttr);
                }
            }
        }
    }

    chunkify(parser.parseFromString(content, 'text/html').body, ((msgType) ? { box: msgType} : {}));

    // combine CR with previous text
    for (let i = 0; i < chunks.length; ++i) {
        if (i > 0 && chunks[i].content === '\n' &&
              ((Object.keys(chunks[i - 1]).length === 0 && Object.keys(chunks[i]).length === 0) ||
               (JSON.stringify(chunks[i - 1].attributes) === JSON.stringify(chunks[i].attributes)) ||
               (Object.keys(chunks[i - 1].attributes).filter(k => k !== 'align').length === 0) ||
               (Object.keys(chunks[i - 1].attributes).filter(k => k !== 'indent').length === 0))) {
            chunks[i - 1].content = chunks[i - 1].content + '\n';
            chunks[i - 0].content = '';
        }
    }
    chunks = chunks.filter(c => c.content.length > 0);

    return {
        type: 'text',
        chunks: chunks,
    };
}

function hydrateHTML(htmlPB: any): IText {
    return { ...html2Chunks(htmlPB.html.content, htmlPB.title),
             ...addRefs(htmlPB.refs) };
}

function hydrateNotice(noticePB: any): IText {
    const html = currI18n.__(noticePB.notice.content, { prefix: '<strong>', postfix: '</strong>' });

    return { ...html2Chunks(html, noticePB.title, noticePB.notice.type),
             ...addRefs(noticePB.refs) };
}

function rgb2Hex(rgb: string): string {
    return '#' + Array.from(rgb.match(/[0-9]+/g)).map(c => parseInt(c).toString(16).padStart(2, '0')).join('');
}

function transpose(columns: Array<Array<ICell>>): Array<Array<ICell>> {
    if ( ! Array.isArray(columns) || columns.length === 0) {
        return [];
    }
    return Array.from(
        { length: columns[0].length },
        (_, rowIdx) => columns.map(col => col[rowIdx])
    );
}

function extractRawCell(cellPB: any, align: 'l' | 'c' | 'r'): IRawCell | null {
    let value = cellPB[cellPB.cellType];
    if (cellPB.cellType === 'o') {
        if (value === 1) {
            value = 'NaN';
        }
        else {
            value = '.';
        }
    }
    return { value, footnotes: cellPB.footnotes, symbols: cellPB.symbols, align };
}

function extractRawColumns(columnsPB: any): Array<IRawColumn> {
    const nCols = columnsPB.length;
    const cols: Array<IRawColumn> = new Array(nCols);

    for (let i = 0; i < nCols; ++i) {
        const columnPB = columnsPB[i];
        const align = {'text': 'l', 'integer': 'r', 'number': 'r'}[columnPB.type.toLowerCase()]
        const cells = columnsPB[i].cells.map((v) => extractRawCell(v, align));
        const { combineBelow } = columnPB;
        const column = { cells, combineBelow };
        cols[i] = column;
    }

    return cols;
}

function transmogrify(rawCols: Array<IRawColumn>, formats: Array<any>): [ Array<IColumn>, Array<string> ] {
    const footnotes: Array<string> = [];
    const finalCells: Array<IColumn> = rawCols.map((col, colNo) => {
        const fmt = formats[colNo];
        const cells = col.cells.map((cell) => {
            if ( ! cell || cell.value === '') {
                return null;
            }
            const indices: Array<number> = [];
            for (let fn of cell.footnotes) {
                let index = footnotes.indexOf(fn);
                if (index == -1) {
                    index = footnotes.length;
                    footnotes.push(fn);
                }
                indices.push(index);
            }
            const finalSups = [...cell.symbols, ...indices.map(i => ALPHABET[i])];
            const finalCell: ICell = {
                content: (typeof cell.value === 'string') ? cell.value : format(cell.value, fmt),
                align: cell.align,
            };
            if (finalSups.length > 0) {
                finalCell.sups = finalSups;
            }
            return finalCell;
        });
        const { combineBelow } = col;
        return { cells, combineBelow };
    });
    return [ finalCells, footnotes ];
}

function foldTitles(row: Array<ICell>, columnNames: Array<string>): Array<ICell> {
    const columnNamesDone = new Set();
    const columnTitles: Array<ICell> = [ ];

    for (let i = 0; i < columnNames.length; ++i) {
        let columnName = columnNames[i];
        const m = columnName.match(/^(.*)\[(.*)\]$/);
        if (m) {
            columnName = m[1];
        }

        if ( ! columnNamesDone.has(columnName)) {
            columnTitles.push(row[i]);
            columnNamesDone.add(columnName);
        }
    }

    return columnTitles;
}

function fold(columns: Array<IColumn>, columnNames: Array<string>): Array<Array<ICell | null>> {
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
    if (subRowNames.size < 1) {
        return columns.map(col => col.cells);
    }

    const nFoldsInRow = subRowNames.size;
    const nRows = columns[0].cells.length * nFoldsInRow;
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

    const combines = new Array(newColumnNames.length);

    for (let i = 0; i < columns.length; i++) {
        const columnName = columnNames[i];
        const address = lookup[columnName];
        for (let j = 0; j < columns[i].cells.length; j++) {
            foldedCells[address.colNo][j * nFoldsInRow + address.rowOffset] = columns[i].cells[j];
        }
        combines[address.colNo] = columns[i].combineBelow;
    }

    // add row span's for 'combineBelow'
    for (const [i, combine] of combines.entries()) {
        if ( ! combine) {
            continue;
        }

        const cells = foldedCells[i];

        let rowSpan = 1;
        for (let j = cells.length - 1; j >= 0; j--) {
            const cell: ICell | null = cells[j];
            const above: ICell | null = (j > 0) ? cells[j - 1] : null;
            if (cell === null) {
                continue;
            }
            else if (above === null || cell.content !== above.content) {
                if (rowSpan > 1) {
                    cell.rowSpan = rowSpan;
                    rowSpan = 1;
                }
            }
            else {
                rowSpan += 1;
            }
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

    for (let i = 0; i < nCols; ++i) {
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

    const rawColumns = extractRawColumns(columnsPB);
    const formatsByColumn = rawColumns.map((x, i) => determFormat(x.cells, columnsPB[i].type, columnsPB[i].format, undefined));
    const [ cellsByColumn, footnotes ] = transmogrify(rawColumns, formatsByColumn);

    const folded = fold(cellsByColumn, columnNames);
    const cellsByRow = transpose(folded);
    const bodyRows: Array<IRow> = cellsByRow.map(cells => {
        return {
            type: 'body',
            cells,
        };
    });
    rows.push(...bodyRows);

    for (let i = 0; i < tablePB.table.notes.length; ++i) {
        const note = tablePB.table.notes[i].note;
        rows.push({
            type: 'footnote',
            cells: [ { content: note, colSpan: folded.length, sups: ['note'], align: 'l' } ]
        });
    }

    for (let i = 0; i < footnotes.length; ++i) {
        const fn = footnotes[i];
        const sup = ALPHABET[i];
        rows.push({
            type: 'footnote',
            cells: [ { content: fn, colSpan: folded.length, sups: [sup], align: 'l' } ]
        });
    }

    const columns = columnsPB.map((column) => {
        return {
            title: column.title,
            rows: rows,
        };
    });

    return {
        ...{
            type: 'table',
            title: tablePB.title,
            rows,
            nCols: folded.length,
        },
        ...addRefs(tablePB),
    }
}
