
import { hasAttr } from './hydrate';
import { IElement } from './hydrate';
import { ITable } from './hydrate';
import { IText } from './hydrate';
import { ITextChunk } from './hydrate';
import { IReference } from '../references';

export interface IHTMLifyOptions {
    level?: number;
    rtlLanguage?: boolean;
    showSyntax?: boolean;
}

export function htmlify(item: IElement, options?: IHTMLifyOptions): string {
    // handle falling back to defaults, if the option parameter is not given
    options = options || {};
    options.level = options.level ?? 1;
    options.rtlLanguage = options.rtlLanguage ?? false;
    options.showSyntax = options.showSyntax ?? false;

    const doc = document.implementation.createHTMLDocument('Results');
    const body = doc.body;

    _populate(item, body, options.level, options.rtlLanguage, options.showSyntax);

    return '<!doctype html>\n' + doc.documentElement.outerHTML;
}

// ensures that references (that may overlap for different analyses)
// appear only once
export function unfifyRefs(): Array<IReference> {
    const output = [];

    // TBA

    return output;
}

// assign each reference (originally an array with names) a unique
// index (pointing to the resepctive reference created by unifyRefs)
export function assignRefs(): Array<string> {
    const output = [];

    // TBA

    return output;
}

function _populate(item: IElement, parent: HTMLElement, level: number,
                   rtlLanguage: boolean, showSyntax: boolean): void {
    if (item.type === 'group') {
        if (item.title) {
            parent.appendChild(createHeader(level, item.title))
        }
        for (let child of item.items) {
            _populate(child, parent, level > -1 ? level + 1 : level, rtlLanguage, showSyntax);
        }
    }
    else if (item.type === 'image') {
        const image = document.createElement('img');
        image.width = item.width;
        image.height = item.height;
        image.src = item.path || '';
        image.title = item.title || 'PLACEHOLDER';
        image.alt = item.title || 'PLACEHOLDER';
        parent.appendChild(image);
    }
    else if (item.type === 'table') {
        generateTable(item, parent);
    }
    else if (item.type === 'preformatted' && (!item.syntax || showSyntax)) {
        const para = document.createElement('p');
        const code = document.createElement('pre');
        code.innerText = item.content;
        para.appendChild(code);
        parent.appendChild(textMargin(para));
    }
    else if (item.type === 'text') {
        generateText(item, parent, level);
    }
    parent.appendChild(emptyPara());
}

function decodeAlign(abbr: string): string {
    return abbr.replace('l', 'left').replace('r', 'right').replace('c', 'center').replace('j', 'justify');
}

function createHeader(level: number, title: string): DocumentFragment {
    let fragment = document.createDocumentFragment();

    if (level >= 0 && title) {
        const hdr = document.createElement('h' + level.toString())
        hdr.textContent = title;
        fragment.appendChild(hdr);
    }

    return fragment;
}

function pxVals2Str(pxVals: Array<number>): string {
    return pxVals.map(v => v.toString() + 'px').join(' ')
}

function textMargin(elem: HTMLElement, indent?: number, prevNode?: string): HTMLElement {
    indent = indent || 0;
    prevNode = prevNode || '';
    const marginVals = [0, 0, 0, 0];

    if (['OL', 'UL'].includes(elem.nodeName)) {
        marginVals[3] += 18;
    }
    else if (['LI'].includes(elem.nodeName)) {
        marginVals[3] += 18;
    }
    else if (['P'].includes(elem.nodeName)) {
        marginVals[0] += ['P', 'UL', 'OL'].includes(prevNode) ? 12 : 0;
    }

    if (indent > 0) {
        marginVals[3] += indent * 36;
    }

    elem.style.margin = pxVals2Str(marginVals);

    return elem
}

function padCell(elem: HTMLElement, cellFmt: number, isFtr?: boolean, isTtl?: boolean): HTMLElement {
    cellFmt = cellFmt || 0;
    isFtr = isFtr || false;
    isTtl = isTtl || false;
    const padVals = isFtr ? [2, 8, 2, 8] : [4, 8, 4, 8];

    if (isTtl) {
        padVals[3] = 0;
    }
    if ((cellFmt & 1) === 1) {
        padVals[0] += 4;
    }
    if ((cellFmt & 2) === 2) {
        padVals[2] += 4;
    }
    // cellFmt is NEGATIVE (red) and doesn't affect padding
    if ((cellFmt & 8) === 8) {
        padVals[3] += 16;
    }
    if (elem.style.textAlign && elem.style.textAlign === 'right') {
        padVals[1] += 12;
    }

    elem.style.padding = pxVals2Str(padVals);

    return elem
}

function emptyPara(): HTMLElement {
    const para = document.createElement('p');

    return textMargin(para);
}

