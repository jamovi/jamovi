
from .analysis import Analysis
from jamovi.server.jamovi_pb2 import AnalysisResponse
from jamovi.server.jamovi_pb2 import AnalysisStatus
from jamovi.server.jamovi_pb2 import ResultsGroup

from jamovi.server.i18n import _
from jamovi.server.utils.event import Event

import html


ANALYSIS_COMPLETE = AnalysisStatus.Value('ANALYSIS_COMPLETE')


class Weights(Analysis):

    _results: AnalysisResponse

    def __init__(self, dataset, id, name, ns, options, parent, enabled, **kwargs):
        super().__init__(dataset, id, name, ns, options, parent, enabled, **kwargs)
        self._status = Analysis.Status.COMPLETE

        self.results = AnalysisResponse()
        self.results.name = name
        self.results.ns = ns
        self.results.analysisId = id
        self.results.status = ANALYSIS_COMPLETE
        self.results.title = ''
        self.results.hasTitle = True
        self.results.results.title = _('Weights')
        self.results.results.group.CopyFrom(ResultsGroup())
        self.results.results.status = ANALYSIS_COMPLETE

        self.results.options.CopyFrom(self.options.as_pb())

        self._html_pb = self.results.results.group.elements.add().html
        self._removed = False
        self._update(just_created=True)

    def set_weights(self, weights_name: str, *, silent=False):
        self.options.set_value('weights', weights_name)
        if not silent:
            self._update()

    def set_status(self, status):
        # do nothing, always 'COMPLETE'
        pass

    def run(self):
        # do nothing
        pass

    def set_options(self, options, changes, revision, enabled=None):
        self.options.set(options)
        self.revision = revision
        self.results.options.CopyFrom(self.options.as_pb())
        self.results.revision = revision
        self._update()

    def notify_removing(self):
        self._removed = True
        self._update()

    def _update(self, *, just_created=False):
        if self._removed:
            weights = None
        else:
            weights = self.options.get_value('weights')
            if weights:
                bolded = f'<strong>{ html.escape(weights) }</strong>'
                content = _('Data is weighted by the variable {}').format(bolded)
            else:
                content = _('Data is unweighted')
            self._html_pb.content = content
            self.parent._notify_results_changed(self)

        if just_created:
            pass
        else:
            weights_changed_event = Event(self, 'weights_changed', { 'weights': weights })
            self.parent.weights_changed(weights_changed_event)
