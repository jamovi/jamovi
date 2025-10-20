
'use strict';

const path = require('path');
const fs = require('fs');
const yaml = require('js-yaml');
const _ = require('underscore');
const validate = require('jsonschema').validate;
const util = require('util')
const uiUpdateCheck = require('./layoutupdatecheck');

let uiSchemaPath = path.join(__dirname, 'schemas', 'uischema.yaml');
let uiSchema = yaml.load(fs.readFileSync(uiSchemaPath));
let uiCtrlSchemasPath = path.join(__dirname, 'schemas', 'uictrlschemas.yaml');
let uiCtrlSchemas = yaml.load(fs.readFileSync(uiCtrlSchemasPath));
let currentBasename = '';
let magicHandlers = false;

const uicompile = function(analysisPath, uiPath, jsPath, basename, sTemplPath, outPath) {

    currentBasename = basename;

    let content = fs.readFileSync(analysisPath, 'utf-8');
    let analysis = yaml.load(content);

    let uiData = null;

    if (fs.existsSync(uiPath)) {
        try {
            uiData = yaml.load(fs.readFileSync(uiPath, 'utf-8'));
        }
        catch (e) {
            reject(uiPath, e.message);
        }
        if (uiData.children === undefined)
            uiData.children = [];
    }

    if (uiData === null || uiData.compilerMode === 'aggressive')
        uiData = { title: analysis.title, name: analysis.name, jus: "3.0", stage: 0, compilerMode: 'aggressive', children: [] };

    if (uiData.compilerMode === undefined)
        uiData.compilerMode = 'tame';

    let upgradeInfo = uiUpdateCheck(uiData);
    if (upgradeInfo.upgraded)
        console.log("upgraded: " + path.basename(uiPath) + " : " + upgradeInfo.message);

    if (uiData === null || typeof uiData.jus !== 'string')
        reject(uiPath, "no 'jus' present");

    let jus = uiData.jus.match(/^([0-9]+)\.([0-9]+)$/)
    if ((jus[1] !== '1' && jus[1] !== '2' && jus[1] !== '3'  && jus[1] !== '4') || jus[2] !== '0')
        reject(uiPath, 'requires a newer jamovi-compiler');

    magicHandlers = parseInt(jus[1]) >= 3;

    let removed = removeMissingOptions(analysis.options, uiData);
    if (removed.length > 0) {
        console.log("modified: " + path.basename(uiPath));
        for (let i = 0; i < removed.length; i++)
            console.log("  - removed ctrl: " + ((removed[i].name === undefined) ? (removed[i].type + " - " + removed[i].label)  : removed[i].name));
    }

    let added = insertMissingControls(analysis.options, uiData);
    if (uiData.compilerMode === 'tame' && added.length > 0) {
        if (removed.length === 0)
            console.log("modified: " + path.basename(uiPath));
        for (let i = 0; i < added.length; i++)
            console.log("  - added ctrl: " + added[i].name);
    }

    let report = validate(uiData, uiSchema);
    if ( ! report.valid)
        throwVError(report, analysis.title, uiPath);

    checkControls(uiData.children, uiPath);

    if (upgradeInfo.upgraded || added.length > 0 || removed.length > 0) {
        fs.writeFileSync(uiPath,  yaml.dump(uiData));
        console.log('wrote: ' + path.basename(uiPath));
    }

    let template = fs.readFileSync(sTemplPath, 'utf-8');
    let compiler = _.template(template);

    let elements = createUIElementsFromYaml(uiData);

    analysis.constructor = createConstructorCode(jus, jsPath, basename);

    let object = { analysis: analysis, elements: elements };
    content = compiler(object);

    fs.writeFileSync(outPath, content);

    console.log('wrote: ' + path.basename(outPath));
};

const createConstructorCode = function(jus, jsPath, basename) {
    if (parseInt(jus[1]) < 3)
        return '';

    let handlers = '{ }';
    if (fs.existsSync(jsPath))
        handlers = `require('./${basename}')`;



    return `this.handlers = ${ handlers }`
}

const reject = function(filePath, message) {
    throw "Unable to compile '" + path.basename(filePath) + "':\n\t" + message;
}

const throwVError = function(report, name, filename) {
    let errors = report.errors.map(e => {
        return e.stack.replace(/instance/g, name);
    }).join('\n\t');
    reject(filename, errors)
}

const extendSchemas = function(source, destination) {

    for (let name in source) {
        if (name === "properties") {
            for (let prop in source.properties) {
                if (prop === "events") {
                    if (destination.properties[prop] === undefined) {
                        destination.properties[prop] = {
                            type: "object",
                            additionalProperties: false,
                            properties: []
                        }
                    }
                    extendSchemas(source.properties[prop], destination.properties[prop]);
                }
                else
                    destination.properties[prop] = source.properties[prop];
            }
        }
        else if (name === "required" && destination.required)
            destination.required = destination.required.concat(source.required)
        else
            destination[name] = source[name];
    }
}

const createSchema = function(ctrl) {
    let schema = { };
    schema["$schema"] = 'http://json-schema.org/draft-04/schema#';
    schema.type = "object";
    schema.additionalProperties = false;
    schema.properties = { };
    let list = uiCtrlSchemas.ControlInheritance[ctrl.type];
    for (let i = 0; i < list.length; i++) {
        let partSchema = uiCtrlSchemas[list[i]];
        extendSchemas(partSchema, schema);
    }
    return schema;
}

const checkForEventHandle = function(eventName, ctrl) {
    return ctrl.events !== undefined && ctrl.events[eventName] !== undefined;
}

