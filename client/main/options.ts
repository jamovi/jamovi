'use strict';

class Option {
    _value: any;
    _template: { [property: string]: any};
    _templateOverride: { [property: string]: any};
    _isLeaf: boolean;
    _initialized: boolean;
    children: Option[];

    constructor(template, value, isLeaf) {
        this._template = template;
        this._templateOverride = { };
        this._isLeaf = isLeaf;
        this._initialized = false;

        this.setValue(value);
    }

    setProperty(property, value) {
        if (value === this._template[property])
            delete this._templateOverride[property];
        else
            this._templateOverride[property] = value;
    }

    getProperty(property) {
        let value = this._templateOverride[property];
        if (value === undefined)
            value = this._template[property];

        return value;
    }

    getValue() {
        if (this._isLeaf)
            return this._value;
        else if (this._onGetValue)
            return this._onGetValue();
    }

    _onGetValue?(): any;

    arraysEqual(a, b) {
        if (a === b) return true;
        if (a == null || b == null) return false;
        if (a.length !== b.length) return false;

        for (let i = 0; i < a.length; ++i) {
            if (this.areEqual(a[i], b[i]) === false)
                return false;
        }
        return true;
    }

    objectsEqual(a, b) {
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
    }

    areEqual(a, b) {
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

    setValue(value) {
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
    }

    _createChildren?(value:any): void;
    _updateChildren?(value:any): boolean;
    getChild?(key: number | string): Option;

    getAssignedColumns() {
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
    }

    getAssignedOutputs() {
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
    }

    renameColumn(oldName, newName) {
        if (this._isLeaf)
            this._onRenameColumn(oldName, newName);
        else {
            for (let i = 0; i < this.children.length; i++)
                this.children[i].renameColumn(oldName, newName);
        }
    }

    renameLevel(variable, oldLabel, newLabel, getOption) {
        if (this._isLeaf)
            this._onRenameLevel(variable, oldLabel, newLabel, getOption);
        else {
            for (let i = 0; i < this.children.length; i++)
                this.children[i].renameLevel(variable, oldLabel, newLabel, getOption);
        }
    }

    clearColumnUse(columnName) {
        if (this._isLeaf)
            this._onClearColumnUse(columnName);
        else {
            for (let i = 0; i < this.children.length; i++)
                this.children[i].clearColumnUse(columnName);
        }
    }

    _onGetAssignedColumns() {
        return [];
    }

    _onGetAssignedOutputs() {
        return [];
    }

    _onClearColumnUse(columnName) {  };

    _onRenameColumn(oldName, newName) {  };

    _onRenameLevel(variable, oldLevel, newLevel, getOption) {  };
}

class Integer extends Option {
    constructor(template, value) {
        super(template, value, true);
    }
}

class Number extends Option {
    constructor(template, value) {
        super(template, value, true);
    }
}

class Level extends Option {
    constructor(template, value) {
        super(template, value, true);
    }

    override _onRenameLevel(variable, oldLabel, newLabel, getOption) {
        let linkedVariable = this.getProperty('variable');
        if (linkedVariable) {
            if (linkedVariable.startsWith('(') && linkedVariable.endsWith(')')) {
                let binding = linkedVariable.slice(1, -1);
                linkedVariable = getOption(binding).getValue();
            }
            if (linkedVariable === variable && this._value === oldLabel)
                this._value = newLabel;
        }
    }
}

class Variable extends Option {
    constructor(template, value) {
        super(template, value, true);
    }

    override _onClearColumnUse(columnName) {
        if (this._value === columnName)
            this._value = null;
    }

    override _onGetAssignedColumns() {
        if (this._value !== null)
            return [ this._value ];
        else
            return [];
    }

    override _onRenameColumn(oldName, newName) {
        if (this._value === oldName)
            this._value = newName;
    }
}

class Variables extends Option {
    constructor(template, value) {
        super(template, value, true);
    }

    override _onGetAssignedColumns() {
        let r = [];
        if (this._value !== null)
            r = this._value;

        r = [...new Set(r)];
        return r;
    }

    override _onClearColumnUse(columnName) {
        if (this._value !== null) {
            for (let i = 0; i < this._value.length; i++) {
                if (this._value[i] === columnName) {
                    this._value.splice(i, 1);
                    i -= 1;
                }
            }
        }
    }

    override _onRenameColumn(oldName, newName) {
        if (this._value !== null) {
            for (let i = 0; i < this._value.length; i++) {
                if (this._value[i] === oldName)
                    this._value[i] = newName;
            }
        }
    }
}

class Output extends Variable {
    constructor(template, value) {
        super(template, value);
    }

    override _onGetAssignedOutputs() {
        if (this._value !== null)
            return [ this._value ];
        else
            return [];
    }
}

class Outputs extends Variables {
    constructor(template, value) {
        super(template, value);
    }

    override _onGetAssignedOutputs() {
        let r = [];
        if (this._value !== null)
            r = this._value;

        r = [...new Set(r)];
        return r;
    }
}

class Terms extends Option {
    constructor(template, value) {
        super(template, value, true);
    }

    override _onGetAssignedColumns() {
        let t = [];
        if (this._value !== null) {
            for (let i = 0; i < this._value.length; i++) {
                if (this._value[i] !== null && this._value[i].length > 0)
                    t = [...new Set(t.concat(this._value[i]))];
            }
        }
        return t;
    }

    override _onClearColumnUse(columnName) {
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
    }

    override _onRenameColumn(oldName, newName) {
        if (this._value !== null) {
            for (let i = 0; i < this._value.length; i++) {
                for (let j = 0; j < this._value[i].length; j++) {
                    if (this._value[i][j] === oldName)
                        this._value[i][j] = newName;
                }
            }
        }
    }

}

class Term extends Option {
    constructor(template, value) {
        super(template, value, true);
    }

