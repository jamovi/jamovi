
import os.path
import yaml


class Analysis:
    def __init__(self, id, name, ns, options):
        self.id = id
        self.name = name
        self.ns = ns
        self.options = options


class Analyses:
    def __init__(self):
        self._nextId = 0
        self._analyses = []

    def create(self, name, ns):

        here = os.path.realpath(os.path.dirname(__file__))
        root = os.path.realpath(os.path.join(here, '..'))
        analysis_root = os.path.join(root, 'analyses', ns, 'silky', name)

        with open(analysis_root + '.say', 'r') as stream:
            defn = yaml.load(stream)
            optionDefs = defn['options']

            options = []

            for optionDef in optionDefs:
                if 'name' not in optionDef or 'type' not in optionDef:
                    continue

                o_name = optionDef['name']
                o_type = optionDef['type']

                if o_type == "Dataset":
                    continue

                if 'default' in optionDef:
                    o_default = optionDef['default']
                elif o_type == "Bool":
                    o_default = False
                elif o_type == "Variables":
                    o_default = []
                elif o_type == "Int":
                    o_default = 0
                else:
                    o_default = None

                options.append({ 'name': o_name, 'type': o_type, 'value': o_default })

            analysis = Analysis(self._nextId, name, ns, options)
            self._analyses.append(analysis)
            self._nextId += 1

            return analysis