const checkControl = function(ctrl, uifilename) {
    if (ctrl.inputPattern !== undefined)
        reject(uifilename, 'The property "inputPattern" is no longer supported and should be removed. Option: ' + (ctrl.name === undefined ? ctrl.type : ctrl.name));

    if ((ctrl.type === 'Supplier' || (ctrl.type === 'VariableSupplier' && ctrl.populate === 'manual')) && checkForEventHandle('update', ctrl) === false && checkForEventHandle('updated', ctrl) === false) {
        if (magicHandlers === false)
            reject(uifilename, `The use of a ${ ctrl.type === 'Supplier' ? ("'" + ctrl.type + "' control") : ("'" + ctrl.type + "' control, with the property > populate: 'manual',") } requires an 'updated' event handler to be assigned. Option: ${ctrl.name === undefined ? ctrl.type : ctrl.name}`);
    }


    let schema = createSchema(ctrl);
    if (schema) {
        let report = validate(ctrl, schema);
        if ( ! report.valid)
            throwVError(report, ctrl.name === undefined ? ctrl.type : ctrl.name, uifilename);
    }
};

const checkControls = function(ctrls, uifilename) {
    for (let i = 0; i < ctrls.length; i++) {
        checkControl(ctrls[i], uifilename);

        if (ctrls[i].template)
            checkControl(ctrls[i].template, uifilename);

        if (ctrls[i].children)
            checkControls(ctrls[i].children, uifilename);
    }
}

const removeMissingOptions = function(options, parent) {
    let list = [];
    let i = 0;
    while (i < parent.children.length) {
        let removed = false;

        let ctrl = parent.children[i];
        if (ctrl.children !== undefined)
            list = list.concat(removeMissingOptions(options, ctrl));

        var optionName = isOptionControl(ctrl);
        if (optionName === false) {
            if (uiOptionControl[ctrl.type].isContainerControl(ctrl) && ctrl.children.length === 0) {
                parent.children.splice(i, 1);
                removed = true;
            }
        }
        else if (isOptionValid(optionName, ctrl, options) === false) {
            list.push(ctrl);
            if (ctrl.children !== undefined && ctrl.children.length > 0) {
                let newCtrl = createLayoutEquivalent(ctrl);
                parent.children[i] = newCtrl;
            }
            else {
                parent.children.splice(i, 1);
                removed = true;
            }
        }

        if (removed === false)
            i += 1;
    }

    return list;
};

const createLayoutEquivalent = function(ctrl) {
    let newCtrl = groupConstructors.open_LayoutBox();
    delete newCtrl.children;

    if (ctrl.cell !== undefined)
        newCtrl.cell = ctrl.cell;

    if (ctrl.margin !== undefined)
        newCtrl.margin = ctrl.margin;

    if (ctrl.stage !== undefined)
        newCtrl.stage = ctrl.stage;

    if (ctrl.fitToGrid !== undefined)
        newCtrl.fitToGrid = ctrl.fitToGrid;

    if (ctrl.stretchFactor !== undefined)
        newCtrl.stretchFactor = ctrl.stretchFactor;

    if (ctrl.horizontalAlignment !== undefined)
        newCtrl.horizontalAlignment = ctrl.horizontalAlignment;

    if (ctrl.verticalAlignment !== undefined)
        newCtrl.verticalAlignment = ctrl.verticalAlignment;

    if (ctrl.minWidth !== undefined)
        newCtrl.minWidth = ctrl.minWidth;

    if (ctrl.minHeight !== undefined)
        newCtrl.minHeight = ctrl.minHeight;

    if (ctrl.maxWidth !== undefined)
        newCtrl.maxWidth = ctrl.maxWidth;

    if (ctrl.maxHeight !== undefined)
        newCtrl.maxHeight = ctrl.maxHeight;

    newCtrl.children = [];
    for (let j = 0; j < ctrl.children.length; j++)
        newCtrl.children.push(ctrl.children[j]);

    return newCtrl;
};

const isOptionValid = function(name, ctrl, options) {
    for (let i = 0; i < options.length; i++) {
        if (options[i].name === name) {
            if (ctrl.optionPart !== undefined) {
                if (options[i].options !== undefined) {
                    for (let j = 0; j < options[i].options.length; j++) {
                        let subOption = options[i].options[j];
                        if ((typeof subOption === 'string' && subOption === ctrl.optionPart) || subOption.name === ctrl.optionPart)
                            return options[i].hidden !== true && compatibleDataTypes(ctrl, options[i]);
                    }
                }
                return false;
            }
            else
                return options[i].hidden !== true && compatibleDataTypes(ctrl, options[i]);
        }
    }

    return false;
};

const insertMissingControls = function(options, uiData) {
    var baseObj = { ctrl: uiData, index: 0, parentData: null };
    let lastPosData = baseObj;
    var updated = [];
    for (var i = 0; i < options.length; i++) {
        var option = options[i];
        if (option.hidden)
            continue;
        let posDatas = findOptionControl(option, baseObj);
        if (posDatas.length === 0) {
            let posData = addOptionAsControl(option, null, lastPosData);
            if (posData !== null) {
                posDatas.push(posData);
                updated.push(option);
            }
        }
        else if (option.options !== undefined) {
            let isfragmented = true;
            if (posDatas.length === 1)
                isfragmented = posDatas[0].ctrl.optionPart !== undefined;

            if (isfragmented) {
                let fragUpdated = false;
                let insertPosData = lastPosData;
                for (let k = 0; k < option.options.length; k++) {
                    let subOption = option.options[k];
                    let subOptionName = typeof subOption === 'string' ? subOption : subOption.name;
                    let found = false;
                    for (let j = 0; j < posDatas.length; j++) {
                        let focusValue = posDatas[j].ctrl.optionPart;
                        if (focusValue === undefined)
                            throw 'Cannot have more then one non fragmented control.';
                        if (subOptionName === focusValue) {
                            found = true;
                            insertPosData = posDatas[j];
                            break;
                        }
                    }
                    if (found === false) {
                        let posData = addOptionAsControl(option, subOptionName, insertPosData);
                        if (posData !== null) {
                            posDatas.push(posData);
                            fragUpdated = true;
                            insertPosData = posData;
                        }
                    }
                }
                if (fragUpdated)
                    updated.push(option);
            }
        }

        if (posDatas.length > 0)
            lastPosData = posDatas[posDatas.length - 1];
    }

    return updated;
};

