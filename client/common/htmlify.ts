
import { IElement } from "./hydrate";

function _populate(item: IElement, parent: HTMLElement, level: number): void {

    if (item.type === 'group') {
        if (item.title) {
            const h = document.createElement(`h${ level }`);
            h.textContent = item.title;
            parent.appendChild(h);
        }
        for (let child of item.items)
            _populate(child, parent, level+1);
    }
    else if (item.type === 'image') {
        const image = document.createElement('img');
        image.width = item.width;
        image.height = item.height;
        parent.appendChild(image);
    }
    else if (item.type === 'table') {

        let tr, td, th: HTMLTableCellElement;

        const table = document.createElement('table');
        const thead = document.createElement('thead');
        const tbody = document.createElement('tbody');

        tr = document.createElement('tr');
        th = document.createElement('th');
        th.textContent = item.title;
        th.colSpan = item.nCols;
        tr.appendChild(th);
        thead.appendChild(tr);

        for (let row of item.rows) {
            const cellType = ['superTitle', 'title'].includes(row.type) ? 'th' : 'td';

            tr = document.createElement('tr');
            for (let cell of row.cells) {
                const elem = document.createElement(cellType);
                if (cell) {
                    elem.textContent = cell.content;
                    // TODO add superscripts
                    if (cell.span)
                        elem.colSpan = cell.span;
                }
                tr.appendChild(elem);
            }

            if (cellType === 'th')
                thead.appendChild(tr);
            else
                tbody.appendChild(tr);
        }

        table.appendChild(thead);
        table.appendChild(tbody);

        parent.appendChild(table);
    }
}

export function htmlify(item: IElement) {

    const doc = document.implementation.createHTMLDocument('Results');
    const body = doc.body;

    _populate(item, body, 0);

    return '<!doctype html>\n' + doc.documentElement.outerHTML;
}
