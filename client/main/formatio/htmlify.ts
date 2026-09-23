
// converts hydrated results into html: a single element for the clipboard
// (htmlify()), or a complete document for export (createDoc()). everything
// is styled inline, as that's all which survives a paste into word, gmail,
// etc. the structure mirrors docxify.ts, so the two agree on what's produced

import { IElement, ITable, IRow, ICell, IImage, IPreformatted, IText, IVerbatimHtml, ITextChunk } from './hydrate';
import { html2Chunks } from './hydrate';
import { IReference } from '../references';
import { referenceAsHTML } from '../references';

export interface IHtmlifyOptions {
    level?: number;         // the heading level of the outermost element (default 1)
    showSyntax?: boolean;   // whether syntax elements are included (default false)
}

export interface IDocItem {
    element: IElement;
    level?: number;  // heading level of the element (1-6), default 1
}

export interface IDocOptions {
    references?: Array<IReference>;
    showSyntax?: boolean;
    showRefs?: boolean;   // citations and the reference list, default true
    generator?: string;   // for the <meta name="generator">
}

// what's carried through the document as it's built
interface IContext {
    showSyntax: boolean;
    showRefs: boolean;
    refNames: Array<string>;
}

// cell.format bits (cf. resultsview/table.ts)
const FORMAT_BEGIN_GROUP = 1;
const FORMAT_END_GROUP = 2;
const FORMAT_INDENTED = 8;

const RULE = '1px solid #333333';
const HEAVY_RULE = '2px solid #333333';  // beneath the body (cf. resultsview/main.css)
const MONO = "Consolas, Menlo, monospace";

// notices: warning-1, warning-2, info, error (cf. resultsview/notice.ts)
const BOX_COLORS = [ '#a6a6a6', '#f5a623', '#3e6da9', '#dd0000' ];
const BOX_FILLS  = [ '#f2f2f2', '#fdf3e4', '#e8eef8', '#fbe9e9' ];

// a single element, as for the clipboard: no references
export function htmlify(item: IElement, options: IHtmlifyOptions = {}): string {
    const context: IContext = {
        showSyntax: options.showSyntax ?? false,
        showRefs: false,
        refNames: [],
    };

    const doc = document.implementation.createHTMLDocument('Results');
    populate(item, doc.body, options.level ?? 1, context);

    return '<!doctype html>\n' + doc.documentElement.outerHTML;
}

// a complete, self-contained document: the elements, with their reference
// numbers, and the reference list beneath (like docxify's createDoc())
export function createDoc(items: Array<IDocItem>, options: IDocOptions = {}): string {
    const showRefs = options.showRefs ?? true;
    // when the references are hidden in the results view, they're left out
    // of the document too (the list, and the citations)
    const references = showRefs ? (options.references || []) : [];

    const context: IContext = {
        showSyntax: options.showSyntax ?? false,
        showRefs,
        refNames: references.map((ref) => ref.name),
    };

    const doc = document.implementation.createHTMLDocument('Results');
    doc.head.appendChild(doc.createElement('meta')).setAttribute('charset', 'utf-8');
    if (options.generator) {
        const meta = doc.head.appendChild(doc.createElement('meta'));
        meta.setAttribute('name', 'generator');
        meta.setAttribute('content', options.generator);
    }
    doc.head.appendChild(doc.createElement('style')).textContent = STYLESHEET;

    for (const item of items)
        populate(item.element, doc.body, item.level ?? 1, context);

    if (references.length > 0) {
        doc.body.appendChild(heading('References', 1));
        references.forEach((ref, i) => {
            const p = document.createElement('p');
            p.style.paddingLeft = '2em';
            p.style.textIndent = '-2em';
            p.append(`[${ i + 1 }] `, ...chunkNodes(html2Chunks(referenceAsHTML(ref))));
            doc.body.appendChild(p);
        });
    }

    return '<!doctype html>\n' + doc.documentElement.outerHTML;
}

