'use strict';

import I18ns from '../../common/i18n';
import { determFormat } from '../../common/formatting';
import { format } from '../../common/formatting';
import { richMarkdown } from '../../common/htmlelementcreator';

const ALPHABET = 'abcdefghijklmnopqrstuvwxyz';

// a footnote reference: unlike a symbol (cell.symbols, straight from the
// engine, already whatever it needs to be -- a plain '*', or its own markup
// like '<sup>μ</sup>'), a footnote letter carries no markup of its own,
// so it's marked up here, once, rather than by every consumer of cell.sups
// (cf. resultsview/table.ts, which instead uses a dedicated unicode
// superscript alphabet for the same purpose)
function footnoteMark(index: number): string {
    return `<sup>${ ALPHABET[index] }</sup>`;
}

// cell.format bits (cf. resultsview/table.ts)
const FORMAT_BEGIN_GROUP = 1;
const FORMAT_END_GROUP = 2;

interface IRawCell {
    value: string | number;
    integer: boolean;
    footnotes: Array<string>;
    symbols: Array<string>;
    align: 'l' | 'c' | 'r';
    format: number;
}

interface IRawColumn {
    cells: Array<IRawCell>;
    combineBelow: boolean;
}

export interface ICell {
    content: string;              // plain text
    chunks: Array<ITextChunk>;    // the same, with inline formatting (e.g. p<sub>tukey</sub>)
    align: 'l' | 'c' | 'r';
    format?: number;
    // a cell spanning several columns/rows carries the count, and the cells
    // it covers carry 0. covered cells keep their content (repeated from the
    // spanning cell), so a consumer that doesn't merge cells, or a screen
    // reader, still sees a complete table. every row has one entry per
    // column, and null means there's nothing there
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
    // where the image is to be had from, as the consumer needs it (a data
    // url, say). hydration leaves it empty; the exporter fills it in
    path: string | null;
    // the rendered image as the results view has it, relative to the
    // instance (and the .omv, which stores it alongside the analysis)
    resource?: string;
    width: number;   // 0 when unknown (an svg element)
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

export interface IChunkAttributes {
    bold?: boolean;
    italic?: boolean;
    underline?: boolean;
    strike?: boolean;
    script?: 'super' | 'sub';
    code?: boolean;
    link?: string;
    formula?: boolean;
    color?: string;       // '#rrggbb'
    background?: string;  // '#rrggbb'
}

// a run of text with its inline formatting
export interface ITextChunk {
    content: string;
    attributes?: IChunkAttributes;
}

export interface IParagraphAttributes {
    header?: number;              // a heading, 1 = directly beneath the containing element
    list?: 'ordered' | 'bullet';
    indent?: number;              // levels (nesting, for list items)
    align?: 'center' | 'right' | 'justify';  // absent: start
    codeBlock?: boolean;
}

export interface IParagraph {
    chunks: Array<ITextChunk>;    // empty for a blank line
    attributes?: IParagraphAttributes;
}

export interface IText {
    type: 'text';
    paragraphs: Array<IParagraph>;
    // a notice is text in a box, with a title
    // box: 1 warning-1, 2 warning-2, 3 info, 4 error (cf. resultsview/notice.ts)
    title?: string;
    box?: number;
    refs?: Array<string>;
}

export interface IGroup {
    type: 'group';
    title?: string;
    items: Array<IElement>;
    refs?: Array<string>;
}

// an Html result's content, verbatim -- an alternative to hydrateHTML()'s
// parsed IText/ITable, for a destination that can render arbitrary html
// itself (htmlify.ts's clipboard/html export) and would rather not lose
// anything hydrateHTML() can't represent (cf. IHydrateOptions.verbatimHtml)
export interface IVerbatimHtml {
    type: 'html';
    content: string;
    refs?: Array<string>;
}

export type IElement = IGroup | ITable | IImage | IText | IPreformatted | IVerbatimHtml;
type IOptionValues = { [ name: string ]: any };
type IAddress = Array<string>;

export function hasAttr(item: ITextChunk | IParagraph, attr: string): boolean {
    return (item.attributes !== undefined && attr in item.attributes);
}

export interface IHydrateOptions {
    address?: IAddress;
    values?: IOptionValues;
    top?: boolean;
    analysisId?: number;
    // an Html result hydrates as an IVerbatimHtml, its content untouched,
    // rather than being parsed into an IText/ITable (see hydrateHTML() vs
    // hydrateVerbatimHTML()) -- for htmlify.ts, which can render arbitrary
    // html itself, so nothing of the source markup/styling need be lost;
    // docxify.ts and latexify.ts still need the parsed form, having no html
    // of their own to fall back on
    verbatimHtml?: boolean;
}

// what stays the same across a whole hydrate() call, as it recurses down
// through hydrateElement()/hydrateGroup()/hydrateArray()/hydrateElements()
// -- as opposed to pb/target/cursor, which are specific to where in the
// results tree a given call is
interface IHydrateContext {
    values: IOptionValues;
    top: boolean;
    analysisId: number;
    verbatimHtml: boolean;
}

export function hydrate(pb: any, options: IHydrateOptions = {}): IElement {
    const context: IHydrateContext = {
        values: options.values ?? {},
        top: options.top ?? false,
        analysisId: options.analysisId ?? 0,
        verbatimHtml: options.verbatimHtml ?? false,
    };

    const elements = hydrateElement(pb, options.address ?? [], [], context);
    if (elements === null) {
        return null;
    }
    return elements[0];
}

function hydrateText(top: boolean, values: IOptionValues, cursor: IAddress): IText | null {
    const name = `results/${ cursor.join('/') }/${ top ? 'topText' : 'bottomText' }`;
    const value = values[name];

    if (value)
        return { type: 'text', paragraphs: delta2Paragraphs(value.ops) };
    else
        return null;
}

// the paragraph formats quill applies to the '\n' ending a line (the rest
// are inline formats, on the text itself)
const DELTA_PARAGRAPH_ATTRS = new Set(['align', 'indent', 'list', 'header', 'code-block', 'direction']);

// converts a quill delta into paragraphs. in a delta, inline formatting sits
// on the text it applies to, and paragraph formatting sits on the '\n' which
// ends the paragraph
function delta2Paragraphs(ops: Array<any>): Array<IParagraph> {
    const paragraphs: Array<IParagraph> = [];
    let chunks: Array<ITextChunk> = [];

    for (const op of ops) {
        if (typeof op.insert !== 'string') {
            if (op.insert && op.insert.formula)
                chunks.push(createChunk(op.insert.formula, { ...deltaInlineAttrs(op.attributes), formula: true }));
            continue;
        }
        const lines: Array<string> = op.insert.split('\n');
        lines.forEach((line, i) => {
            if (line.length > 0)
                chunks.push(createChunk(line, deltaInlineAttrs(op.attributes)));
            if (i < lines.length - 1) {
                paragraphs.push(createParagraph(chunks, deltaParagraphAttrs(op.attributes)));
                chunks = [];
            }
        });
    }

    // a delta always ends with a '\n', but just in case
    if (chunks.length > 0)
        paragraphs.push(createParagraph(chunks));

    return paragraphs;
}

function deltaInlineAttrs(attributes?: { [name: string]: any }): IChunkAttributes {
    const attrs: { [name: string]: any } = {};
    if ( ! attributes)
        return attrs;
    for (const [ name, value ] of Object.entries(attributes)) {
        if ( ! DELTA_PARAGRAPH_ATTRS.has(name))
            attrs[name] = value;
    }
    // the annotation editor's link dialog doesn't require a scheme (e.g.
    // 'www.jamovi.org'), so one's added here too (cf. normalizeUrl())
    if (attrs.link)
        attrs.link = normalizeUrl(attrs.link);
    return attrs as IChunkAttributes;
}

function deltaParagraphAttrs(attributes?: { [name: string]: any }): IParagraphAttributes {
    const attrs: IParagraphAttributes = {};
    if ( ! attributes)
        return attrs;
    if (attributes.header)
        // the annotation editor's headings begin at h2 (h1 being the analysis)
        attrs.header = Math.max(attributes.header - 1, 1);
    if (attributes.list)
        attrs.list = attributes.list;
    if (attributes.indent)
        attrs.indent = attributes.indent;
    if (attributes['code-block'])
        attrs.codeBlock = true;
    const align = normaliseAlign(attributes.align);
    if (align)
        attrs.align = align;
    return attrs;
}

// 'start'/'left' is the default, and so isn't recorded
function normaliseAlign(align?: string): IParagraphAttributes['align'] | undefined {
    if (align === 'center' || align === 'right' || align === 'justify')
        return align;
    if (align === 'end')
        return 'right';
    return undefined;
}

function createChunk(content: string, attributes?: IChunkAttributes): ITextChunk {
    if (attributes && Object.keys(attributes).length > 0)
        return { content, attributes };
    else
        return { content };
}

function createParagraph(chunks: Array<ITextChunk>, attributes?: IParagraphAttributes): IParagraph {
    if (attributes && Object.keys(attributes).length > 0)
        return { chunks, attributes };
    else
        return { chunks };
}

function hydrateRefs(currPB: any): Array<string> {
    if (currPB && currPB.refs)
        return currPB.refs;
    return [];
}

function hydrateElement(pb: any, target: IAddress, cursor: Array<string>, context: IHydrateContext): Array<IElement> {

    cursor = [ ...cursor ];  // clone

    const before = hydrateText(true, context.values, cursor);
    const after = hydrateText(false, context.values, cursor);

    let element: IElement | null = null;
    const elements: Array<IElement> = [];

    if (before)
        elements.push(before);

    if (pb.group) {
        if (target.length > 0) {
            const name = target.shift();
            cursor.push(name);
            for (let elementPB of pb.group.elements) {
                if (elementPB.name === name)
                    return hydrateElement(elementPB, target, cursor, context);
            }
            throw Error('Address not valid');
        }
        const group = hydrateGroup(pb, target, cursor, context);
        if (group) {
            // if there's text at the top of the group, we move it down into
            // the body of the group
            if (before)
                elements.shift();
            elements.push(group);
            if (before)
                group.items.unshift(before);
            element = group;
        }
    }
    else if (pb.array) {
        if (target.length > 0) {
            const name = target.shift();
            cursor.push(name);
            for (let elementPB of pb.array.elements) {
                if (elementPB.name === name)
                    return hydrateElement(elementPB, target, cursor, context);
            }
            throw Error('Address not valid');
        }
        const array = hydrateArray(pb, target, cursor, context);
        if (array) {
            // if there's text at the top of the group, we move it down into
            // the body of the group
            if (before)
                elements.shift();
            elements.push(array);
            if (before)
                array.items.unshift(before);
            element = array;
        }
    }
    if (target.length > 0)
        throw Error('Address not valid');

    // append results objects to elements: table, image, or preformatted
    if (pb.table) {
        element = hydrateTable(pb);
        elements.push(element);
    }
    else if (pb.image) {
        element = hydrateImage(pb, target, cursor, context.analysisId);
        elements.push(element);
    }
    else if (pb.svg) {
        element = hydrateSvg(pb, target, cursor, context.analysisId);
        elements.push(element);
    }
    else if (pb.preformatted) {
        element = hydratePreformatted(pb);
        elements.push(element);
    }
    else if (pb.text) {
        element = hydrateTextElement(pb);
        elements.push(element);
    }
    else if (pb.html) {
        element = context.verbatimHtml ? hydrateVerbatimHTML(pb) : hydrateHTML(pb);
        elements.push(element);
    }
    else if (pb.notice) {
        element = hydrateNotice(pb);
        elements.push(element);
    }

    if (element) {
        const refs = hydrateRefs(pb)
        if (refs.length > 0)
            element.refs = refs;
    }

    if (after)
        elements.push(after);

    if (elements.length === 0)
        return null;

    return elements;
}

function hydrateArray(arrayPB: any, target: IAddress, cursor: IAddress, context: IHydrateContext): IGroup | null {
    if (arrayPB.array.elements.length === 0)
        return null;
    const items = hydrateElements(arrayPB.array.elements, target, cursor, context);
    if (items === null)
        return null;
    return {
        type: 'group',
        title: arrayPB.title,
        items,
    }
}

function hydrateGroup(groupPB: any, target: IAddress, cursor: IAddress, context: IHydrateContext): IGroup | null {

    let title: string = groupPB.title;
    if (context.top && cursor.length === 0) {
        title = context.values['results//heading'] || title;
        return { type: 'group', title, items: [] };
    }

    const items = hydrateElements(groupPB.group.elements, target, cursor, context);
    if (items === null)
        return null;
    return { type: 'group', title, items };
}

function hydrateElements(elementsPB: Array<any>, target: IAddress, cursor: IAddress, context: IHydrateContext): Array<IElement> | null {
    const items: Array<IElement> = [ ]
    for (const itemPB of elementsPB) {
        const itemCursor = [...cursor, itemPB.name];
        if ([0, 2].includes(itemPB.visible)) {
            const elem = hydrateElement(itemPB, target, itemCursor, context);
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
    const image: IImage = {
        type: 'image',
        title: imagePB.title,
        path: null,
        width: imagePB.image.width,
        height: imagePB.image.height,
        address: [ analysisId.toString(), ...cursor, ...target].join('/'),
    };
    if (imagePB.image.path)
        image.resource = imagePB.image.path;
    return image;
}

// an svg element draws itself in the results view, so it's exported as the
// image the view renders it to (see ResultsPanel._fillImages()); its size
// isn't known here
function hydrateSvg(svgPB: any, target: IAddress, cursor: IAddress, analysisId: number): IImage {
    const image: IImage = {
        type: 'image',
        title: svgPB.title,
        path: null,
        width: 0,
        height: 0,
        address: [ analysisId.toString(), ...cursor, ...target].join('/'),
    };
    if (svgPB.svg.path)
        image.resource = svgPB.svg.path;
    return image;
}

function hydratePreformatted(preformattedPB: any): IPreformatted {
    return {
        type: 'preformatted',
        title: preformattedPB.title,
        content: preformattedPB.preformatted,
        syntax: preformattedPB.name == 'syntax',
    };
}

function hydrateTextElement(textPB: any): IText {
    // content is markdown, so it's run through the same markdown-to-sanitized-html
    // pass text.ts uses to render it live, before being converted for copy/export --
    // otherwise the two would drift out of sync (e.g. a stripped heading showing
    // as plain text on screen, but surviving as a real heading in a LaTeX export)
    return { type: 'text', paragraphs: html2Paragraphs(richMarkdown(textPB.text)) };
}

function hydrateHTML(htmlPB: any): IElement {
    // title isn't rendered as a heading in the live results view, so it's
    // left out of the exported/copied content too
    const elements = html2Elements(htmlPB.html.content);
    if (elements.length === 0)
        return { type: 'text', paragraphs: [] };
    if (elements.length === 1)
        return elements[0];
    // mixed content (text around one or more tables): grouped, with no
    // title of its own, so it renders as a plain run of elements
    return { type: 'group', items: elements };
}

function hydrateVerbatimHTML(htmlPB: any): IVerbatimHtml {
    return { type: 'html', content: htmlPB.html.content };
}

function hydrateNotice(noticePB: any): IText {
    const html = I18ns.get('app').__(noticePB.notice.content, { prefix: '<strong>', postfix: '</strong>' });
    return {
        type: 'text',
        paragraphs: html2Paragraphs(html),
        title: noticePB.title,
        box: noticeBox(noticePB.notice.type),
    };
}

// the notice's type as IText.box: NoticeType ERROR is 0, but a box of 0
// means none (and the consumers have error as 4)
function noticeBox(type: number): number {
    return (type === 0) ? 4 : type;
}

// a link typed without a scheme (e.g. 'www.jamovi.org', from an annotation's
// link dialog) would otherwise resolve as a path relative to wherever the
// document ends up -- the exported file on disk, or the app's own page --
// rather than the external site intended, so it's given one explicitly.
// fragments (#x) and root-relative paths (/x) are left as they are
function normalizeUrl(url: string): string {
    if (/^[a-z][a-z0-9+.-]*:/i.test(url) || url.startsWith('#') || url.startsWith('/'))
        return url;
    return `https://${ url }`;
}

// converts a string of inline html (p<sub>tukey</sub>, <i>Note.</i>, ...)
// into chunks. anything that isn't markup is text, so 'p < .001' is safe
export function html2Chunks(html: string): Array<ITextChunk> {
    // most table text is plain, and needn't be parsed
    if ( ! html.includes('<') && ! html.includes('&'))
        return html.length > 0 ? [ { content: html } ] : [];
    const chunks: Array<ITextChunk> = [];
    for (const paragraph of html2Paragraphs(html))
        chunks.push(...paragraph.chunks);
    return chunks;
}

// the elements which start a new paragraph
const BLOCK_TAGS = new Set(['P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI', 'PRE', 'BLOCKQUOTE',
                            'UL', 'OL', 'TABLE', 'TR', 'TD', 'TH', 'BR', 'HR']);

// the inline/paragraph attributes an element contributes to its descendants,
// on top of what it inherits from its ancestors (shared by html2Paragraphs,
// for content that's never a table, and html2Elements, for content that
// might be -- see hydrateHTML())
function deriveElementAttrs(element: Element, inline: IChunkAttributes, block: IParagraphAttributes): [IChunkAttributes, IParagraphAttributes] {
    const tag = element.tagName;
    inline = { ...inline };
    block = { ...block };

    if (['B', 'STRONG'].includes(tag))
        inline.bold = true;
    if (['I', 'EM'].includes(tag))
        inline.italic = true;
    if (tag === 'U')
        inline.underline = true;
    if (['S', 'STRIKE', 'DEL'].includes(tag))
        inline.strike = true;
    if (tag === 'CODE')
        inline.code = true;
    if (tag === 'SUP')
        inline.script = 'super';
    if (tag === 'SUB')
        inline.script = 'sub';
    const href = element.getAttribute('href');
    if (tag === 'A' && href)
        inline.link = normalizeUrl(href);
    if (/^H[1-6]$/.test(tag))
        block.header = parseInt(tag.charAt(1));
    if (tag === 'PRE')
        block.codeBlock = true;
    if (tag === 'UL')
        block.list = 'bullet';
    if (tag === 'OL')
        block.list = 'ordered';

    const style = element.getAttribute('style');
    if (style) {
        for (const declaration of style.split(';')) {
            const [ property, value ] = declaration.split(':').map(s => s.trim());
            if (property === 'text-align') {
                const align = normaliseAlign(value);
                if (align)
                    block.align = align;
            }
            else if (property === 'padding') {
                // quill's indentation, as its html converter writes it
                const indent = Math.floor(parseInt(value.replaceAll('px', '').split(' ')[3]) / 36);
                if (indent > 0)
                    block.indent = indent;
            }
            else if (property === 'color') {
                inline.color = rgb2Hex(value);
            }
            else if (property === 'background-color') {
                inline.background = rgb2Hex(value);
            }
        }
    }

    return [ inline, block ];
}

// converts html (a string, or a list of top-level nodes as richMarkdown()
// produces) into paragraphs. block elements begin paragraphs and contribute
// paragraph attributes, inline elements contribute chunk attributes. this is
// for content that's never a table (annotations, notices); see html2Elements()
// for content that might be (an Html result -- see hydrateHTML())
function html2Paragraphs(content: string | Node[]): Array<IParagraph> {
    const paragraphs: Array<IParagraph> = [];
    let current: IParagraph | null = null;

    function walk(node: Node, inline: IChunkAttributes, block: IParagraphAttributes) {

        if (node.nodeType === Node.TEXT_NODE) {
            const text = node.textContent;
            if ( ! text)
                return;
            if (current === null) {
                // whitespace between blocks isn't content
                if (text.trim() === '')
                    return;
                current = createParagraph([], block);
                paragraphs.push(current);
            }
            current.chunks.push(createChunk(text, inline));
            return;
        }

        if (node.nodeType !== Node.ELEMENT_NODE)
            return;

        const element = node as Element;
        const tag = element.tagName;
        [ inline, block ] = deriveElementAttrs(element, inline, block);

        const isBlock = BLOCK_TAGS.has(tag);
        if (isBlock)
            current = null;
        for (const child of Array.from(element.childNodes))
            walk(child, inline, block);
        if (isBlock)
            current = null;
    }

    if (typeof content === 'string') {
        const doc = new DOMParser().parseFromString(content, 'text/html');
        walk(doc.body, {}, {});
    }
    else {
        for (const node of content)
            walk(node, {}, {});
    }

    return paragraphs;
}

// converts an Html result's content into a sequence of elements: text (as
// html2Paragraphs(), gathered into IText elements) with any <table> kept as
// its own ITable, rather than flattened into text along with everything else
// (cf. issue #1867 -- a table pasted/exported without its structure is
// useless, since it's the whole reason the result used html in the first
// place)
function html2Elements(content: string): Array<IElement> {
    const elements: Array<IElement> = [];
    let paragraphs: Array<IParagraph> = [];
    let current: IParagraph | null = null;

    function flush() {
        if (paragraphs.length > 0)
            elements.push({ type: 'text', paragraphs });
        paragraphs = [];
        current = null;
    }

    function walk(node: Node, inline: IChunkAttributes, block: IParagraphAttributes) {

        if (node.nodeType === Node.ELEMENT_NODE && (node as Element).tagName === 'TABLE') {
            flush();
            elements.push(html2Table(node as Element));
            return;
        }

        if (node.nodeType === Node.TEXT_NODE) {
            const text = node.textContent;
            if ( ! text)
                return;
            if (current === null) {
                // whitespace between blocks isn't content
                if (text.trim() === '')
                    return;
                current = createParagraph([], block);
                paragraphs.push(current);
            }
            current.chunks.push(createChunk(text, inline));
            return;
        }

        if (node.nodeType !== Node.ELEMENT_NODE)
            return;

        const element = node as Element;
        const tag = element.tagName;
        [ inline, block ] = deriveElementAttrs(element, inline, block);

        const isBlock = BLOCK_TAGS.has(tag);
        if (isBlock)
            current = null;
        for (const child of Array.from(element.childNodes))
            walk(child, inline, block);
        if (isBlock)
            current = null;
    }

    const doc = new DOMParser().parseFromString(content, 'text/html');
    walk(doc.body, {}, {});
    flush();

    return elements;
}

function colSpanOf(cellEl: Element): number {
    return Math.max(parseInt(cellEl.getAttribute('colspan') || '1') || 1, 1);
}

function rowSpanOf(cellEl: Element): number {
    return Math.max(parseInt(cellEl.getAttribute('rowspan') || '1') || 1, 1);
}

// a header cell (<th>) is centred, like a jamovi table's own column titles;
// a data cell (<td>) follows the table's own alignment, from a style or
// align attribute, defaulting to left (cf. resultsview/table.ts, which
// aligns by column type instead -- there's no such type here, html content
// being free-form)
function cellAlign(cellEl: Element, isHeader: boolean): 'l' | 'c' | 'r' {
    const style = cellEl.getAttribute('style');
    if (style) {
        for (const declaration of style.split(';')) {
            const [ property, value ] = declaration.split(':').map(s => s.trim());
            if (property === 'text-align') {
                if (value === 'center')
                    return 'c';
                if (value === 'right')
                    return 'r';
                if (value === 'left')
                    return 'l';
            }
        }
    }
    const align = cellEl.getAttribute('align');
    if (align === 'center')
        return 'c';
    if (align === 'right')
        return 'r';
    if (align === 'left')
        return 'l';
    return isHeader ? 'c' : 'l';
}

// a rowspan still open from an earlier row, tracked per column: 'first' marks
// the column the spanning cell itself started at, where the continuation's
// single placeholder goes (carrying the same colSpan, so a docx/html
// consumer can still merge it visually); the rest of its columns (if any)
// are left as colSpan 0, exactly like any other covered column
interface IPending {
    cell: ICell;
    colSpan: number;
    rowsLeft: number;
    first: boolean;
}

// converts a <table> element (as authored by an Html result, e.g. R's gt/
// gtsummary) into an ITable, so it survives copy/export with its structure
// intact, rather than being flattened into disconnected lines of text (see
// html2Elements())
function html2Table(tableEl: Element): ITable {
    const trEls = Array.from(tableEl.querySelectorAll('tr'));

    // a row's a header if it's in the thead, or if it's all th's and comes
    // before the body. (without a thead, the parser puts the rows in an
    // implicit tbody, so where a row sits can't tell us)
    let inBody = false;
    const rawRows = trEls.map((tr) => {
        const cellEls = Array.from(tr.children).filter((c) => c.tagName === 'TD' || c.tagName === 'TH');
        const allTH = cellEls.length > 0 && cellEls.every((c) => c.tagName === 'TH');
        const isHeader = tr.parentElement?.tagName === 'THEAD' || ( ! inBody && allTH);
        if ( ! isHeader)
            inBody = true;
        return { type: (isHeader ? 'title' : 'body') as 'title' | 'body', cellEls };
    });

    let nCols = 1;
    for (const raw of rawRows) {
        const n = raw.cellEls.reduce((sum, c) => sum + colSpanOf(c), 0);
        nCols = Math.max(nCols, n);
    }

    const pending: Array<IPending | null> = new Array(nCols).fill(null);

    const rows: Array<IRow> = rawRows.map((raw) => {
        const cells: Array<ICell | null> = new Array(nCols).fill(null);
        let col = 0;
        let cellIdx = 0;

        while (col < nCols) {
            const covering = pending[col];
            if (covering) {
                cells[col] = covering.first
                    ? { ...covering.cell, rowSpan: 0, colSpan: covering.colSpan > 1 ? covering.colSpan : undefined }
                    : { ...covering.cell, rowSpan: 0, colSpan: 0 };
                pending[col] = (covering.rowsLeft > 1) ? { ...covering, rowsLeft: covering.rowsLeft - 1 } : null;
                col += 1;
                continue;
            }
            if (cellIdx >= raw.cellEls.length)
                break;

            const cellEl = raw.cellEls[cellIdx];
            cellIdx += 1;
            const cs = Math.min(colSpanOf(cellEl), nCols - col);
            const rs = rowSpanOf(cellEl);
            const cell = createCell(cellEl.innerHTML, cellAlign(cellEl, raw.type === 'title'));
            if (cs > 1)
                cell.colSpan = cs;
            if (rs > 1)
                cell.rowSpan = rs;

            for (let k = 0; k < cs; k++) {
                cells[col + k] = (k === 0) ? cell : { ...cell, colSpan: 0 };
                if (rs > 1)
                    pending[col + k] = { cell, colSpan: cs, rowsLeft: rs - 1, first: (k === 0) };
            }
            col += cs;
        }

        return { type: raw.type, cells };
    });

    return { type: 'table', title: '', rows, nCols };
}

function rgb2Hex(rgb: string): string {
    if (rgb.startsWith('#'))
        return rgb;
    return '#' + Array.from(rgb.match(/[0-9]+/g) || []).map(c => parseInt(c).toString(16).padStart(2, '0')).join('');
}

// table text (titles, values, notes) can carry inline html; it's parsed once
// here, into chunks, with the plain text alongside
function createCell(html: string, align: 'l' | 'c' | 'r'): ICell {
    const chunks = html2Chunks(html);
    const content = chunks.map(chunk => chunk.content).join('');
    return { content, chunks, align };
}

function transpose(columns: Array<Array<ICell>>): Array<Array<ICell>> {
    if ( ! Array.isArray(columns) || columns.length === 0)
        return [];
    return Array.from(
        { length: columns[0].length },
        (_, rowIdx) => columns.map(col => col[rowIdx])
    );
}

function extractRawCell(cellPB: any, align: 'l' | 'c' | 'r'): IRawCell | null {
    let value = cellPB[cellPB.cellType];
    if (cellPB.cellType === 'o') {
        if (value === 1)
            value = 'NaN';
        else
            value = '.';
    }
    const integer = (cellPB.cellType === 'i');
    return { value, integer, footnotes: cellPB.footnotes, symbols: cellPB.symbols, align, format: cellPB.format };
}

function extractRawColumns(columnsPB: any): Array<IRawColumn> {
    const nCols = columnsPB.length;
    const cols: Array<IRawColumn> = new Array(nCols);

    for (let i = 0; i < nCols; i++) {
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
            const finalSups = [...cell.symbols, ...indices.map(i => footnoteMark(i))];
            const finalCell = createCell(formatValue(cell, fmt), cell.align);
            if (finalSups.length > 0)
                finalCell.sups = finalSups;
            if (cell.format)
                finalCell.format = cell.format;
            return finalCell;
        });
        const { combineBelow } = col;
        return { cells, combineBelow };
    });
    return [ finalCells, footnotes ];
}

