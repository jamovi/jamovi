
'use strict';

import { s6e } from '../utils';

let _registeredNodeObjs = null;

export function registerNodeObject(node, object) {
    if (_registeredNodeObjs === null)
        _registeredNodeObjs = new WeakMap();

    _registeredNodeObjs.set(node, object);
}

export function csvifyCells(cells, decSymbol: '.' | ',') {
    if (cells.length === 0)
        return '';

    let rows = new Array(cells[0].length);

    for (let rowNo = 0; rowNo < cells[0].length; rowNo++) {
        let row = '';
        let sep = '';
        for (let colNo = 0; colNo < cells.length; colNo++) {
            let cell = cells[colNo][rowNo];
            if (cell === null)
                row += sep + '';
            else if (typeof cell === 'string')
                row += sep + '"' + cell.replace(/"/g, '""') + '"';
            else
                row += sep + displayNum(cell, { decSymbol });
            sep = '\t';
        }
        rows[rowNo] = row;
    }

    return rows.join('\n');
}

export interface IHtmlifyOptions extends IDisplayOptions {
    generator?: string;
}

export interface IDisplayOptions {
    decSymbol?: '.' | ',';
}

export function parseNum(value: string, options: IDisplayOptions): number | string {
    const decimal = options.decSymbol ? options.decSymbol : '.';
    let s = value.trim().replace(/\s/g, '');

    const comma = s.includes(",");
    const dot = s.includes(".");

    if (comma && dot) {
        const lastComma = s.lastIndexOf(",");
        const lastDot = s.lastIndexOf(".");

        if (lastComma > lastDot)
            s = s.replace(/\./g, "").replace(",", ".");
        else
            s = s.replace(/,/g, "");
    }
    else if (comma) {
        if (decimal === ',')
            s = s.replace(/,/g, '.');
        else {
            const re = /^-?\d{1,3}(?:,\d{3})*(?:.\d+)?$/;
            if (re.test(s))
                s = s.replace(/,/g, "");
        }
    }

    if (s === '') // because Number('') === 0
        return value;

    const number = Number(s);
    return isNaN(number) ? value : number;
}

export function displayNum(value: number, options: IDisplayOptions) {
    return value.toString().replace('.', options.decSymbol);
}

export function htmlifyCells(cells, options: IHtmlifyOptions={}) {
    if (cells.length === 0)
        return '';

    let rows = new Array(cells[0].length);

    for (let rowNo = 0; rowNo < cells[0].length; rowNo++) {
        let row = '<tr><td>';
        let sep = '';
        for (let colNo = 0; colNo < cells.length; colNo++) {
            let cell = cells[colNo][rowNo];
            if (cell === null)
                row += sep + '';
            else if (typeof cell === 'string')
                row += sep + cell.replace('\u2212', '-');  // minus to dash
            else {
                if (options.decSymbol)
                    row += sep + displayNum(cell, options);
                else
                    row += sep + cell.toString();
            }
            sep = '</td><td>';
        }
        row += '</td></tr>';
        rows[rowNo] = row;
    }

    let generator = '';
    if (options.generator)
        generator = '<meta name="generator" content="' + options.generator + '" />';

    return '<!DOCTYPE html>\n<html><head><meta charset="utf-8">' + generator + '</head><body><table>' + rows.join('\n') + '</table></body></html>';
}

export function exportElem(el, format=undefined, options: { exclude?: string[], dir: 'rtl' | 'ltr', images: 'absolute' | 'relative', margin: number, docType: boolean }={ images:'absolute', margin: 24, docType: true, dir: 'ltr' }) {
    if (format === 'text/plain') {
        return Promise.resolve(_textify(el).trim());
    }
    else if (format === 'image/png') {
        return _imagify(el);
    }
    else if (format === 'image/svg+xml') {
        return _svgify(el);
    }
    else {

        let html;

        if (typeof el === 'string') {
            html = Promise.resolve(el);
        }
        else {
            if (options.exclude === undefined)
                options.exclude = [];

            options.exclude.push('.ignore-html');

            options.excludeTags = options.exclude.filter(x => ! x.startsWith('.'));
            options.excludeClasses = options.exclude.filter(x => x.startsWith('.')).map(x => x.substring(1));

            html = _htmlify(el, options);
        }

        if (options.fragment) {
            return html;
        }

        return html.then((content) => {

            let generator = '';
            if (options.generator)
                generator = `<meta name="generator" content="${ options.generator }" />`;

            let docType = '';
            if (options.docType)
                docType = '<!DOCTYPE html>';

            let margin = 24;
            if (options.margin !== undefined)
                margin = options.margin;

            // In the following style sheet, i've removed all the macOS fonts
            // i.e. -apple-system,BlinkMacSystemFont,"Apple Color Emoji"
            // At this stage, they totally mess-up pdf rendering on macOS
            // https://github.com/electron/electron/issues/21724

            return `${ docType }
<html>
    <head>
        <meta charset="utf-8" />
        ${ generator }
        <title>Results</title>
        <style>

    body {
        font-family: "Segoe UI",Roboto,Helvetica,Arial,sans-serif,"Segoe UI Emoji","Segoe UI Symbol" ;
        color: #333333 ;
        cursor: default ;
        margin: ${ margin }px;
        font-size: 12px ;
    }

    h1 {
        font-size: 160% ;
        color: #3E6DA9 ;
        margin-bottom: 12px ;
        white-space: nowrap ;
    }

    h2 {
        font-size: 130% ;
        margin-bottom: 12px ;
        color: #3E6DA9 ;
    }

    h3, h4, h5 {
        font-size: 110% ;
        margin-bottom: 12px ;
    }

    table {
        border-spacing: 0 ;
        page-break-inside: avoid;
    }

    table tr td, table tr th {
        page-break-inside: avoid;
        font-size: 12px ;
    }

    .ql-align-center {
        text-align: center;
    }

    .ql-align-right {
        text-align: right;
    }

    .ql-align-justify {
        text-align: justify;
    }

    .ql-indent-1 {
        padding-left: 3em;
    }

    .ql-indent-2 {
        padding-left: 6em;
    }

    .ql-indent-3 {
        padding-left: 9em;
    }

    .ql-indent-4 {
        padding-left: 12em;
    }

    .ql-indent-5 {
        padding-left: 15em;
    }

    .note {
        margin: 5px 0px;
    }
        </style>
</head>
<body dir="${options.dir ? options.dir : 'ltr'}">
    ${ content }
</body>
</html>`;
        });
    }
}

function _textify(el) {
    if (el.nodeType === Node.TEXT_NODE)
        return '\n' + el.data + '\n';

    let str = '';

    for (let child of el.childNodes)
        str += _textify(child);

    return str;
}

// the url of an Image element's picture, or null if it has none
function imageSrc(el: HTMLElement): string | null {
    const bgiu = getComputedStyle(el).backgroundImage;
    if (bgiu === 'none')
        return null;
    return /(?:\(['"]?)(.*?)(?:['"]?\))/.exec(bgiu)![1];
}

function isSvgUrl(src: string): boolean {
    return /\.svg(\?|$)/i.test(src);
}

// whether an Image element is showing a vector (svg) rather than a raster
export function isVectorImage(el: HTMLElement): boolean {
    const image = el.querySelector<HTMLElement>('.jmv-results-image-image');
    const src = image ? imageSrc(image) : null;
    return src !== null && isSvgUrl(src);
}

// inserts an opaque white rect as the svg's first child, so it reads
// correctly pasted onto a page or app that isn't already white (the engine
// renders these transparent, matching the results view's own background)
function addWhiteBackground(svg: SVGElement) {
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('x', '0');
    rect.setAttribute('y', '0');
    rect.setAttribute('width', '100%');
    rect.setAttribute('height', '100%');
    rect.setAttribute('fill', 'white');
    svg.insertBefore(rect, svg.firstChild);
}

async function _svgify(el: HTMLElement) {

    // a vector Image element's svg is a file on the server, not markup in
    // the document, so it's fetched rather than harvested
    if (el.classList.contains('jmv-results-image')) {
        if ( ! isVectorImage(el))
            return '';
        const src = imageSrc(el.querySelector('.jmv-results-image-image'))!;
        const response = await fetch(src);
        if ( ! response.ok)
            throw new Error(`Unable to load image ${ src }`);
        const text = await response.text();
        const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
        const svg = doc.documentElement as unknown as SVGElement;
        addWhiteBackground(svg);
        return new XMLSerializer().serializeToString(svg);
    }

    let source;
    if (el.tagName.toLowerCase() === 'svg')
        source = el;
    else
        source = el.querySelector('svg.jmv-results-svg-content') ?? el.querySelector('svg');

    if (source === null)
        return '';

    return `<?xml version="1.0" encoding="UTF-8"?>\n${ _svgMarkup(source) }`;
}

// an svg as it appears in the results is not self-contained -- it takes its
// namespaces, its size and its styling from the document around it. this
// bakes those in, so the markup can stand on its own
function _svgMarkup(source) {

    const svg = source.cloneNode(true);

    svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    if ( ! svg.hasAttribute('xmlns:xlink'))
        svg.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');

    // once the svg leaves the document it has no layout to be sized by, so
    // it needs to carry its own dimensions
    const rect = source.getBoundingClientRect();
    const width = source.getAttribute('width') || `${ rect.width }`;
    const height = source.getAttribute('height') || `${ rect.height }`;
    if ( ! svg.hasAttribute('viewBox') && parseFloat(width) && parseFloat(height))
        svg.setAttribute('viewBox', `0 0 ${ parseFloat(width) } ${ parseFloat(height) }`);
    svg.setAttribute('width', width);
    svg.setAttribute('height', height);

    addWhiteBackground(svg);

    // text properties are inherited from the document we're leaving behind
    const cs = getComputedStyle(source);
    svg.style.fontFamily = cs.fontFamily;
    svg.style.fontSize = cs.fontSize;
    svg.style.color = cs.color;

    // the module's stylesheets are in the document head, not in the svg, so
    // they have to come along too
    const sss = Array.from(document.querySelectorAll<HTMLStyleElement>('style.module-asset'))
        .map(ss => ss.textContent)
        .join('\n');

    if (sss.trim() !== '') {
        const style = document.createElementNS('http://www.w3.org/2000/svg', 'style');
        style.textContent = sss;
        svg.insertBefore(style, svg.firstChild);
    }

    return new XMLSerializer().serializeToString(svg);
}

// how many times the device pixel ratio a vector is rasterised at, for the
// png fallback / export. the engine renders raster images at 2x, so at 1x
// (dpr on a non-hidpi display) the png of an svg would be the poorer of the
// two. 4 is also reasonable, at the cost of pngs some 4 times the size
const VECTOR_RASTER_SCALE = 2;

// renders an Svg element's markup to a raster, and returns it wrapped as an
// <img> -- for embedding in html bound for the clipboard, where an inline
// <svg> isn't a live consumer: word, powerpoint and gmail all strip it down
// to its text nodes on paste, same as they do the html flavour of a copied
// vector Image (see resultspanel's use of this). elsewhere -- the html/pdf
// report export, whose consumer is a real browser -- the live, self-
// contained markup from _svgMarkup is kept and used directly instead
async function _svgToImgHtml(source: SVGElement): Promise<string> {

    const markup = _svgMarkup(source);
    const rect = source.getBoundingClientRect();
    const scale = VECTOR_RASTER_SCALE * (window.devicePixelRatio || 1);

    const image = new Image();
    image.src = `data:image/svg+xml,${ encodeURIComponent(markup) }`;
    await image.decode();

    const canvas = document.createElement('canvas');
    canvas.width = rect.width * scale;
    canvas.height = rect.height * scale;
    const context = canvas.getContext('2d')!;
    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    return `<img src="${ canvas.toDataURL() }" style="width: ${ rect.width }px; height: ${ rect.height }px;">`;
}

async function _imagify(el) {

    // HACK!! :/
    if (el.classList.contains('jmv-results-image'))
        return _imagifyImage(el.querySelector('.jmv-results-image-image'));
    else if (el.classList.contains('jmv-results-svg'))
        // the .content wrapper, rather than the svg itself, because the svg
        // has no offsetWidth/offsetHeight to size the canvas by
        el = el.querySelector('.content');

    let margin = 0;

    let html = await exportElem(el, 'text/html', { margin: margin, docType: false });
    html = html.replace(/&nbsp\;/g, ' ');

    let sourceWidth = el.offsetWidth;
    let sourceHeight = el.offsetHeight;
    let scale = VECTOR_RASTER_SCALE * (window.devicePixelRatio || 1);
    let destWidth = sourceWidth * scale;
    let destHeight = sourceHeight * scale;

    let svg = `
        <svg xmlns="http://www.w3.org/2000/svg" width="${ destWidth }" height="${ destHeight }">
            <foreignObject width="100%" height="100%">
                <div xmlns="http://www.w3.org/1999/xhtml">
                    ${ html }
                </div>
            </foreignObject>
        </svg>`;

    const image = new Image();
    image.src = `data:image/svg+xml,${ encodeURIComponent(svg) }`;
    await image.decode();

    let canvas = document.createElement('canvas');
    canvas.width = destWidth + 2 * margin;
    canvas.height = destHeight + 2 * margin;

    let context = canvas.getContext('2d');
    context.fillStyle = 'white';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, sourceWidth, sourceHeight,
                             margin, margin, destWidth, destHeight);
    return canvas.toDataURL();
}

// an Image element is just a picture, so it can be drawn straight onto the
// canvas -- there's no need for the html -> <foreignObject> detour above.
// and for a vector (svg) image there mustn't be: firefox won't render an svg
// nested inside another svg-as-image, so it would come out blank
function _imagifyImage(el: HTMLElement): Promise<string> {
    const src = imageSrc(el);
    if (src === null)
        return Promise.resolve('');
    return flattenImage(src, el.offsetWidth, el.offsetHeight);
}

// draws the picture at src onto a white canvas, and returns it as a png data
// url. the engine renders result images with a transparent background (so
// they sit on the results view's own), which looks fine there but not on a
// dark page in whatever it's pasted into -- so everything that leaves as a
// picture goes through here.
//
// a raster is drawn at its own resolution (the engine's 2x); a vector at
// VECTOR_RASTER_SCALE times the device pixel ratio of its displayed size
async function flattenImage(src: string, displayWidth: number, displayHeight: number): Promise<string> {

    const vector = isSvgUrl(src);

    const image = new Image();
    image.src = src;
    try {
        await image.decode();
    }
    catch {
        throw new Error(`Unable to load image ${ src }`);
    }

    const canvas = document.createElement('canvas');
    if (vector) {
        const scale = VECTOR_RASTER_SCALE * (window.devicePixelRatio || 1);
        canvas.width = displayWidth * scale;
        canvas.height = displayHeight * scale;
    }
    else {
        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;
    }
    const context = canvas.getContext('2d')!;
    context.fillStyle = 'white';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL();
}

function genBorderCSS(side, cs) {
    let w = cs.getPropertyValue(`border-${ side }-width`);
    if (w === '0px')
        return `border-${ side }:0px;`;
    let s = cs.getPropertyValue(`border-${ side }-style`);
    let c = cs.getPropertyValue(`border-${ side }-color`);
    return `border-${ side }:${ w } ${ s } ${ c };`;
}

function _htmlify(el, options) {

    if (el.nodeType === Node.TEXT_NODE) {
        let data = el.data.replace('\u2212', '-').replace('\u2009', '');
        data = s6e(data);
        return Promise.resolve(data);
    }

    if (el.nodeType !== Node.ELEMENT_NODE && el.nodeType !== Node.DOCUMENT_FRAGMENT_NODE)
        return Promise.resolve('');

    let tag;
    let include = false;
    let includeChildren = true;
    let includeVerbatim = false;
    let styles = [ ];
    let prepend = '';
    let append = '';

    return Promise.resolve().then(() => {

        if (el.nodeType === Node.DOCUMENT_FRAGMENT_NODE)
            return '';

        if (getComputedStyle(el).display === 'none') {
            include = false;
            includeChildren = false;
            return '';
        }

        tag = el.tagName.toLowerCase();

        if (options.excludeTags) {
            if (options.excludeTags.includes(tag)) {
                includeChildren = false;
                return '';
            }
        }
        if (options.excludeClasses) {
            let nodeClasses = [...el.classList];
            for (let ex of options.excludeClasses) {
                if (nodeClasses.includes(ex)) {
                    includeChildren = false;
                    return '';
                }
            }
        }

        switch (tag) {
        case 'div':
            return _htmlifyDiv(el, options);
        case 'iframe':
            return _htmlifyIFrame(el, options);
        case 'table':
            include = true;
            prepend = '';
            append = '<p>&nbsp;</p>';
            break;
        case 'h1':
        case 'h2':
        case 'h3':
        case 'h4':
        case 'h5':
        case 'thead':
        case 'tbody':
        case 'tfoot':
        case 'pre':
        case 'em':
        case 'a':
        case 'u':
        case 's':
        case 'strong':
        case 'b':
        case 'sub':
        case 'sup':
            include = true;
            break;
        case 'tr':
            include = (el.childElementCount > 0);
            break;
        case 'span':
            include = true;
            styles = [ 'font-weight' ];
            break;
        case 'p':
            include = true;
            styles = [
                'text-align',
                'padding'
            ];
            break;
        case 'ol':
        case 'ul':
            include = true;
            styles = [
                'text-align',
                'padding',
                'list-style-type'
            ];
            break;
        case 'li':
            include = true;
            styles = [
                'display',
                'text-align',
                'padding'
            ];
            break;
        case 'caption':
            include = true;
            styles = [
                'text-align',
                'padding',
                'border',
                'vertical-align',
                'caption-side'
            ];
            tag = 'th'; // because word doesn't honour caption elements for tables
            prepend = '<thead><tr>';
            append = '</tr></thead>';
            break;
        case 'td':
        case 'th':
            include = true;
            styles = [
                'text-align',
                'padding',
                'border',
                'vertical-align',
                'font-weight'
            ];
            break;
        case 'style':
            include = false;
            includeChildren = false;
            break;
        case 'svg':
            includeVerbatim = true;
            if (options.svgAsImage)
                return _svgToImgHtml(el);
            // el.outerHTML would give us markup which only renders correctly
            // in the document it came from
            return Promise.resolve(_svgMarkup(el));
        default:
            if (el.shadowRoot)
                return _htmlify(el.shadowRoot, options);
        }

        return Promise.resolve('');

    }).then(html => {

        if (includeVerbatim) {
            include = false;
            includeChildren = false;
        }
        else if (tag === 'div' && html !== '') {
            includeChildren = false;
        }

        html += prepend;

        if (include) {
            html += '<' + tag;
            for (let attrib of el.attributes) {
                if (attrib.name !== 'class' && attrib.specified)
                    html += ' ' + attrib.name + '="' + attrib.value + '"';
            }
            if (styles.length > 0) {
                let cs = getComputedStyle(el);
                html += ' style="';

                for (let style of styles) {
                    if (style === 'padding') {
                        let value = `${ cs.getPropertyValue('padding-top') } ${ cs.getPropertyValue('padding-right')} ${ cs.getPropertyValue('padding-bottom') } ${ cs.getPropertyValue('padding-left') }`;
                        html += `${ style }:${ value };`;
                    }
                    else if (style === 'border') {

                        let top = cs.getPropertyValue('border-top-width');
                        let right = cs.getPropertyValue('border-right-width');
                        let bottom = cs.getPropertyValue('border-bottom-width');
                        let left = cs.getPropertyValue('border-left-width');

                        if (top === '0px' && right === '0px' && bottom === '0px' && left === '0px') {
                            html += 'border:0px;'; // '0px' is less chars than 'none'
                        }
                        else {
                            html += genBorderCSS('top', cs);
                            html += genBorderCSS('right', cs);
                            html += genBorderCSS('bottom', cs);
                            html += genBorderCSS('left', cs);
                        }
                    }
                    else if (style === 'text-align') {
                        let value = cs.getPropertyValue(style);
                        if (value === 'start')
                            value = 'left';
                        else if (value === 'end')
                            value = 'right';
                        html += `${ style }:${ value };`;
                    }
                    else {
                        let value = cs.getPropertyValue(style);
                        if (value)
                            html += `${ style }:${ value };`;
                    }
                }
                html += '"';
            }
            html += '>';
        }

        let promises = [ ];
        if (includeChildren) {
            for (let child of el.childNodes)
                promises.push(_htmlify(child, options));
        }

        return Promise.all(promises).then(all => {

            return html + all.join('');

        }).then(html => {
            if (include)
                html += '</' + tag + '>';
            html += append;
            return html;
        });
    });
}

function _htmlifyIFrame(el, options) {
    let promises = [ ];
    const body = el.contentWindow.document.body;
    for (let child of body.childNodes)
        promises.push(_htmlify(child, options));

    return Promise.all(promises).then(all => all.join(''));
}

function _htmlifyDiv(el, options) {

    if (el.classList.contains('jmv-annotation')) {
        let obj = _registeredNodeObjs.get(el);
        if (obj) {
            let note = obj.getHTML();
            if (note !== '')
                return `<div class="note"> ${ note } </div>`;
        }
        return Promise.resolve('');
    }

    const style = window.getComputedStyle(el);

    let bgiu = style.backgroundImage;

    if (bgiu === 'none')
        return Promise.resolve('');

    let width = style.width;
    let height = style.height;

    let bgi = /(?:\(['"]?)(.*?)(?:['"]?\))/.exec(bgiu)[1]; // remove surrounding uri(...)

    if (options.images === 'absolute') {
        return `<img src="${ bgi }" style="width: ${ width }; height: ${ height };">`;
    }

    let address = '';
    if (options.id)
        address = `${ options.id }/${ el.dataset.address }`;

    if (options.images === 'relative') {
        let dbgi = decodeURI(bgi);
        if (dbgi.startsWith(el.baseURI + 'res/')) {
            dbgi = dbgi.substring(el.baseURI.length + 4);
            bgi = encodeURI(dbgi);
        }
        else {
            console.log('Unable to resolve relative address');
            bgi = '';
        }
        return `<img src="${ bgi }" data-address="${ address }" style="width: ${ width }; height: ${ height };" alt="">`;
    }

    // a chart image goes onto a white background (see flattenImage); other
    // background-images here are UI glyphs -- notice icons, sort arrows and
    // the like -- meant to sit transparent against whatever they're on, so
    // they're carried over as-is
    const asDataURI = el.classList.contains('jmv-results-image-image')
        ? flattenImage(bgi, el.offsetWidth, el.offsetHeight)
        : rawDataURI(bgi);

    return asDataURI.then((dataURI) => {
        // we add the `</img>` closing tag for compatibility with xhtml and svg foreign objects
        return `<img src="${ dataURI }" style="width: ${ width }; height: ${ height };"></img>`;
    });
}

// fetches src and returns it as a data uri, verbatim -- no flattening
async function rawDataURI(src: string): Promise<string> {
    const response = await fetch(src);
    const blob = await response.blob();
    return await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
    });
}

