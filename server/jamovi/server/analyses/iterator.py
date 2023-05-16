
from .analysis import Analysis


class AnalysisIterator:
    def __init__(self, parent, needs_init=False, needs_op=False):
        self._parent = parent
        self._needs_init = needs_init
        self._needs_op = needs_op
        self._iter = parent.__iter__()

    def __iter__(self):
        return self

    def __next__(self):
        if self._needs_op:
            while True:
                analysis = self._iter.__next__()
                if analysis.status is Analysis.Status.COMPLETE and analysis.needs_op:
                    return analysis
        else:
            while True:
                analysis = self._iter.__next__()
                if analysis.ns == 'jmv' and analysis.name == 'empty':
                    continue
                if analysis.status is Analysis.Status.NONE:
                    return analysis
                if not analysis.enabled:
                    continue
                if self._needs_init is False and analysis.status is Analysis.Status.INITED:
                    return analysis
