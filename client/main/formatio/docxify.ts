
// converts hydrated results (see hydrate.ts) into a word document, using
// the docx library. this is the .docx counterpart to latexify.ts, but unlike
// the latex bundle the whole document is built here: figures come from the
// results view (see the figures callback) rather than the engine, and the
// server just writes the bytes out.
//
// this module pulls in the docx library, so it's loaded on demand (see
// resultspanel's getAsDocx()) rather than as part of the main bundle

import {
    AlignmentType,
    BorderStyle,
    Document,
    ExternalHyperlink,
    HeadingLevel,
    ImageRun,
    LevelFormat,
    Packer,
    Paragraph,
    ShadingType,
    Table,
    TableCell,
    TableLayoutType,
    TableRow,
    TextRun,
    VerticalAlign,
    VerticalMergeType,
} from 'docx';
import type { FileChild, IParagraphOptions, IRunOptions, ParagraphChild } from 'docx';

import { IElement } from './hydrate';
import { IImage } from './hydrate';
import { ITable } from './hydrate';
import { IRow } from './hydrate';
import { ICell } from './hydrate';
import { IPreformatted } from './hydrate';
import { IText } from './hydrate';
import { ITextChunk } from './hydrate';
import { html2Chunks } from './hydrate';
import { IReference } from '../references';
import { referenceAsHTML } from '../references';

// a figure, as the results view renders it: the png always, and the svg
// when the plot is vector (mode: vector) -- word 2016+ shows the svg, other
// viewers fall back to the png
export interface IFigure {
    png: Uint8Array | ArrayBuffer;
    svg?: string;
}

// resolves a figure's address (analysisId/element/…) to its image data, or
// null if it can't be had (e.g. the element isn't rendered)
export type IFigureSource = (address: string) => Promise<IFigure | null>;

export interface IDocItem {
    element: IElement;
    level?: number;  // heading level of the element (1-6), default 1
}

export interface IDocOptions {
    references?: Array<IReference>;
    figures?: IFigureSource;
    showSyntax?: boolean;
    showRefs?: boolean;  // citations and the reference list, default true
}

// page geometry: A4 with 2.54cm margins (twips, 1/20 pt)
const PAGE_WIDTH = 11906;
const PAGE_HEIGHT = 16838;
const PAGE_MARGIN = 1440;
const TEXT_WIDTH = PAGE_WIDTH - 2 * PAGE_MARGIN;
const TEXT_HEIGHT = PAGE_HEIGHT - 2 * PAGE_MARGIN;

// the docx library sizes images in px at 96 dpi; jamovi's figures are in pt
const PX_PER_PT = 96 / 72;
const PX_PER_TWIP = 96 / 1440;

// cell format flags, see resultsview/table.ts
const FORMAT_BEGIN_GROUP = 1;
const FORMAT_INDENTED = 8;

// message box types, cf. resultsview/notice.ts
// 1: 'warning-1', 2: 'warning-2', 3: 'info', 4: 'error'
const BOX_COLORS = [ 'A6A6A6', 'F5A623', '3E6DA9', 'DD0000' ];
const BOX_FILLS  = [ 'F2F2F2', 'FDF3E4', 'E8EEF8', 'FBE9E9' ];

// calibri/consolas: on every office install, and sans-serif like the results
// view (aptos, word's newer default, isn't on older installs)
const FONT = 'Calibri';
const MONO = 'Consolas';

const RULE = { style: BorderStyle.SINGLE, size: 8, color: '000000', space: 0 };
const NO_RULE = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };

const HEADINGS = [
    HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3,
    HeadingLevel.HEADING_4, HeadingLevel.HEADING_5, HeadingLevel.HEADING_6,
];

// what's counted across the document as it's built
interface IContext {
    figures: IFigureSource;
    refNames: Array<string>;
    showSyntax: boolean;
    showRefs: boolean;
    nOrdered: number;  // ordered lists, each numbered from 1
}