const findOptionControl = function(option, posData) {
    let ctrls = [];
    let ctrl = posData.ctrl;
    if (isOptionControl(ctrl, option.name))
        ctrls.push(posData);

    if (ctrl.children !== undefined) {
        for (let i = 0; i < ctrl.children.length; i++) {
            let found = findOptionControl(option, { ctrl: ctrl.children[i], index: i, parentData: posData } );
            if (found !== null)
                ctrls = ctrls.concat(found);
        }
    }

    return ctrls;
};

const addOptionAsControl = function(option, focusValue, sibblingData) {

    var optType = constructors[option.type];
    if (optType === undefined)
        return null;

    let newCtrl = null;

    if (focusValue !== null) {
        if (optType.createFragment === undefined)
            throw 'This control does not support fragmentation.'
        newCtrl = optType.createFragment(option, focusValue)
    }
    else
        newCtrl = optType.create(option);

    var index;

    var neededGroup = groupConstructors.getAppropriateSupplier(option);
    var parentData = sibblingData.parentData;

    if (parentData === null) {
        parentData = sibblingData;
        sibblingData = { ctrl: parentData.ctrl.children[parentData.ctrl.children.length - 1], index: parentData.ctrl.children.length - 1, parentData: parentData };
    }

    var parentCtrl = parentData.ctrl;
    while (parentData.parentData !== null && (neededGroup.parent !== parentCtrl.type || areControlsCompatibleSibblings(sibblingData.ctrl, newCtrl) === false)) {
        sibblingData = parentData;
        parentData = parentData.parentData;
        parentCtrl = parentData.ctrl;
    }


    if ((parentData.parentData === null || isPureContainerControl(sibblingData.ctrl)) && neededGroup !== null) {
        var parentControl = groupConstructors["open_" + neededGroup.constructor]();
        addChild(newCtrl, parentControl, 0);
        var ii = addChild(parentControl, parentCtrl, sibblingData.index + 1);
        parentData = { ctrl: parentControl, index: ii, parentData: parentData };
        parentCtrl = parentControl;
        index = 0;
    }
    else
        index = addChild(newCtrl, parentCtrl, sibblingData.index + 1);

    return { ctrl: newCtrl, index: index, parentData: parentData };
};

const addChild = function(newCtrl, parentCtrl, index) {
    if (parentCtrl.type === "Supplier" || parentCtrl.type === "VariableSupplier") {
        let label = newCtrl.name;
        if (newCtrl._target_label !== undefined) {
            label = newCtrl._target_label;
            delete newCtrl._target_label;
        }

        let cc = groupConstructors.open_TargetLayoutBox(label);
        cc.children.push(newCtrl);
        newCtrl = cc;
    }

    if (newCtrl._target_label !== undefined)
        delete newCtrl._target_label;

    index = index + 1;
    if (index >= parentCtrl.children.length) {
        parentCtrl.children.push(newCtrl);
        index = parentCtrl.children.length - 1;
    }
    else
        parentCtrl.children.splice(index, 0, newCtrl);

    return index;
};


const replaceAt = function(value, index, character) {
    return value.substr(0, index) + character + value.substr(index+character.length);
}

const createUIElementsFromYaml = function(uiData) {

    var data = createChildTree(uiData.children, "\t\t");

    if (uiData.stage === undefined)
        uiData.stage = 0;

    let mainEvents = uiData.events;
    let events = "events: [\n" + data.events + "\n\t]";
    for (let eventName in mainEvents)
        events = events + ",\n\n\t" + checkEventAliases(eventName) + ": " + functionify(mainEvents[eventName]);

    return { events: events, controls: "[\n" + data.ctrls + "\n\t]", title: uiData.title, name: uiData.name, stage: uiData.stage, jus: uiData.jus };
};

const createChildTree = function(list, indent) {
    if (list === undefined)
        return { ctrls: "", events: "" };

    var ctrlList = "";
    var events = "";
    var children = list;
    for (let i = 0; i < children.length; i++) {
        let child = children[i];
        let copy = "";
        for (let name in child) {
            if (copy !== "")
                copy += ",\n";

            if (name === "type") {
                copy += indent + "\t" + name + ": " + processEnum("DefaultControls", child[name]);
                if (child[name].startsWith('.') === false)
                    copy += ",\n" + indent + "\ttypeName: '" + child[name] + "'";
            }
            else if (name === "format") {
                copy += indent + "\t" + name + ": " + processEnum("FormatDef", child[name]);
            }
            else if (name === "events") {
                if (child.name === undefined)
                    throw "A control cannot have events with no name.";
                let innerevents = processEventsList(child, child[name], indent + "\t\t");
                copy += indent + "\t" + name + ": [\n";
                copy += innerevents + "\n";
                copy += indent + "\t" + "]";
            }
            else if (name === "children") {
                var data = createChildTree(child.children, indent + "\t\t");
                copy += indent + "\t" + "controls: [\n" + data.ctrls + "\n\t" + indent + "]";
                if (data.events !== "") {
                    if (events !== "")
                        events += ",\n";
                    events += data.events;
                }
            }
            else if (name === "columns") {
                var data = createChildTree(child.columns, indent + "\t\t");
                copy += indent + "\t" + "columns: [\n" + data.ctrls + "\n\t" + indent + "]";
            }
            else if (name === "template") {
                var data = createChildTree([child.template], indent + "\t");
                copy += indent + "\t" + "template:\n" + data.ctrls + "\t" + indent;
            }
            else
                copy += indent + "\t" + name + ": " + JSON.stringify(child[name]);
        }
        copy += "\n";
        copy = indent + "{\n" +  copy + indent + "}";
        if (ctrlList !== "")
            ctrlList += ",\n";
        ctrlList += copy;
    }

    return { ctrls: ctrlList, events: events };
};

