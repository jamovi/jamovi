
from .jamovi_pb2 import AnalysisOption
from .jamovi_pb2 import AnalysisOptions


class Option:
    def __init__(self):
        self.name = None
        self.type = None
        self.passive = False


class Options:

    @staticmethod
    def create(defn):

        options = Options()
        options._pb.hasNames = True

        for opt_defn in defn:

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
                    default = first_option['value']
                else:
                    default = first_option
            elif typ == 'NMXList':
                default = [ ]
            else:
                default = None

            Options._populate_pb(opt_pb, default)

        return options

    @staticmethod
    def _populate_pb(dest_pb, value):
        if value is True:
            dest_pb.o = AnalysisOption.Other.Value('TRUE')
        elif value is False:
            dest_pb.o = AnalysisOption.Other.Value('FALSE')
        elif type(value) == str:
            dest_pb.s = value
        elif type(value) == int:
            dest_pb.i = value
        elif type(value) == float:
            dest_pb.d = value
        elif type(value) == list:
            dest_pb.c.hasNames = False
            for v in value:
                child_pb = dest_pb.c.options.add()
                Options._populate_pb(child_pb, v)
        elif type(value) == dict:
            dest_pb.c.hasNames = True
            for k, v in value.items():
                dest_pb.c.names.append(k)
                child_pb = dest_pb.c.options.add()
                Options._populate_pb(child_pb, v)
        else:
            dest_pb.o = AnalysisOption.Other.Value('NULL')

    def __init__(self):
        self._options = { }
        self._pb = AnalysisOptions()

    def set(self, pb):
        changes = False
        old_names = list(self._pb.names)
        new_names = list(pb.names)

        for i in range(len(new_names)):
            name = new_names[i]
            new_pb = pb.options[i]
            if name in old_names:
                old_index = old_names.index(name)
                old_pb = self._pb.options[old_index]
                if old_pb != new_pb:
                    old_pb.CopyFrom(new_pb)
                    if name not in self._options or not self._options[name].passive:
                        changes = True
            else:
                self._pb.names.append(name)
                option_pb = self._pb.options.add()
                option_pb.CopyFrom(new_pb)
                if name not in self._options or not self._options[name].passive:
                    changes = True

        return changes

    def read(self, bin):
        self._pb.ParseFromString(bin)

    def as_pb(self):
        return self._pb

    def as_bytes(self):
        return self._pb.SerializeToString()

    @staticmethod
    def _get_option_pb(pb, name):
        for i in range(len(pb.names)):
            if pb.names[i] == name:
                return pb.options[i]
        return None
