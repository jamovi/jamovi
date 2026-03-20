
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
    inclRefs?: boolean;
    images?: string;
    generator?: string;
    charset?: string;
    margin?: number; 
}

export function htmlify(item: IElement,
                        options?: IHTMLifyOptions,
                        refNames?: Array<string>,
                        doc?: HTMLDocument): HTMLDocument {
    // for parameter option ensure that for any options not given, there is a fall back to defaults
    options = checkOptions(options);
    // create an empty array if refNames is not given of inclRefs is false
    refNames = refNames || [];
    refNames = options.inclRefs ? refNames : []
    // if the parameter doc is not given, create a new HTML document
    if (! doc) {
        doc = htmlSetupDoc(options);
    }

    // append contents to the document body
    populateElements(item, doc.body, options, refNames);

    return doc;
}

export function htmlSetupDoc(options: IHTMLifyOptions, doc?: HTMLDocument): HTMLDocument {
    options = checkOptions(options);
    let metaExists;
    let metaCreate;

    if (!doc) {
        doc = document.implementation.createHTMLDocument('Results');
    }
    
    // set meta-tags: generator, charset, ...
    const metaNames = ['generator', 'charset'];
    for (let name of metaNames) {
        metaExists = doc.querySelector(`meta[name='${name}']`);
        if (metaExists) {``
            metaExists.setAttribute('content', options[name]);
        } else {
            metaCreate = doc.createElement('meta');
            metaCreate.name = name;
            metaCreate.content = options[name];
            doc.head.appendChild(metaCreate);
        }
    }

    // set document style (CSS)
    const style = document.createElement('style');
    style.innerHTML = `
    body {
        font-family: "Segoe UI",Roboto,Helvetica,Arial,sans-serif,"Segoe UI Emoji","Segoe UI Symbol" ;
        color: #333333;
        cursor: default;
        margin: ${options.margin}px;
        font-size: 12px;
    }

    h1 {
        font-size: 160%;
        color: #3E6DA9;
        margin-bottom: 12px;
        white-space: nowrap;
    }

    h2 {
        font-size: 130%;
        margin-bottom: 12px;
        color: #3E6DA9;
    }

    h3, h4, h5 {
        font-size: 110%;
        margin-bottom: 12px;
    }

    table {
        border-spacing: 0;
        page-break-inside: avoid;
    }

    table tr td, table tr th {
        page-break-inside: avoid;
        font-size: 12px;
    }

    .note {
        color: #3E6DA9;
        margin: 5px 0px;
    }`;
    doc.head.appendChild(style);

    // set text direction: LTR / RTL
    doc.body.dir = options.rtlLanguage ? "rtl" : "ltr";

    return doc;
}

export function formatRefs(references: Array<IReference>, doc: HTMLDocument): HTMLDocument {
    let refPara: HTMLElement;
    let refIndex: HTMLElement;
    let refTextN1: Text;
    let refTextI:  HTMLElement;
    let refTextN2: Text;    
    const heading = createHeader(1, 'References');
    doc.body.appendChild(heading);

    // walk though the references
    for (let [i, currRef] of references.entries()) {
        refPara = document.createElement('p');
        refIndex = document.createElement('strong');
        refIndex.innerText = `[${i + 1}]`;
        refPara.appendChild(refIndex);
        refTextN1 = document.createTextNode('');
        refTextI = document.createElement('em');
        refTextN2 = document.createTextNode('');
        // assign elements accordingly to reference type
        if (currRef.type === 'software') {
            refTextN1.textContent = ' ' + currRef.authors.complete + ' (' + currRef.year2 + '). ';
            refTextI.textContent = currRef.title + '.';
            refTextN2.textContent = ' ' + currRef.publisher + '.' + (currRef.extra ? (' ' + currRef.extra + '.') : '');
        }
        else if (currRef.type === 'article') {
            refTextN1.textContent = ' ' + currRef.authors.complete + ' (' + currRef.year2 + '). ' + currRef.title + '. ';
            refTextI.textContent = currRef.publisher + ', ' + currRef.volume + (currRef.issue ? ('(' + currRef.issue + ')') : '');
            refTextN2.textContent = ', ' +  currRef.pages + '. ' + currRef.url;
        }
        refPara.appendChild(refTextN1);
        refPara.appendChild(refTextI);
        refPara.appendChild(refTextN2);
        doc.body.appendChild(refPara)
    }

    return doc;
}