// the look of the results view (cf. the stylesheet in common/utils/formatio).
// this is page-level only; everything on an element is styled inline, so it
// survives the clipboard. the document is also what's printed to pdf, so
// tables and figures are kept together, and headings with what follows
const STYLESHEET = `
    body {
        font-family: "Segoe UI", Roboto, Helvetica, Arial, sans-serif, "Segoe UI Emoji", "Segoe UI Symbol";
        color: #333333;
        font-size: 12px;
        margin: 24px;
    }
    h1 { font-size: 160%; color: #3E6DA9; margin-top: 24px; margin-bottom: 12px; }
    h2 { font-size: 130%; color: #3E6DA9; margin-top: 24px; margin-bottom: 12px; }
    h3, h4, h5, h6 { font-size: 110%; margin-top: 16px; margin-bottom: 12px; }
    h1, h2, h3, h4, h5, h6 { break-after: avoid; page-break-after: avoid; }
    table, img, pre { break-inside: avoid; page-break-inside: avoid; }
    img { max-width: 100%; height: auto; }
    th { font-weight: normal; }
    a { color: #3E6DA9; }
`;

function populate(item: IElement, parent: HTMLElement, level: number, context: IContext): void {
    if (item.type === 'group') {
        let childLevel = level;
        if (item.title) {
            parent.appendChild(heading(item.title, level));
            childLevel = level + 1;
        }
        for (const child of item.items)
            populate(child, parent, childLevel, context);
    }
    else if (item.type === 'image') {
        generateImage(item, parent, context);
    }
    else if (item.type === 'table') {
        generateTable(item, parent, context);
    }
    else if (item.type === 'preformatted') {
        generatePreformatted(item, parent, level, context);
    }
    else if (item.type === 'text') {
        generateText(item, parent, level, context);
    }
    else if (item.type === 'html') {
        generateVerbatimHtml(item, parent, context);
    }
}

// the "[1] [2]" reference numbers beneath an element, as the results view
// shows them: the modules/packages it was created with, numbered as in the
// reference list
function refNumbers(refs: Array<string> | undefined, context: IContext): Array<HTMLElement> {
    if ( ! context.showRefs || ! refs || refs.length === 0)
        return [];
    const numbers = refs.map((name) => {
        const index = context.refNames.indexOf(name);
        return (index === -1) ? name : String(index + 1);
    });
    const p = document.createElement('p');
    p.style.fontSize = 'smaller';
    p.style.color = '#808080';
    p.textContent = numbers.map((n) => `[${ n }]`).join(' ');
    return [ p ];
}

function heading(title: string, level: number): HTMLElement {
    level = Math.min(Math.max(level, 1), 6);
    const h = document.createElement(`h${ level }`);
    h.append(...chunkNodes(html2Chunks(title)));
    return h;
}

// a figure's title, above it, as in the results view
function caption(title: string): HTMLElement {
    const p = document.createElement('p');
    p.style.fontWeight = 'bold';
    p.append(...chunkNodes(html2Chunks(title)));
    return p;
}

// word merges adjacent tables, so they're followed by an empty paragraph
function spacer(): HTMLElement {
    return document.createElement('p');
}

function generateImage(image: IImage, parent: HTMLElement, context: IContext): void {
    if (image.title)
        parent.appendChild(caption(image.title));
    const img = document.createElement('img');
    // (an svg element's size isn't known; the image's own is used)
    if (image.width && image.height) {
        img.width = image.width;
        img.height = image.height;
    }
    // the path is filled in by the caller, where it can be (see
    // ResultsPanel._fillImages()); otherwise it's left empty
    if (image.path)
        img.src = image.path;
    if (image.title)
        img.alt = image.title;
    parent.appendChild(img);
    const refs = refNumbers(image.refs, context);
    parent.append(...(refs.length > 0 ? refs : [ spacer() ]));
}

function generateTable(table: ITable, parent: HTMLElement, context: IContext): void {
    const nCols = Math.max(table.nCols, 1);

    const el = document.createElement('table');
    el.style.borderCollapse = 'collapse';
    const thead = document.createElement('thead');
    const tbody = document.createElement('tbody');

    // APA: a rule above, below the column titles, and below the body; no
    // vertical rules. the title sits above the first rule, as on screen
    if (table.title) {
        const th = tableCell('th', chunkNodes(html2Chunks(table.title)), { align: 'l', span: nCols, bottomRule: true, flush: true });
        thead.appendChild(row([ th ]));
    }
    else {
        el.style.borderTop = RULE;
    }

    const lastBody = table.rows.map((r) => r.type).lastIndexOf('body');

    table.rows.forEach((r, i) => {
        if (r.type === 'superTitle')
            thead.appendChild(formatSuperTitle(r));
        else if (r.type === 'title')
            thead.appendChild(formatTitleRow(r));
        else if (r.type === 'body')
            tbody.appendChild(formatBodyRow(r, i, lastBody));
        else if (r.type === 'footnote')
            tbody.appendChild(formatNoteRow(r, nCols));
    });

    el.appendChild(thead);
    el.appendChild(tbody);
    parent.appendChild(el);
    const refs = refNumbers(table.refs, context);
    parent.append(...(refs.length > 0 ? refs : [ spacer() ]));
}

