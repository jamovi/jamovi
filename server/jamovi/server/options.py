
from typing import Any

from .jamovi_pb2 import AnalysisOption
from .jamovi_pb2 import AnalysisOptions


NONE = AnalysisOption.Other.Value('NONE')
TRUE = AnalysisOption.Other.Value('TRUE')
FALSE = AnalysisOption.Other.Value('FALSE')


def substitute(values, changes):
    for index, old_value in enumerate(values):
        try:
            values[index] = changes[old_value]
        except KeyError:
            pass
    return values


def write_value_to_pb(value, pb):
    if value is True:
        pb.o = TRUE
    elif value is False:
        pb.o = FALSE
    elif type(value) == str:
        pb.s = value
    elif type(value) == int:
        pb.i = value
    elif type(value) == float:
        pb.d = value
    elif type(value) == list:
        pb.ClearField('c')
        pb.c.hasNames = False
        for v in value:
            child_pb = pb.c.options.add()
            write_value_to_pb(v, child_pb)
    elif type(value) == dict:
        pb.ClearField('c')
        pb.c.hasNames = True
        for k, v in value.items():
            pb.c.names.append(k)
            child_pb = pb.c.options.add()
            write_value_to_pb(v, child_pb)
    else:
        pb.o = NONE


def read_value_from_pb(pb: AnalysisOption):
    if pb.HasField('s'):
        return pb.s
    elif pb.HasField('c'):
        values = map(read_value_from_pb, pb.c.options)
        if pb.c.hasNames:
            return dict(zip(pb.c.names, values))
        else:
            return list(values)
    elif pb.HasField('o'):
        if pb.o == TRUE:
            return True
        elif pb.o == FALSE:
            return False
        else:
            return None
    elif pb.HasField('i'):
        return pb.i
    elif pb.HasField('d'):
        return pb.d
    else:
        return None


def read_values_from_pb(pb: AnalysisOptions) -> dict[str, Any]:
    values = {}
    for i, opt_pb in enumerate(pb.options):
        name = pb.names[i]
        value = read_value_from_pb(opt_pb)
        values[name] = value
    return values


class Option:
    def __init__(self, defn):
        self.defn = defn
        self.type = defn['type']
        self.name = defn.get('name')
        self.passive = defn.get('passive', False)
        self.default = self.gen_default()
        self.pb = None

    def attach(self, pb):
        self.pb = pb

    def set_value(self, value):
        write_value_to_pb(value, self.pb)

    def get_value(self):
        return read_value_from_pb(self.pb)

    def get_using(self):
        return set()

    def rename_using(self, changes):
        pass

    def gen_default(self):
        if 'default' in self.defn:
            def4ult = self.defn['default']
            if self.type == 'Output':
                return { 'value': def4ult, 'vars': [ ], 'synced': [ ] }
            else:
                return def4ult
        elif self.type == 'Bool' or self.type == 'Action':
            return False
        elif self.type == 'Variables':
            return [ ]
        elif self.type == 'Integer':
            return 0
        elif self.type == 'Number':
            return 0.0
        elif self.type == 'List':
            first_option = self.defn['options'][0]
            if isinstance(first_option, dict):
                return first_option['name']
            else:
                return first_option
        elif self.type == 'NMXList':
            return [ ]
        elif self.type == 'Output':
            return { 'value': False, 'vars': [ ], 'synced': [ ] }
        else:
            return None


class OptionVariable(Option):
    def get_using(self):
        value = self.get_value()
        if value is not None:
            return set([ value ])
        else:
            return set()

    def rename_using(self, changes):
        old_value = self.get_value()
        if old_value in changes:
            new_value = changes[old_value]
            self.set_value(new_value)


class OptionVariables(Option):
    def get_using(self):
        values = self.get_value()
        if values is not None:
            return set(values)
        else:
            return set()

    def rename_using(self, changes):
        values = self.get_value()
        if not values:
            return
        substitute(values, changes)
        self.set_value(values)


class OptionTerms(Option):
    def get_using(self):
        valuess = self.get_value()
        using = set()
        if not valuess:
            return using
        for values in valuess:
            for value in values:
                using.add(value)
        return using

    def rename_using(self, changes):
        valuess = self.get_value()
        if not valuess:
            return
        for values in valuess:
            substitute(values, changes)
        self.set_value(valuess)


class OptionPairs(OptionTerms):
    def get_using(self):
        valuess = self.get_value()
        using = set()
        if not valuess:
            return using
        for values in valuess:
            for value in values.values():
                using.add(value)
        return using

    def rename_using(self, changes):
        valuess = self.get_value()
        if not valuess:
            return
        for values in valuess:
            for key, value in values.items():
                try:
                    values[key] = changes[value]
                except KeyError:
                    pass
        self.set_value(valuess)