const processEnum = function(type, value) {
    let pvalue = value;
    if (value.startsWith('.')) {
        let list = value.split("::");
        pvalue = "require('" + list[0] + "')";
        if (list.length > 1)
            pvalue = pvalue + "." + list[1];
    }
    else
        pvalue = type + "." + pvalue;

    return pvalue;
};

const checkEventAliases = function(eventName) {
    switch (eventName) {
        case 'updated':
            return 'update';
        case 'changed':
            return 'change';
        default:
            return eventName;
    }
};

const processEventsList = function(ctrl, events, indent) {
    var list = "";
    for (let name in events) {
        let eventName = checkEventAliases(name);
        var eventData = events[eventName];
        var event = "";
        if (eventName === "change")
            event += "execute: " + functionify(eventData);
        else {
            event += "onEvent: '" + checkEventAliases(eventName) + "', ";
            event += "execute: " + functionify(eventData);
        }
        //event += "\n";
        event = indent + "{ " + event + " }";
        if (list !== "")
            list += ",\n";
        list += event;
    }
    return list;
};

const functionify = function(value) {

    let init = value;
    if (init === undefined)
        init = "function(ui) { }";
    else if (init.startsWith('.')) {
        let initList = init.split("::");
        init = "require('" + initList[0] + "')";
        if (initList.length > 1)
            init = init + "." + initList[1];
    }
    else
        init = "require('./" + currentBasename + "')." + init;

    return init;
};

const isPureContainerControl = function(ctrl) {
    return uiOptionControl[ctrl.type].isContainerControl(ctrl) && uiOptionControl[ctrl.type].isOptionControl(ctrl) === false
};

const isOptionControl = function(ctrl, optionName) {
    if (ctrl.type === undefined)
        return false;

    let isOptionCtrl = uiOptionControl[ctrl.type].isOptionControl(ctrl);

    if (isOptionCtrl) {
        if (optionName !== undefined)
            return ctrl.optionName === optionName || ctrl.name === optionName;

        return (ctrl.optionName === undefined) ? ctrl.name : ctrl.optionName;
    }

    return false;
};

const areControlsCompatibleSibblings = function(ctrl1, ctrl2) {

    let i1 = uiOptionControl[ctrl1.type].usesSingleCell(ctrl1);
    let i2 = uiOptionControl[ctrl2.type].usesSingleCell(ctrl2);

    return i1 && i2;
};

const ff = function(item) {
    switch (item.type) {
        case "Variables":
        case "Variable":
        case "Pairs":
        case "Pair":
            return { parent: 'VariableSupplier', constructor: 'VariableSupplier' };
        case "Terms":
        case "Term":
            return { parent: 'Supplier', constructor: 'Supplier' };
    }

    if (item.template !== undefined) {
        let template = item.template;
        if (template.elements !== undefined) {
            for (let i = 0; i < template.elements.length; i++) {
                let rr = ff(template.elements[i]);
                if (rr !== null)
                    return rr;
            }
        }

        if (template.template !== undefined) {
            let rr = ff(template.template);
            if (rr !== null)
                return rr;
        }
    }

    return null;
};

const groupConstructors = {

    getAppropriateSupplier: function(item) {

        let ss = ff(item);
        if (ss !== null)
            return ss;

        switch (item.type) {
            case "Array":
                return null;
        }

        return { parent: 'LayoutBox', constructor: 'LayoutBox' };
    },

    open_TargetLayoutBox: function(label) {
        let ctrl = { };
        ctrl.type = "TargetLayoutBox";
        if (label !== undefined)
            ctrl.label = label;
        ctrl.children = [ ];
        return ctrl;
    },

    open_LayoutBox: function(margin) {
        var ctrl = {};
        ctrl.type = 'LayoutBox';
        ctrl.margin = margin !== undefined ? margin : "large";
        ctrl.children = [ ];
        return ctrl;
    },

    open_ContentSelector: function(label) {
        var ctrl = {};
        ctrl.type = 'ModeSelector';
        ctrl.label = label;
        ctrl.children = [ ];
        return ctrl;
    },

    open_Label: function(label) {
        var ctrl = {};
        ctrl.type = 'Label';
        ctrl.label = label;
        ctrl.children = [ ];
        return ctrl;
    },

    open_VariableSupplier: function() {
        var ctrl = { };
        ctrl.type = 'VariableSupplier'
        ctrl.persistentItems = false;
        ctrl.stretchFactor = 1;
        ctrl.children = [ ];
        return ctrl;
    },

    open_Supplier: function() {
        var ctrl = { };
        ctrl.type = 'Supplier'
        ctrl.persistentItems = false;
        ctrl.stretchFactor = 1;
        ctrl.format = 'term';
        ctrl.children = [ ];
        return ctrl;
    }
};

const CheckTemplateState = function(item, ctrl, isTemplate) {
    if(item.name !== undefined) {
        if (!isTemplate)
            ctrl.name = item.name;
    }
};


const compatibleDataTypes = function(ctrl, opt) {
    let ctrl_raw = uiOptionControl[ctrl.type].toRaw(ctrl);
    let key = ctrl.valueKey === undefined ? [] : ctrl.valueKey;
    let opt_raw = constructors[opt.type].toRaw(opt, key);

    let r = false;
    if (opt_raw !== null)
        r = compareTypeObjects(ctrl_raw, opt_raw);

    if (r === false) {
        console.log('#############################');
        console.log(util.inspect(ctrl_raw, false, null));
        console.log('=============================');
        console.log(util.inspect(opt_raw, false, null));
        console.log('-----------------------------');
    }
    return r;
};

