
'use strict';

const path = require('path');
const fs = require('fs');

const utils = require('./utils');

const parse = function(srcDir) {
    let descPath = path.join(srcDir, 'DESCRIPTION');

    if ( ! utils.exists(descPath))
        throw 'DESCRIPTION file could not be found\n\nIs the path specified an R/jamovi package?\n';

    let descContent = fs.readFileSync(descPath, 'utf-8');
    let packageMatch = descContent.match(/^Package: *(.+)$/m);
    if (packageMatch === null)
        throw 'DESCRIPTION file does not contain a package name';
    let packageName = packageMatch[1];

    descContent = descContent.replace(/\r?\n[ \t]/g, '').replace(/[\t ]+/g, ' ');

    let descMatch = descContent.match(/Description: (.+)/);
    if (descMatch === null)
        throw 'DESCRIPTION file does not contain a description (irony much?)';
    let description = descMatch[1]

    let entries = descContent.split('\n');
    entries = entries.filter(entry => entry.indexOf(':') !== -1);
    entries = entries.map(entry => entry.split(':'));

    let obj = { }
    for (let entry of entries)
        obj[entry[0].trim()] = entry[1].trim();

    let authors = [ ];
    if ('Author' in obj) {
        authors = obj.Author.split(',');
        authors = authors.map(author => author.trim())
    }

    return {
        title: ('Title' in obj ? obj.Title : packageName),
        name: packageName,
        version: ('Version' in obj ? obj.Version : '0.0.0'),
        jms: '1.0',
        authors: authors,
        maintainer: ('Maintainer' in obj ? obj.Maintainer : '(no maintainer, sorry)'),
        date: ('Date' in obj ? obj.Date : '1970-01-01'),
        type: 'R',
        description: ('Description' in obj ? obj.Description : '(no description)'),
        analyses: [ ],
    };
}

module.exports = parse;
