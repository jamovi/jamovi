
'use strict';

const $ = require('jquery');

function csvifyCells(cells) {
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
                row += sep + cell;
            sep = ',';
        }
        rows[rowNo] = row;
    }

    return rows.join('\n');
}

function htmlifyCells(cells, options={}) {
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
            else
                row += sep + cell;
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

function exportElem(el, format, options={ images:'absolute', margin: '24', docType: true }) {
    if (format === 'text/plain') {
        return Promise.resolve(_textify(el).trim());
    }
    else if (format === 'image/png') {
        return _imagify(el);
    }
    else {

        let html;

        if (typeof el === 'string') {
            html = Promise.resolve(el);
        }
        else {
            if (options.exclude) {
                options.excludeTags = options.exclude.filter(x => ! x.startsWith('.'));
                options.excludeClasses = options.exclude.filter(x => x.startsWith('.')).map(x => x.substring(1));
            }

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

            let margin = '24';
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
        </style>
</head>
<body>
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

    for (let child of $(el).contents())
        str += _textify(child);

    return str;
}

function _imagify(el) {

    let margin = 0;

    return Promise.resolve().then(() => {

        return exportElem(el, 'text/html', { margin: margin, docType: false });

    }).then((html) => {

        return new Promise((resolve, reject) => {

            let canvas = document.createElement('canvas');
            let sourceWidth = el.offsetWidth;
            let sourceHeight = el.offsetHeight;
            let destWidth = sourceWidth * (window.devicePixelRatio || 1);
            let destHeight = sourceHeight * (window.devicePixelRatio || 1);

            canvas.width = destWidth + 2 * margin;
            canvas.height = destHeight + 2 * margin;

            let image = new Image();
            image.onload = function() {
                let context = canvas.getContext('2d');
                context.fillStyle = 'white';
                context.fillRect(0, 0, canvas.width, canvas.height);
                context.drawImage(image, 0, 0, sourceWidth, sourceHeight,
                                         margin, margin, destWidth, destHeight);
                resolve(canvas.toDataURL());
            };

            html = html.replace(/&nbsp\;/g, ' ');

            let svg = `
                <svg xmlns="http://www.w3.org/2000/svg" width="${ destWidth }" height="${ destHeight }">
                    <foreignObject width="100%" height="100%">
                        <div xmlns="http://www.w3.org/1999/xhtml">
                            ${ html }
                        </div>
                    </foreignObject>
                </svg>`;
            let encoded = encodeURIComponent(svg);
            let url = `data:image/svg+xml,${encoded}`;
            image.src = url;
        });
    });
}

function _htmlify(el, options) {

    if (el.nodeType === Node.TEXT_NODE) {
        let data = el.data.replace('\u2212', '-');
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
        case 'tr':
        case 'pre':
        case 'p':
        case 'em':
        case 'a':
        case 'sub':
        case 'sup':
            include = true;
            break;
        case 'span':
            include = true;
            styles = [ 'font-weight' ];
            break;
        case 'td':
        case 'th':
            include = true;
            styles = [
                'text-align',
                'padding',
                'border-left',
                'border-right',
                'border-top',
                'border-bottom' ];
            break;
        case 'style':
            include = false;
            includeChildren = false;
            break;
        case 'svg':
            includeVerbatim = true;
            break;
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

        html += prepend;

        if (include) {
            html += '<' + tag;
            for (let attrib of el.attributes) {
                if (attrib.name !== 'class' && attrib.specified)
                    html += ' ' + attrib.name + '="' + attrib.value + '"';
            }
            if (styles.length > 0) {
                html += ' style="';
                for (let style of styles)
                    html += style + ':' + $(el).css(style) + ';';
                html += '"';
            }
            html += '>';
        }

        let promises = [ ];
        if (includeChildren) {
            for (let child of $(el).contents())
                promises.push(_htmlify(child, options));
        }

        if (includeVerbatim) {
            html += el.outerHTML;
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
    let str = '';
    let promises = [ ];
    for (let child of $(el.contentWindow.document).find('body').contents())
        promises.push(_htmlify(child, options));
    return Promise.all(promises).then(all => all.join(''));
}

function _htmlifyDiv(el, options) {

    let str = '';
    let bgiu = $(el).css('background-image');

    if (bgiu === 'none')
        return Promise.resolve('');

    let width = $(el).css('width');
    let height = $(el).css('height');
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

    return new Promise((resolve, reject) => {

        let xhr = new XMLHttpRequest();  // jQuery doesn't support binary!
        xhr.open('GET', bgi);
        xhr.responseType = 'arraybuffer';
        xhr.onload = function(e) {
            let mime = this.getResponseHeader('content-type');
            let data = new Uint8Array(this.response);
            let b64 = btoa(String.fromCharCode.apply(null, data));
            let dataURI = `data:${ mime };base64,${b64}`;
            resolve(dataURI);
        };
        xhr.onerror = function(e) {
            reject(e);
        };
        xhr.send();

        return str;
    }).then((dataURI) => {

        // we add the `</img>` closing tag for compatibility with xhtml and svg foreign objects
        return `<img src="${ dataURI }" style="width: ${ width }; height: ${ height };"></img>`;
    });
}

module.exports = { exportElem, csvifyCells, htmlifyCells };