function generateTable(item: ITable, parent: HTMLElement): void {
    let skipRows = new Array(item.nCols).fill(0);
    let tr: HTMLTableRowElement;
    let tc: HTMLTableCellElement;
    const table = document.createElement('table');
    const thead = document.createElement('thead');
    const tbody = document.createElement('tbody');
    const rowType = item.rows.map(r => r.type);
    const rowBorder = [rowType.indexOf('body') - 1, rowType.lastIndexOf('body')];
    const styBorder = '1px solid rgb(51, 51, 51)';

    // create header with table title
    tr = document.createElement('tr');
    tc = document.createElement('th');
    tc.textContent = item.title;
    tc.style.textAlign = 'left';
    tc.style.borderBottom = styBorder;
    tc.colSpan = item.nCols;
    tr.appendChild(padCell(tc, 0, false, true));
    thead.appendChild(tr);

    // create table
    for (let [i, row] of item.rows.entries()) {
        let skipCols = 0;
        const cellType = ['superTitle', 'title'].includes(row.type) ? 'th' : 'td';
        // bit to set in cellFmt (see below) if the line is either the first (bitBfr) or
        // the last line (bitAft) of the table body
        const bitBfr = (i === (rowBorder[0] + 1) ? 1 : 0);
        const bitAft = (i === (rowBorder[1] + 0) ? 2 : 0);

        tr = document.createElement('tr');
        for (let [j, cell] of row.cells.entries()) {
            const cellFmt = (cell && cell.format ? cell.format : 0) | bitBfr | bitAft;

            if (skipCols > 0) {
                --skipCols;
                continue;
            }
            if (skipRows[j] > 0) {
                --skipRows[j];
                continue;
            }
            tc = document.createElement(cellType);
            if (cell) {
                let content = cell.content;
                if (cell.sups && cell.sups.length > 0) {
                    tc.appendChild(formatSups(content, cell.sups, ['footnote'].includes(row.type)));
                }
                else {
                    tc.textContent = content;
                }
                if (cell.colSpan) {
                    tc.colSpan = cell.colSpan;
                    skipCols = cell.colSpan - 1;
                }
                if (cell.rowSpan) {
                    tc.rowSpan = cell.rowSpan;
                    tc.style.verticalAlign = 'top';
                    skipRows[j] = cell.rowSpan - 1;
                }
                if (cell.align) {
                    tc.style.textAlign = decodeAlign(cell.align);
                }
                if (['superTitle'].includes(row.type)) {
                    tc.style.borderBottom = styBorder;
                }
            }
            if (rowBorder.includes(i)) {
                tc.style.borderBottom = styBorder;
            }

            tr.appendChild(padCell(tc, cellFmt, row.type === 'footnote'));
        }
        if (cellType === 'th') {
            thead.appendChild(tr);
        }
        else {
            tbody.appendChild(tr);
        }
    }

    table.appendChild(thead);
    table.appendChild(tbody);
    parent.appendChild(table);
}

function generateText(item: IText, parent: HTMLElement, level: number): void {
    let calgn = 'left';
    let clist = '';
    let cindt = 0;
    let elem: HTMLElement = undefined;
    let list: HTMLElement = undefined;
    let litm: HTMLElement = undefined;
    let para: HTMLElement = document.createElement('p');

    for (const chunk of item.chunks) {
        const prevNode = (parent.lastElementChild) ? parent.lastElementChild.nodeName : '';

        // headers
        if (hasAttr(chunk, 'header')) {
            parent.appendChild(createHeader((level > -1 ? level + chunk.attributes.header : level), chunk.content));
        }
        // lists: [1] append previous list
        if (clist !== (hasAttr(chunk, 'list') ? chunk.attributes.list : '')) {
            if (clist !== '' && list.children.length + list.childNodes.length > 0) {
                parent.appendChild(textMargin(list, cindt, prevNode));
            }
        }
        // paragraphs: [1] append previous paragraph if alignment or indentation changes
        // needs to come after list formatting is finished, as list formatting is embedded
        // in formatting alignment)
        if (calgn !== (hasAttr(chunk, 'align') ? chunk.attributes.align : 'left') ||
            cindt !== (hasAttr(chunk, 'indent') ? parseInt(chunk.attributes.indent) : 0)) {
            if (para.children.length + para.childNodes.length > 0) {
                parent.appendChild(textMargin(para, cindt, prevNode));
            }
        }
        // format paragraphs: [2] begin new alignment or indentation
        if (calgn !== (hasAttr(chunk, 'align') ? chunk.attributes.align : 'left') ||
            cindt !== (hasAttr(chunk, 'indent') ? parseInt(chunk.attributes.indent) : 0)) {
                calgn = (hasAttr(chunk, 'align') ? chunk.attributes.align : 'left');
                cindt = (hasAttr(chunk, 'indent') ? parseInt(chunk.attributes.indent) : 0);
                para = document.createElement('p');
                if (calgn !== 'left') {
                    para.style.textAlign = calgn;
                }
        }
        // format lists: [2] begin new list
        if (clist !== (hasAttr(chunk, 'list') ? chunk.attributes.list : '')) {
            clist = (hasAttr(chunk, 'list') ? chunk.attributes.list : '');
            if (clist !== '') {
                list = document.createElement(clist === 'ordered' ? 'ol' : 'ul');
                litm = document.createElement('li');
            }
        }
        // list items as well as paragraphs may consist of several chunks which need to be
        // concatenated until a CR is encountered; at this the list / paragraph is appended
        // to the parent element and a new list item / paragraph is started
        // formatAttr formats other attributes (if the chunk doesn't contain attributes,
        // then the content is appended without any formatting
        if (hasAttr(chunk, 'list')) {
            if (chunk.content.endsWith('\n')) {
                litm.appendChild(formatAttr(chunk));
                list.appendChild(textMargin(litm, cindt, prevNode));
                litm = document.createElement('li');
            }
            else {
                // format other attributes (if the chunk doesn't contain attributes,
                // then the content remains unchanged)
                litm.appendChild(formatAttr(chunk));
            }
        }
        else {
            if (chunk.content.endsWith('\n')) {
                // append the current chunk, if it has content ('\n' doesn't)
                if (chunk.content !== '\n') {
                    para.appendChild(formatAttr(chunk));
                }
                parent.appendChild(textMargin(para, cindt, prevNode));
                para = document.createElement('p');
            }
            else {
                para.appendChild(formatAttr(chunk));
            }
        }
    }

    if (item.refs) {
        para = document.createElement('p');
        para.textContent = item.refs.join(', ');
        parent.appendChild(textMargin(para, 0, parent.lastElementChild ? parent.lastElementChild.nodeName : ''));
    }
}

