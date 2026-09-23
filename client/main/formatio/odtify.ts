
// converts hydrated results (see hydrate.ts) into an OpenDocument Text
// (.odt) document, for LibreOffice/OpenOffice. this is the .odt counterpart
// to docxify.ts: the same IDocItem/IDocOptions shape, the same figures
// callback, the same 'agrees on what's produced' pipeline (see hydrate.ts's
// file header) -- only the markup differs (ODF rather than OOXML), so this
// is deliberately structured as a close, function-for-function port of
// docxify.ts, to keep the two easy to diff against each other
//
// unlike docx, an ODT package needs no schema-provided builder here: the
// content is built directly as ODF xml, zipped up with jszip (already a
// transitive dependency of the docx package). there's no dedicated ODF
// library pulled in, so -- like docxify.ts -- this is loaded on demand
// (see resultspanel's getAsOdt())
//
// a vector plot is embedded as its png rather than its svg (unlike
// docxify.ts, which prefers the svg with the png as fallback): ODF has no
// equivalent of OOXML's alternate-content fallback, and LibreOffice's own
// svg support is inconsistent enough that a raster image is the safer
// choice across viewers

import JSZip from 'jszip';

import { IElement } from './hydrate';
import { IImage } from './hydrate';
import { ITable } from './hydrate';
import { IRow } from './hydrate';
import { ICell } from './hydrate';
import { IPreformatted } from './hydrate';
import { IText } from './hydrate';
import { ITextChunk } from './hydrate';
import { IChunkAttributes } from './hydrate';
import { html2Chunks } from './hydrate';
import { referenceAsHTML } from '../references';

import type { IDocItem, IDocOptions, IFigure, IFigureSource } from './docxify';
export type { IDocItem, IDocOptions, IFigure, IFigureSource };

// page geometry: A4 with 2.54cm (1in, 72pt) margins -- ODF lengths take a
// unit suffix directly, so everything here is kept in points, the same
// scale docxify.ts's twips/half-points ultimately reduce to
const PAGE_WIDTH_PT = 595.3;
const PAGE_HEIGHT_PT = 841.9;
const MARGIN_PT = 72;
const TEXT_WIDTH_PT = PAGE_WIDTH_PT - 2 * MARGIN_PT;
const TEXT_HEIGHT_PT = PAGE_HEIGHT_PT - 2 * MARGIN_PT;

// cell format flags, see resultsview/table.ts
const FORMAT_BEGIN_GROUP = 1;
const FORMAT_INDENTED = 8;

// message box types, cf. resultsview/notice.ts
// 1: 'warning-1', 2: 'warning-2', 3: 'info', 4: 'error'
const BOX_COLORS = [ 'A6A6A6', 'F5A623', '3E6DA9', 'DD0000' ];
const BOX_FILLS  = [ 'F2F2F2', 'FDF3E4', 'E8EEF8', 'FBE9E9' ];

const MONO = 'Consolas';

// a pool of automatic styles, keyed by a signature of the properties they
// represent, so the same combination (e.g. 'bold') is only ever declared
// once, however many chunks/cells ask for it
interface IStylePool {
    prefix: string;
    n: number;
    cache: Map<string, string>;
    defs: Array<string>;
}

function newPool(prefix: string): IStylePool {
    return { prefix, n: 0, cache: new Map(), defs: [] };
}

// the style with this signature, allocating (and collecting the xml for)
// a new one on first request
function styleId(pool: IStylePool, signature: string, build: (id: string) => string): string {
    let id = pool.cache.get(signature);
    if (id === undefined) {
        id = `${ pool.prefix }${ ++pool.n }`;
        pool.cache.set(signature, id);
        pool.defs.push(build(id));
    }
    return id;
}

// what's counted across the document as it's built
interface IContext {
    figures: IFigureSource;
    refNames: Array<string>;
    showSyntax: boolean;
    showRefs: boolean;
    paraStyles: IStylePool;
    textStyles: IStylePool;
    cellStyles: IStylePool;
    tableN: number;
    frameN: number;
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
        paraStyles: newPool('P'),
        textStyles: newPool('T'),
        cellStyles: newPool('TC'),
        tableN: 0,
        frameN: 0,
    };

    const body: Array<string> = [];
    for (const item of items)
        body.push(...await populateElements(item.element, item.level ?? 1, context));

    if (references.length > 0) {
        body.push(heading('References', 1, context));
        references.forEach((ref, i) => {
            const inner = `[${ i + 1 }] ` + chunksXml(html2Chunks(referenceAsHTML(ref)), context);
            body.push(`<text:p text:style-name="References">${ inner }</text:p>`);
        });
    }

    const automaticStyles = [ ...context.paraStyles.defs, ...context.textStyles.defs, ...context.cellStyles.defs ].join('');
    const contentXml = buildContentXml(automaticStyles, body.join(''));

    const zip = new JSZip();
    // the mimetype entry must be first, and stored (not deflated) -- it's
    // how a bare file-type sniff recognises an ODF package
    zip.file('mimetype', 'application/vnd.oasis.opendocument.text', { compression: 'STORE' });
    zip.file('META-INF/manifest.xml', MANIFEST_XML);
    zip.file('meta.xml', META_XML);
    zip.file('styles.xml', STYLES_XML);
    zip.file('content.xml', contentXml);

    return await zip.generateAsync({ type: 'arraybuffer' });
}