function row(cells: Array<HTMLTableCellElement>): HTMLTableRowElement {
    const tr = document.createElement('tr');
    tr.append(...cells);
    return tr;
}

function formatSuperTitle(r: IRow): HTMLTableRowElement {
    const cells: Array<HTMLTableCellElement> = [];
    for (const cell of r.cells) {
        if (cell && cell.colSpan === 0)  // covered by the span before it
            continue;
        if (cell && cell.content)
            cells.push(tableCell('th', cellNodes(cell), { align: 'c', span: cell.colSpan, bottomRule: true, vAlign: 'bottom' }));
        else
            cells.push(tableCell('th', [], {}));
    }
    return row(cells);
}

function formatTitleRow(r: IRow): HTMLTableRowElement {
    const cells: Array<HTMLTableCellElement> = [];
    for (const cell of r.cells) {
        if (cell && (cell.rowSpan === 0 || cell.colSpan === 0))  // covered by the cell above/before
            continue;
        const props: ICellProps = { align: 'c', bottomRule: true, vAlign: 'bottom' };
        if (cell?.colSpan && cell.colSpan > 1)
            props.span = cell.colSpan;
        if (cell?.rowSpan && cell.rowSpan > 1)
            props.rowSpan = cell.rowSpan;
        cells.push(tableCell('th', cell ? cellNodes(cell) : [], props));
    }
    return row(cells);
}

// i is the row's index, and lastBody that of the last body row: the rule
// beneath the body goes on the cells in that row, and on any cell spanning
// down into it
function formatBodyRow(r: IRow, i: number, lastBody: number): HTMLTableRowElement {
    const cells: Array<HTMLTableCellElement> = [];
    for (const cell of r.cells) {
        const props: ICellProps = { bottomRule: i === lastBody, heavy: true };
        if ( ! cell) {
            cells.push(tableCell('td', [], props));
            continue;
        }
        if (cell.rowSpan === 0 || cell.colSpan === 0)  // covered by the cell above/before
            continue;
        props.align = cell.align;
        if (cell.colSpan && cell.colSpan > 1)
            props.span = cell.colSpan;
        if (cell.rowSpan && cell.rowSpan > 1) {
            props.rowSpan = cell.rowSpan;
            props.vAlign = 'top';
            props.bottomRule = (i + cell.rowSpan - 1 >= lastBody);
        }
        const format = cell.format || 0;
        if (format & FORMAT_INDENTED)
            props.indent = true;
        if (format & FORMAT_BEGIN_GROUP)
            props.before = true;
        if (format & FORMAT_END_GROUP)
            props.after = true;
        cells.push(tableCell('td', cellNodes(cell), props));
    }
    return row(cells);
}

function formatNoteRow(r: IRow, nCols: number): HTMLTableRowElement {
    const nodes: Array<Node> = [];
    for (const cell of r.cells) {
        if ( ! cell || ! cell.content)
            continue;
        if (cell.sups && cell.sups[0] === 'note') {
            const note = document.createElement('em');
            note.textContent = 'Note. ';
            nodes.push(note);
        }
        else if (cell.sups && cell.sups.length > 0) {
            nodes.push(...chunkNodes(html2Chunks(cell.sups.join(''))), document.createTextNode(' '));
        }
        nodes.push(...chunkNodes(cell.chunks));
    }
    return row([ tableCell('td', nodes, { align: 'l', span: nCols, small: true }) ]);
}