export async function createDoc(items: Array<IDocItem>, options?: IDocOptions): Promise<ArrayBuffer> {
    options = options || {};
    const showRefs = options.showRefs ?? true;
    // when the references are hidden in the results view, they're left out
    // of the document too (the list, and the citations)
    const references = showRefs ? (options.references || []) : [];

    const context: IContext = {
        figures: options.figures || (async () => null),
        refNames: references.map((ref) => ref.name),
        showSyntax: options.showSyntax ?? false,
        showRefs,
        nOrdered: 0,
    };

    const children: Array<FileChild> = [];
    for (const item of items)
        children.push(...await populateElements(item.element, item.level ?? 1, context));

    if (references.length > 0) {
        children.push(heading('References', 1));
        references.forEach((ref, i) => {
            const runs = [ new TextRun(`[${ i + 1 }] `), ...chunkRuns(html2Chunks(referenceAsHTML(ref))) ];
            children.push(new Paragraph({ style: 'References', children: runs }));
        });
    }

    const doc = new Document({
        creator: 'jamovi',
        styles: styles(),
        numbering: numbering(),
        sections: [ {
            properties: {
                page: {
                    size: { width: PAGE_WIDTH, height: PAGE_HEIGHT },
                    margin: { top: PAGE_MARGIN, right: PAGE_MARGIN, bottom: PAGE_MARGIN, left: PAGE_MARGIN },
                },
            },
            children,
        } ],
    });

    // (not toBuffer(), which wants a node Buffer and fails in the browser)
    return await Packer.toArrayBuffer(doc);
}

// main loop: iterates through the input elements and calls itself when a
// group element has children
async function populateElements(item: IElement, level: number, context: IContext): Promise<Array<FileChild>> {
    const output: Array<FileChild> = [];

    if (item.type === 'group') {
        let childLevel = level;
        if (item.title) {
            output.push(heading(item.title, level));
            childLevel = level + 1;
        }
        for (const child of item.items)
            output.push(...await populateElements(child, childLevel, context));
    }
    else if (item.type === 'image') {
        output.push(...await generateFigure(item, context));
    }
    else if (item.type === 'table') {
        output.push(...generateTable(item, context));
    }
    else if (item.type === 'preformatted') {
        output.push(...generatePreformatted(item, level, context));
    }
    else if (item.type === 'text') {
        output.push(...generateText(item, level, context));
    }

    return output;
}

function heading(title: string, level: number): Paragraph {
    level = Math.min(Math.max(level, 1), 6);
    return new Paragraph({ heading: HEADINGS[level - 1], children: chunkRuns(html2Chunks(title)) });
}

// a table's or figure's title, above it, as in the results view
function caption(title: string | undefined): Array<Paragraph> {
    if ( ! title)
        return [];
    return [ new Paragraph({
        style: 'Caption',
        keepNext: true,
        children: chunkRuns(html2Chunks(title)),
    }) ];
}

// the "[1] [2]" reference numbers beneath an element, as the results view
// shows them: the modules/packages it was created with, numbered as in the
// reference list
function refNumbers(refs: Array<string> | undefined, context: IContext): Array<Paragraph> {
    if ( ! context.showRefs || ! refs || refs.length === 0)
        return [];
    const numbers = refs.map((name) => {
        const index = context.refNames.indexOf(name);
        return (index === -1) ? name : String(index + 1);
    });
    return [ new Paragraph({
        style: 'ReferenceNumbers',
        children: [ new TextRun(numbers.map((n) => `[${ n }]`).join(' ')) ],
    }) ];
}

