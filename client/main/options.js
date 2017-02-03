

'use strict';

const SuperClass = require('../common/superclass');
const _ = require('underscore');

const OptionTypes = {

    create: function(template, value) {
        var constructor = OptionTypes[template.type];
        var initialValue = value;
        if (initialValue === undefined) {
            if (constructor && constructor.defaultValue !== undefined)
                initialValue = constructor.defaultValue;
            else
                initialValue = null;
        }

        if ( ! constructor)
            return new OptionTypes.Option(template, initialValue, true);

        return new constructor(template, initialValue);
    }
};

OptionTypes.Option = function(template, value, isLeaf) {
    this._template = template;
    this._isLeaf = isLeaf;
    this._initialized = false;

    this.getValue = function() {
        if (this._isLeaf)
            return this._value;
        else
            return this._onGetValue();
    };

    this.setValue = function(value, initializeOnly) {
        if (initializeOnly && this._initialized)
            return;

        if (this._isLeaf)
            this._value = value;
        else {
            this.children = [];
            if (value === null)
                return;

            if (this._createChildren)
                this._createChildren(value);
        }

        if (value !== null)
            this._initialized = true;
    };

    this.getUsedColumns = function() {
        if (this._isLeaf)
            return this._onGetUsedColumns();
        else {
            let r = [];
            for (let i = 0; i < this.children.length; i++) {
                let child = this.children[i];
                r = r.concat(child.getUsedColumns());
            }
            r = _.uniq(r);
            return r;
        }
    };

    this.renameColumn = function(oldName, newName) {
        if (this._isLeaf)
            this._onRenameColumn(oldName, newName);
        else {
            for (let i = 0; i < this.children.length; i++)
                this.children[i].renameColumn(oldName, newName);
        }
     };

     this._onGetUsedColumns = function() {
         return [];
     };

     this._onRenameColumn = function() {  };

    this.setValue(value, true);
};
SuperClass.create(OptionTypes.Option);

OptionTypes.Integer = function(template, value) {
    OptionTypes.Option.extendTo(this, template, value, true);
};
OptionTypes.Integer.defaultValue = 0;
SuperClass.create(OptionTypes.Integer);

OptionTypes.number = function(template, value) {
    OptionTypes.Option.extendTo(this, template, value, true);
};
OptionTypes.number.defaultValue = 0;
SuperClass.create(OptionTypes.number);

OptionTypes.Variable = function(template, value) {
    OptionTypes.Option.extendTo(this, template, value, true);

    this._override('_onGetUsedColumns', (baseFunction) => {
        if (this._value !== null)
            return [ this._value ];
        else
            return [];
    });

    this._override('_onRenameColumn', (baseFunction, oldName, newName) => {
        if (this._value === oldName)
            this._value = newName;
    });
};
SuperClass.create(OptionTypes.Variable);

OptionTypes.Variables = function(template, value) {
    OptionTypes.Option.extendTo(this, template, value, true);

    this._override('_onGetUsedColumns', (baseFunction) => {
        let r = [];
        if (this._value !== null)
            r = this._value;

        r = _.uniq(r);
        return r;
    });

    this._override('_onRenameColumn', (baseFunction, oldName, newName) => {
        if (this._value !== null) {
            for (let i = 0; i < this._value.length; i++) {
                if (this._value[i] === oldName)
                    this._value[i] = newName;
            }
        }
    });
};
SuperClass.create(OptionTypes.Variables);

OptionTypes.Terms = function(template, value) {
    OptionTypes.Array.extendTo(this, { type:"Array", template: { type: "Variables" } }, value);
};
SuperClass.create(OptionTypes.Terms);

OptionTypes.Term = function(template, value) {
    OptionTypes.Array.extendTo(this, { type:"Array", template: { type: "Variable" } }, value);
};
SuperClass.create(OptionTypes.Term);

OptionTypes.Pairs = function(template, value) {
    OptionTypes.Array.extendTo(this, { type:"Array", template: { type: "Pair" } }, value);
};
SuperClass.create(OptionTypes.Pairs);

OptionTypes.Pair = function(template, value) {
    OptionTypes.Group.extendTo(this, { type: "Group", elements: [{ type: "Variable", name: "i1" }, { type: "Variable", name: "i2" }] }, value);
};
SuperClass.create(OptionTypes.Pair);


OptionTypes.Array = function(template, value) {
    OptionTypes.Option.extendTo(this, template, value, false);

    this._override('_onGetValue', (baseFunction) => {
        if (this._initialized === false)
            return null;

        var r = [];
        for (let i = 0; i < this.children.length; i++)
            r.push(this.children[i].getValue());
        return r;
    });

    this._override('_createChildren', (baseFunction, value) => {
        for (let i = 0; i < value.length; i++)
            this.children.push(OptionTypes.create(this._template.template, value[i]));
    });

    if (value !== null)
        this._createChildren(value);
};
SuperClass.create(OptionTypes.Array);

OptionTypes.Group = function(template, value) {
    OptionTypes.Option.extendTo(this, template, value, false);

    this._override('_onGetValue', (baseFunction) => {
        if (this._initialized === false)
            return null;

        var r = { };
        for (let i = 0; i < this._template.elements.length; i++) {
            let element = this._template.elements[i];
            r[element.name] = this.children[i].getValue();
        }
        return r;
    });

    this._override('_createChildren', (baseFunction, value) => {
        for (let i = 0; i < this._template.elements.length; i++) {
            let element = this._template.elements[i];
            this.children.push(OptionTypes.create(element, value[element.name]));
        }
    });

    if (value !== null)
        this._createChildren(value);
};
SuperClass.create(OptionTypes.Group);


const Options = function(def) {

    this._options = {};

    for (var i = 0; i < def.length; i++) {
        var template = def[i];
        let defaultValue = template.default;
        var option = OptionTypes.create(template, defaultValue);
        this._options[template.name] = option;
    }

    this.getUsedColumns = function() {
        let r = [];
        for (let name in this._options) {
            let option = this._options[name];
            r = r.concat(option.getUsedColumns());
        }
        r = _.uniq(r);
        return r;
    };

    this.renameColumn = function(oldName, newName) {
        for (let name in this._options) {
            let option = this._options[name];
            option.renameColumn(oldName, newName);
        }
    };

    this.getOption = function(name) {
        return this._options[name];
    };

    this.setValues = function(values, initializeOnly) {
        for (let name in values) {
            if (name in this._options) {
                if (values[name] !== undefined)
                    this._options[name].setValue(values[name], initializeOnly);
            }
        }
    };

    this.getValues = function() {
        var values = { };
        for (let name in this._options) {
            let value = this._options[name].getValue();
            if (value !== undefined)
                values[name] = value;
        }

        return values;
    };
};

module.exports = Options;
