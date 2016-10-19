
import os.path
import yaml

from .options import Options
from . import jamovi_pb2 as jcoms


class Analysis:
    def __init__(self, id, name, ns, options, parent):
        self.id = id
        self.name = name
        self.ns = ns
        self.options = options
        self.parent = parent
        self.results = None

    @property
    def has_results(self):
        return self.results is not None

    def set_options(self, options):
        for name, option in options:
            self.options[name] = option

    def serialize(self):
        return self.results.SerializeToString()

    @property
    def resources(self):
        return Analysis._get_resources(self.results.results)

    @staticmethod
    def _get_resources(results_pb):
        if results_pb.HasField('image'):
            return [ results_pb.image.path ]
        elif results_pb.HasField('group'):
            resources = [ ]
            for element_pb in results_pb.group.elements:
                resources += Analysis._get_resources(element_pb)
            return resources
        elif results_pb.HasField('array'):
            resources = [ ]
            for element_pb in results_pb.array.elements:
                resources += Analysis._get_resources(element_pb)
            return resources
        return [ ]


class Analyses:
    def __init__(self):
        self._analyses = []

    def create_from_serial(self, serial):
        analysis_pb = jcoms.AnalysisResponse()
        analysis_pb.ParseFromString(serial)

        options = Options()
        options.read(analysis_pb.options.SerializeToString())

        analysis = Analysis(analysis_pb.analysisId, analysis_pb.name, analysis_pb.ns, options, self)
        analysis.results = analysis_pb
        self._analyses.append(analysis)

        return analysis

    def create(self, id, name, ns):

        here = os.path.realpath(os.path.dirname(__file__))
        root = os.path.realpath(os.path.join(here, '..'))
        analysis_root = os.path.join(root, 'analyses', ns, 'jamovi', name.lower())

        with open(analysis_root + '.a.yaml', 'r', encoding='utf-8') as stream:
            defn = yaml.load(stream)
            analysisName = defn['name']
            optionDefs = defn['options']

            options = Options.create(optionDefs)

            analysis = Analysis(id, analysisName, ns, options, self)
            self._analyses.append(analysis)

            return analysis

    def __getitem__(self, id):
        for analysis in self._analyses:
            if analysis.id == id:
                return analysis
        raise KeyError(id)

    def __iter__(self):
        return self._analyses.__iter__()