async function generateFigure(figure: IImage, context: IContext): Promise<Array<FileChild>> {
    const output: Array<FileChild> = caption(figure.title);

    let data: IFigure | null = null;
    try {
        data = await context.figures(figure.address);
    }
    catch (e) {
        console.log(e);
    }

    if (data === null) {
        output.push(new Paragraph({ children: [ new TextRun('[the figure could not be exported]') ] }));
        return output;
    }

    // scale down to fit the page
    let width = (figure.width || 432) * PX_PER_PT;
    let height = (figure.height || 288) * PX_PER_PT;
    const maxWidth = TEXT_WIDTH * PX_PER_TWIP;
    const maxHeight = TEXT_HEIGHT * PX_PER_TWIP * 0.8;
    const scale = Math.min(1, maxWidth / width, maxHeight / height);
    width = Math.round(width * scale);
    height = Math.round(height * scale);

    const transformation = { width, height };
    const altText = { title: figure.title || 'Figure', description: figure.title || '', name: figure.title || 'Figure' };
    // (the library takes string data as base64, so the svg markup is encoded)
    const image = data.svg
        ? new ImageRun({ type: 'svg', data: base64(data.svg), transformation, altText, fallback: { type: 'png', data: data.png } })
        : new ImageRun({ type: 'png', data: data.png, transformation, altText });

    output.push(new Paragraph({ children: [ image ] }));
    output.push(...refNumbers(figure.refs, context));
    return output;
}

function generateTable(table: ITable, context: IContext): Array<FileChild> {
    const output: Array<FileChild> = caption(table.title);
    const nCols = Math.max(table.nCols, 1);

    const lastBody = table.rows.map((row) => row.type).lastIndexOf('body');

    const rows: Array<TableRow> = [];
    table.rows.forEach((row, i) => {
        if (row.type === 'superTitle')
            rows.push(formatSuperTitle(row));
        else if (row.type === 'title')
            rows.push(formatTitleRow(row));
        else if (row.type === 'body')
            rows.push(formatBodyRow(row, i === lastBody));
        else if (row.type === 'footnote')
            rows.push(formatNoteRow(row, nCols));
    });

    output.push(new Table({
        rows,
        columnWidths: new Array(nCols).fill(Math.floor(TEXT_WIDTH / nCols)),
        layout: TableLayoutType.AUTOFIT,
        // APA: a rule above, below the column titles, and below the body
        // (the last two are on the cells); no vertical rules
        borders: { top: RULE, bottom: NO_RULE, left: NO_RULE, right: NO_RULE, insideHorizontal: NO_RULE, insideVertical: NO_RULE },
        margins: { left: 80, right: 80 },
    }));

    // word merges adjacent tables, so they're always followed by a paragraph
    const refs = refNumbers(table.refs, context);
    output.push(...(refs.length > 0 ? refs : [ new Paragraph({ spacing: { after: 0 } }) ]));
    return output;
}

function formatSuperTitle(row: IRow): TableRow {
    const cells: Array<TableCell> = [];
    for (const cell of row.cells) {
        if (cell && cell.colSpan === 0)  // covered by the span before it
            continue;
        if (cell && cell.content)
            cells.push(tableCell(cellRuns(cell), { align: 'c', span: cell.colSpan, bottomRule: true, vAlign: 'bottom' }));
        else
            cells.push(tableCell([], {}));
    }
    return new TableRow({ children: cells });
}

function formatTitleRow(row: IRow): TableRow {
    const cells: Array<TableCell> = [];
    for (const cell of row.cells) {
        const props: ICellProps = { align: 'c', bottomRule: true, vAlign: 'bottom' };
        if ( ! cell) {
            cells.push(tableCell([], props));
            continue;
        }
        if (cell.colSpan === 0)  // covered by the span before it
            continue;
        if (cell.colSpan && cell.colSpan > 1)
            props.span = cell.colSpan;
        if (cell.rowSpan === 0) {
            // covered by a header cell spanning down from the row above
            props.vMerge = VerticalMergeType.CONTINUE;
            cells.push(tableCell([], props));
            continue;
        }
        if (cell.rowSpan && cell.rowSpan > 1)
            props.vMerge = VerticalMergeType.RESTART;
        cells.push(tableCell(cellRuns(cell), props));
    }
    // repeats the column titles when a table breaks across pages
    return new TableRow({ children: cells, tableHeader: true });
}