interface ICellProps {
    align?: string;
    span?: number;
    rowSpan?: number;
    bottomRule?: boolean;
    heavy?: boolean;    // the bottom rule is the heavier one, beneath the body
    vAlign?: 'top' | 'bottom';
    indent?: boolean;   // an indented row (a level beneath the one above)
    before?: boolean;   // the first row of a group, set apart from the one above
    after?: boolean;    // the last row of a group
    small?: boolean;    // a table note
    flush?: boolean;    // with the table's left edge (the title)
}

function tableCell(tag: 'th' | 'td', nodes: Array<Node>, props: ICellProps): HTMLTableCellElement {
    const cell = document.createElement(tag);
    cell.append(...nodes);

    const padding = props.small ? [ 2, 8, 2, 8 ] : [ 4, 8, 4, 8 ];
    if (props.flush)
        padding[3] = 0;
    if (props.before)
        padding[0] += 4;
    if (props.after)
        padding[2] += 4;
    if (props.indent)
        padding[3] += 16;
    // a right-aligned (numeric) cell reserves extra room on its right for a
    // trailing sup (see cellNodes()), so that sup doesn't throw off the
    // numbers' own right alignment when only some rows have one (cf.
    // resultsview/table.ts's '-integer'/'-number' padding-inline-end)
    if (props.align === 'r')
        padding[1] += 12;
    cell.style.padding = padding.map((px) => `${ px }px`).join(' ');
    cell.style.position = 'relative';

    if (props.align)
        cell.style.textAlign = alignment(props.align);
    if (props.vAlign)
        cell.style.verticalAlign = props.vAlign;
    if (props.span && props.span > 1)
        cell.colSpan = props.span;
    if (props.rowSpan && props.rowSpan > 1)
        cell.rowSpan = props.rowSpan;
    if (props.bottomRule)
        cell.style.borderBottom = props.heavy ? HEAVY_RULE : RULE;
    if (props.small)
        cell.style.fontSize = 'smaller';

    return cell;
}

// a cell's content, with its footnote markers and symbols. both are used
// exactly as hydrate.ts gives them -- a footnote's already '<sup>a</sup>',
// and a symbol's already whatever it needs to be, plain ('*') or its own
// markup ('<sup>μ</sup>') -- so there's nothing to add to them here (cf.
// resultsview/table.ts, which likewise appends cell.sups as given). they're
// positioned out of flow, so a trailing sup doesn't count towards the
// cell's own width -- otherwise a value with one (e.g. '0.578***') would
// sit out of line with the plain values above/below it in the same,
// right-aligned column (cf. table.ts's '.jmv-results-table-sup', and
// tableCell()'s position: relative and reserved padding for 'r' cells)
function cellNodes(cell: ICell): Array<Node> {
    const nodes = chunkNodes(cell.chunks);
    if (cell.sups && cell.sups.length > 0) {
        const sups = document.createElement('span');
        sups.style.position = 'absolute';
        sups.style.paddingInlineStart = '2px';
        sups.append(...chunkNodes(html2Chunks(cell.sups.join(''))));
        nodes.push(sups);
    }
    return nodes;
}

function generatePreformatted(preformatted: IPreformatted, parent: HTMLElement, level: number, context: IContext): void {
    if (preformatted.syntax && ! context.showSyntax)
        return;
    if (preformatted.title)
        parent.appendChild(heading(preformatted.title, level));
    const pre = document.createElement('pre');
    pre.style.fontFamily = MONO;
    pre.textContent = preformatted.content || '';
    parent.appendChild(pre);
    parent.append(...refNumbers(preformatted.refs, context));
}

