
// converts hydrated results into markdown: a single element for the
// clipboard's plain text flavour (markdownify()), or a whole document
// (createDoc()). it's what's pasted wherever text is preferred over html --
// chat apps (chatgpt, gemini), slack, github, editors -- most of which
// render markdown, and where it otherwise still reads fine as text. the
// structure mirrors htmlify.ts, so the two agree on what's produced

import { IElement, ITable, IRow, ICell, IImage, IPreformatted, IText, IVerbatimHtml, ITextChunk, IChunkAttributes } from './hydrate';
import { html2Chunks } from './hydrate';
import { IDocItem } from './htmlify';
import { IReference } from '../references';
import { referenceAsHTML } from '../references';

export interface IMarkdownifyOptions {
    level?: number;         // the heading level of the outermost element (default 1)
    showSyntax?: boolean;   // whether syntax elements are included (default false)
}

export interface IDocOptions {
    references?: Array<IReference>;
    showSyntax?: boolean;
    showRefs?: boolean;   // citations and the reference list, default true
}

// what's carried through the document as it's built
interface IContext {
    showSyntax: boolean;
    showRefs: boolean;
    refNames: Array<string>;
}

// a single element, as for the clipboard: no references
export function markdownify(item: IElement, options: IMarkdownifyOptions = {}): string {
    const context: IContext = {
        showSyntax: options.showSyntax ?? false,
        showRefs: false,
        refNames: [],
    };
    return populate(item, options.level ?? 1, context).join('\n\n');
}

// a whole document: the elements, with their reference numbers, and the
// reference list beneath (like htmlify's createDoc())
export function createDoc(items: Array<IDocItem>, options: IDocOptions = {}): string {
    const showRefs = options.showRefs ?? true;
    const references = showRefs ? (options.references || []) : [];

    const context: IContext = {
        showSyntax: options.showSyntax ?? false,
        showRefs,
        refNames: references.map((ref) => ref.name),
    };

    const blocks: Array<string> = [];
    for (const item of items)
        blocks.push(...populate(item.element, item.level ?? 1, context));

    if (references.length > 0) {
        blocks.push(heading('References', 1));
        references.forEach((ref, i) => {
            blocks.push(`[${ i + 1 }] ` + inline(html2Chunks(referenceAsHTML(ref))));
        });
    }

    return blocks.join('\n\n');
}

// the element as markdown blocks (paragraphs, tables, etc.), to be separated
// by blank lines
function populate(item: IElement, level: number, context: IContext): Array<string> {
    if (item.type === 'group') {
        const blocks: Array<string> = [];
        let childLevel = level;
        if (item.title) {
            blocks.push(heading(item.title, level));
            childLevel = level + 1;
        }
        for (const child of item.items)
            blocks.push(...populate(child, childLevel, context));
        return blocks;
    }
    else if (item.type === 'image') {
        return generateImage(item, context);
    }
    else if (item.type === 'table') {
        return generateTable(item, context);
    }
    else if (item.type === 'preformatted') {
        return generatePreformatted(item, level, context);
    }
    else if (item.type === 'text') {
        return generateText(item, level, context);
    }
    else if (item.type === 'html') {
        return generateVerbatimHtml(item, context);
    }
    return [];
}

// the "[1] [2]" reference numbers beneath an element, numbered as in the
// reference list (cf. htmlify's refNumbers())
function refNumbers(refs: Array<string> | undefined, context: IContext): Array<string> {
    if ( ! context.showRefs || ! refs || refs.length === 0)
        return [];
    const numbers = refs.map((name) => {
        const index = context.refNames.indexOf(name);
        return (index === -1) ? name : String(index + 1);
    });
    return [ numbers.map((n) => `[${ n }]`).join(' ') ];
}

function heading(title: string, level: number): string {
    level = Math.min(Math.max(level, 1), 6);
    return '#'.repeat(level) + ' ' + inline(html2Chunks(title));
}

// the image itself can't come along (as a data uri it would be enormous, and
// useless as text), so it's marked by its title
function generateImage(image: IImage, context: IContext): Array<string> {
    const title = image.title ? inline(html2Chunks(image.title)) : 'Image';
    return [ `*[${ title }]*`, ...refNumbers(image.refs, context) ];
}