function formatBodyRow(row: IRow, last: boolean): TableRow {
    const cells: Array<TableCell> = [];
    for (const cell of row.cells) {
        const props: ICellProps = { bottomRule: last };
        if ( ! cell) {
            cells.push(tableCell([], props));
            continue;
        }
        if (cell.colSpan === 0)  // covered by the span before it
            continue;
        if (cell.colSpan && cell.colSpan > 1)
            props.span = cell.colSpan;
        if (cell.rowSpan === 0) {
            // covered by the cell above; merged into it
            props.vMerge = VerticalMergeType.CONTINUE;
            cells.push(tableCell([], props));
            continue;
        }
        props.align = cell.align;
        if (cell.rowSpan && cell.rowSpan > 1)
            props.vMerge = VerticalMergeType.RESTART;
        const format = cell.format || 0;
        if (format & FORMAT_INDENTED)
            props.indent = 240;
        if (format & FORMAT_BEGIN_GROUP)
            props.before = 120;
        cells.push(tableCell(cellRuns(cell), props));
    }
    return new TableRow({ children: cells });
}

function formatNoteRow(row: IRow, nCols: number): TableRow {
    const runs: Array<ParagraphChild> = [];
    const small = { size: 18 };
    for (const cell of row.cells) {
        if ( ! cell || ! cell.content)
            continue;
        if (cell.sups && cell.sups[0] === 'note')
            runs.push(new TextRun({ text: 'Note. ', italics: true, ...small }));
        else if (cell.sups && cell.sups.length > 0)
            runs.push(...chunkRuns(html2Chunks(cell.sups.join('')), small), new TextRun({ text: ' ', ...small }));
        runs.push(...chunkRuns(cell.chunks, small));
    }
    return new TableRow({ children: [ tableCell(runs, { align: 'l', span: nCols, style: 'TableNote' }) ] });
}

interface ICellProps {
    align?: string;
    span?: number;
    vMerge?: (typeof VerticalMergeType)[keyof typeof VerticalMergeType];
    bottomRule?: boolean;
    vAlign?: 'top' | 'bottom';
    indent?: number;
    before?: number;
    style?: string;
}

function tableCell(runs: Array<ParagraphChild>, props: ICellProps): TableCell {
    const paragraph: IParagraphOptions = { style: props.style || 'TableText', children: runs };
    if (props.align)
        Object.assign(paragraph, { alignment: alignment(props.align) });
    if (props.indent)
        Object.assign(paragraph, { indent: { left: props.indent } });
    if (props.before)
        Object.assign(paragraph, { spacing: { before: props.before } });

    return new TableCell({
        children: [ new Paragraph(paragraph) ],
        columnSpan: (props.span && props.span > 1) ? props.span : undefined,
        verticalMerge: props.vMerge,
        verticalAlign: props.vAlign === 'bottom' ? VerticalAlign.BOTTOM : VerticalAlign.TOP,
        borders: props.bottomRule ? { bottom: RULE } : undefined,
    });
}

// a cell's content, with its footnote markers and symbols. both are used
// exactly as hydrate.ts gives them -- a footnote's already '<sup>a</sup>',
// and a symbol's already whatever it needs to be, plain ('*') or its own
// markup ('<sup>μ</sup>') -- so there's nothing to add here (cf.
// resultsview/table.ts, which likewise appends cell.sups as given)
function cellRuns(cell: ICell): Array<ParagraphChild> {
    const runs = chunkRuns(cell.chunks);
    if (cell.sups && cell.sups.length > 0)
        runs.push(...chunkRuns(html2Chunks(cell.sups.join(''))));
    return runs;
}

