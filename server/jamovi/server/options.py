
from .jamovi_pb2 import AnalysisOption
from .jamovi_pb2 import AnalysisOptions


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

            options._pb.names.append(name)
            opt_pb = options._pb.options.add()

            if 'default' in opt_defn:
                default = opt_defn['default']
            elif typ == 'Bool':
                default = False
            elif typ == 'Variables':
                default = []
            elif typ == 'Integer':
                default = 0
            elif typ == 'Number':
                default = 0.0
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
        self._pb = AnalysisOptions()

    def set(self, pb):
        self._pb.CopyFrom(pb)

    def read(self, bin):
        self._pb.ParseFromString(bin)

    def as_pb(self):
        return self._pb

    def as_bytes(self):
        return self._pb.SerializeToString()