function checkOptions(options?: IHTMLifyOptions): IHTMLifyOptions {
    options = options || {};
    options.level = options.level ?? 1;
    options.rtlLanguage = options.rtlLanguage ?? false;
    options.showSyntax = options.showSyntax ?? false;
    options.inclRefs = options.inclRefs ?? false;
    options.images = options.images ?? 'inline';
    options.generator = options.generator ?? 'jamovi';
    options.charset = options.charset ?? 'utf-8';
    options.margin = options.margin ?? 24;

    return options;
}

// if not -1 (no headings), otherwise increase level by 1 or
// set to specified level (if given)
function incrLevel(level: number, setTo?: number): number {
    return level === -1 ? -1 : (setTo ?? level + 1);
}

function populateElements(item: IElement, parent: HTMLElement,
                          options: IHTMLifyOptions,
                          refNames: Array<string>): void {
    let para: HTMLElement;

    // if the item has a reference, replace it with the respective index
    if (item.refs && options.inclRefs) {
        item.refs = item.refs.map(r => String(refNames.indexOf(r) + 1));
    }
    else if (!options.inclRefs) {
        delete item.refs;
    }
    const div = document.createElement('div');
    // process the items according to their type
    if (item.type === 'group') {
        if (item.title) {
            div.appendChild(createHeader(options.level, item.title))
        }
        options = Object.assign({}, options); // clone
        options.level = incrLevel(options.level);
        for (let child of item.items) {
            populateElements(child, div, options, refNames);
        }
        if (item.refs) {
            para = addRefsPara(item.refs);
            div.appendChild(para);
        }
        div.appendChild(emptyPara());
    }
    else if (item.type === 'image') {
        const image = document.createElement('img');
        image.width = item.width;
        image.height = item.height;
        image.src = item.path || '';
        if (item.title) {
            image.title = item.title;
            image.alt = item.title;
        }
        div.appendChild(image);
        if (item.refs) {
            para = addRefsPara(item.refs);
            div.appendChild(para);
        }
        div.appendChild(emptyPara());
    }
    else if (item.type === 'table') {
        generateTable(item, div);
    }
    else if (item.type === 'preformatted' && (!item.syntax || options.showSyntax)) {
        para = document.createElement('p');
        const code = document.createElement('pre');
        code.innerText = item.content;
        para.appendChild(code);
        para = textMargin(para);
        div.appendChild(para);
        if (item.refs) {
            para = addRefsPara(item.refs);
            div.appendChild(para);
        }
        div.appendChild(emptyPara());
    }
    else if (item.type === 'text') {
        generateText(item, div, options.level);
    }
    parent.appendChild(div);
}

function decodeAlign(abbr: string): string {
    return abbr.replace('l', 'left').replace('r', 'right').replace('c', 'center').replace('j', 'justify');
}