function formatAttr(chunk: ITextChunk): DocumentFragment {
    let content = chunk.content.substring(0, chunk.content.length - (chunk.content.endsWith('\n') ? 1 : 0));
    let elements = [];
    let fragment = document.createDocumentFragment();

    if (hasAttr(chunk, 'formula')) {
        content = 'Please copy the formula into a web page that converts LaTeX to images and insert it into your document: ' + content;
    }

    if (hasAttr(chunk, 'color') || hasAttr(chunk, 'background') || hasAttr(chunk, 'strike')) {
        const span = document.createElement('span');
        if (hasAttr(chunk, 'color')) {
            span.style.color = chunk.attributes ? chunk.attributes.color : '#000000';
        }
        if (hasAttr(chunk, 'background')) {
            span.style.backgroundColor = chunk.attributes ? chunk.attributes.background : '#FFFFFF';
        }
        if (hasAttr(chunk, 'strike')) {
            span.style.textDecoration = "line-through";
        }

        elements.push(span);
    }
    if (hasAttr(chunk, 'bold')) {
        elements.push(document.createElement('strong'));
    }
    if (hasAttr(chunk, 'italic')) {
        elements.push(document.createElement('em'));
    }
    if (hasAttr(chunk, 'underline')) {
        elements.push(document.createElement('u'));
    }
    if (hasAttr(chunk, 'code-block')) {
        elements.push(document.createElement('pre'));
    }
    if (hasAttr(chunk, 'script') && chunk.attributes && chunk.attributes.script === 'super') {
        elements.push(document.createElement('sup'));
    }
    if (hasAttr(chunk, 'script') && chunk.attributes && chunk.attributes.script === 'sub') {
        elements.push(document.createElement('sub'));
    }
    if (hasAttr(chunk, 'link')) {
        const a = document.createElement('a');
        a.href = chunk.attributes ? chunk.attributes.link : '';
        elements.push(a);
    }

    if (elements.length > 0) {
        elements[elements.length - 1].innerText = content;
        while (elements.length > 1) {
            elements[elements.length - 2].appendChild(elements.pop());
        }
        fragment.appendChild(elements.pop());
    }
    else {
        fragment.textContent = content;
    }

    return fragment;
}

function formatSups(content: string, sups: Array<string>, isFN: boolean): DocumentFragment {
    let fragment = document.createDocumentFragment();

    if (isFN) {
        if (sups[0] === 'note') {
            // general and significance notes
            const note = document.createElement('em');
            note.innerText = 'Note.'
            fragment.appendChild(note);
            fragment.appendChild(document.createTextNode('\u00A0' + replace4HTML(content)));
        }
        else {
            // specific notes
            const note = document.createElement('sup');
            note.innerText = sups.join(',');
            fragment.appendChild(note);
            fragment.appendChild(document.createTextNode('\u00A0' + replace4HTML(content)));
        }
    }
    else {
        const note = document.createElement('sup');
        note.innerText = replace4HTML(sups.join(','));
        fragment.appendChild(document.createTextNode(content + ' '));
        fragment.appendChild(note);
    }

    return fragment;
}

function formatRefs(level: number, references?: Array<IReference>): DocumentFragment {
    let fragment = document.createDocumentFragment()

    fragment.appendChild(createHeader(level, 'References'));

    // walk though the references
    for (const currRef of references) {
    }

    return fragment;
}

// replace non-printable characters
function replace4HTML(content: string): string {
    const stringRepl = {
                        // jamovi output that with non-printable characters that need conversion
                        '<sup>μ</sup>': 'μ', // superscripts (footnotes, etc.)
                       };

    for (const [target, replace] of Object.entries(stringRepl)) {
        content = content.replaceAll(target, replace);
    }

    return content;
}