class OptionArray(Option):
    def __iter__(self):
        template = self.defn['template']
        option = create_option(template)
        for child_pb in self.pb.c.options:
            option.attach(child_pb)
            yield option

    def get_using(self):
        using = set()
        for option in self:
            using.update(option.get_using())
        return using

    def rename_using(self, changes):
        for option in self:
            option.rename_using(changes)


class OptionGroup(OptionArray):
    def __iter__(self):
        elems = self.defn['elements']
        names = list(self.pb.c.names)
        for elem_defn in elems:
            option = create_option(elem_defn)
            index = names.index(option.name)
            elem_pb = self.pb.c.options[index]
            option.attach(elem_pb)
            yield option


OptionTypes = {
    'Variable': OptionVariable,
    'Variables': OptionVariables,
    'Terms': OptionTerms,
    'Pairs': OptionPairs,
    'Array': OptionArray,
    'Group': OptionGroup,
}


def create_option(defn):
    Type = OptionTypes.get(defn['type'], Option)
    option = Type(defn)
    return option


class Options:

    @staticmethod
    def create(options_defn):

        options = Options()
        options._pb.hasNames = True

        for opt_defn in options_defn:

            if 'name' not in opt_defn or 'type' not in opt_defn:
                continue

            name = opt_defn['name']
            typ  = opt_defn['type']

            if typ == 'Data':
                continue

            option = create_option(opt_defn)

            options._options[name] = option
            options._pb.names.append(name)
            opt_pb = options._pb.options.add()

            option.attach(opt_pb)
            option.set_value(option.default)

        return options

    def __init__(self):
        self._options = { }
        self._pb = AnalysisOptions()

    def reset(self):
        for i in range(len(self._pb.names)):
            name = self._pb.names[i]
            opt_pb = self._pb.options[i]
            default = None
            if name in self._options:
                default = self._options[name].default
            write_value_to_pb(default, opt_pb)

    def get(self, name):
        return self.get_value(name)

    def get_value(self, name, otherwise=None):
        for i, opt_name in enumerate(self._pb.names):
            if opt_name == name:
                pb = self._pb.options[i]
                break
        else:
            return otherwise

        return read_value_from_pb(pb)

    def set_value(self, name, value):

        for i, opt_name in enumerate(self._pb.names):
            if opt_name == name:
                option_pb = self._pb.options[i]
                break
        else:
            option_pb = self._pb.options.add()
            self._pb.names.append(name)

        write_value_to_pb(value, option_pb)

    def set(self, pb):
        changes = False
        old_names = list(self._pb.names)
        new_names = list(pb.names)

        for i, name in enumerate(new_names):
            new_pb = pb.options[i]

            changed = False

            if name in old_names:
                old_index = old_names.index(name)
                old_pb = self._pb.options[old_index]
                if old_pb != new_pb:
                    old_pb.CopyFrom(new_pb)
                    changed = True
            else:
                self._pb.names.append(name)
                option_pb = self._pb.options.add()
                option_pb.CopyFrom(new_pb)
                changed = True

            if changed:
                if name.startswith('results/'):
                    # 'results/' options don't change the analysis, except these ones
                    if (name.endswith('/widthScale')
                            or name.endswith('/heightScale')):
                        changes = True
                elif name not in self._options or not self._options[name].passive:
                    changes = True

        to_delete = set(old_names) - set(new_names)
        to_delete = filter(lambda name: name.startswith('results/'), to_delete)
        to_delete = list(to_delete)
        for i, old_name in reversed(list(enumerate(old_names))):
            if old_name in to_delete:
                del self._pb.options[i]
                del self._pb.names[i]

        return changes

    def get_producing(self):
        producing = set()
        for option in self._options.values():
            if option.type == 'Output':
                value = option.get_value()
                if value is not None and 'vars' in value:
                    producing.update(value['vars'])
        return producing

    def get_using(self):
        using = set()
        for i, name in enumerate(self._pb.names):
            try:
                option = self._options[name]
            except KeyError:
                continue
            pb = self._pb.options[i]
            option.attach(pb)
            using.update(option.get_using())
        return set(using)

    def rename_using(self, changes):
        for i, name in enumerate(self._pb.names):
            try:
                option = self._options[name]
            except KeyError:
                continue
            pb = self._pb.options[i]
            option.attach(pb)
            option.rename_using(changes)

    def clear_actions(self):
        for i, name in enumerate(self._pb.names):
            option = self._options.get(name, None)
            if option is not None and option.type == 'Action':
                opt_pb = self._pb.options[i]
                write_value_to_pb(False, opt_pb)

    def read(self, bin):
        self._pb.ParseFromString(bin)

    def as_pb(self):
        return self._pb

    def as_bytes(self):
        return self._pb.SerializeToString()

    def compress(self):
        # remove deleted results options (set to null)
        # used before saving
        i = 0
        while i < len(self._pb.names):
            name = self._pb.names[i]
            pb = self._pb.options[i]
            if name.startswith('results/') and pb.o is AnalysisOption.Other.Value('NONE'):
                del self._pb.names[i]
                del self._pb.options[i]
            else:
                i += 1