function createHeader(level: number, title: string): DocumentFragment {
    let fragment = document.createDocumentFragment();

    if (level > 0 && title) {
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

    return elem;
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
    const tfoot = document.createElement('tfoot');
    const tbody = document.createElement('tbody');
    const rowType = item.rows.map(r => r.type);
    const styMidlBorder = '1px solid rgb(51, 51, 51)';
    const styLastBorder = '2px solid rgb(51, 51, 51)';

    // create header with table title
    tr = document.createElement('tr');
    tc = document.createElement('th');
    tc.textContent = item.title;
    tc.style.textAlign = 'left';
    tc.style.borderBottom = styMidlBorder;
    tc.colSpan = item.nCols;
    tr.appendChild(padCell(tc, 0, false, true));
    thead.appendChild(tr);

    // create table
    for (let [i, row] of item.rows.entries()) {
        let skipCols = 0;
        const cellType = ['superTitle', 'title'].includes(row.type) ? 'th' : 'td';
        // bit to set in cellFmt (see below) if the line is either the first (bitBfr) or
        // the last line (bitAft) of the table body
        const bitBfr = (i === rowType.indexOf('body') ? 1 : 0);
        const bitAft = (i === rowType.lastIndexOf('body') ? 2 : 0);

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
                    tc.style.borderBottom = styMidlBorder;
                }
            }
            if (i + skipRows[j] === rowType.indexOf('body') - 1) {
                tc.style.borderBottom = styMidlBorder;
            }
            else if (i + skipRows[j] === rowType.lastIndexOf('body')) {
                tc.style.borderBottom = styLastBorder;
            }
            tr.appendChild(padCell(tc, cellFmt, ['footnote'].includes(row.type)));
        }
        if (cellType === 'th') {
            thead.appendChild(tr);
        }
        else if (cellType === 'td' && ['body'].includes(row.type)) {
            tbody.appendChild(tr);
        }
        else if (cellType === 'td' && ['footnote'].includes(row.type)) {
            tfoot.appendChild(tr);
        }
    }

    // references
    if (item.refs) {
        tr = document.createElement('tr');
        tc = document.createElement('th');
        tc.textContent = joinRefs(item.refs);
        tc.style.textAlign = 'right';
        tc.colSpan = item.nCols;
        tr.appendChild(padCell(tc, 0, false, true));
        tfoot.appendChild(tr);
    }

    // empty line after table
    const para = document.createElement('p');
    para.innerHTML = '&nbsp;'

    table.appendChild(thead);
    table.appendChild(tbody);
    table.appendChild(tfoot);
    parent.appendChild(table);
    parent.appendChild(para);
}

function generateText(item: IText, parent: HTMLElement, level: number): void {
    let calgn = 'left';
    let clist = '';
    let cindt = 0;
    let list: HTMLElement = document.createElement('ul');
    let litm: HTMLElement = document.createElement('li');
    let para: HTMLElement = document.createElement('p');
    para.className = 'note';

    for (const chunk of item.chunks) {
        const prevNode = prevNodeName(parent);

        // headers
        if (hasAttr(chunk, 'header')) {
            parent.appendChild(createHeader(incrLevel(level, chunk.attributes.header), chunk.content));
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
                para.className = 'note';
                if (calgn !== 'left') {
                    para.style.textAlign = calgn;
                }
        }
        // format lists: [2] begin new list
        if (clist !== (hasAttr(chunk, 'list') ? chunk.attributes.list : '')) {
            clist = (hasAttr(chunk, 'list') ? chunk.attributes.list : '');
            if (clist !== '') {
                list = document.createElement(clist === 'ordered' ? 'ol' : 'ul');
                list.className = 'note';
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
                para.className = 'note';
            }
            else {
                para.appendChild(formatAttr(chunk));
            }
        }
    }

    if (item.refs) {
        para = addRefsPara(item.refs);
        parent.appendChild(para);
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
            const name = document.createElement('em');
            name.innerText = 'Note.'
            fragment.appendChild(name);
            const span = document.createElement('span');
            span.innerHTML = '\u00A0' + content;
            fragment.appendChild(span);
        }
        else {
            // specific notes
            const note = document.createElement('sup');
            note.innerText = sups.join(',');
            fragment.appendChild(note);
            const span = document.createElement('span');
            span.innerHTML = '\u00A0' + content;
            fragment.appendChild(span);
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

function prevNodeName(parent: HTMLElement): string {
    return parent.lastElementChild ? parent.lastElementChild.nodeName : ''    
}

function addRefsPara(refs: Array<string>): HTMLElement {
    const para = document.createElement('p');
    const strong = document.createElement('strong');
    strong.textContent = joinRefs(refs);
    para.appendChild(strong);
    para.style.textAlign = 'right';
    return para;
}

function joinRefs(refs: Array<string>) {
    return `[${refs.join('] [')}]`;  // like today [1] [2]
//  return `[${refs.join(', ')}]`;   // [1, 2]
//  return `[${refs.join('], [')}]`; // [1], [2]
}