function generatePreformatted(preformatted: IPreformatted, level: number, context: IContext): Array<FileChild> {
    const output: Array<FileChild> = [];

    if (preformatted.syntax && ! context.showSyntax)
        return output;

    if (preformatted.title)
        output.push(heading(preformatted.title, level));
    for (const line of (preformatted.content || '').split('\n'))
        output.push(new Paragraph({ style: 'Preformatted', children: [ new TextRun({ text: line, font: MONO }) ] }));
    output.push(new Paragraph({ spacing: { after: 0 } }));
    output.push(...refNumbers(preformatted.refs, context));

    return output;
}

// formatted text (annotations, notices, html/text elements)
function generateText(text: IText, level: number, context: IContext): Array<FileChild> {
    const output: Array<FileChild> = [];
    const box = text.box ? boxProps(text.box) : {};

    // a notice's title sits inside its box
    if (text.title)
        output.push(new Paragraph({ ...box, children: [ new TextRun({ text: text.title, bold: true }) ] }));

    let ordered = -1;  // the current ordered list's instance

    for (const paragraph of text.paragraphs) {
        const attrs = paragraph.attributes || {};
        const props: IParagraphOptions = { ...box, children: chunkRuns(paragraph.chunks) };

        if (attrs.header)
            Object.assign(props, { heading: HEADINGS[Math.min(level + attrs.header - 1, 6) - 1] });
        else if (attrs.codeBlock)
            Object.assign(props, { style: 'Preformatted' });
        if (attrs.align)
            Object.assign(props, { alignment: alignment(attrs.align) });

        if (attrs.list) {
            Object.assign(props, { spacing: { after: 60 }, contextualSpacing: true });
            if (attrs.list === 'ordered') {
                if (ordered === -1)
                    ordered = context.nOrdered++;
                Object.assign(props, { numbering: { reference: 'ordered', instance: ordered, level: Math.min(attrs.indent || 0, 8) } });
            }
            else {
                Object.assign(props, { numbering: { reference: 'bullets', level: Math.min(attrs.indent || 0, 8) } });
            }
        }
        else {
            // a paragraph outside the list ends it; the next one restarts at 1
            ordered = -1;
            if (attrs.indent)
                Object.assign(props, { indent: { left: attrs.indent * 720 } });
        }

        output.push(new Paragraph(props));
    }

    output.push(...refNumbers(text.refs, context));
    return output;
}

function boxProps(box: number): IParagraphOptions {
    const color = BOX_COLORS[box - 1] || BOX_COLORS[0];
    const fill = BOX_FILLS[box - 1] || BOX_FILLS[0];
    return {
        border: { left: { style: BorderStyle.SINGLE, size: 24, space: 8, color } },
        shading: { type: ShadingType.CLEAR, color: 'auto', fill },
    };
}

function alignment(align: string): (typeof AlignmentType)[keyof typeof AlignmentType] | undefined {
    switch (align) {
        case 'l': case 'left': return AlignmentType.LEFT;
        case 'c': case 'center': return AlignmentType.CENTER;
        case 'r': case 'right': return AlignmentType.RIGHT;
        case 'justify': return AlignmentType.JUSTIFIED;
    }
    return undefined;
}

// chunks as runs, optionally with properties applied throughout
function chunkRuns(chunks: Array<ITextChunk>, base: IRunOptions = {}): Array<ParagraphChild> {
    return chunks.map((chunk) => {
        const attrs = chunk.attributes || {};
        const props: IRunOptions = { ...base, text: chunk.content };
        if (attrs.bold)
            Object.assign(props, { bold: true });
        if (attrs.italic || attrs.formula)
            Object.assign(props, { italics: true });
        if (attrs.underline)
            Object.assign(props, { underline: {} });
        if (attrs.strike)
            Object.assign(props, { strike: true });
        if (attrs.code)
            Object.assign(props, { font: MONO });
        else if (attrs.formula)
            Object.assign(props, { font: 'Cambria Math' });
        if (attrs.script === 'super')
            Object.assign(props, { superScript: true });
        else if (attrs.script === 'sub')
            Object.assign(props, { subScript: true });
        const color = hexColor(attrs.color);
        if (color)
            Object.assign(props, { color });
        const background = hexColor(attrs.background);
        if (background)
            Object.assign(props, { shading: { type: ShadingType.CLEAR, color: 'auto', fill: background } });

        if (attrs.link)
            return new ExternalHyperlink({ link: attrs.link, children: [ new TextRun({ ...props, style: 'Hyperlink' }) ] });
        return new TextRun(props);
    });
}