// integers are shown as they are, whatever the column's format (cf.
// resultsview/table.ts)
function formatValue(cell: IRawCell, fmt: any): string {
    if (typeof cell.value === 'string')
        return cell.value;
    if (cell.integer)
        return String(cell.value);
    return format(cell.value, fmt);
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

// recounts the column spans of a row, from its covered (colSpan 0) cells.
// folding can remove columns from the middle of a span, so spans are counted
// after it rather than before
function recountColSpans(row: Array<ICell | null>): void {
    let owner: ICell | null = null;
    for (const cell of row) {
        if (cell !== null && cell.colSpan === 0 && owner !== null) {
            owner.colSpan = (owner.colSpan || 1) + 1;
        }
        else if (cell !== null && cell.colSpan !== undefined) {
            // the start of a span (or a covered cell whose spanning cell was
            // folded away, which now stands for the span itself)
            cell.colSpan = 1;
            owner = cell;
        }
        else {
            owner = null;
        }
    }
}

function fold(columns: Array<IColumn>, columnNames: Array<string>): Array<IColumn> {
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
        return columns;

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
            rowOffset = 0;
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

    // add spacing around the folds: the first row of each folded group
    // begins a group, and the last row ends it
    if (nFoldsInRow > 1) {
        for (let j = 0; j < nRows; j += nFoldsInRow) {
            for (const cells of foldedCells) {
                const first = cells[j];
                if (first)
                    first.format = (first.format || 0) | FORMAT_BEGIN_GROUP;
                const last = cells[j + nFoldsInRow - 1];
                if (last)
                    last.format = (last.format || 0) | FORMAT_END_GROUP;
            }
        }
    }

    return foldedCells.map((cells, i) => ({ cells, combineBelow: combines[i] }));
}

// a run of equal cells in a combineBelow column becomes a single cell,
// spanning the run (cf. resultsview/table.ts). mutates columns in place
function addRowSpans(columns: Array<IColumn>): void {
    for (const column of columns) {
        if ( ! column.combineBelow)
            continue;

        const cells = column.cells;

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
                // covered by the cell above (or one further up)
                cell.rowSpan = 0;
                rowSpan += 1;
            }
        }
    }
}

