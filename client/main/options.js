

'use strict';

const SuperClass = require('../common/superclass');

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
    this._templateOverride = { };
    this._isLeaf = isLeaf;
    this._initialized = false;

    this.setProperty = function(property, value) {
        if (value === this._template[property])
            delete this._templateOverride[property];
        else
            this._templateOverride[property] = value;
    };

    this.getProperty = function(property) {
        let value = this._templateOverride[property];
        if (value === undefined)
            value = this._template[property];

        return value;
    };

    this.getValue = function() {
        if (this._isLeaf)
            return this._value;
        else
            return this._onGetValue();
    };

    this.setValue = function(value) {
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

    this.getAssignedColumns = function() {
        if (this._isLeaf)
            return this._onGetAssignedColumns();
        else {
            let r = [];
            for (let i = 0; i < this.children.length; i++) {
                let child = this.children[i];
                r = r.concat(child.getAssignedColumns());
            }
            r = [...new Set(r)];
            return r;
        }
    };

    this.getAssignedOutputs = function() {
        if (this._isLeaf)
            return this._onGetAssignedOutputs();
        else {
            let r = [];
            for (let i = 0; i < this.children.length; i++) {
                let child = this.children[i];
                r = r.concat(child.getAssignedOutputs());
            }
            r = [...new Set(r)];
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

    this.renameLevel = function(variable, oldLabel, newLabel, getOption) {
        if (this._isLeaf)
            this._onRenameLevel(variable, oldLabel, newLabel, getOption);
        else {
            for (let i = 0; i < this.children.length; i++)
                this.children[i].renameLevel(variable, oldLabel, newLabel, getOption);
        }
    };

    this.clearColumnUse = function(columnName) {
        if (this._isLeaf)
            this._onClearColumnUse(columnName);
        else {
            for (let i = 0; i < this.children.length; i++)
                this.children[i].clearColumnUse(columnName);
        }
    };

    this._onGetAssignedColumns = function() {
        return [];
    };

    this._onGetAssignedOutputs = function() {
        return [];
    };

    this._onClearColumnUse = function(columnName) {  };

    this._onRenameColumn = function(oldName, newName) {  };

    this._onRenameLevel = function(variable, oldLevel, newLevel, getOption) {  };

    this.setValue(value);
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

OptionTypes.Level = function(template, value) {
    OptionTypes.Option.extendTo(this, template, value, true);

    this._override('_onRenameLevel', (baseFunction, variable, oldLabel, newLabel, getOption) => {
        let linkedVariable = this.getProperty('variable');
        if (linkedVariable) {
            if (linkedVariable.startsWith('(') && linkedVariable.endsWith(')')) {
                let binding = linkedVariable.slice(1, -1);
                linkedVariable = getOption(binding).getValue();
            }
            if (linkedVariable === variable && this._value === oldLabel)
                this._value = newLabel;
        }
    });
};
SuperClass.create(OptionTypes.Level);

OptionTypes.Output = function(template, value) {
    OptionTypes.Variable.extendTo(this, template, value);

    this._override('_onGetAssignedOutputs', (baseFunction) => {
        if (this._value !== null)
            return [ this._value ];
        else
            return [];
    });
};
SuperClass.create(OptionTypes.Output);

OptionTypes.Outputs = function(template, value) {
    OptionTypes.Variables.extendTo(this, template, value);

    this._override('_onGetAssignedOutputs', (baseFunction) => {
        let r = [];
        if (this._value !== null)
            r = this._value;

        r = [...new Set(r)];
        return r;
    });
};
SuperClass.create(OptionTypes.Outputs);

OptionTypes.Variable = function(template, value) {
    OptionTypes.Option.extendTo(this, template, value, true);

    this._override('_onClearColumnUse', (baseFunction, columnName) => {
        if (this._value === columnName)
            this._value = null;
    });

    this._override('_onGetAssignedColumns', (baseFunction) => {
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

    this._override('_onGetAssignedColumns', (baseFunction) => {
        let r = [];
        if (this._value !== null)
            r = this._value;

        r = [...new Set(r)];
        return r;
    });

    this._override('_onClearColumnUse', (baseFunction, columnName) => {
        if (this._value !== null) {
            for (let i = 0; i < this._value.length; i++) {
                if (this._value[i] === columnName) {
                    this._value.splice(i, 1);
                    i -= 1;
                }
            }
        }
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
    OptionTypes.Option.extendTo(this, template, value, true);

    this._override('_onGetAssignedColumns', (baseFunction) => {
        let t = [];
        if (this._value !== null) {
            for (let i = 0; i < this._value.length; i++) {
                if (this._value[i] !== null && this._value[i].length > 0)
                    t = [...new Set(t.concat(this._value[i]))];
            }
        }
        return t;
    });

    this._override('_onClearColumnUse', (baseFunction, columnName) => {
        if (this._value !== null) {
            for (let i = 0; i < this._value.length; i++) {
                for (let j = 0; j < this._value[i].length; j++) {
                    if (this._value[i][j] === columnName) {
                        this._value.splice(i, 1);
                        i -= 1;
                        break;
                    }
                }
            }
        }
    });

    this._override('_onRenameColumn', (baseFunction, oldName, newName) => {
        if (this._value !== null) {
            for (let i = 0; i < this._value.length; i++) {
                for (let j = 0; j < this._value[i].length; j++) {
                    if (this._value[i][j] === oldName)
                        this._value[i][j] = newName;
                }
            }
        }
    });

};
SuperClass.create(OptionTypes.Terms);

OptionTypes.Term = function(template, value) {
    OptionTypes.Option.extendTo(this, template, value, true);

    this._override('_onGetAssignedColumns', (baseFunction) => {
        let r = [];
        if (this._value !== null)
            r = this._value;

        r = [...new Set(r)];
        return r;
    });

    this._override('_onClearColumnUse', (baseFunction, columnName) => {
        if (this._value !== null) {
            for (let i = 0; i < this._value.length; i++) {
                if (this._value[i] === columnName) {
                    this._value = null;
                    return;
                }
            }
        }
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
SuperClass.create(OptionTypes.Term);

OptionTypes.Pairs = function(template, value) {
    OptionTypes.Option.extendTo(this, template, value, true);

    this._override('_onGetAssignedColumns', (baseFunction) => {
        let r = [];
        if (this._value !== null) {
            for (let i = 0; i < this._value.length; i++) {
                if (this._value[i] !== null) {
                    r.push(this._value[i].i1);
                    r.push(this._value[i].i2);
                }
            }
        }

        r = [...new Set(r)];
        return r;
    });

    this._override('_onClearColumnUse', (baseFunction, columnName) => {
        if (this._value !== null) {
            for (let i = 0; i < this._value.length; i++) {
                if (this._value[i] !== null) {
                    if (this._value[i].i1 === columnName)
                        this._value[i].i1 = null;
                    if (this._value[i].i2 === columnName)
                        this._value[i].i2 = null;
                    if (this._value[i].i1 === null && this._value[i].i2 === null) {
                        this._value.splice(i, 1);
                        i -= 1;
                    }
                }
            }
        }
    });

    this._override('_onRenameColumn', (baseFunction, oldName, newName) => {
        if (this._value !== null) {
            for (let i = 0; i < this._value.length; i++) {
                if (this._value[i] !== null) {
                    if (this._value[i].i1 === oldName)
                        this._value[i].i1 = newName;
                    if (this._value[i].i2 === oldName)
                        this._value[i].i2 = newName;
                }
            }
        }
    });
};
SuperClass.create(OptionTypes.Pairs);

OptionTypes.Pair = function(template, value) {
    OptionTypes.Group.extendTo(this, { type: 'Group', elements: [{ type: 'Variable', name: 'i1' }, { type: 'Variable', name: 'i2' }] }, value);
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

    this.getChild = function(index) {
        return this.children[index];
    };

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
            if (this.children.length > i)
                r[element.name] = this.children[i].getValue();
        }
        return r;
    });

    this._override('_createChildren', (baseFunction, value) => {
        this._indexedChildren = { };
        for (let i = 0; i < this._template.elements.length; i++) {
            let element = this._template.elements[i];
            let child = OptionTypes.create(element, value[element.name]);
            this.children.push(child);
            this._indexedChildren[element.name] = child;
        }
    });

    this.getChild = function(name) {
        return this._indexedChildren[name];
    };

    if (value !== null)
        this._createChildren(value);
};
SuperClass.create(OptionTypes.Group);


const Options = function(def=[], translator=null) {

    this._options = {};

    this._changingHandles = [ ];

    this.translateDefault = function(translator, item, _defaultValue) {

        if (_defaultValue === undefined) {
            if (item.default) {
                let translated = this.translateDefault(translator, item, item.default);
                if (translated !== null)
                    item.default = translated;
                return;
            }
        }

        if (_defaultValue) {
            switch (item.type) {
                case 'String':
                    return translator(_defaultValue);
                case 'Group':
                    for (let element of item.elements) {
                        let translated = this.translateDefault(translator, element, _defaultValue[element.name]);
                        if (translated !== null)
                            _defaultValue[element.name] = translated;
                    }
                    break;
                case 'Array':
                    for (let i = 0; i  < _defaultValue.length; i++) {
                        let translated = this.translateDefault(translator, item.template, _defaultValue[i]);
                        if (translated !== null)
                            _defaultValue[i] = translated;
                    }
                    break;
            }
        }

        return null;
    };

    for (var i = 0; i < def.length; i++) {
        var template = def[i];
        this.translateDefault(translator, template);
        let defaultValue = template.default;
        var option = OptionTypes.create(template, defaultValue);
        this._options[template.name] = option;
    }

    this.addValueChangingHandler = function(handle) {
        this._changingHandles.push(handle);
    };

    this.getAssignedColumns = function() {
        let r = [];
        for (let name in this._options) {
            let option = this._options[name];
            r = r.concat(option.getAssignedColumns());
        }
        r = [...new Set(r)];
        return r;
    };

    this.clearColumnUse = function(columnName) {
        for (let name in this._options) {
            let option = this._options[name];
            option.clearColumnUse(columnName);
        }
    };

    this.renameColumn = function(oldName, newName) {
        for (let name in this._options) {
            let option = this._options[name];
            option.renameColumn(oldName, newName);
        }
    };

    this.renameLevel = function(variable, oldLabel, newLabel) {
        for (let name in this._options) {
            let option = this._options[name];
            option.renameLevel(variable, oldLabel, newLabel, this.getOption);
        }
    };

    this.getOption = (name) => {
        return this._options[name];
    };

    this.setProperty = function(name, property, key, value) {
        let option = this._options[name];

        for (let i = 0; i < key.length; i++) {
            if ( ! option.getChild)
                return false;

            option = option.getChild(key[i]);
            if ( ! option)
                return false;
        }

        option.setProperty(property, value);

        return true;
    };

    this.getHeading = function() {
        let option = this.getOption('results//heading');
        if (option)
            return option.getValue();
        return null;
    };

    this.getAnnotation = function(address) {
        let option = this.getOption('results//' + address);
        if (option)
            return option.getValue();
        return null;
    };

    this.setValues = function(values, initializeOnly) {
        let changed = false;
        for (let name in values) {
            let value = values[name];
            if (value === undefined) {
                console.log("option '" + name + "' not set!");
                continue;
            }
            else if (name.startsWith('results/')) {  // results options
                if (name in this._options) {
                    // results options / params are notified as cleared by
                    // having values of null
                    if (value === null)
                         delete this._options[name];
                    else
                        this._options[name].setValue(value, initializeOnly);
                    changed = true;
                }
                else {
                    if (value !== null) {
                        this._options[name] = new OptionTypes.Option({}, value, true);
                        changed = true;
                    }
                }
            }
            else if (name in this._options) {
                let option = this._options[name];
                let apply = true;
                for (let handle of this._changingHandles) {
                    let result = handle(option, value, initializeOnly);
                    if (result.cancel) {
                        apply = ! result.cancel;
                        break;
                    }

                    value = result.value;
                }
                if (apply) {
                    this._options[name].setValue(value, initializeOnly);
                    changed = true;
                }
            }
        }

        return changed;
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
