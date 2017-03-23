
'use strict';

const $ = require('jquery');

const csvifyCells = function(cells) {
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
};

const htmlifyCells = function(cells) {
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
                row += sep + '"' + cell + '"';
            else
                row += sep + cell;
            sep = '</td><td>';
        }
        row += '</td></tr>';
        rows[rowNo] = row;
    }

    return '<html><body><table>' + rows.join('\n') + '</table></body></html>';
};

const exportElem = function($el, format) {
    if (format === 'text/plain')
        return _textify($el[0]);
    else
        return _htmlify($el[0]);
};

const _textify = function(el) {
    if (el.nodeType === Node.TEXT_NODE)
        return '\n' + el.data + '\n';

    let str = '';

    for (let child of $(el).contents())
        str += _textify(child);

    return str;
};

const _htmlify = function(el) {

    if (el.nodeType === Node.TEXT_NODE)
        return el.data;

    if (el.nodeType !== Node.ELEMENT_NODE)
        return '';

    let str = '';
    let tag = el.tagName;
    let include = false;
    let styles = [ ];
    let prepend = '';
    let append = '';

    switch (tag) {
    case 'DIV':
        str += _htmlifyDiv(el);
        break;
    case 'TABLE':
        include = true;
        prepend = '';
        append = '<p>&nbsp;</p>';
        break;
    case 'H1':
    case 'H2':
    case 'H3':
    case 'H4':
    case 'H5':
    case 'THEAD':
    case 'TBODY':
    case 'TFOOT':
    case 'TR':
    case 'PRE':
        include = true;
        break;
    case 'TD':
    case 'TH':
        include = true;
        styles = [
            'text-align',
            'padding',
            'border-left',
            'border-right',
            'border-top',
            'border-bottom' ];
        break;
    }

    str += prepend;

    if (include) {
        str += '<' + tag;
        for (let attrib of el.attributes) {
            if (attrib.name !== 'class' && attrib.specified)
                str += ' ' + attrib.name + '="' + attrib.value + '"';
        }
        if (styles.length > 0) {
            str += ' style="';
            for (let style of styles)
                str += style + ':' + $(el).css(style) + ';';
            str += '"';
        }
        str += '>';
    }

    for (let child of $(el).contents())
        str += _htmlify(child);

    if (include)
        str += '</' + tag + '>';

    str += append;

    return str;
};

const _htmlifyDiv = function(el) {

    let str = '';
    let bgiu = $(el).css('background-image');

    if (bgiu !== 'none') {
        let bgi = /(?:\(['"]?)(.*?)(?:['"]?\))/.exec(bgiu)[1]; // remove surrounding uri(...)
        let width = $(el).css('width');
        let height = $(el).css('height');
        str += '<img src="' + bgi + '" style="width:' + width + ';height:' + height + ';">';
    }

    return str;
};

module.exports = { exportElem, csvifyCells, htmlifyCells };
