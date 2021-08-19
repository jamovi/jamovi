
from .jamovi_pb2 import AnalysisOption
from .jamovi_pb2 import AnalysisOptions


NONE = AnalysisOption.Other.Value('NONE')
TRUE = AnalysisOption.Other.Value('TRUE')
FALSE = AnalysisOption.Other.Value('FALSE')


class Option:
    def __init__(self):
        self.name = None
        self.type = None
        self.passive = False
        self.default = None


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

            option = Option()
            option.name = name
            option.type = typ
            option.passive = 'passive' in opt_defn and opt_defn['passive']
            options._options[name] = option

            options._pb.names.append(name)
            opt_pb = options._pb.options.add()

            if 'default' in opt_defn:
                default = opt_defn['default']
            elif typ == 'Bool':
                default = False
            elif typ == 'Variables':
                default = [ ]
            elif typ == 'Integer':
                default = 0
            elif typ == 'Number':
                default = 0.0
            elif typ == 'List':
                first_option = opt_defn['options'][0]
                if isinstance(first_option, dict):
                    default = first_option['name']
                else:
                    default = first_option
            elif typ == 'NMXList':
                default = [ ]
            elif typ == 'Output':
                default = { 'value': False, 'vars': [ ], 'synced': [ ] }
            else:
                default = None

            option.default = default

            Options._populate_pb(opt_pb, default)

        return options

    @staticmethod
    def _populate_pb(dest_pb, value):
        if value is True:
            dest_pb.o = TRUE
        elif value is False:
            dest_pb.o = FALSE
        elif type(value) == str:
            dest_pb.s = value
        elif type(value) == int:
            dest_pb.i = value
        elif type(value) == float:
            dest_pb.d = value
        elif type(value) == list:
            dest_pb.ClearField('c')
            dest_pb.c.hasNames = False
            for v in value:
                child_pb = dest_pb.c.options.add()
                Options._populate_pb(child_pb, v)
        elif type(value) == dict:
            dest_pb.ClearField('c')
            dest_pb.c.hasNames = True
            for k, v in value.items():
                dest_pb.c.names.append(k)
                child_pb = dest_pb.c.options.add()
                Options._populate_pb(child_pb, v)
        else:
            dest_pb.o = NONE

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

            self._populate_pb(opt_pb, default)

    def get(self, name):
        return self.get_value(name)

    def get_value(self, name, otherwise=None):
        for i, opt_name in enumerate(self._pb.names):
            if opt_name == name:
                pb = self._pb.options[i]
                break
        else:
            return otherwise

        return self._read_value(pb)

    def _read_value(self, pb):
        if pb.HasField('s'):
            return pb.s
        elif pb.HasField('c'):
            values = map(self._read_value, pb.c.options)
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

    def set_value(self, name, value):

        for i, opt_name in enumerate(self._pb.names):
            if opt_name == name:
                option_pb = self._pb.options[i]
                break
        else:
            option_pb = self._pb.options.add()
            self._pb.names.append(name)

        Options._populate_pb(option_pb, value)

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
                    pass
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

    @staticmethod
    def _get_option_pb(pb, name):
        for i in range(len(pb.names)):
            if pb.names[i] == name:
                return pb.options[i]
        return None