    override _onGetAssignedColumns() {
        let r = [];
        if (this._value !== null)
            r = this._value;

        r = [...new Set(r)];
        return r;
    }

    override _onClearColumnUse(columnName) {
        if (this._value !== null) {
            for (let i = 0; i < this._value.length; i++) {
                if (this._value[i] === columnName) {
                    this._value = null;
                    return;
                }
            }
        }
    }

    override _onRenameColumn(oldName, newName) {
        if (this._value !== null) {
            for (let i = 0; i < this._value.length; i++) {
                if (this._value[i] === oldName)
                    this._value[i] = newName;
            }
        }
    }
}

class Pairs extends Option {
    constructor(template, value) {
        super(template, value, true);
    }

    override _onGetAssignedColumns() {
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
    }

    override _onClearColumnUse(columnName) {
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
    }

    override _onRenameColumn(oldName, newName) {
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
    }
}

class Group extends Option {
    
    _indexedChildren: { [key:string]:Option };

    constructor(template, value) {
        super(template, value, false);

        if (value !== null)
            this._createChildren(value);
    }

    override _onGetValue() {
        if (this._initialized === false)
            return null;

        var r = { };
        for (let i = 0; i < this._template.elements.length; i++) {
            let element = this._template.elements[i];
            if (this.children.length > i)
                r[element.name] = this.children[i].getValue();
        }
        return r;
    }

    override _createChildren(value) {
        this._indexedChildren = { };
        for (let i = 0; i < this._template.elements.length; i++) {
            let element = this._template.elements[i];
            let child = OptionTypes.create(element, value[element.name]);
            this.children.push(child);
            this._indexedChildren[element.name] = child;
        }
    }

    override _updateChildren(value) {
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
    }

    override getChild(name: string) {
        return this._indexedChildren[name];
    }
}

class Pair extends Group {
    constructor(template, value) {
        super({ type: 'Group', elements: [{ type: 'Variable', name: 'i1' }, { type: 'Variable', name: 'i2' }] }, value);
    }
}

class ArrayOption extends Option {
    constructor(template, value) {
        super(template, value, false);

        if (value !== null)
            this._createChildren(value);
    }

    override _onGetValue() {
        if (this._initialized === false)
            return null;

        var r = [];
        for (let i = 0; i < this.children.length; i++)
            r.push(this.children[i].getValue());
        return r;
    }

    override _createChildren(value) {
        for (let i = 0; i < value.length; i++)
            this.children.push(OptionTypes.create(this._template.template, value[i]));
    }

    override _updateChildren(value) {
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
    }

    override getChild(index: number) {
        return this.children[index];
    }
}

const OptionTypes = {

    create: function(template, value): Option {
        var constructor = OptionTypes[template.type];
        var initialValue = value;
        if (initialValue === undefined) {
            if (OptionTypes.defaultValues[template.type] !== undefined)
                initialValue = OptionTypes.defaultValues[template.type];
            else
                initialValue = null;
        }

        if ( ! constructor)
            return new OptionTypes.Option(template, initialValue, true);

        return new constructor(template, initialValue);
    },

    Option: Option,
    Integer: Integer,
    number: Number,
    Level: Level,
    Output: Output,
    Variable: Variable,
    Variables: Variables,
    Outputs: Outputs,
    Terms: Terms,
    Term: Term,
    Pairs: Pairs,
    Group: Group,
    Pair: Pair,
    Array: ArrayOption,

    defaultValues: {
        Integer: 0,
        number: 0
    }
};

type ValueChangedHandle = (option: Option, value: any, initializeOnly: boolean) => { value: any, cancel: boolean };

export class Options {
    
    _options: {[key: string]: Option};
    _changingHandles: ValueChangedHandle[];

    constructor(def=[]) {
        this._options = {};

        this._changingHandles = [ ];

        for (var i = 0; i < def.length; i++) {
            var template = def[i];
            let defaultValue = template.default;
            var option = OptionTypes.create(template, defaultValue);
            this._options[template.name] = option;
        }
    }

    addValueChangingHandler(handle: ValueChangedHandle) {
        this._changingHandles.push(handle);
    }

    getAssignedColumns() {
        let r = [];
        for (let name in this._options) {
            let option = this._options[name];
            r = r.concat(option.getAssignedColumns());
        }
        r = [...new Set(r)];
        return r;
    }

    clearColumnUse(columnName) {
        for (let name in this._options) {
            let option = this._options[name];
            option.clearColumnUse(columnName);
        }
    }

    renameColumn(oldName, newName) {
        for (let name in this._options) {
            let option = this._options[name];
            option.renameColumn(oldName, newName);
        }
    }

    renameLevel(variable, oldLabel, newLabel) {
        for (let name in this._options) {
            let option = this._options[name];
            option.renameLevel(variable, oldLabel, newLabel, this.getOption);
        }
    }

    getOption(name) {
        return this._options[name];
    }

    setProperty(name, property, key, value) {
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
    }

    getHeading(): string | null {
        let option = this.getOption('results//heading');
        if (option)
            return option.getValue();
        return null;
    }

    getAnnotation(address): string | null {
        let option = this.getOption('results//' + address);
        if (option)
            return option.getValue();
        return null;
    }

    setValues(values, initializeOnly?: boolean) {
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
    }

    getValues() {
        var values = { };
        for (let name in this._options) {
            let value = this._options[name].getValue();
            if (value !== undefined)
                values[name] = value;
        }

        return values;
    }
}

export default Options;
