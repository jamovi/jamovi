

'use strict';

const SuperClass = require('../common/superclass');
const _ = require('underscore');

const OptionTypes = {

    create: function(template, value) {
        var constructor = OptionTypes[template.type];
        if ( ! constructor)
            constructor = OptionTypes.Option;

        return new constructor(template, value);
    }
};

OptionTypes.Option = function(template, value) {
    this._template = template;

    this.setValue = function(value) {
        this._value = value;
    };

    this.getUsedColumns = function() {
        return [];
    };

    this.renameColumn = function(oldName, newName) { };

    this.setValue(value);
};
SuperClass.create(OptionTypes.Option);

OptionTypes.Variable = function(template, value) {
    OptionTypes.Option.extendTo(this, template, value);

    this._override('getUsedColumns', (baseFunction) => {
        if (this._value !== null)
            return [ this._value ];
        else
            return [];
    });

    this._override('renameColumn', (baseFunction, oldName, newName) => {
        if (this._value === oldName)
            this._value = newName;
    });

};
SuperClass.create(OptionTypes.Variable);

OptionTypes.Variables = function(template, value) {
    OptionTypes.Option.extendTo(this, template, value);

    this._override('getUsedColumns', (baseFunction) => {
        let r = [];
        if (this._value !== null)
            r = this._value;

        r = _.uniq(r);
        return r;
    });

    this._override('renameColumn', (baseFunction, oldName, newName) => {
        for (let i = 0; i < this._value.length; i++) {
            if (this._value[i] === oldName)
                this._value[i] = newName;
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

OptionTypes.ParentOption = function(template, value) {
    this.children = [];

    OptionTypes.Option.extendTo(this, template, value);

    this._override('setValue', (baseFunction, value) => {
        baseFunction.call(this, value);
        this.children = [];
        if (value === null)
            return;

        if (this.createChildren)
            this.createChildren(value);
    });

    this._override('getUsedColumns', (baseFunction) => {
        let r = [];
        for (let i = 0; i < this.children.length; i++) {
            let child = this.children[i];
            r = r.concat(child.getUsedColumns());
        }
        r = _.uniq(r);
        return r;
    });

    this._override('renameColumn', (baseFunction, oldName, newName) => {
        for (let i = 0; i < this.children.length; i++)
            this.children[i].renameColumn(oldName, newName);
    });
};
SuperClass.create(OptionTypes.ParentOption);

OptionTypes.Array = function(template, value) {
    OptionTypes.ParentOption.extendTo(this, template, value);

    this._override('createChildren', (baseFunction, value) => {
        for (let i = 0; i < value.length; i++)
            this.children.push(OptionTypes.create(this._template.template, value[i]));
    });
};
SuperClass.create(OptionTypes.Array);

OptionTypes.Group = function(template, value) {
    OptionTypes.ParentOption.extendTo(this, template, value);

    this._override('createChildren', (baseFunction, value) => {
        for (let i = 0; i < this._template.elements.length; i++) {
            let element = this._template.elements[i];
            this.children.push(OptionTypes.create(element, value[element.name]));
        }
    });
};
SuperClass.create(OptionTypes.Group);


const Options = function(def) {

    this._options = {};

    for (var i = 0; i < def.length; i++) {
        var template = def[i];
        var option = OptionTypes.create(template, template.default);
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

    this.setValues = function(values) {
        for (let name in values) {
            if (name in this._options) {
                if (values[name] !== undefined)
                    this._options[name].setValue(values[name]);
            }
        }
    };

    this.getValues = function() {
        var values = { };
        for (let name in this._options) {
            if (this._options[name]._value !== undefined)
                values[name] = this._options[name]._value;
        }

        return values;
    };
};

module.exports = Options;