// ensure that the first two bits of the cell format (BEGIN.GROUP / END.GROUP) are consistent for all cells in a row
// spreads each row's BEGIN.GROUP / END.GROUP bits (the first two bits of
// cell.format) across every cell in that row, leaving NEGATIVE and INDENT
// (the other two bits) untouched. mutates cellsByRow in place
function ensureFormat(cellsByRow: Array<Array<ICell>>): void {
    // first determine what the maximum value of format (BEGIN.GROUP: 1, END.GROUP: 2) is, while ensuring
    // that the other format markers (NEGATIVE: 4, INDENT: 8) remain unaffected
    const maxFormat = cellsByRow.map(r => Math.max(...r.map(c => (c && c.format) ? c.format & 3 : 0)));
    // afterwards, if there is any occurrence of BEGIN.GROUP or END.GROUP (indicated by the row entry in
    // maxFormat being larger than 0), apply maxFormat for that row (again, ensuring by using | that
    // NEGATIVE and INDENT are unaffected)
    if (maxFormat.some(v => v > 0)) {
        for (let [i, row] of cellsByRow.entries() ) {
            if (maxFormat[i] > 0) {
                for (let cell of row) {
                    if (cell && Object.keys(cell).includes('format')) {
                        const fmt = (cell.format | maxFormat[i]);
                        if (fmt > 0)
                            cell.format = fmt;
                    }
                }
            }
        }
    }
}