// utf-8 text as base64
function base64(text: string): string {
    return btoa(String.fromCharCode(...new TextEncoder().encode(text)));
}

function hexColor(color?: string): string | undefined {
    if ( ! color)
        return undefined;
    const m = color.match(/^#?([0-9a-fA-F]{6})$/);
    return m ? m[1].toUpperCase() : undefined;
}

function styles() {
    const heading = (id: string, name: string, size: number, before: number, italics = false) => ({
        id, name, basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { bold: true, italics, size, font: FONT },
        paragraph: { keepNext: true, keepLines: true, spacing: { before, after: 120 } },
    });

    return {
        default: {
            document: { run: { font: FONT, size: 22 }, paragraph: { spacing: { after: 160, line: 276 } } },
            heading1: heading('Heading1', 'heading 1', 32, 480),
            heading2: heading('Heading2', 'heading 2', 28, 360),
            heading3: heading('Heading3', 'heading 3', 26, 240),
            heading4: heading('Heading4', 'heading 4', 24, 240, true),
            heading5: heading('Heading5', 'heading 5', 24, 200),
            heading6: heading('Heading6', 'heading 6', 24, 200, true),
            hyperlink: { run: { color: '0563C1', underline: {} } },
        },
        paragraphStyles: [
            { id: 'Caption', name: 'caption', basedOn: 'Normal',
              run: { bold: true }, paragraph: { keepNext: true, spacing: { before: 240, after: 120 } } },
            { id: 'ReferenceNumbers', name: 'Reference Numbers', basedOn: 'Normal',
              run: { bold: true, size: 18 }, paragraph: { alignment: AlignmentType.RIGHT, spacing: { before: 0, after: 120 } } },
            { id: 'TableText', name: 'Table Text', basedOn: 'Normal',
              run: { size: 20 }, paragraph: { spacing: { before: 40, after: 40, line: 240 } } },
            { id: 'TableNote', name: 'Table Note', basedOn: 'Normal',
              run: { size: 18 }, paragraph: { spacing: { before: 60, after: 0, line: 240 } } },
            { id: 'Preformatted', name: 'Preformatted Text', basedOn: 'Normal',
              run: { font: MONO, size: 20 }, paragraph: { spacing: { after: 0, line: 240 } } },
            { id: 'References', name: 'References', basedOn: 'Normal',
              paragraph: { indent: { left: 720, hanging: 720 } } },
        ],
    };
}

function numbering() {
    const bullets = [ '•', '◦', '▪' ];
    const formats = [ LevelFormat.DECIMAL, LevelFormat.LOWER_LETTER, LevelFormat.LOWER_ROMAN ];

    const level = (i: number, format: (typeof LevelFormat)[keyof typeof LevelFormat], text: string) => ({
        level: i,
        format,
        text,
        alignment: AlignmentType.LEFT,
        style: { paragraph: { indent: { left: 720 * (i + 1), hanging: 360 } } },
    });

    return {
        config: [
            { reference: 'bullets', levels: [ 0, 1, 2, 3, 4, 5, 6, 7, 8 ].map((i) => level(i, LevelFormat.BULLET, bullets[i % 3])) },
            // each ordered list is a separate instance of this, so numbers from 1
            { reference: 'ordered', levels: [ 0, 1, 2, 3, 4, 5, 6, 7, 8 ].map((i) => level(i, formats[i % 3], `%${ i + 1 }.`)) },
        ],
    };
}
