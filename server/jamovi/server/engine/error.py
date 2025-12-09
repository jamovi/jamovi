from jamovi.server.jamovi_pb2 import AnalysisRequest
from jamovi.server.jamovi_pb2 import AnalysisResponse
from jamovi.server.jamovi_pb2 import AnalysisStatus


ANALYSIS_ERROR = AnalysisStatus.Value("ANALYSIS_ERROR")


def create_error_results(request: AnalysisRequest, message: str):
    """create error results"""
    results = AnalysisResponse()
    results.instanceId = request.instanceId
    results.analysisId = request.analysisId
    results.name = request.name
    results.ns = request.ns
    results.options.CopyFrom(request.options)
    results.status = ANALYSIS_ERROR
    results.revision = request.revision
    results.version = 0

    results.results.name = request.name
    results.results.title = request.name
    results.results.status = ANALYSIS_ERROR
    results.results.error.message = message

    item = results.results.group.elements.add()
    item.preformatted = ""

    return results
