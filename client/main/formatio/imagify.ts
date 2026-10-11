
// converts a hydrated table into a png (as a data url): it's made html (see
// htmlify.ts), laid out off-screen to find its size, and then drawn to a
// canvas by way of an svg <foreignObject> (cf. common/utils/formatio's
// _imagify(), which does the same for an element in the results view). for
// pasting a table wherever it's wanted as a picture
//
// NB: webkit (safari) taints a canvas drawn with a <foreignObject>, so there
// toDataURL() throws a SecurityError. electron and the other browsers are
// fine

import { ITable } from './hydrate';
import { htmlify } from './htmlify';

// the look of the results view (cf. htmlify's STYLESHEET), which a single
// element's html leaves to wherever it's pasted
const STYLE = {
    fontFamily: '"Segoe UI", Roboto, Helvetica, Arial, sans-serif',
    fontSize: '12px',
    color: '#333333',
    backgroundColor: '#ffffff',
    padding: '12px',
};

// the png's pixels to each css pixel, matching the engine's 2x for result
// images
const SCALE = 2;

export async function imagify(table: ITable): Promise<string> {
    const element = tableElement(table);
    const { width, height } = measure(element);
    const svg = tableSvg(element, width, height);

    const image = new Image();
    // (without the charset, it's not read as utf-8 -- '< .001' has a thin
    // space)
    image.src = `data:image/svg+xml;charset=utf-8,${ encodeURIComponent(svg) }`;
    await image.decode();

    const canvas = document.createElement('canvas');
    canvas.width = width * SCALE;
    canvas.height = height * SCALE;
    const context = canvas.getContext('2d')!;
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/png');
}

// the table, in a container carrying the page's look (as htmlify gives it,
// less the empty paragraph following it -- see its spacer())
export function tableElement(table: ITable): HTMLElement {
    const doc = new DOMParser().parseFromString(htmlify(table), 'text/html');
    const container = document.createElement('div');
    Object.assign(container.style, STYLE);
    container.style.display = 'inline-block';
    container.appendChild(document.importNode(doc.querySelector('table')!, true));
    // titles aren't bold, as in the results view (cf. htmlify's STYLESHEET)
    for (const th of Array.from(container.querySelectorAll('th')))
        th.style.fontWeight = 'normal';
    return container;
}

// its size as laid out, in whole css pixels. it's placed out of sight, at
// the top level of the document, so nothing else constrains its width
function measure(element: HTMLElement): { width: number, height: number } {
    element.style.position = 'fixed';
    element.style.left = '-100000px';
    element.style.top = '0';
    document.body.appendChild(element);
    try {
        const rect = element.getBoundingClientRect();
        return { width: Math.ceil(rect.width), height: Math.ceil(rect.height) };
    }
    finally {
        element.remove();
        element.style.position = '';
        element.style.left = '';
        element.style.top = '';
    }
}

// the element as an svg image of the given size. it's serialised as xhtml,
// as a <foreignObject>'s content must be well-formed xml
export function tableSvg(element: HTMLElement, width: number, height: number): string {
    const xhtml = new XMLSerializer().serializeToString(element);
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${ width }" height="${ height }">`
        + `<foreignObject x="0" y="0" width="${ width }" height="${ height }">${ xhtml }</foreignObject>`
        + '</svg>';
}