function hydrateTable(tablePB: any): ITable {
    const columnsPB = tablePB.table.columns.filter((cPB) => [0, 2].includes(cPB.visible));
    const columnNames = columnsPB.map((columnPB) => columnPB.name);
    const nCols = columnsPB.length;

    // one entry per column: the first column under a super title spans the
    // run of columns sharing it, and the rest are covered (colSpan 0)
    let superTitles: Array<ICell | null> = new Array(nCols).fill(null);
    let hasSuperTitles = false;
    let lastSuperTitle: string | null = null;

    for (let i = 0; i < nCols; i++) {
        const column = columnsPB[i];
        if (column.superTitle) {
            const covered = (lastSuperTitle === column.superTitle);
            superTitles[i] = { ...createCell(column.superTitle, 'c'), colSpan: covered ? 0 : 1 };
            lastSuperTitle = column.superTitle;
            hasSuperTitles = true;
        }
        else {
            lastSuperTitle = null;
        }
    }

    superTitles = foldTitles(superTitles, columnNames);
    recountColSpans(superTitles);

    const rows: Array<IRow> = [];

    if (hasSuperTitles) {
        const row: IRow = {
            type: 'superTitle',
            cells: superTitles,
        }
        rows.push(row);
    }

    let titles: Array<ICell | null> = columnsPB.map((columnPB) => {
        return columnPB.title ? createCell(columnPB.title, 'c') : null
    });
    titles = foldTitles(titles, columnNames);

    rows.push({ type: 'title', cells: titles });

    const rawColumns = extractRawColumns(columnsPB);
    // the column's (double) values, as resultsview/table.ts gives them
    const formatsByColumn = columnsPB.map((columnPB: any) => {
        const values = columnPB.cells.map((cellPB: any) => (cellPB.cellType === 'd') ? cellPB.d : undefined);
        return determFormat(values, columnPB.type, columnPB.format, undefined);
    });
    const [ cellsByColumn, footnotes ] = transmogrify(rawColumns, formatsByColumn);

    const folded = fold(cellsByColumn, columnNames);
    addRowSpans(folded);
    const cellsByRow = transpose(folded.map((column) => column.cells));
    ensureFormat(cellsByRow);
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
            cells: [ { ...createCell(note, 'l'), colSpan: folded.length, sups: ['note'] } ]
        });
    }

    for (let i = 0; i < footnotes.length; ++i) {
        const fn = footnotes[i];
        rows.push({
            type: 'footnote',
            cells: [ { ...createCell(fn, 'l'), colSpan: folded.length, sups: [ footnoteMark(i) ] } ]
        });
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
        nCols: folded.length,
    }
}

