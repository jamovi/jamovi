'use strict';

var _ = require('underscore');
var $ = require('jquery');

var TableModel = require('./table').Model;
var TableView  = require('./table').View;
var GroupModel = require('./group').Model;
var GroupView  = require('./group').View;

var createItem = function(element, level) {

    if (_.isUndefined(level))
        level = 1;

    var $item = $('<div></div>');
    
    var model;
    var view;

    if (element.table) {
        model = new TableModel({ name : element.name, title : element.title, element : element.table, level : level });
        view = new TableView({ el : $item, model : model });
    }
    else if (element.group) {
        model = new GroupModel({ name : element.name, title : element.title, element : element.group });
        view = new GroupView({ el : $item, model : model, create : createItem, level : level });
    }
    else if (element.text) {
        $item.append(element.text);
    }
    
    return $item;
};

module.exports = { createItem: createItem };
