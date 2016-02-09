
import os.path
import json

class Analyses:
    def __init__(self):
        self._analyses = [ ]
        
    def create(self, name, ns):
    
        here = os.path.realpath(os.path.dirname(__file__))
        root = os.path.realpath(os.path.join(here, '..'))
        analysis_root = os.path.join(root, 'analyses', ns, name)
        
        with open(analysis_root + '.json', 'r') as stream:
            defn = json.load(stream)
            print(defn)
        
    
        #self._analyses.append(...)
        