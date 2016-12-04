'use strict';

const _ = require('underscore');
const $ = require('jquery');

const TableModel = require('./table').Model;
const TableView  = require('./table').View;
const GroupModel = require('./group').Model;
const GroupView  = require('./group').View;
const ImageModel = require('./image').Model;
const ImageView  = require('./image').View;
const ArrayModel = require('./array').Model;
const ArrayView  = require('./array').View;
const SyntaxModel = require('./syntax').Model;
const SyntaxView  = require('./syntax').View;

const createItem = function(element, $el, level, parent, mode) {

    if (_.isUndefined(level))
        level = 1;
    if (_.isUndefined(mode))
        mode = 'rich';

    let model;
    let view;

    if (element.table) {
        model = new TableModel({
            name: element.name,
            title: element.title,
            element: element.table,
            status: element.status,
            error: element.error });
        view = new TableView({
            el: $el,
            model: model,
            level: level,
            parent: parent,
            mode: mode });
    }
    else if (element.group) {

        if (element.group.elements.length > 0) {
            model = new GroupModel({
                name: element.name,
                title: element.title,
                element: element.group,
                status: element.status,
                error: element.error });
            view = new GroupView({
                el: $el,
                model: model,
                create: createItem,
                level: level,
                parent: parent,
                mode: mode });
        }
        else {
            view = null;
        }
    }
    else if (element.image) {
        model = new ImageModel({
            name: element.name,
            title: element.title,
            element: element.image,
            status: element.status,
            error: element.error });
        view = new ImageView({
            el: $el,
            model: model,
            level: level,
            parent: parent,
            mode: mode });
    }
    else if (element.array) {

        if (element.array.elements.length > 0) {
            model = new ArrayModel({
                name: element.name,
                title: element.title,
                element: element.array,
                status: element.status,
                error: element.error });
            view = new ArrayView({
                el: $el,
                model: model,
                create: createItem,
                level: level,
                parent: parent,
                mode: mode });
        }
        else {
            view = null;
        }
    }
    else if (element.syntax) {
        model = new SyntaxModel({
            name : element.name,
            title : element.title,
            element : element.syntax,
            status: element.status,
            error: element.error,
            stale: element.stale });
        view = new SyntaxView({
            el: $el,
            model: model,
            level: level,
            parent: parent,
            mode: mode });
    }
    else if (element.preformatted) {
        model = new SyntaxModel({
            name : element.name,
            title : element.title,
            element : element.preformatted,
            status: element.status,
            error: element.error,
            stale: element.stale });
        view = new SyntaxView({
            el: $el,
            model: model,
            level: level,
            parent: parent,
            mode: mode });
    }

    return view;
};

module.exports = { createItem: createItem };
