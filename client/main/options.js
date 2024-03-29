

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

    this.arraysEqual = function(a, b) {
        if (a === b) return true;
        if (a == null || b == null) return false;
        if (a.length !== b.length) return false;

        for (let i = 0; i < a.length; ++i) {
            if (this.areEqual(a[i], b[i]) === false)
                return false;
        }
        return true;
    };

    this.objectsEqual = function (a, b) {
        if (a === b) return true;
        if (a == null || b == null) return false;

        const obj1Keys = Object.keys(a).sort();
        const obj2Keys = Object.keys(b).sort();
        if (obj1Keys.length !== obj2Keys.length)
            return false;

        return obj1Keys.every((key, index) => {
            const objValue1 = a[key];
            const objValue2 = b[obj2Keys[index]];
            return this.areEqual(objValue1, objValue2);
        });
    };

    this.areEqual = function (a, b) {
        if (Array.isArray(a) && a !== null) {
            if (this.arraysEqual(b, a) === false)
                return false;
        }
        if (typeof a === 'object' && a !== null) {
            if (this.objectsEqual(b, a) === false)
                return false;
        }
        else if (b !== a)
            return false;

        return true;
    }

    this.setValue = function (value) {
        let changed = false;
        if (this._isLeaf) {
            if (this.areEqual(value, this._value) === false) {
                changed = true;
                this._value = value;
            }
        }
        else {
            if (this._initialized === false) {
                this.children = [];
                if (value === null)
                    return true;

                if (this._createChildren)
                    this._createChildren(value);
                changed = true;
            }
            else if (value === null) {
                if (this.children.length > 0) {
                    this.children = [];
                    changed = true;
                }
            }
            else {
                if (this._updateChildren)
                    changed = this._updateChildren(value) || changed;
            }
        }

        if (value !== null)
            this._initialized = true;
        
        return changed;
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

    this._override('_updateChildren', (baseFunction, value) => {
        let changed = false;
        for (let i = 0; i < value.length; i++) {
            if (i < this.children.length)
                changed = this.children[i].setValue(value[i]) || changed;
            else {
                this.children.push(OptionTypes.create(this._template.template, value[i]));
                changed = true;
            }
        }

        if (value.length < this.children.length) {
            this.children.splice(value.length - this.children.length);
            changed = true;
        }

        return changed;
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

    this._override('_updateChildren', (baseFunction, value) => {
        let changed = false;
        this.children = [];
        let newIndexedChildren = {};
        for (let i = 0; i < this._template.elements.length; i++) {
            let element = this._template.elements[i];
            let child = this._indexedChildren[element.name];
            if (child) {
                changed = child.setValue(value[element.name]) || changed;
                delete this._indexedChildren[element.name];
            }
            else {
                child = OptionTypes.create(element, value[element.name]);
                changed = true;
            }

            this.children.push(child);
            newIndexedChildren[element.name] = child;
        }
        this._indexedChildren = newIndexedChildren;
        return changed;
    });

    this.getChild = function(name) {
        return this._indexedChildren[name];
    };

    if (value !== null)
        this._createChildren(value);
};
SuperClass.create(OptionTypes.Group);


const Options = function(def=[]) {

    this._options = {};

    this._changingHandles = [ ];

    for (var i = 0; i < def.length; i++) {
        var template = def[i];
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
                    if (value === null) {
                        delete this._options[name];
                        changed = true;
                    }
                    else
                        changed = this._options[name].setValue(value) || changed;
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
                    changed = this._options[name].setValue(value) || changed;
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
