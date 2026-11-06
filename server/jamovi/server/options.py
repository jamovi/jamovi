
from typing import Any
from typing import Container

from .jamovi_pb2 import AnalysisOption
from .jamovi_pb2 import AnalysisOptions
from .sessionfiles import is_file_id


NONE = AnalysisOption.Other.Value('NONE')
TRUE = AnalysisOption.Other.Value('TRUE')
FALSE = AnalysisOption.Other.Value('FALSE')

# an addon's options are carried in its parent's options, named
# addons/<ns>/<name>/<option>
ADDONS_PREFIX = 'addons/'


def addon_prefix(ns, name):
    return f'{ ADDONS_PREFIX }{ ns }/{ name }/'


# the settings the client sends along with an analysis' options, which its
# addons need as well
SETTINGS = ('.ppi', 'theme', 'palette', 'decSymbol', '.lang')


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

    def prune_using(self, allowed):
        # removes the use of any variable not in allowed
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
        elif self.type == 'File':
            return [ ]
        elif self.type == 'Color':
            return '#000000'
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

    def prune_using(self, allowed):
        value = self.get_value()
        if value is not None and value not in allowed:
            self.set_value(None)


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

    def prune_using(self, allowed):
        values = self.get_value()
        if not values:
            return
        self.set_value([ v for v in values if v in allowed ])


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

    def prune_using(self, allowed):
        # a term goes if any of its variables isn't allowed
        valuess = self.get_value()
        if not valuess:
            return
        self.set_value([ values for values in valuess
                         if all(v in allowed for v in values) ])


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

    def prune_using(self, allowed):
        valuess = self.get_value()
        if not valuess:
            return
        self.set_value([ values for values in valuess
                         if all(v in allowed for v in values.values()) ])


class OptionFile(Option):
    # a list of { id, filename } (always a list, even when not multiple --
    # only jmvcore's OptionFile collapses a single file to a singleton). id
    # names the file in the session temp dir (see sessionfiles.py), and is
    # NONE if the file isn't there -- restored from an .omv that didn't carry
    # it, say -- in which case the filename is kept so the user can see what
    # needs re-selecting

    @staticmethod
    def _entries(pb: AnalysisOption):
        # yields the 'id' sub-option of each file
        if not pb.HasField('c'):
            return
        for file_pb in pb.c.options:
            if not file_pb.HasField('c') or not file_pb.c.hasNames:
                continue
            for i, name in enumerate(file_pb.c.names):
                if name == 'id':
                    yield file_pb.c.options[i]

    @staticmethod
    def ids(pb: AnalysisOption):
        # the (well-formed) ids in pb. an id is client-supplied, so anything
        # that isn't one is ignored rather than ever reaching the filesystem
        for id_pb in OptionFile._entries(pb):
            if id_pb.HasField('s') and is_file_id(id_pb.s):
                yield id_pb.s

    @staticmethod
    def keep_ids(pb: AnalysisOption, ids: Container[str]):
        # sets to NONE every id not in ids (or not well-formed)
        for id_pb in OptionFile._entries(pb):
            if not id_pb.HasField('s') or not is_file_id(id_pb.s) or id_pb.s not in ids:
                id_pb.o = NONE


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

    def prune_using(self, allowed):
        for option in self:
            option.prune_using(allowed)


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
    'File': OptionFile,
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

    def get_using(self, include_addons=True):
        using = set()
        for i, name in enumerate(self._pb.names):
            if not include_addons and name.startswith(ADDONS_PREFIX):
                continue
            try:
                option = self._options[name]
            except KeyError:
                continue
            pb = self._pb.options[i]
            option.attach(pb)
            using.update(option.get_using())
        return set(using)

    def own_pb(self):
        # the options, less those of addons
        pb = AnalysisOptions()
        pb.hasNames = True
        for i, name in enumerate(self._pb.names):
            if name.startswith(ADDONS_PREFIX):
                continue
            pb.names.append(name)
            pb.options.add().CopyFrom(self._pb.options[i])
        return pb

    def addon_pb(self, ns, name):
        # the options of an addon, named as the addon knows them. an addon
        # may only use the variables its parent uses, so any others are
        # removed (from what is returned, not from the options themselves,
        # so they reappear if the parent takes them up again)
        prefix = addon_prefix(ns, name)
        allowed = self.get_using(include_addons=False)
        pb = AnalysisOptions()
        pb.hasNames = True
        for i, opt_name in enumerate(self._pb.names):
            if opt_name in SETTINGS:
                pb.names.append(opt_name)
                pb.options.add().CopyFrom(self._pb.options[i])
                continue
            if not opt_name.startswith(prefix):
                continue
            pb.names.append(opt_name[len(prefix):])
            opt_pb = pb.options.add()
            opt_pb.CopyFrom(self._pb.options[i])
            if opt_name in self._options:
                option = create_option(self._options[opt_name].defn)
                option.attach(opt_pb)
                option.prune_using(allowed)
        return pb

    def rename_using(self, changes):
        for i, name in enumerate(self._pb.names):
            try:
                option = self._options[name]
            except KeyError:
                continue
            pb = self._pb.options[i]
            option.attach(pb)
            option.rename_using(changes)

    def file_ids(self, pb: AnalysisOptions | None = None):
        # see OptionFile
        if pb is None:
            pb = self._pb
        for i, name in enumerate(pb.names):
            option = self._options.get(name, None)
            if option is not None and option.type == 'File':
                yield from OptionFile.ids(pb.options[i])

    def keep_file_ids(self, ids: Container[str], pb: AnalysisOptions | None = None):
        # see OptionFile. pb defaults to our own, but can be a copy about to
        # be written out, so the live options are left alone
        if pb is None:
            pb = self._pb
        for i, name in enumerate(pb.names):
            option = self._options.get(name, None)
            if option is not None and option.type == 'File':
                OptionFile.keep_ids(pb.options[i], ids)

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
