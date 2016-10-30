
from .jamovi_pb2 import AnalysisOption
from .jamovi_pb2 import AnalysisOptions


class Options:

    def create(defn):

        options = Options()
        options._pb.hasNames = True

        for opt_defn in defn:

            if 'name' not in opt_defn or 'type' not in opt_defn:
                continue

            o_name = opt_defn['name']
            o_type = opt_defn['type']

            if o_type == "Data":
                continue

            options._pb.names.append(o_name)
            opt_pb = options._pb.options.add()

            if 'default' in opt_defn:
                o_default = opt_defn['default']
            elif o_type == "Bool":
                o_default = False
            elif o_type == "Variables":
                o_default = []
            elif o_type == "Int":
                o_default = 0
            elif o_type == "Number":
                o_default = 0.0
            else:
                o_default = None

            if o_default is True:
                opt_pb.o = AnalysisOption.Other.Value('TRUE')
            elif o_default is False:
                opt_pb.o = AnalysisOption.Other.Value('FALSE')
            elif type(o_default) == str:
                opt_pb.s = o_default
            elif type(o_default) == int:
                opt_pb.i = o_default
            elif type(o_default) == float:
                opt_pb.d = o_default
            elif type(o_default) == list:
                opt_pb.c.hasNames = False
            else:
                opt_pb.o = AnalysisOption.Other.Value('NULL')

        return options

    def __init__(self):
        self._pb = AnalysisOptions()

    def set(self, pb):
        self._pb.CopyFrom(pb)

    @property
    def asPB(self):
        return self._pb

    @property
    def asBytes(self):
        return self._pb.SerializeToString()