const compareTypeObjects = function(subType, fullType) {
    if (subType === 'unknown' || fullType === 'unknown')
        return true;

    if (typeof subType !== 'object')
        return subType === fullType;

    if (typeof fullType !== 'object') {
        if (subType.type === 'enum' && subType.template === fullType)
            return true;
        return false;
    }

    if (subType.type !== fullType.type)
        return false;

    if (subType.type === 'array')
        return compareTypeObjects(subType.template, fullType.template);

    if (subType.type === 'object') {
        for (let i = 0; i < subType.elements.length; i++) {
            let e1 = subType.elements[i];
            let found = false;
            for (let j = 0; j < fullType.elements.length; j++) {
                let e2 = fullType.elements[j];
                if (e1.key === e2.key) {
                    found = true;
                    break;
                }
            }
            if (found === false)
                return false;
        }
    }

    return true;
};

const constructors = {

    Integer: {
        create: function(item, isTemplate) {
            let ctrl = { };
            ctrl.type = 'TextBox';
            CheckTemplateState(item, ctrl, isTemplate);
            ctrl.format = "number";
            return ctrl
        },
        toRaw: function(obj, key) {
            if (key === undefined || key.length === 0)
                return "number";

            return null;
        }
    },

    Number: {
        create: function(item, isTemplate) {
            let ctrl = { };
            ctrl.type = 'TextBox';
            CheckTemplateState(item, ctrl, isTemplate);
            ctrl.format = "number";
            return ctrl
        },
        toRaw: function(obj, key) {
            if (key === undefined || key.length === 0)
                return "number";

            return null;
        }
    },

    Bool: {
        create: function(item, isTemplate) {
            let ctrl = { };
            ctrl.type = 'CheckBox';
            CheckTemplateState(item, ctrl, isTemplate);
            return ctrl
        },
        toRaw: function(obj, key) {
            if (key === undefined || key.length === 0)
                return "boolean";

            return null;
        }
    },

    Action: {
        create: function (item, isTemplate) {
            let ctrl = {};
            ctrl.type = 'ActionButton';
            CheckTemplateState(item, ctrl, isTemplate);
            return ctrl
        },
        toRaw: function (obj, key) {
            if (key === undefined || key.length === 0)
                return "boolean";

            return null;
        }
    },

    Output: {
        create: function(item, isTemplate) {
            let ctrl = { };
            ctrl.type = 'Output';
            CheckTemplateState(item, ctrl, isTemplate);
            return ctrl
        },
        toRaw: function(obj, key) {
            if (key === undefined || key.length === 0)
                return { type: 'group', elements: [ { name: 'value', type: 'boolean' }, { name: 'vars', type: 'array', template: 'string' } ] };;

            return null;
        }
    },

    NMXList: {
        create: function(item, isTemplate) {
            let ctrl = groupConstructors.open_Label(item.title);
            CheckTemplateState(item, ctrl, isTemplate);
            if (item.options.length <= 3)
                ctrl.style = "list-inline";
            for (let i = 0; i < item.options.length; i++) {
                let option = item.options[i];
                let checkbox = constructors.NMXList.createFragment(item, option.name);
                ctrl.children.push(checkbox);
            }

            return ctrl;
        },
        createFragment: function(item, fragmentName) {
            let checkbox = { };
            checkbox.name = item.name + "_" + fragmentName;
            checkbox.type = 'CheckBox';
            checkbox.optionName = item.name;
            checkbox.optionPart = fragmentName;
            return checkbox;
        },
        toRaw: function(obj, key) {
            if (key === undefined || key.length === 0)
                return { type: "array", template: { type: "enum", template: "string", options: obj.options } };

            if (key.length > 1)
                return null;

            return { type: "enum", template: "string", options: obj.options };
        }
    },

    List: {
        create: function(item, isTemplate) {
            var ctrl = { };
            ctrl.type = 'ComboBox';
            CheckTemplateState(item, ctrl, isTemplate);
            return ctrl;
        },
        createFragment: function(item, fragmentName) {
            let ctrl = { };
            ctrl.name = item.name + "_" + fragmentName;
            ctrl.type = 'RadioButton';
            ctrl.optionName = item.name;
            ctrl.optionPart = fragmentName;
            return ctrl;
        },
        toRaw: function(obj, key) {
            if (key === undefined || key.length === 0)
                return { type: "enum", template: "string", options: obj.options };

            return null;
        }
    },

    Term: {
        create: function(item, isTemplate) {
            let ctrl = { };
            ctrl.type = 'TermLabel';
            CheckTemplateState(item, ctrl, isTemplate);

            return ctrl;
        },
        toRaw: function(obj, key) {
            if (key === undefined || key.length === 0)
                return { type: "array", template: "string" };

            if (key.length === 1)
                return "string";

            return null;
        }
    },

    Terms: {
        create: function(item, isTemplate) {
            let ctrl = { };
            ctrl.type = 'ListBox';
            CheckTemplateState(item, ctrl, isTemplate);
            if (item.name !== undefined || item.title !== undefined)
                ctrl._target_label = item.title !== undefined ? item.title : item.name;
            ctrl.isTarget = true;
            ctrl.template = {
                type: "TermLabel"
            };

            return ctrl;
        },
        toRaw: function(obj, key) {
            if (key === undefined || key.length === 0)
                return { type: "array", template: { type: "array", template: "string" } };

            if (key.length === 1)
                return { type: "array", template: "string" };

            if (key.length === 2)
                return "string";

            return null;
        }
    },

    Level: {
        create: function(item, isTemplate) {
            let ctrl = { }
            ctrl.type = "LevelSelector";
            CheckTemplateState(item, ctrl, isTemplate);
            if (isTemplate !== true && (item.name !== undefined || item.title !== undefined))
                ctrl._target_label = item.title !== undefined ? item.title : item.name;
            return ctrl;
        },
        toRaw: function(obj, key) {
            if (key === undefined || key.length === 0)
                return "string";

            return null;
        }
    },

    String: {
        create: function(item, isTemplate) {
            let ctrl = { };
            ctrl.type = "TextBox";
            CheckTemplateState(item, ctrl, isTemplate);
            ctrl.format = "string";
            return ctrl;
        },
        toRaw: function(obj, key) {
            if (key === undefined || key.length === 0)
                return "string";

            return null;
        }
    },

    Variables: {
        create: function(item, isTemplate) {
            let ctrl = { }
            ctrl.type = "VariablesListBox";
            CheckTemplateState(item, ctrl, isTemplate);
            if (isTemplate !== true && (item.name !== undefined || item.title !== undefined))
                ctrl._target_label = item.title !== undefined ? item.title : item.name;
            ctrl.isTarget = true;
            return ctrl;
        },
        toRaw: function(obj, key) {

            if (key === undefined || key.length === 0)
                return { type: "array", template: "string" };

            if (key.length === 1)
                return "string";

            return null;
        }
    },

    Variable: {
        create: function(item, isTemplate) {
            let ctrl = { }
            ctrl.type = "VariablesListBox";
            CheckTemplateState(item, ctrl, isTemplate);
            if (isTemplate !== true && (item.name !== undefined || item.title !== undefined))
                ctrl._target_label = item.title !== undefined ? item.title : item.name;
            ctrl.maxItemCount = 1;
            ctrl.isTarget = true;
            return ctrl;
        },
        toRaw: function(obj, key) {
            if (key === undefined || key.length === 0)
                return "string";

            return null;
        }
    },

    Array: {
        create: function(item, isTemplate) {
            var ctrl = { };

            ctrl.type = "ListBox";
            CheckTemplateState(item, ctrl, isTemplate);
            if (isTemplate !== true && (item.name !== undefined || item.title !== undefined))
                ctrl._target_label = item.title !== undefined ? item.title : item.name;
            ctrl.showColumnHeaders = false;
            ctrl.fullRowSelect = true;
            ctrl.stretchFactor = 1;

            if (item.template.type === 'Group') {
                ctrl.columns = [ ];
                for (let i = 0; i < item.template.elements.length; i++) {
                    let column = item.template.elements[i];
                    let columnData = {
                        name: column.name,
                        stretchFactor: 1
                    }
                    columnData.template = constructors[column.type].create(column, true);
                    ctrl.columns.push(columnData);
                }
            }
            else
                ctrl.template = constructors[item.template.type].create(item.template, true);

            return ctrl;
        },
        toRaw: function(obj, key) {

            if (key === undefined || key.length === 0)
                return { type: "array", template: constructors[obj.template.type].toRaw(obj.template, key.slice(1)) };

            return constructors[obj.template.type].toRaw(obj.template, key.slice(1))
        }
    },

    Pairs: {
        create: function(item, isTemplate) {
            var ctrl = { };
            ctrl.type = "VariablesListBox";
            CheckTemplateState(item, ctrl, isTemplate);
            if (isTemplate !== true && (item.name !== undefined || item.title !== undefined))
                ctrl._target_label = item.title !== undefined ? item.title : item.name;
            ctrl.fullRowSelect = true;
            ctrl.isTarget = true;
            ctrl.columns = [
                {
                    name: "i1",
                    stretchFactor: 1,
                    template: {
                        type: "VariableLabel"
                    }
                },
                {
                    name: "i2",
                    stretchFactor: 1,
                    template: {
                        type: "VariableLabel"
                    }
                }
            ];
            return ctrl;
        },
        toRaw: function(obj, key) {
            if (key === undefined || key.length === 0)
                return {
                    type: "array",
                    template: {
                        type: "object",
                        elements: [
                            {
                                key: "i1",
                                type: "string"
                            },
                            {
                                key: "i2",
                                type: "string"
                            }
                        ]
                    }
                };

            if (key.length === 1)
                return "string";

            return null;
        }
    },

    Pair: {
        create: function(item, isTemplate) {
            var ctrl = { };
            ctrl.type = "VariablesListBox";
            CheckTemplateState(item, ctrl, isTemplate);
            if (isTemplate !== true && (item.name !== undefined || item.title !== undefined))
                ctrl._target_label = item.title !== undefined ? item.title : item.name;
            ctrl.fullRowSelect = true;
            ctrl.isTarget = true;
            ctrl.maxItemCount = 1;
            ctrl.columns = [
                {
                    name: "i1",
                    stretchFactor: 1,
                    template: {
                        type: "VariableLabel"
                    }
                },
                {
                    name: "i2",
                    stretchFactor: 1,
                    template: {
                        type: "VariableLabel"
                    }
                }
            ];
            return ctrl;
        },
        toRaw: function(obj, key) {
            if (key === undefined || key.length === 0)
                return {
                    type: "object",
                    elements: [
                        {
                            key: "i1",
                            type: "string"
                        },
                        {
                            key: "i2",
                            type: "string"
                        }
                    ]
                };

            if (key.length === 1)
                return "string";

            return null;
        }
    },

    Group: {
        create: function(item, isTemplate) {
            let ctrl = { }
            ctrl.type = "ListBox";
            CheckTemplateState(item, ctrl, isTemplate);
            if (isTemplate !== true && (item.name !== undefined || item.title !== undefined))
                ctrl._target_label = item.title !== undefined ? item.title : item.name;
            ctrl.maxItemCount = 1;

            ctrl.columns = [ ];
            for (let i = 0; i < item.elements.length; i++) {
                let column = item.elements[i];
                let columnData = {
                    name: column.name,
                    stretchFactor: 1
                }
                columnData.template = constructors[column.type].create(column, true);
                ctrl.columns.push(columnData);
            }

            return ctrl;
        },
        toRaw: function(obj, key) {
            let props = [];
            let x = -1;
            for (let i = 0; i < obj.elements.length; i++) {
                props[i] = { key: obj.elements[i].name, template: constructors[obj.elements[i].type].toRaw(obj.elements[i], key.slice(1)) };
                if (key.length > 0 && obj.elements[i].name === key[0])
                    x = i;
            }
            if (key === undefined || key.length === 0)
                return { type: "object", elements: props };

            if (x !== -1)
                return props[x].template;

            return null;
        }
    },
};

