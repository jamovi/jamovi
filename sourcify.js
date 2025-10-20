
'use strict';

const _ = require('underscore');
const jsesc = require('jsesc');

const sourcify = function(object, indent) {

    if (typeof indent === 'undefined')
        indent = '                ';

    let str = '';
    if (object === undefined) {
        str = 'NULL';
    }
    else if (object === null) {
        str = 'NULL';
    }
    else if (object === true) {
        str = 'TRUE'
    }
    else if (object === false) {
        str = 'FALSE'
    }
    else if (typeof(object) === 'number') {
        str = '' + object;
    }
    else if (typeof(object) === 'string') {
        str = jsesc(object, { json: true, wrap: true });
    }
    else if (_.isArray(object)) {
        str = 'list('
        let sep = '\n' + indent + '    ';
        for (let value of object) {
            str += sep + sourcify(value, indent + '    ');
            sep = ',\n' + indent + '    ';
        }
        str += ')';
    }
    else if (_.isObject(object)) {
        str = 'list(';
        let sep = '';
        for (let prop in object) {
            let value = object[prop];
            str += sep + '\n' + indent + '    ' + '`' + prop + '`' + '=' + sourcify(value, indent + '    ');
            sep = ', '
        }
        str += ')';
    }
    return str;
}

module.exports = sourcify;
