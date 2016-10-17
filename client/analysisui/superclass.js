
'use strict';

var SuperClass = { };

SuperClass.superClasses = { };

SuperClass.create = function(_class) {

    if (_class.name in SuperClass.superClasses)
        throw "This name is already used for a superclass.";

    _class.extendTo = function(target, param1, param2, param3, param4, param5, param6, param7) {

        if (!target._inheritedClasses)
            target._inheritedClasses = [];
        else {
            for (let i = 0; i < target._inheritedClasses.length; i++) {
                var scid = target._inheritedClasses[i];
                if (scid === _class.name)
                    return false;
            }
        }

        _class.call(target, param1, param2, param3, param4, param5, param6, param7);
        target._inheritedClasses.push(_class.name);

        return true;
    };

    SuperClass.superClasses[_class.name] = _class;
};

module.exports = SuperClass;