const getControlRawType = function(ctrl) {
    if (ctrl.format === undefined || ctrl.format.startsWith('./'))
        return 'unknown';

    if (ctrl.format === 'term')
        return { type: 'array', template: 'string' };
    else if (ctrl.format === 'terms')
        return { type: 'array', template: { type: 'array', template: 'string' } };
    else if (ctrl.format === 'variable')
        return 'string';
    else if (ctrl.format === 'variables')
        return { type: 'array', template: 'string' };
    else if (ctrl.format === 'output')
        return { type: 'group', elements: [ { name: 'value', type: 'boolean' }, { name: 'vars', type: 'array', template: 'string' } ] };

    return ctrl.format;
}

const uiOptionControl = {
    Label: {
        usesSingleCell: function(ctrl) {
            return true;
        },
        isContainerControl: function(ctrl) {
            return ctrl.children !== undefined && ctrl.children.length > 0;
        },
        isOptionControl: function(ctrl) {
            return ctrl.label === undefined && ctrl.isVirtual !== true;
        },
        toRaw: function(ctrl) {
            if (ctrl.label !== undefined)
                return null;

            if (ctrl.format !== undefined)
                return getControlRawType(ctrl);
            else
                return "string";
        }
    },

    TextBox: {
        usesSingleCell: function(ctrl) {
            return ctrl.useSingleCell === true;
        },
        isContainerControl: function(ctrl) {
            return false;
        },
        isOptionControl: function(ctrl) {
            return ctrl.isVirtual !== true;
        },
        toRaw: function(ctrl) {
            if (ctrl.format !== undefined)
                return getControlRawType(ctrl);
            else
                return "string";
        }
    },

    ComboBox: {
        usesSingleCell: function(ctrl) {
            return ctrl.useSingleCell === true;
        },
        isContainerControl: function(ctrl) {
            return false;
        },
        isOptionControl: function(ctrl) {
            return ctrl.isVirtual !== true;
        },
        toRaw: function(ctrl) {
            if (ctrl.format !== undefined)
                return { type: "enum", template: getControlRawType(ctrl) };

            return { type: "enum", template: "string" };
        }
    },

    ModeSelector: {
        usesSingleCell: function(ctrl) {
            return true;
        },
        isContainerControl: function(ctrl) {
            return true;
        },
        isOptionControl: function(ctrl) {
            return ctrl.isVirtual !== true;
        },
        toRaw: function(ctrl) {
            if (ctrl.format !== undefined)
                return { type: "enum", template: getControlRawType(ctrl) };

            return { type: "enum", template: "string" };
        }
    },

    LevelSelector: {
        usesSingleCell: function(ctrl) {
            return ctrl.useSingleCell === true;
        },
        isContainerControl: function(ctrl) {
            return false;
        },
        isOptionControl: function(ctrl) {
            return ctrl.isVirtual !== true;
        },
        toRaw: function(ctrl) {
            if (ctrl.format !== undefined)
                return  getControlRawType(ctrl);

            return "string";
        }
    },

    CheckBox:  {
        usesSingleCell: function(ctrl) {
            return true;
        },
        isContainerControl: function(ctrl) {
            return ctrl.children !== undefined && ctrl.children.length > 0;
        },
        isOptionControl: function(ctrl) {
            return ctrl.isVirtual !== true;
        },
        toRaw: function(ctrl) {
            if (ctrl.optionPart !== undefined)
                return { type: "array", template: { type: "enum", template: "string" } };

            return "boolean";
        }
    },

    ActionButton: {
        usesSingleCell: function (ctrl) {
            return true;
        },
        isContainerControl: function (ctrl) {
            return false;
        },
        isOptionControl: function (ctrl) {
            return ctrl.isVirtual !== true;
        },
        toRaw: function (ctrl) {
            return "boolean";
        }
    },

    Output:  {
        usesSingleCell: function(ctrl) {
            return true;
        },
        isContainerControl: function(ctrl) {
            return ctrl.children !== undefined && ctrl.children.length > 0;
        },
        isOptionControl: function(ctrl) {
            return ctrl.isVirtual !== true;
        },
        toRaw: function(ctrl) {
            return { type: 'group', elements: [ { name: 'value', type: 'boolean' }, { name: 'vars', type: 'array', template: 'string' } ] };;
        }
    },

    RadioButton: {
        usesSingleCell: function(ctrl) {
            return true;
        },
        isContainerControl: function(ctrl) {
            return ctrl.children !== undefined && ctrl.children.length > 0;
        },
        isOptionControl: function(ctrl) {
            return ctrl.isVirtual !== true;
        },
        toRaw: function(ctrl) {
            if (ctrl.optionPart !== undefined)
                return { type: "enum", template: "string" };

            return "boolean";
        }
    },

    ListBox: {
        usesSingleCell: function(ctrl) {
            return true;
        },
        isContainerControl: function(ctrl) {
            return false;
        },
        isOptionControl: function(ctrl) {
            return ctrl.isVirtual !== true;
        },
        toRaw: function(ctrl) {

            let template = null;
            if (ctrl.template !== undefined)
                template = determineTemplateType(ctrl.template);
            else if (ctrl.columns !== undefined) {
                if (ctrl.columns.length === 1)
                    template = determineTemplateType(ctrl.columns[0].template);
                else {
                    let props = [];
                    for (let i = 0; i < ctrl.columns.length; i++) {
                        if (ctrl.columns[i].isVirtual !== true) {
                            let temp = determineTemplateType(ctrl.columns[i].template);
                            props.push({ key: ctrl.columns[i].name, template: temp });
                        }
                    }
                    if (props.length > 1)
                        template = { type: "object", elements: props };
                    else
                        template = props[0].template;
                }
            }
            else
                throw "ListBox is missing columns.";

            if (ctrl.maxItemCount === 1)
                return template;

            return { type: "array", template: template };

        }
    },

    VariableLabel: {
        usesSingleCell: function(ctrl) {
            return true;
        },
        isContainerControl: function(ctrl) {
            return false;
        },
        isOptionControl: function(ctrl) {
            return ctrl.isVirtual !== true;
        },
        toRaw: function() {
            return "string";
        }
    },

    TermLabel: {
        usesSingleCell: function(ctrl) {
            return true;
        },
        isContainerControl: function(ctrl) {
            return false;
        },
        isOptionControl: function(ctrl) {
            return ctrl.isVirtual !== true;
        },
        toRaw: function() {
            return { type: "array", template: "string" };
        }
    },

    VariablesListBox: {
        usesSingleCell: function(ctrl) {
            return true;
        },
        isContainerControl: function(ctrl) {
            return false;
        },
        isOptionControl: function(ctrl) {
            return ctrl.isVirtual !== true;
        },
        toRaw: function(ctrl) {

            if (ctrl.columns !== undefined || ctrl.template !== undefined)
                return uiOptionControl.ListBox.toRaw(ctrl);

            if (ctrl.maxItemCount === 1)
                return 'string';

            return { type: 'array', template: 'string' };
        }
    },

    RMAnovaFactorsBox: {
        usesSingleCell: function(ctrl) {
            return true;
        },
        isContainerControl: function(ctrl) {
            return false;
        },
        isOptionControl: function(ctrl) {
            return ctrl.isVirtual !== true;
        },
        toRaw: function() {
            return {
                type: "array",
                template: {
                    type: "object",
                    elements: [
                        { key: "label", template: "string" },
                        { key: "levels", template: { type: "array", template: "string" } }
                    ]
                }
            };
        }
    },

    TargetLayoutBox: {
        usesSingleCell: function(ctrl) {
            return false;
        },
        isContainerControl: function(ctrl) {
            return true;
        },
        isOptionControl: function(ctrl) {
            return false;
        }
    },

    CustomControl: {
        usesSingleCell: function(ctrl) {
            return true;
        },
        isContainerControl: function(ctrl) {
            return false;
        },
        isOptionControl: function(ctrl) {
            return false;
        }
    },

    Supplier: {
        usesSingleCell: function(ctrl) {
            return true;
        },
        isContainerControl: function(ctrl) {
            return true;
        },
        isOptionControl: function(ctrl) {
            return false;
        }
    },

    VariableSupplier: {
        usesSingleCell: function(ctrl) {
            return true;
        },
        isContainerControl: function(ctrl) {
            return true;
        },
        isOptionControl: function(ctrl) {
            return false;
        }
    },

    CollapseBox: {
        usesSingleCell: function(ctrl) {
            return true;
        },
        isContainerControl: function(ctrl) {
            return true;
        },
        isOptionControl: function(ctrl) {
            return false;
        }
    },

    LayoutBox: {
        usesSingleCell: function(ctrl) {
            return true;
        },
        isContainerControl: function(ctrl) {
            return true;
        },
        isOptionControl: function(ctrl) {
            return false;
        }
    },

    Content: {
        usesSingleCell: function(ctrl) {
            return true;
        },
        isContainerControl: function(ctrl) {
            return true;
        },
        isOptionControl: function(ctrl) {
            return false;
        }
    }
};

