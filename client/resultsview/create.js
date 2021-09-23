'use strict';

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
const HtmlModel = require('./html').Model;
const HtmlView  = require('./html').View;

const createItem = function(element, options, $el, level, parent, mode, devMode, fmt, refTable ) {

    if (level === undefined)
        level = 1;
    if (mode === undefined)
        mode = 'rich';

    let model;
    let view;

    if (element.type === 'table') {
        model = new TableModel({
            name: element.name,
            title: element.title,
            element: element.table,
            status: element.status,
            error: element.error,
            refs: element.refs,
            options: options,
            refTable: refTable });
        view = new TableView({
            el: $el,
            model: model,
            update: updateItem,
            level: level,
            parent: parent,
            mode: mode,
            fmt: fmt });
    }
    else if (element.type === 'group') {

        let visible;

        if (element.visible === 2) {
            visible = true;
        }
        else {
            visible = false;
            for (let child of element.group.elements) {
                if (child.visible === 0 || child.visible === 2) {
                    visible = true;
                    break;
                }
            }
        }

        if (visible) {
            model = new GroupModel({
                name: element.name,
                title: element.title,
                element: element.group,
                status: element.status,
                error: element.error,
                refs: element.refs,
                options: options,
                refTable: refTable });
            view = new GroupView({
                el: $el,
                model: model,
                create: createItem,
                update: updateItem,
                level: level,
                isEmptyAnalysis: parent.isEmptyAnalysis === undefined ? false : parent.isEmptyAnalysis,
                hasTitle: parent.hasTitle === undefined ? true : parent.hasTitle,
                parent: parent,
                mode: mode,
                devMode: devMode,
                fmt: fmt });
        }
        else {
            view = null;
        }
    }
    else if (element.type === 'image') {
        model = new ImageModel({
            name: element.name,
            title: element.title,
            element: element.image,
            status: element.status,
            error: element.error,
            refs: element.refs,
            options: options,
            refTable: refTable });
        view = new ImageView({
            el: $el,
            model: model,
            update: updateItem,
            level: level,
            parent: parent,
            mode: mode });
    }
    else if (element.type === 'array') {

        let visible = false;

        if (element.array.hasHeader)
            visible = true;

        for (let child of element.array.elements) {
            if (child.visible === 0 || child.visible === 2)
                visible = true;
        }

        if (visible) {
            model = new ArrayModel({
                name: element.name,
                title: element.title,
                element: element.array,
                status: element.status,
                error: element.error,
                refs: element.refs,
                options: options,
                refTable: refTable });
            view = new ArrayView({
                el: $el,
                model: model,
                create: createItem,
                update: updateItem,
                level: level,
                parent: parent,
                mode: mode,
                fmt: fmt });
        }
        else {
            view = null;
        }
    }
    else if (element.type === 'preformatted') {
        model = new SyntaxModel({
            name : element.name,
            title : element.title,
            element : element.preformatted,
            status: element.status,
            error: element.error,
            stale: element.stale,
            refs: element.refs,
            options: options,
            refTable: refTable });
        view = new SyntaxView({
            el: $el,
            model: model,
            update: updateItem,
            level: level,
            parent: parent,
            mode: mode });
    }
    else if (element.type === 'html') {
        model = new HtmlModel({
            name : element.name,
            title : element.title,
            element : element.html,
            status: element.status,
            error: element.error,
            stale: element.stale,
            refs: element.refs,
            options: options,
            refTable: refTable });
        view = new HtmlView({
            el: $el,
            model: model,
            update: updateItem,
            level: level,
            parent: parent,
            mode: mode });
    }

    return view;
};

const updateItem = function(item, element, options, level, mode, devMode, fmt, refTable ) {

    if (level === undefined)
        level = 1;
    if (mode === undefined)
        mode = 'rich';

    let model = item.model;
    let view = item;

    if (element.type === 'table') {

        model.attributes.name = element.name;
        model.attributes.title = element.title;
        model.attributes.element = element.table;
        model.attributes.status = element.status;
        model.attributes.error = element.error;
        model.attributes.refs = element.refs;
        model.attributes.options = options;
        model.attributes.refTable = refTable;


        model.initialize();

        view.level = level;
        view.mode = mode;
        view.fmt = fmt;
    }
    else if (element.type === 'group') {

        let visible;

        if (element.visible === 2) {
            visible = true;
        }
        else {
            visible = false;
            for (let child of element.group.elements) {
                if (child.visible === 0 || child.visible === 2) {
                    visible = true;
                    break;
                }
            }
        }

        if (visible) {

            model.attributes.name = element.name;
            model.attributes.title = element.title;
            model.attributes.element = element.group;
            model.attributes.status = element.status;
            model.attributes.error = element.error;
            model.attributes.refs = element.refs;
            model.attributes.options = options;
            model.attributes.refTable = refTable;

            view.level = level;
            view.mode = mode;
            view.devMode = devMode;
            view.fmt = fmt;
        }
        else
            return false;
    }
    else if (element.type === 'image') {

        model.attributes.name = element.name;
        model.attributes.title = element.title;
        model.attributes.element = element.image;
        model.attributes.status = element.status;
        model.attributes.error = element.error;
        model.attributes.refs = element.refs;
        model.attributes.options = options;
        model.attributes.refTable = refTable;

        view.level = level;
        view.mode = mode;
    }
    else if (element.type === 'array') {

        let visible = false;

        if (element.array.hasHeader)
            visible = true;

        for (let child of element.array.elements) {
            if (child.visible === 0 || child.visible === 2)
                visible = true;
        }

        if (visible) {

            model.attributes.name = element.name;
            model.attributes.title = element.title;
            model.attributes.element = element.array;
            model.attributes.status = element.status;
            model.attributes.error = element.error;
            model.attributes.refs = element.refs;
            model.attributes.options = options;
            model.attributes.refTable = refTable;

            view.level = level;
            view.mode = mode;
            view.fmt = fmt;
        }
        else {
            return false;
        }
    }
    else if (element.type === 'preformatted') {

        model.attributes.name = element.name;
        model.attributes.title = element.title;
        model.attributes.element = element.preformatted;
        model.attributes.status = element.status;
        model.attributes.error = element.error;
        model.attributes.stale = element.stale;
        model.attributes.refs = element.refs;
        model.attributes.options = options;
        model.attributes.refTable = refTable;

        view.level = level;
        view.mode = mode;
    }
    else if (element.type === 'html') {

        model.attributes.name = element.name;
        model.attributes.title = element.title;
        model.attributes.element = element.html;
        model.attributes.status = element.status;
        model.attributes.error = element.error;
        model.attributes.stale = element.stale;
        model.attributes.refs = element.refs;
        model.attributes.options = options;
        model.attributes.refTable = refTable;

        view.level = level;
        view.mode = mode;
    }

    return true;
};


module.exports = { createItem: createItem };