// main loop: iterates through the input elements and calls itself when a
// group element has children
async function populateElements(item: IElement, level: number, context: IContext): Promise<Array<string>> {
    const output: Array<string> = [];

    if (item.type === 'group') {
        let childLevel = level;
        if (item.title) {
            output.push(heading(item.title, level, context));
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

function heading(title: string, level: number, context: IContext): string {
    level = Math.min(Math.max(level, 1), 6);
    return `<text:h text:style-name="Heading_${ level }" text:outline-level="${ level }">${ chunksXml(html2Chunks(title), context) }</text:h>`;
}

// a table's or figure's title, above it, as in the results view
function caption(title: string | undefined, context: IContext): Array<string> {
    if ( ! title)
        return [];
    return [ `<text:p text:style-name="Caption">${ chunksXml(html2Chunks(title), context) }</text:p>` ];
}

// the "[1] [2]" reference numbers beneath an element, as the results view
// shows them: the modules/packages it was created with, numbered as in the
// reference list
function refNumbers(refs: Array<string> | undefined, context: IContext): Array<string> {
    if ( ! context.showRefs || ! refs || refs.length === 0)
        return [];
    const numbers = refs.map((name) => {
        const index = context.refNames.indexOf(name);
        return (index === -1) ? name : String(index + 1);
    });
    return [ `<text:p text:style-name="ReferenceNumbers">${ textContent(numbers.map((n) => `[${ n }]`).join(' ')) }</text:p>` ];
}

async function generateFigure(figure: IImage, context: IContext): Promise<Array<string>> {
    const output: Array<string> = caption(figure.title, context);

    let data: IFigure | null = null;
    try {
        data = await context.figures(figure.address);
    }
    catch (e) {
        console.log(e);
    }

    if (data === null) {
        output.push(`<text:p>${ textContent('[the figure could not be exported]') }</text:p>`);
        return output;
    }

    // scale down to fit the page (figure.width/height are already in pt)
    let width = figure.width || 432;
    let height = figure.height || 288;
    const maxWidth = TEXT_WIDTH_PT;
    const maxHeight = TEXT_HEIGHT_PT * 0.8;
    const scale = Math.min(1, maxWidth / width, maxHeight / height);
    width = round2(width * scale);
    height = round2(height * scale);

    const name = escAttr(figure.title || 'Figure') + ' ' + ( ++context.frameN );
    const frame = `<draw:frame text:anchor-type="as-char" draw:style-name="Fr" draw:name="${ name }" svg:width="${ width }pt" svg:height="${ height }pt">` +
        `<draw:image xlink:href="" xlink:type="simple" xlink:show="embed" xlink:actuate="onLoad"><office:binary-data>${ base64Bytes(data.png) }</office:binary-data></draw:image></draw:frame>`;

    output.push(`<text:p>${ frame }</text:p>`);
    output.push(...refNumbers(figure.refs, context));
    return output;
}

function generateTable(table: ITable, context: IContext): Array<string> {
    const output: Array<string> = caption(table.title, context);
    const nCols = Math.max(table.nCols, 1);
    const lastBody = table.rows.map((row) => row.type).lastIndexOf('body');

    // ODF has no table-wide border, unlike OOXML -- the rule above the
    // table is drawn by giving every cell of the first row a top border
    let isFirstRow = true;

    const headerRowsXml: Array<string> = [];
    const bodyRowsXml: Array<string> = [];
    table.rows.forEach((row, i) => {
        const topRule = isFirstRow;
        isFirstRow = false;
        if (row.type === 'superTitle')
            headerRowsXml.push(superTitleRowXml(row, context, topRule));
        else if (row.type === 'title')
            headerRowsXml.push(titleRowXml(row, context, topRule));
        else if (row.type === 'body')
            bodyRowsXml.push(bodyRowXml(row, i === lastBody, context, topRule));
        else if (row.type === 'footnote')
            bodyRowsXml.push(noteRowXml(row, nCols, context, topRule));
    });

    const colsXml = new Array(nCols).fill('<table:table-column table:style-name="TableColumn"/>').join('');
    // repeats the column titles when a table breaks across pages
    const headerXml = headerRowsXml.length > 0 ? `<table:table-header-rows>${ headerRowsXml.join('') }</table:table-header-rows>` : '';
    output.push(`<table:table table:name="Table${ ++context.tableN }" table:style-name="TableGrid">${ colsXml }${ headerXml }${ bodyRowsXml.join('') }</table:table>`);

    // a spacer paragraph, so a table is never the last thing in its parent
    const refs = refNumbers(table.refs, context);
    output.push(...(refs.length > 0 ? refs : [ '<text:p/>' ]));
    return output;
}

interface ICellProps {
    align?: string;
    span?: number;
    rowSpanCount?: number;
    covered?: boolean;
    bottomRule?: boolean;
    heavy?: boolean;  // the bottom rule is the heavier one, beneath the body (cf. resultsview/main.css)
    topRule?: boolean;
    vAlign?: 'top' | 'bottom';
    indent?: boolean;
    before?: boolean;
    paraStyle?: string;
}

function superTitleRowXml(row: IRow, context: IContext, topRule: boolean): string {
    const cellsXml: Array<string> = [];
    for (const cell of row.cells) {
        if (cell && cell.colSpan === 0)  // covered by the span before it
            continue;
        if (cell && cell.content)
            cellsXml.push(tableCellXml(cellContentXml(cell, context), { align: 'c', span: cell.colSpan, bottomRule: true, topRule, vAlign: 'bottom' }, context));
        else
            cellsXml.push(tableCellXml('', { topRule }, context));
    }
    return `<table:table-row>${ cellsXml.join('') }</table:table-row>`;
}

function titleRowXml(row: IRow, context: IContext, topRule: boolean): string {
    const cellsXml: Array<string> = [];
    for (const cell of row.cells) {
        const props: ICellProps = { align: 'c', bottomRule: true, vAlign: 'bottom', topRule };
        if ( ! cell) {
            cellsXml.push(tableCellXml('', props, context));
            continue;
        }
        if (cell.colSpan === 0)  // covered by the span before it
            continue;
        if (cell.colSpan && cell.colSpan > 1)
            props.span = cell.colSpan;
        if (cell.rowSpan === 0) {
            // covered by a header cell spanning down from the row above
            cellsXml.push(tableCellXml('', { ...props, covered: true }, context));
            continue;
        }
        if (cell.rowSpan && cell.rowSpan > 1)
            props.rowSpanCount = cell.rowSpan;
        cellsXml.push(tableCellXml(cellContentXml(cell, context), props, context));
    }
    return `<table:table-row>${ cellsXml.join('') }</table:table-row>`;
}

function bodyRowXml(row: IRow, last: boolean, context: IContext, topRule: boolean): string {
    const cellsXml: Array<string> = [];
    for (const cell of row.cells) {
        const props: ICellProps = { bottomRule: last, heavy: true, topRule };
        if ( ! cell) {
            cellsXml.push(tableCellXml('', props, context));
            continue;
        }
        if (cell.colSpan === 0)  // covered by the span before it
            continue;
        if (cell.colSpan && cell.colSpan > 1)
            props.span = cell.colSpan;
        if (cell.rowSpan === 0) {
            // covered by the cell above; merged into it
            cellsXml.push(tableCellXml('', { ...props, covered: true }, context));
            continue;
        }
        props.align = cell.align;
        if (cell.rowSpan && cell.rowSpan > 1)
            props.rowSpanCount = cell.rowSpan;
        const format = cell.format || 0;
        if (format & FORMAT_INDENTED)
            props.indent = true;
        if (format & FORMAT_BEGIN_GROUP)
            props.before = true;
        cellsXml.push(tableCellXml(cellContentXml(cell, context), props, context));
    }
    return `<table:table-row>${ cellsXml.join('') }</table:table-row>`;
}

function noteRowXml(row: IRow, nCols: number, context: IContext, topRule: boolean): string {
    let inner = '';
    for (const cell of row.cells) {
        if ( ! cell || ! cell.content)
            continue;
        if (cell.sups && cell.sups[0] === 'note')
            inner += italicSpanXml('Note. ', context);
        else if (cell.sups && cell.sups.length > 0)
            inner += chunksXml(html2Chunks(cell.sups.join('')), context) + ' ';
        inner += chunksXml(cell.chunks, context);
    }
    const props: ICellProps = { align: 'l', span: nCols, paraStyle: 'TableNote', topRule };
    return `<table:table-row>${ tableCellXml(inner, props, context) }</table:table-row>`;
}

function tableCellXml(innerXml: string, props: ICellProps, context: IContext): string {
    if (props.covered)
        return `<table:covered-table-cell${ props.span && props.span > 1 ? ` table:number-columns-repeated="${ props.span }"` : '' }/>`;

    const attrs = [ `table:style-name="${ cellStyleId(context, props) }"` ];
    if (props.span && props.span > 1)
        attrs.push(`table:number-columns-spanned="${ props.span }"`);
    if (props.rowSpanCount && props.rowSpanCount > 1)
        attrs.push(`table:number-rows-spanned="${ props.rowSpanCount }"`);

    const pStyle = paragraphStyleFor(context, props.paraStyle || 'TableText', {
        align: props.align,
        marginLeftPt: props.indent ? 12 : undefined,
        marginTopPt: props.before ? 6 : undefined,
    });
    return `<table:table-cell ${ attrs.join(' ') }><text:p text:style-name="${ pStyle }">${ innerXml }</text:p></table:table-cell>`;
}

function cellStyleId(context: IContext, props: ICellProps): string {
    const sig = `${ props.topRule ? 1 : 0 }${ props.bottomRule ? 1 : 0 }${ props.heavy ? 1 : 0 }${ props.vAlign === 'bottom' ? 1 : 0 }`;
    return styleId(context.cellStyles, sig, (id) => {
        const borders: Array<string> = [];
        if (props.topRule)
            borders.push('fo:border-top="1pt solid #000000"');
        if (props.bottomRule)
            borders.push(`fo:border-bottom="${ props.heavy ? 2 : 1 }pt solid #000000"`);
        const vAlign = props.vAlign === 'bottom' ? 'bottom' : 'top';
        return `<style:style style:name="${ id }" style:family="table-cell"><style:table-cell-properties fo:padding-left="4pt" fo:padding-right="4pt" fo:padding-top="1pt" fo:padding-bottom="1pt" style:vertical-align="${ vAlign }" ${ borders.join(' ') }/></style:style>`;
    });
}

// a cell's content, with its footnote markers and symbols. both are used
// exactly as hydrate.ts gives them -- a footnote's already '<sup>a</sup>',
// and a symbol's already whatever it needs to be, plain ('*') or its own
// markup ('<sup>μ</sup>') -- so there's nothing to add here (cf.
// resultsview/table.ts, which likewise appends cell.sups as given)
function cellContentXml(cell: ICell, context: IContext): string {
    let xml = chunksXml(cell.chunks, context);
    if (cell.sups && cell.sups.length > 0)
        xml += chunksXml(html2Chunks(cell.sups.join('')), context);
    return xml;
}

function generatePreformatted(preformatted: IPreformatted, level: number, context: IContext): Array<string> {
    const output: Array<string> = [];

    if (preformatted.syntax && ! context.showSyntax)
        return output;

    if (preformatted.title)
        output.push(heading(preformatted.title, level, context));
    for (const line of (preformatted.content || '').split('\n'))
        output.push(`<text:p text:style-name="Preformatted">${ textContent(line) }</text:p>`);
    output.push('<text:p/>');
    output.push(...refNumbers(preformatted.refs, context));

    return output;
}

// a run of consecutive list paragraphs, gathered so they can be nested by
// indent level into proper <text:list> markup (see renderList())
interface IListItem {
    indent: number;
    styleName: string;
    xml: string;
}

// formatted text (annotations, notices, html/text elements)
function generateText(text: IText, level: number, context: IContext): Array<string> {
    const output: Array<string> = [];
    const box = text.box ? `Notice${ Math.min(Math.max(text.box, 1), 4) }` : undefined;

    // a notice's title sits inside its box
    if (text.title)
        output.push(`<text:p${ box ? ` text:style-name="${ box }"` : '' }>${ boldChunkXml(text.title, context) }</text:p>`);

    let pendingList: Array<IListItem> = [];
    const flushList = () => {
        if (pendingList.length > 0)
            output.push(renderList(pendingList));
        pendingList = [];
    };

    for (const paragraph of text.paragraphs) {
        const attrs = paragraph.attributes || {};

        if (attrs.list) {
            pendingList.push({
                indent: Math.min(attrs.indent || 0, 8),
                styleName: attrs.list === 'ordered' ? 'ListNumber' : 'ListBullet',
                xml: `<text:p>${ chunksXml(paragraph.chunks, context) }</text:p>`,
            });
            continue;
        }
        // a paragraph outside the list ends it; the next one restarts at 1
        flushList();

        if (attrs.header) {
            const headingLevel = Math.min(level + attrs.header - 1, 6);
            const base = `Heading_${ headingLevel }`;
            const styleName = attrs.align ? paragraphStyleFor(context, base, { align: attrs.align }) : base;
            output.push(`<text:h text:style-name="${ styleName }" text:outline-level="${ headingLevel }">${ chunksXml(paragraph.chunks, context) }</text:h>`);
            continue;
        }

        const base = attrs.codeBlock ? 'Preformatted' : (box || 'Standard');
        const styleName = paragraphStyleFor(context, base, {
            align: attrs.align,
            marginLeftPt: attrs.indent ? attrs.indent * 36 : undefined,
        });
        output.push(`<text:p text:style-name="${ styleName }">${ chunksXml(paragraph.chunks, context) }</text:p>`);
    }

    flushList();
    output.push(...refNumbers(text.refs, context));
    return output;
}

// a list item, once nested under its parent by indent level (see renderList())
interface IListNode {
    xml: string;
    styleName: string;
    children: Array<IListNode>;
}

// turns a flat run of list items (each carrying its indent level) into
// properly nested <text:list>/<text:list-item> markup. a change of list
// style (bullet vs ordered) at the same depth starts a fresh <text:list>,
// which in ODF is exactly what restarts its numbering at 1 -- unlike
// docxify.ts, no separate numbering instance needs to be minted for that
function renderList(items: Array<IListItem>): string {
    const roots: Array<IListNode> = [];
    const levels: Array<IListNode | undefined> = [];

    for (const item of items) {
        const node: IListNode = { xml: item.xml, styleName: item.styleName, children: [] };
        const parent = item.indent > 0 ? levels[item.indent - 1] : undefined;
        if (parent)
            parent.children.push(node);
        else
            roots.push(node);
        levels[item.indent] = node;
        levels.length = item.indent + 1;
    }

    return renderListNodes(roots);
}

function renderListNodes(nodes: Array<IListNode>): string {
    const blocks: Array<string> = [];
    let i = 0;
    while (i < nodes.length) {
        const styleName = nodes[i].styleName;
        const listItems: Array<string> = [];
        while (i < nodes.length && nodes[i].styleName === styleName) {
            listItems.push(`<text:list-item>${ nodes[i].xml }${ renderListNodes(nodes[i].children) }</text:list-item>`);
            i++;
        }
        blocks.push(`<text:list text:style-name="${ styleName }">${ listItems.join('') }</text:list>`);
    }
    return blocks.join('');
}

function boldChunkXml(text: string, context: IContext): string {
    const id = styleId(context.textStyles, propsSignature({ bold: true }), (id) => textStyleXml(id, { bold: true }));
    return `<text:span text:style-name="${ id }">${ textContent(text) }</text:span>`;
}

function italicSpanXml(text: string, context: IContext): string {
    const id = styleId(context.textStyles, propsSignature({ italic: true }), (id) => textStyleXml(id, { italic: true }));
    return `<text:span text:style-name="${ id }">${ textContent(text) }</text:span>`;
}

function alignOf(align?: string): string | undefined {
    switch (align) {
        case 'l': case 'left': return 'start';
        case 'c': case 'center': return 'center';
        case 'r': case 'right': return 'end';
        case 'justify': return 'justify';
    }
    return undefined;
}

// an automatic paragraph style for a base (named) style plus per-instance
// overrides -- reused (via the pool) whenever the same base/overrides
// combination comes up again, and skipped entirely when there's nothing to
// override, so the common case just uses the named style directly
function paragraphStyleFor(context: IContext, base: string, opts: { align?: string; marginLeftPt?: number; marginTopPt?: number }): string {
    const align = alignOf(opts.align);
    const marginLeft = opts.marginLeftPt ? round2(opts.marginLeftPt) : 0;
    const marginTop = opts.marginTopPt ? round2(opts.marginTopPt) : 0;
    if ( ! align && ! marginLeft && ! marginTop)
        return base;

    const sig = `p:${ base }:${ align || '' }:${ marginLeft }:${ marginTop }`;
    return styleId(context.paraStyles, sig, (id) => {
        const props: Array<string> = [];
        if (align)
            props.push(`fo:text-align="${ align }"`);
        if (marginLeft)
            props.push(`fo:margin-left="${ marginLeft }pt"`);
        if (marginTop)
            props.push(`fo:margin-top="${ marginTop }pt"`);
        return `<style:style style:name="${ id }" style:family="paragraph" style:parent-style-name="${ base }"><style:paragraph-properties ${ props.join(' ') }/></style:style>`;
    });
}

// chunks as inline xml: text with a <text:span> (and an automatic character
// style) only where a chunk actually carries formatting, so plain text stays
// plain text
function chunksXml(chunks: Array<ITextChunk>, context: IContext): string {
    return chunks.map((chunk) => chunkXml(chunk, context)).join('');
}

interface IRunProps {
    bold?: boolean;
    italic?: boolean;
    underline?: boolean;
    strike?: boolean;
    superscript?: boolean;
    subscript?: boolean;
    fontName?: string;
    color?: string;
    background?: string;
}

function chunkProps(attrs: IChunkAttributes): IRunProps {
    const props: IRunProps = {};
    if (attrs.bold)
        props.bold = true;
    if (attrs.italic || attrs.formula)
        props.italic = true;
    if (attrs.underline)
        props.underline = true;
    if (attrs.strike)
        props.strike = true;
    if (attrs.script === 'super')
        props.superscript = true;
    else if (attrs.script === 'sub')
        props.subscript = true;
    if (attrs.code)
        props.fontName = MONO;
    else if (attrs.formula)
        props.fontName = 'Cambria Math';
    const color = hexColor(attrs.color);
    if (color)
        props.color = color;
    const background = hexColor(attrs.background);
    if (background)
        props.background = background;
    return props;
}

function propsSignature(props: IRunProps): string {
    return JSON.stringify(props);
}

function textStyleXml(id: string, props: IRunProps, parent?: string): string {
    const tp: Array<string> = [];
    if (props.bold)
        tp.push('fo:font-weight="bold" style:font-weight-asian="bold" style:font-weight-complex="bold"');
    if (props.italic)
        tp.push('fo:font-style="italic" style:font-style-asian="italic" style:font-style-complex="italic"');
    if (props.underline)
        tp.push('style:text-underline-style="solid" style:text-underline-width="auto" style:text-underline-color="font-color"');
    if (props.strike)
        tp.push('style:text-line-through-style="solid" style:text-line-through-type="single"');
    if (props.superscript)
        tp.push('style:text-position="super 58%"');
    if (props.subscript)
        tp.push('style:text-position="sub 58%"');
    if (props.fontName)
        tp.push(`style:font-name="${ escAttr(props.fontName) }"`);
    if (props.color)
        tp.push(`fo:color="#${ props.color }"`);
    if (props.background)
        tp.push(`fo:background-color="#${ props.background }"`);
    const parentAttr = parent ? ` style:parent-style-name="${ parent }"` : '';
    return `<style:style style:name="${ id }" style:family="text"${ parentAttr }><style:text-properties ${ tp.join(' ') }/></style:style>`;
}

function chunkXml(chunk: ITextChunk, context: IContext): string {
    const attrs = chunk.attributes || {};
    const props = chunkProps(attrs);
    const body = textContent(chunk.content);

    if (attrs.link) {
        const id = styleId(context.textStyles, 'link:' + propsSignature(props), (id) => textStyleXml(id, props, 'Internet_Link'));
        return `<text:a xlink:href="${ escAttr(attrs.link) }" xlink:type="simple" text:style-name="${ id }">${ body }</text:a>`;
    }
    if (Object.keys(props).length === 0)
        return body;
    const id = styleId(context.textStyles, propsSignature(props), (id) => textStyleXml(id, props));
    return `<text:span text:style-name="${ id }">${ body }</text:span>`;
}

// utf-8 bytes as base64, chunked so a large image doesn't overflow the call
// stack via String.fromCharCode(...bytes)
function base64Bytes(data: Uint8Array | ArrayBuffer): string {
    const bytes = (data instanceof Uint8Array) ? data : new Uint8Array(data);
    const CHUNK = 0x8000;
    let binary = '';
    for (let i = 0; i < bytes.length; i += CHUNK)
        binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
    return btoa(binary);
}

function hexColor(color?: string): string | undefined {
    if ( ! color)
        return undefined;
    const m = color.match(/^#?([0-9a-fA-F]{6})$/);
    return m ? m[1].toUpperCase() : undefined;
}

function round2(n: number): number {
    return Math.round(n * 100) / 100;
}

// escapes text for use between xml tags
function esc(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// escapes text for use inside an xml attribute value
function escAttr(s: string): string {
    return esc(s).replace(/"/g, '&quot;');
}

// text content, escaped, with runs of spaces and tabs turned into the
// explicit elements ODF needs to keep them from collapsing (cf. OOXML's
// xml:space="preserve", which does this for free)
function textContent(s: string): string {
    return esc(s)
        .replace(/\t/g, '<text:tab/>')
        .replace(/ {2,}/g, (run) => `<text:s text:c="${ run.length }"/>`);
}

function buildContentXml(automaticStyles: string, bodyXml: string): string {
    return '<?xml version="1.0" encoding="UTF-8"?>\n' +
        '<office:document-content ' + NAMESPACES + ' office:version="1.3">' +
        `<office:font-face-decls>${ FONT_FACE_DECLS }</office:font-face-decls>` +
        `<office:automatic-styles>${ automaticStyles }</office:automatic-styles>` +
        `<office:body><office:text>${ bodyXml }</office:text></office:body>` +
        '</office:document-content>';
}

const NAMESPACES = 'xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" ' +
    'xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" ' +
    'xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" ' +
    'xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0" ' +
    'xmlns:draw="urn:oasis:names:tc:opendocument:xmlns:drawing:1.0" ' +
    'xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0" ' +
    'xmlns:xlink="http://www.w3.org/1999/xlink" ' +
    'xmlns:svg="urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0"';

// calibri/consolas: on every office install, and sans-serif like the results
// view (aptos, word's newer default, isn't on older installs)
const FONT_FACE_DECLS = '<style:font-face style:name="Calibri" svg:font-family="Calibri"/>' +
    '<style:font-face style:name="Consolas" svg:font-family="Consolas"/>' +
    '<style:font-face style:name="Cambria Math" svg:font-family="Cambria Math"/>';

function headingStyleXml(level: number, size: number, before: number, italic: boolean): string {
    const italicProps = italic ? ' fo:font-style="italic" style:font-style-asian="italic" style:font-style-complex="italic"' : '';
    return `<style:style style:name="Heading_${ level }" style:display-name="Heading ${ level }" style:family="paragraph" style:parent-style-name="Standard" style:next-style-name="Standard" style:class="text">` +
        `<style:paragraph-properties fo:margin-top="${ before }pt" fo:margin-bottom="6pt" fo:keep-with-next="always" fo:keep-together="always"/>` +
        `<style:text-properties fo:font-weight="bold" style:font-weight-asian="bold" style:font-weight-complex="bold" fo:font-size="${ size }pt"${ italicProps }/></style:style>`;
}

// docx/latex parity: heading4 and heading6 are italic, the rest aren't --
// see docxify.ts's own styles(), which carries the same quirk
const HEADING_STYLES = [
    headingStyleXml(1, 16, 24, false),
    headingStyleXml(2, 14, 18, false),
    headingStyleXml(3, 13, 12, false),
    headingStyleXml(4, 12, 12, true),
    headingStyleXml(5, 12, 10, false),
    headingStyleXml(6, 12, 10, true),
].join('');

const NOTICE_STYLES = [ 1, 2, 3, 4 ].map((n) =>
    `<style:style style:name="Notice${ n }" style:family="paragraph" style:parent-style-name="Standard">` +
    `<style:paragraph-properties fo:border-left="3pt solid #${ BOX_COLORS[n - 1] }" fo:padding-left="4pt" fo:background-color="#${ BOX_FILLS[n - 1] }"/></style:style>`
).join('');

function bulletListStyleXml(): string {
    const bullets = [ '•', '◦', '▪' ];
    const levels = Array.from({ length: 9 }, (_, i) => {
        const margin = round2((i + 1) * 0.5 * 28.35);  // 0.5cm steps, in pt
        return `<text:list-level-style-bullet text:level="${ i + 1 }" text:bullet-char="${ bullets[i % 3] }">` +
            `<style:list-level-properties text:min-label-width="10pt" fo:margin-left="${ margin }pt" fo:text-indent="-10pt"/></text:list-level-style-bullet>`;
    }).join('');
    return `<text:list-style style:name="ListBullet">${ levels }</text:list-style>`;
}

function numberListStyleXml(): string {
    const formats = [ '1', 'a', 'i' ];
    const levels = Array.from({ length: 9 }, (_, i) => {
        const margin = round2((i + 1) * 0.6 * 28.35);  // 0.6cm steps, in pt
        return `<text:list-level-style-number text:level="${ i + 1 }" style:num-format="${ formats[i % 3] }" style:num-suffix=".">` +
            `<style:list-level-properties text:min-label-width="17pt" fo:margin-left="${ margin }pt" fo:text-indent="-17pt"/></text:list-level-style-number>`;
    }).join('');
    return `<text:list-style style:name="ListNumber">${ levels }</text:list-style>`;
}

const NAMED_STYLES = [
    '<style:style style:name="Standard" style:family="paragraph" style:class="text">' +
        '<style:paragraph-properties fo:margin-top="0pt" fo:margin-bottom="8pt" fo:line-height="115%"/>' +
        '<style:text-properties style:font-name="Calibri" fo:font-size="11pt"/></style:style>',
    HEADING_STYLES,
    '<style:style style:name="Caption" style:family="paragraph" style:parent-style-name="Standard" style:next-style-name="Standard">' +
        '<style:paragraph-properties fo:margin-top="12pt" fo:margin-bottom="6pt" fo:keep-with-next="always"/>' +
        '<style:text-properties fo:font-weight="bold" style:font-weight-asian="bold" style:font-weight-complex="bold"/></style:style>',
    '<style:style style:name="ReferenceNumbers" style:family="paragraph" style:parent-style-name="Standard">' +
        '<style:paragraph-properties fo:text-align="end" fo:margin-top="0pt" fo:margin-bottom="6pt"/>' +
        '<style:text-properties fo:font-weight="bold" style:font-weight-asian="bold" style:font-weight-complex="bold" fo:font-size="9pt"/></style:style>',
    '<style:style style:name="TableText" style:family="paragraph" style:parent-style-name="Standard">' +
        '<style:paragraph-properties fo:margin-top="2pt" fo:margin-bottom="2pt" fo:line-height="100%"/>' +
        '<style:text-properties fo:font-size="10pt"/></style:style>',
    '<style:style style:name="TableNote" style:family="paragraph" style:parent-style-name="Standard">' +
        '<style:paragraph-properties fo:margin-top="3pt" fo:margin-bottom="0pt" fo:line-height="100%"/>' +
        '<style:text-properties fo:font-size="9pt"/></style:style>',
    '<style:style style:name="Preformatted" style:family="paragraph" style:parent-style-name="Standard">' +
        '<style:paragraph-properties fo:margin-bottom="0pt" fo:line-height="100%"/>' +
        '<style:text-properties style:font-name="Consolas" fo:font-size="10pt"/></style:style>',
    '<style:style style:name="References" style:family="paragraph" style:parent-style-name="Standard">' +
        '<style:paragraph-properties fo:margin-left="36pt" fo:text-indent="-36pt"/></style:style>',
    '<style:style style:name="Internet_Link" style:display-name="Internet Link" style:family="text">' +
        '<style:text-properties fo:color="#0563C1" style:text-underline-style="solid" style:text-underline-width="auto" style:text-underline-color="font-color"/></style:style>',
    NOTICE_STYLES,
    `<style:style style:name="TableGrid" style:family="table"><style:table-properties style:width="${ TEXT_WIDTH_PT }pt" table:align="left"/></style:style>`,
    '<style:style style:name="TableColumn" style:family="table-column"><style:table-column-properties style:rel-column-width="1*"/></style:style>',
    '<style:style style:name="Fr" style:family="graphic"><style:graphic-properties style:wrap="none" style:vertical-pos="top" style:vertical-rel="paragraph"/></style:style>',
    bulletListStyleXml(),
    numberListStyleXml(),
].join('');

const STYLES_XML = '<?xml version="1.0" encoding="UTF-8"?>\n' +
    `<office:document-styles ${ NAMESPACES } office:version="1.3">` +
    `<office:font-face-decls>${ FONT_FACE_DECLS }</office:font-face-decls>` +
    `<office:styles>${ NAMED_STYLES }</office:styles>` +
    `<office:automatic-styles><style:page-layout style:name="PM1"><style:page-layout-properties fo:page-width="${ PAGE_WIDTH_PT }pt" fo:page-height="${ PAGE_HEIGHT_PT }pt" fo:margin-top="${ MARGIN_PT }pt" fo:margin-bottom="${ MARGIN_PT }pt" fo:margin-left="${ MARGIN_PT }pt" fo:margin-right="${ MARGIN_PT }pt" style:print-orientation="portrait"/></style:page-layout></office:automatic-styles>` +
    '<office:master-styles><style:master-page style:name="Standard" style:page-layout-name="PM1"/></office:master-styles>' +
    '</office:document-styles>';

const META_XML = '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<office:document-meta xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:meta="urn:oasis:names:tc:opendocument:xmlns:meta:1.0" xmlns:dc="http://purl.org/dc/elements/1.1/" office:version="1.3">' +
    '<office:meta><meta:generator>jamovi</meta:generator><dc:creator>jamovi</dc:creator></office:meta>' +
    '</office:document-meta>';

const MANIFEST_XML = '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.3">' +
    '<manifest:file-entry manifest:full-path="/" manifest:version="1.3" manifest:media-type="application/vnd.oasis.opendocument.text"/>' +
    '<manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"/>' +
    '<manifest:file-entry manifest:full-path="styles.xml" manifest:media-type="text/xml"/>' +
    '<manifest:file-entry manifest:full-path="meta.xml" manifest:media-type="text/xml"/>' +
    '</manifest:manifest>';