const combineDataTypes = function(data1, data2) {
    let nData = { };
    if (data1.type === data2.type) {
        if (data1.elements === undefined || data2.elements === undefined)
            throw 'Cannot combine data types that have no elements.';

        nData.type = data1.type;
        nData.elements = data1.elements.slice();
        for (let i = 0; i < data2.elements.length; i++) {
            let found = false;
            for (let j = 0; j < nData.elements.length; j++) {
                if (nData.elements[j].key === data2.elements[i].key) {
                    nData.elements[j] = combineDataTypes(nData.elements[j], data2.elements[i]);
                    found = true;
                    break;
                }
            }
            if (found === false)
                nData.elements.push(data2.elements[i]);
        }
    }
    else
        throw 'Cannot combine different data types.';

};

const determineTemplateType = function(template) {
    let elements = [];
    let ctrlInfo = uiOptionControl[template.type];
    if (ctrlInfo !== undefined) {
        let dataType = null;
        if (template.children !== undefined) {
            for (let i = 0; i < template.children.length; i++) {
                let temp = determineTemplateType(template.children[i]);
                if (temp !== null) {
                    if (temp.key === undefined) {
                        if (dataType !== null)
                            dataType = combineDataTypes(dataType, temp);
                        else
                            dataType = temp
                    }
                    else {
                        if (dataType !== null && dataType.elements === undefined)
                            throw 'Cannot add element to a non object.';
                        if (dataType === null && typeof temp.key === 'number')
                            dataType = { type: 'array', elements: elements };
                        else if ((dataType === null || dataType.type !== 'object') && typeof temp.key === 'string') {
                            dataType = { type: 'object', elements: elements };
                        }
                        elements.push(temp);
                    }
                }
            }
        }

        if (ctrlInfo.isOptionControl(template)) {
            let dataType2 = uiOptionControl[template.type].toRaw(template);
            if (template.valueKey !== undefined && template.valueKey.length > 0) {
                for (let i = 0; i < template.valueKey.length; i++)
                    dataType2 = { key: template.valueKey[template.valueKey.length - i - 1], template: dataType2 };
            }
            if (dataType !== null)
                dataType = combineDataTypes(dataType, dataType2);
            else
                dataType = dataType2;
        }

        return dataType;
    }

    throw "Unknown control '" + template.type + "'. This compiler does not currently support custom controls."
};

module.exports = uicompile;