// a gfm table, beneath its title in bold, with its notes beneath. markdown
// tables have a single header row and no merged cells, so the super titles
// are folded into the column titles beneath them ('95% CI Lower'), and a
// cell spanning down is shown once, at the top (as in the results view)
function generateTable(table: ITable, context: IContext): Array<string> {
    const blocks: Array<string> = [];

    if (table.title)
        blocks.push(`**${ inline(html2Chunks(table.title)) }**`);

    const nCols = table.nCols;
    if (nCols > 0) {
        const header = headerCells(table);
        const align = columnAlign(table);
        const body = table.rows
            .filter((r) => r.type === 'body')
            .map((r) => r.cells.map(bodyCell));

        // padded to line up, so it reads as a table as plain text too
        const widths = new Array(nCols).fill(3);
        for (const row of [ header, ...body ]) {
            row.forEach((cell, i) => widths[i] = Math.max(widths[i], textWidth(cell)));
        }

        const lines = [ tableRow(header, widths, align) ];
        lines.push('| ' + widths.map((width, i) => rule(width, align[i])).join(' | ') + ' |');
        for (const row of body)
            lines.push(tableRow(row, widths, align));

        blocks.push(lines.join('\n'));
    }

    for (const r of table.rows) {
        if (r.type === 'footnote') {
            const note = formatNote(r);
            if (note)
                blocks.push(note);
        }
    }

    blocks.push(...refNumbers(table.refs, context));
    return blocks;
}

// each column's titles, top to bottom, as the one header cell. a cell
// covered by one spanning across/down repeats its content (see hydrate.ts's
// ICell), so it's only added where it differs from the one above
function headerCells(table: ITable): Array<string> {
    const parts: Array<Array<string>> = [];
    for (let i = 0; i < table.nCols; i++)
        parts.push([]);

    for (const r of table.rows) {
        if (r.type !== 'superTitle' && r.type !== 'title')
            continue;
        r.cells.forEach((cell, i) => {
            if ( ! cell || ! cell.content)
                return;
            const content = cellText(cell, r.type === 'title');
            const column = parts[i];
            if (column[column.length - 1] !== content)
                column.push(content);
        });
    }

    return parts.map((column) => column.join(' '));
}

function bodyCell(cell: ICell | null): string {
    if ( ! cell || cell.rowSpan === 0 || cell.colSpan === 0)  // covered by the cell above/before
        return '';
    return cellText(cell, true);
}

// a cell's content, with its footnote markers and symbols (as given by
// hydrate.ts, cf. htmlify's cellNodes()). newlines would end the table row,
// and a pipe the cell
function cellText(cell: ICell, withSups: boolean): string {
    let text = inline(cell.chunks);
    if (withSups && cell.sups && cell.sups.length > 0)
        text += sups(cell.sups);
    return text.replace(/\s*\n\s*/g, ' ').replace(/\|/g, '\\|');
}

// a column's alignment is that of its body cells
function columnAlign(table: ITable): Array<'l' | 'c' | 'r'> {
    const align: Array<'l' | 'c' | 'r' | undefined> = new Array(table.nCols).fill(undefined);
    for (const r of table.rows) {
        if (r.type !== 'body')
            continue;
        r.cells.forEach((cell, i) => {
            if (cell && align[i] === undefined)
                align[i] = cell.align;
        });
    }
    return align.map((a) => a ?? 'l');
}

function tableRow(cells: Array<string>, widths: Array<number>, align: Array<string>): string {
    const padded = widths.map((width, i) => {
        const cell = cells[i] ?? '';
        const space = width - textWidth(cell);
        if (align[i] === 'r')
            return ' '.repeat(space) + cell;
        if (align[i] === 'c')
            return ' '.repeat(Math.floor(space / 2)) + cell + ' '.repeat(Math.ceil(space / 2));
        return cell + ' '.repeat(space);
    });
    return '| ' + padded.join(' | ') + ' |';
}

// the rule beneath the header, which carries the column's alignment
function rule(width: number, align: string): string {
    if (align === 'r')
        return '-'.repeat(width - 1) + ':';
    if (align === 'c')
        return ':' + '-'.repeat(width - 2) + ':';
    return ':' + '-'.repeat(width - 1);
}

// characters, rather than utf-16 code units (cf. 'η²')
function textWidth(text: string): number {
    return [ ...text ].length;
}

function formatNote(r: IRow): string {
    const parts: Array<string> = [];
    for (const cell of r.cells) {
        if ( ! cell || ! cell.content)
            continue;
        let prefix = '';
        if (cell.sups && cell.sups[0] === 'note')
            prefix = '*Note.* ';
        else if (cell.sups && cell.sups.length > 0)
            prefix = sups(cell.sups) + ' ';
        parts.push(prefix + inline(cell.chunks).trim());
    }
    return parts.join(' ');
}

