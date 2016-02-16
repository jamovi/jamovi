'use strict';

var _ = require('underscore');
var fs = require('fs');
var LintStream = require('jslint').LintStream;
var glob = require('glob');
var path = require('path');
var chalk = require('chalk');

var options = {
    "edition": "latest",
    "node" : true,
    "fudge" : true
};

var linter = new LintStream(options);

var ERRORS = [ 'expected_a_b',
    'unexpected_trailing_space',
    'use_spaces',
    'undeclared_a',
    { code : 'expected_a_before_b', a : 'use strict' } ];

var IGNORES = [ 'bad_property_a',
    'unexpected_a',
    'expected_space_a_b',
    'unexpected_space_a_b',
    'empty_block',
    { code : 'expected_a_b', a : '{' },
    { code : 'expected_a_b', a : '[]', b : 'new Array' } ];

var belongsTo = function(error, errorDescriptors) {

    for (var i = 0; i < errorDescriptors.length; i++) {

        var desc = errorDescriptors[i]

        if (typeof desc === "string" && error.code === desc) {

            return true;
        }
        else if (desc.code === error.code) {

            if (_.has(desc, 'a') && _.has(desc, 'b')) {

                if (desc.a === error.a && desc.b === error.b)
                    return true;
            }
            else if (_.has(desc, 'a')) {
                if (desc.a === error.a)
                    return true;
            }
            else if (_.has(desc, 'b') && desc.b === error.b) {
                if (desc.b === error.b)
                    return true;
            }
        }
    }

    return false
}

linter.on('data', function(chunk, encoding, callback) {

    _.each(chunk.linted.errors, function(error) {

        var message = chunk.file + ", " + error.line + " (:" + error.column + ")"

        if (belongsTo(error, IGNORES)) {
            // do nothing
        }
        else if (belongsTo(error, ERRORS)) {
            message = message + " '" + error.code + "'";
            message = message + "\n\t" + error.message + "\n";
            console.log(chalk.red("error : " + message));
            process.exitCode = 1;
        }
        else {
            message = message + " '" + error.code + "'";
            message = message + "\n\t" + error.message + "\n";
            console.log(chalk.yellow("warn  : " + message));
        }
    })

    if (callback)
        callback();
})

var files = glob.sync(__dirname + '/../js/**/*.js');
var files = _.union(files, glob.sync(__dirname + '/../tests/**/*.js'));
var files = _.without(files, path.normalize(__dirname + '/../js/bundle.js'));

_.each(files, function(file) {

    var fd = fs.openSync(file, 'r');
    var contents = '' + fs.readFileSync(fd);

    linter.write({file : file, body : contents});
})