// formatted text (annotations, notices, html/text elements)
function generateText(text: IText, parent: HTMLElement, level: number, context: IContext): void {

    // a notice sits in a box, with its title
    let container = parent;
    if (text.box) {
        const box = document.createElement('div');
        box.style.borderLeft = `4px solid ${ BOX_COLORS[text.box - 1] || BOX_COLORS[0] }`;
        box.style.backgroundColor = BOX_FILLS[text.box - 1] || BOX_FILLS[0];
        box.style.padding = '8px 12px';
        parent.appendChild(box);
        container = box;
    }
    if (text.title) {
        const p = document.createElement('p');
        p.style.fontWeight = 'bold';
        p.textContent = text.title;
        container.appendChild(p);
    }

    // the lists currently open, outermost first; a list item's indent is
    // its nesting depth, so a deeper item opens a list inside the last item
    const lists: Array<HTMLElement> = [];

    for (const paragraph of text.paragraphs) {
        const attrs = paragraph.attributes || {};

        if (attrs.list) {
            const depth = (attrs.indent || 0) + 1;
            const tag = attrs.list === 'ordered' ? 'OL' : 'UL';
            lists.splice(depth);
            // a change of list type at the same depth begins a new list
            if (lists.length === depth && lists[depth - 1].tagName !== tag)
                lists.pop();
            while (lists.length < depth) {
                const list = document.createElement(tag);
                const outer = lists[lists.length - 1];
                const host = outer ? (outer.lastElementChild || outer) : container;
                host.appendChild(list);
                lists.push(list);
            }
            const li = document.createElement('li');
            li.append(...chunkNodes(paragraph.chunks));
            if (attrs.align)
                li.style.textAlign = attrs.align;
            lists[lists.length - 1].appendChild(li);
            continue;
        }

        // a paragraph outside the list ends it
        lists.splice(0);

        let el: HTMLElement;
        if (attrs.header) {
            // 1 is directly beneath the containing element
            el = heading('', level + attrs.header - 1);
        }
        else if (attrs.codeBlock) {
            el = document.createElement('pre');
            el.style.fontFamily = MONO;
        }
        else {
            el = document.createElement('p');
        }

        if (paragraph.chunks.length > 0)
            el.append(...chunkNodes(paragraph.chunks));
        else
            el.appendChild(document.createElement('br'));  // a blank line
        if (attrs.align)
            el.style.textAlign = attrs.align;
        if (attrs.indent)
            el.style.marginLeft = `${ attrs.indent * 36 }px`;

        container.appendChild(el);
    }

    parent.append(...refNumbers(text.refs, context));
}

// an Html result's content, dropped in verbatim (see IHydrateOptions.
// verbatimHtml): unlike every other element here, nothing is rebuilt/
// restyled to match the rest of the document, so whatever the source
// markup/styling was survives the clipboard/html export as-is
function generateVerbatimHtml(item: IVerbatimHtml, parent: HTMLElement, context: IContext): void {
    const div = document.createElement('div');
    div.innerHTML = item.content;
    parent.appendChild(div);
    parent.append(...refNumbers(item.refs, context));
}

function alignment(align: string): string {
    switch (align) {
        case 'l': return 'left';
        case 'c': return 'center';
        case 'r': return 'right';
    }
    return align;
}

// chunks as nodes, each wrapped in the elements for its formatting
function chunkNodes(chunks: Array<ITextChunk>): Array<Node> {
    return chunks.map((chunk) => {
        const attrs = chunk.attributes || {};
        let node: Node = document.createTextNode(chunk.content);

        // wraps the node so far; innermost first
        const wrap = (tag: string, style?: (el: HTMLElement) => void) => {
            const el = document.createElement(tag);
            if (style)
                style(el);
            el.appendChild(node);
            node = el;
        };

        if (attrs.code)
            wrap('code', (el) => el.style.fontFamily = MONO);
        else if (attrs.formula)
            wrap('i', (el) => el.style.fontFamily = "'Cambria Math', serif");
        if (attrs.script === 'super')
            wrap('sup');
        else if (attrs.script === 'sub')
            wrap('sub');
        if (attrs.strike)
            wrap('s');
        if (attrs.underline)
            wrap('u');
        if (attrs.italic)
            wrap('em');
        if (attrs.bold)
            wrap('strong');
        if (attrs.color || attrs.background) {
            wrap('span', (el) => {
                if (attrs.color)
                    el.style.color = attrs.color;
                if (attrs.background)
                    el.style.backgroundColor = attrs.background;
            });
        }
        const link = attrs.link;
        if (link) {
            // opens in a new tab, so following a link -- e.g. a reference's
            // link to jamovi.org -- doesn't navigate away from the exported
            // document itself (cf. main/references.ts's Reference.setup(),
            // which keeps the literal target="_blank" that referenceAsHTML()
            // writes into the reference text; that's lost by the time it
            // reaches here, since html2Chunks() only carries a link's href)
            wrap('a', (el) => {
                const a = el as HTMLAnchorElement;
                a.href = link;
                a.target = '_blank';
                a.rel = 'noopener noreferrer';
            });
        }

        return node;
    });
}