// footnote markers and symbols. both are used as hydrate.ts gives them -- a
// footnote's '<sup>a</sup>', and a symbol's whatever it needs to be, plain
// ('*') or its own markup ('<sup>μ</sup>'). a symbol is left unescaped: a
// trailing '***' can't open any emphasis, and '\*\*\*' would read badly
function sups(values: Array<string>): string {
    return html2Chunks(values.join('')).map((chunk) => {
        if (chunk.attributes?.script)
            return script(chunk.content, chunk.attributes.script);
        return chunk.content;
    }).join('');
}

function generatePreformatted(preformatted: IPreformatted, level: number, context: IContext): Array<string> {
    if (preformatted.syntax && ! context.showSyntax)
        return [];
    const blocks: Array<string> = [];
    if (preformatted.title)
        blocks.push(heading(preformatted.title, level));
    blocks.push(fence((preformatted.content || '').replace(/\n+$/, '')));
    blocks.push(...refNumbers(preformatted.refs, context));
    return blocks;
}

// a code block, fenced by more backticks than it contains in a row
function fence(code: string): string {
    const longest = Math.max(0, ...(code.match(/`+/g) || []).map((run) => run.length));
    const marker = '`'.repeat(Math.max(3, longest + 1));
    return `${ marker }\n${ code }\n${ marker }`;
}

// formatted text (annotations, notices, html/text elements). a notice
// becomes a blockquote, with its title in bold
function generateText(text: IText, level: number, context: IContext): Array<string> {
    const blocks: Array<string> = [];

    if (text.title)
        blocks.push(`**${ escape(text.title) }**`);

    // the list open (its lines), and the item count at each depth
    let list: Array<string> | null = null;
    let counts: Array<number> = [];
    // the code block open (its lines)
    let code: Array<string> | null = null;

    const close = () => {
        if (list !== null)
            blocks.push(list.join('\n'));
        if (code !== null)
            blocks.push(fence(code.join('\n')));
        list = null;
        code = null;
    };

    for (const paragraph of text.paragraphs) {
        const attrs = paragraph.attributes || {};

        if (attrs.codeBlock && ! attrs.list) {
            if (code === null) {
                close();
                code = [];
            }
            code.push(paragraph.chunks.map((chunk) => chunk.content).join(''));
            continue;
        }

        if (attrs.list) {
            if (list === null) {
                close();
                list = [];
                counts = [];
            }
            // a list item's indent is its nesting depth
            const depth = attrs.indent || 0;
            counts.splice(depth + 1);
            while (counts.length <= depth)
                counts.push(0);
            counts[depth] += 1;
            const marker = (attrs.list === 'ordered') ? `${ counts[depth] }. ` : '- ';
            list.push('    '.repeat(depth) + marker + inline(paragraph.chunks));
            continue;
        }

        close();

        if (paragraph.chunks.length === 0)  // a blank line
            continue;

        if (attrs.header) {
            // 1 is directly beneath the containing element
            blocks.push(heading('', level + attrs.header - 1) + inline(paragraph.chunks));
        }
        else {
            blocks.push(escapeLineStart(inline(paragraph.chunks)));
        }
    }

    close();

    if (text.box)
        return [ quote(blocks.join('\n\n')), ...refNumbers(text.refs, context) ];

    return [ ...blocks, ...refNumbers(text.refs, context) ];
}

function quote(text: string): string {
    return text.split('\n').map((line) => (line ? `> ${ line }` : '>')).join('\n');
}

// an Html result's content, as its text. markdownify is given the parsed
// IText/ITable rather than this (see IHydrateOptions.verbatimHtml), so this
// is a fallback only
function generateVerbatimHtml(item: IVerbatimHtml, context: IContext): Array<string> {
    const text = escapeLineStart(inline(html2Chunks(item.content)).trim());
    return [ ...(text ? [ text ] : []), ...refNumbers(item.refs, context) ];
}

// chunks as inline markdown. adjacent chunks with the same formatting are
// combined first, so a bold run split in two isn't '**a****b**'
function inline(chunks: Array<ITextChunk>): string {
    const merged: Array<ITextChunk> = [];
    for (const chunk of chunks) {
        const last = merged[merged.length - 1];
        if (last && sameAttributes(last.attributes, chunk.attributes))
            last.content += chunk.content;
        else
            merged.push({ ...chunk });
    }
    return merged.map(inlineChunk).join('');
}

function sameAttributes(a: IChunkAttributes = {}, b: IChunkAttributes = {}): boolean {
    const keys = new Set([ ...Object.keys(a), ...Object.keys(b) ]) as Set<keyof IChunkAttributes>;
    for (const key of keys) {
        if (a[key] !== b[key])
            return false;
    }
    return true;
}

// underline, colour and background have no markdown, and are dropped
function inlineChunk(chunk: ITextChunk): string {
    const attrs = chunk.attributes || {};

    if (attrs.code) {
        // backticks inside the code take a longer run of them around it
        const longest = Math.max(0, ...(chunk.content.match(/`+/g) || []).map((run) => run.length));
        const ticks = '`'.repeat(longest + 1);
        const pad = chunk.content.startsWith('`') || chunk.content.endsWith('`') ? ' ' : '';
        return link(`${ ticks }${ pad }${ chunk.content }${ pad }${ ticks }`, attrs);
    }

    if (attrs.formula)
        return link(`$${ chunk.content }$`, attrs);

    let text = escape(chunk.content);
    if (attrs.script)
        text = script(text, attrs.script);
    if (attrs.strike)
        text = wrap(text, '~~');
    if (attrs.italic)
        text = wrap(text, '*');
    if (attrs.bold)
        text = wrap(text, '**');
    return link(text, attrs);
}

function link(text: string, attrs: IChunkAttributes): string {
    if ( ! attrs.link)
        return text;
    return `[${ text }](${ attrs.link.replace(/[()\s]/g, encodeURIComponent) })`;
}

// surrounding whitespace has to sit outside the markers, or they don't count
function wrap(text: string, marker: string): string {
    const match = /^(\s*)(.*?)(\s*)$/s.exec(text)!;
    if (match[2] === '')
        return text;
    return match[1] + marker + match[2] + marker + match[3];
}

const SUPERSCRIPTS: { [ c: string ]: string } = {
    '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹',
    '+': '⁺', '-': '⁻', '=': '⁼', '(': '⁽', ')': '⁾',
    'a': 'ᵃ', 'b': 'ᵇ', 'c': 'ᶜ', 'd': 'ᵈ', 'e': 'ᵉ', 'f': 'ᶠ', 'g': 'ᵍ', 'h': 'ʰ', 'i': 'ⁱ',
    'j': 'ʲ', 'k': 'ᵏ', 'l': 'ˡ', 'm': 'ᵐ', 'n': 'ⁿ', 'o': 'ᵒ', 'p': 'ᵖ', 'r': 'ʳ', 's': 'ˢ',
    't': 'ᵗ', 'u': 'ᵘ', 'v': 'ᵛ', 'w': 'ʷ', 'x': 'ˣ', 'y': 'ʸ', 'z': 'ᶻ',
};

const SUBSCRIPTS: { [ c: string ]: string } = {
    '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄', '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉',
    '+': '₊', '-': '₋', '=': '₌', '(': '₍', ')': '₎',
    'a': 'ₐ', 'e': 'ₑ', 'h': 'ₕ', 'i': 'ᵢ', 'j': 'ⱼ', 'k': 'ₖ', 'l': 'ₗ', 'm': 'ₘ', 'n': 'ₙ',
    'o': 'ₒ', 'p': 'ₚ', 'r': 'ᵣ', 's': 'ₛ', 't': 'ₜ', 'u': 'ᵤ', 'v': 'ᵥ', 'x': 'ₓ',
};

// markdown has no super/subscript, so the unicode characters are used where
// every character has one (footnote letters, η², etc.). otherwise it's
// written out, as 'p_tukey' (which, being within a word, isn't emphasis)
// or 'x^μ' / 'x^(ab)'
function script(text: string, which: 'super' | 'sub'): string {
    const table = (which === 'super') ? SUPERSCRIPTS : SUBSCRIPTS;
    const chars = [ ...text ];
    if (chars.length > 0 && chars.every((c) => c in table))
        return chars.map((c) => table[c]).join('');
    if (which === 'sub')
        return '_' + text;
    if (chars.length === 1)
        return '^' + text;
    return `^(${ text })`;
}

// characters which would otherwise be taken as markdown. an underscore
// within a word can't be emphasis, so it's left alone (snake_case names
// are common), and a < only needs escaping where it could begin a tag
function escape(text: string): string {
    return text
        .replace(/([\\`*[\]])/g, '\\$1')
        .replace(/(?<![\p{L}\p{N}])_|_(?![\p{L}\p{N}])/gu, '\\_')
        .replace(/<(?=[a-zA-Z/!?])/g, '\\<');
}

// text at the start of a paragraph which would otherwise begin a heading,
// a list, or a blockquote
function escapeLineStart(text: string): string {
    return text
        .replace(/^(\s*)([#>+-])(?=\s|$)/, '$1\\$2')
        .replace(/^(\s*\d+)([.)])(?=\s|$)/, '$1\\$2');
}
