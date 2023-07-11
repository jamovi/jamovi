
'use strict';

const applyMagicEvents = function(layout, template) {
    findMagicEvents(layout, 'view', template);
};

const validEvents = {
   OptionControl: [ 'changed', 'changing' ],

   OptionListControl: [ 'listItemAdded', 'listItemRemoved' ],

   TargetListSupport: [ 'preprocess' ],

   CustomControl: [ 'creating', 'updated' ],

   Supplier: ['changed', 'updated' ],

   root: ['loaded', 'updated', 'remoteDataChanged', 'creating']
};

const convertEventName = function(eventName) {
    switch(eventName) {
        case 'changed':
            return 'change';
        case 'updated':
            return 'update';
    }
    return eventName;
};

const eventInheritance = {
    CustomControl: ['CustomControl'],
    RMAnovaFactorsBox: ['OptionControl'],
    CheckBox: ['OptionControl'],
    RadioButton: ['OptionControl'],
    ComboBox: ['OptionControl'],
    ModeSelector: ['OptionControl'],
    LevelSelector: ['OptionControl'],
    TextBox: ['OptionControl'],
    ListBox: ['OptionControl', 'OptionListControl', 'TargetListSupport'],
    VariablesListBox: ['OptionControl', 'OptionListControl', 'TargetListSupport'],
    Supplier: ['Supplier'],
    VariableSupplier: ['Supplier'],
    Label: ['OptionControl'],
    VariableLabel: ['OptionControl'],
    TermLabel: ['OptionControl'],
    root: ['root']
};

const isValidEvent = function(ctrlType, eventName) {

    let ctrls = eventInheritance[ctrlType];
    if (ctrls === undefined)
        return false;

    for (let ctrl of ctrls) {
        let events = validEvents[ctrl];
        for (let event of events) {
            if (event === eventName)
                return true;
        }
    }

    return false;
};

const findMagicEvents = function(ctrl, name, template) {
    if (name !== undefined) {
        for (let handler in template.handlers) {
            if (handler.startsWith(name + '_')) {
                let eventName = handler.substring(name.length + 1);
                if (isValidEvent(ctrl.typeName ? ctrl.typeName : ctrl.type, eventName)) {
                    eventName = convertEventName(eventName);
                    if (name === 'view') {
                        if (template[eventName] !== undefined)
                            continue;

                        template[eventName] = template.handlers[handler];
                    }
                    else {
                        let events = ctrl.events;
                        if (events === undefined) {
                            events = [ ];
                            ctrl.events = events;
                        }

                        if (events[eventName] !== undefined)
                            continue;

                        let event = { };
                        if (eventName === "change")
                            event.execute = template.handlers[handler];
                        else {
                            event.onEvent = eventName;
                            event.execute = template.handlers[handler];
                        }
                        events.push(event);
                    }
                }
            }
        }
    }

    if (Array.isArray(ctrl.controls)) {
        for (let i = 0; i < ctrl.controls.length; i++) {
            findMagicEvents(ctrl.controls[i], ctrl.controls[i].name, template);
            checkForSetupErrors(ctrl, template);
        }
    }
};

const checkForEventHandle = function(eventName, ctrl) {
    let events = ctrl.events;
    if (events === undefined)
        return false;

    for (let event of events) {
        if (event.onEvent === eventName || ( eventName === 'change' && event.onEvent === undefined ))
            return true;
    }

    return false;
};

const checkForSetupErrors = function(ctrl, template) {
    if ((ctrl.typeName === 'Supplier' || (ctrl.typeName === 'VariableSupplier' && ctrl.populate === 'manual')) && checkForEventHandle('update', ctrl) === false)
        template.errors.push(`The use of a ${ ctrl.typeName === 'Supplier' ? ("'" + ctrl.typeName + "' control") : ("'" + ctrl.typeName + "' control, with the property > populate: 'manual',") } requires an 'updated' event handler to be assigned. Option: ${ctrl.name === undefined ? ctrl.typeName : ctrl.name}`);
};

module.exports = applyMagicEvents;
