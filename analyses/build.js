
var fs = require('fs')
var _ = require('underscore')
var Promise = require('es6-promise').Promise
var browserify = require('browserify')

process.chdir(__dirname)

var options = { paths : './common', standalone : 'module' }

function simplify(obj) {

    var o = { }

    if (obj.type)
        o.type = obj.type

    _.each(obj.attributes, function(value, key) {

        if (_.has(value, 'attributes'))
            o[key] = serialise(value)
        else
            o[key] = value
    })

    return o
}

function protofy(obj, name) {

    var content = 'message ' + name + ' {\n'
    var i = 1

    _.each(obj.attributes, function(value, key) {

        switch (value.type) {
            case 'Int':
                content += '  optional int ' + key + ' = ' + i++ + ';\n'
                break
            case 'Bool':
                content += '  optional bool ' + key + ' = ' + i++ + ';\n'
                break
            case 'Variables':
                content += '  repeated string ' + key + ' = ' + i++ + ';\n'
                break
            default:
                break
        }
    })

    content += '}\n'

    return content
}

new Promise(function(resolve, reject) {

    var b = browserify('./base/descriptives.src.js', options)
    b.bundle(function(err, data) {
        if (err) {
            console.log(err)
        }
        else {
            fs.writeFileSync('./base/descriptives.js', data)
            resolve('' + data)
        }
    })

}).then(function(data) {

    return new Promise(function(resolve, reject) {

        try {

            var Model = require('./base/descriptives').Model
            var model = new Model()
            var json = JSON.stringify(simplify(model), null, 4)
            var proto = protofy(model, 'descriptives')

            fs.writeFileSync('./base/descriptives.json', json)
            fs.writeFileSync('./base/descriptives.proto', proto)

            resolve()

        }
        catch (e) {
            console.log(e.message)
            console.log(e)
            reject(e)
        }
    })
})
