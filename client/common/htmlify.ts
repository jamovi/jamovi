import { hasAttr } from './utils';
import { IElement } from './hydrate';
import { IImage } from './hydrate';
import { ITable } from './hydrate';
import { IPreformatted } from './hydrate';
import { IText } from './hydrate';
import { ITextChunk } from './hydrate';
import { IReference } from '../main/references';

export function htmlify(item: IElement) {
    const doc = document.implementation.createHTMLDocument('Results');
    const body = doc.body;

    _populate(item, body, 1);

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

function _populate(item: IElement, parent: HTMLElement, level: number): void {
    if (item.type === 'group') {
        if (item.title) {
            const h = document.createElement(`h${ level }`);
            h.textContent = item.title;
            parent.appendChild(h);
        }
        for (let child of item.items) {
            _populate(child, parent, level + 1);
        }
    }
    else if (item.type === 'image') {
        const image = document.createElement('img');
        image.width = item.width;
        image.height = item.height;
        image.title = item.title || 'PLACEHOLDER';
        image.alt = item.title || 'PLACEHOLDER';
        parent.appendChild(image);
    }
    else if (item.type === 'table') {
        generateTable(item, parent);
    }
    else if (item.type === 'preformatted') {
        const preformatted = document.createElement('pre');
        preformatted.textContent = item.content;
        parent.appendChild(preformatted);
    }
    else if (item.type === 'text') {
        generateText(item, parent, level);
    }
    parent.appendChild(emptyPara());
}

function dcdAlign(abbr: string): string {
    return abbr.replace('l', 'left').replace('r', 'right').replace('c', 'center').replace('j', 'justify');
}

function generateTable(item: ITable, parent: HTMLElement): void {
    let skipRows = new Array(item.nCols).fill(0);
    let tr: HTMLTableRowElement;
    let tc: HTMLTableCellElement;
    const table = document.createElement('table');
    const thead = document.createElement('thead');
    const tbody = document.createElement('tbody');
    const bottomRow = item.rows.map(r => r.type != "footnote").lastIndexOf(true);

    // create header with table title
    tr = document.createElement('tr');
    tc = document.createElement('th');
    tc.textContent = item.title;
    tc.style.textAlign = 'left';
    tc.style.borderBottom = '1px solid black';
    tc.colSpan = item.nCols;
    tr.appendChild(tc);
    thead.appendChild(tr);

    // create table
    for (let [i, row] of item.rows.entries()) {
        let skipCols = 0;
        const cellType = ['superTitle', 'title'].includes(row.type) ? 'th' : 'td';

        tr = document.createElement('tr');
        for (let [j, cell] of row.cells.entries()) {
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
                    if (['footnote'].includes(row.type)) {
                        if (cell.sups[0] === 'note') {
                            // general and significance notes
                            content = '<em>Note.</em>&nbsp;' + content;
                        }
                        else {
                            // specific notes
                            content = '<sup>' + cell.sups.join(',') + '</sup>&nbsp' + content;
                        }
                    }
                    else {
                        content = content + ' <sup>' + cell.sups.join(', ') + '</<sup>';
                    }
                }
                tc.appendChild(formatAttr({content: content}));
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
                    tc.style.textAlign = dcdAlign(cell.align);
                }
                if (['superTitle'].includes(row.type)) {
                    tc.style.borderBottom = '1px solid black';
                }
            }
            if (['title'].includes(row.type)) {
                tc.style.borderBottom = '1px solid black';
            }
            if (i === bottomRow || (cell && cell.rowSpan && bottomRow === i + cell.rowSpan - 1)) {
                tc.style.borderBottom = '1px solid black';
            }

            tr.appendChild(tc);
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
    let citem = '';
    let cindt = 0;
    let elem: HTMLElement = undefined;
    let list: HTMLElement = undefined;
    let litm: HTMLElement = undefined;
    let para: HTMLElement = document.createElement('p');

    for (const chunk of item.chunks) {
        // headers
        if (hasAttr(chunk, 'header')) {
            elem = document.createElement('h' + (chunk.attributes.header + level).toString());
            elem.textContent = chunk.content;
            parent.appendChild(elem);
        }
        // lists: [1] append previous list
        if (clist !== (hasAttr(chunk, 'list') ? chunk.attributes.list : '')) {
            if (clist !== '' && list.children.length + list.childNodes.length > 0) {
                parent.appendChild(list);
            }
        }
        // paragraphs: [1] append previous paragraph if alignment or indentation changes
        // needs to come after list formatting is finished, as list formatting is embedded
        // in formatting alignment)
        if (calgn !== (hasAttr(chunk, 'align') ? chunk.attributes.align : 'left')) {
            if (para.children.length + para.childNodes.length > 0) {
                para.style.paddingTop = (['P', 'UL', 'OL'].includes(parent.lastElementChild.nodeName)  ? '12px' : '0px');
                parent.appendChild(para);
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
                if (cindt > 0) {
                    para.style.marginLeft = (36 * cindt).toString() + 'px';
                }
        }
        // format lists: [2] begin new list
        if (clist !== (hasAttr(chunk, 'list') ? chunk.attributes.list : '')) {
            clist = (hasAttr(chunk, 'list') ? chunk.attributes.list : '');
            if (clist !== '') {
                list = document.createElement(clist === 'ordered' ? 'ol' : 'ul');
            }
        }
        // list items as well as paragraphs may consist of several chunks which need to be
        // concatenated until a CR is encountered; at this the list / paragraph is appended
        // to the parent element and a new list item / paragraph is started
        // formatAttr formats other attributes (if the chunk doesn't contain attributes,
        // then the content is appended without any formatting
        if (hasAttr(chunk, 'list')) {
            if (chunk.content === '\n') {
                console.log('list - is \'\n\'');
            }
            else if (chunk.content.startsWith('\n')) {
                console.log('list - startsWith(\'\n\')');
            }
            else if (chunk.content.endsWith('\n')) {
                litm = document.createElement('li');
                litm.appendChild(formatAttr(chunk));
                list.appendChild(litm);
            }
            else {
                // format other attributes (if the chunk doesn't contain attributes,
                // then the content remains unchanged)
                litm.appendChild(formatAttr(chunk));
            }
        } else {
            if (chunk.content.endsWith('\n')) {
                // append the current chunk, if it has content ('\n' doesn't)
                if (chunk.content !== '\n') {
                    para.appendChild(formatAttr(chunk));
                }
                para.style.paddingTop = (['P', 'UL', 'OL'].includes(parent.lastElementChild.nodeName)  ? '12px' : '0px');
                parent.appendChild(para);
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
        para.style.padding = (['P', 'UL', 'OL'].includes(parent.lastElementChild.nodeName)  ? '12px' : '0px');
        parent.appendChild(para);
    }
}

function formatAttr(chunk: ITextChunk): DocumentFragment {
    let html = chunk.content.substring(0, chunk.content.length - (chunk.content.endsWith('\n') ? 1 : 0));
    let style = '';

    if (hasAttr(chunk, 'bold')) {
        html = '<strong>' + html + '</strong>';
    }
    if (hasAttr(chunk, 'italic')) {
        html = '<em>' + html + '</em>';
    }
    if (hasAttr(chunk, 'underline')) {
        html = '<u>' + html + '</u>';
    }
    if (hasAttr(chunk, 'strike')) {
        html = '<s>' + html + '</s>'; // perhaps: <del>
    }
    if (hasAttr(chunk, 'code-block')) {
        html = '<code>' + html + '</code>';
    }
    if (hasAttr(chunk, 'script') && chunk.attributes.script === 'super') {
        html = '<sup>' + + html + '</sup>';
    }
    if (hasAttr(chunk, 'script') && chunk.attributes.script === 'sub') {
        html = '<sub>' + + html + '</sub>';
    }
    if (hasAttr(chunk, 'link')) {
        html = '<a href=\"' + chunk.attributes.link + '\">' + html + '</a>';
    }
    if (hasAttr(chunk, 'formula')) {
        html = 'Please copy the formula into a web page that converts LaTeX to images and insert it into your document: ' + 
               '<code>' + html + '</code>';
    }

    if (hasAttr(chunk, 'color')) {
        style += 'color: ' + chunk.attributes.color + '; ';
    }
    if (hasAttr(chunk, 'background')) {
        style += 'background-color: ' + chunk.attributes.background + '; ';
    }
    if (style.length > 0) {
        html = '<span style=\"' + style.trim() + '\">' + html + '</span>';
    }

    return document.createRange().createContextualFragment(html);
}

function emptyPara(): DocumentFragment {
    return document.createRange().createContextualFragment('<p style="padding-top:0px;">&nbsp;</p>\n');
}

function formatRefs(refs: IReference, level: number): DocumentFragment {
    let html = '<h' + level + '>References</h' + level + '>\n';

    // walk though the references


    return document.createRange().createContextualFragment(html);
}