from uuid import uuid4
import os

import pytest
from asyncio import sleep
import pytest_asyncio

from jamovi.server.pool import Pool
from jamovi.server.utils import ProgressStream
from jamovi.server.jamovi_pb2 import AnalysisRequest
from jamovi.server.jamovi_pb2 import AnalysisResponse

from jamovi.server.dataset import DataType
from jamovi.server.dataset import MeasureType

from .conftest import Session

from loguru import logger


PERFORM_INIT = AnalysisRequest.Perform.Value("INIT")
PERFORM_RUN = AnalysisRequest.Perform.Value("RUN")


@pytest.mark.asyncio
@pytest.mark.timeout(20)
async def test_analysis(session: Session):
    request = AnalysisRequest()
    request.sessionId = session.session_id
    request.instanceId = session.instance_id
    request.analysisId = 1
    request.ns = "jmv"
    request.name = "anova"
    request.perform = PERFORM_INIT

    request.options.hasNames = True
    request.options.names[:] = ("dep", "factors")

    values_pb = request.options.options

    dep_pb = values_pb.add()
    dep_pb.s = "len"

    factors_pb = values_pb.add()
    factor1_pb = factors_pb.c.options.add()
    factor1_pb.s = "supp"
    factor2_pb = factors_pb.c.options.add()
    factor2_pb.s = "dose"

    dataset = session.dataset
    try:
        dataset.attach()

        l3n = dataset.append_column("len")
        l3n.set_data_type(DataType.DECIMAL)
        l3n.measure_type = MeasureType.CONTINUOUS

        supp = dataset.append_column("supp")
        supp.set_data_type(DataType.TEXT)
        supp.measure_type = MeasureType.NOMINAL
        supp.append_level(0, "OJ", "OJ", False)
        supp.append_level(1, "VC", "VC", False)

        dose = dataset.append_column("dose")
        dose.set_data_type(DataType.INTEGER)
        dose.measure_type = MeasureType.ORDINAL
        dose.append_level(500, "500", "500")
        dose.append_level(1000, "1000", "1000")
        dose.append_level(2000, "2000", "2000")

        dataset.set_row_count(60)

        values = (
            (4.2, "VC", 500),
            (11.5, "VC", 500),
            (7.3, "VC", 500),
            (5.8, "VC", 500),
            (6.4, "VC", 500),
            (10, "VC", 500),
            (11.2, "VC", 500),
            (11.2, "VC", 500),
            (5.2, "VC", 500),
            (7, "VC", 500),
            (16.5, "VC", 1000),
            (16.5, "VC", 1000),
            (15.2, "VC", 1000),
            (17.3, "VC", 1000),
            (22.5, "VC", 1000),
            (17.3, "VC", 1000),
            (13.6, "VC", 1000),
            (14.5, "VC", 1000),
            (18.8, "VC", 1000),
            (15.5, "VC", 1000),
            (23.6, "VC", 2000),
            (18.5, "VC", 2000),
            (33.9, "VC", 2000),
            (25.5, "VC", 2000),
            (26.4, "VC", 2000),
            (32.5, "VC", 2000),
            (26.7, "VC", 2000),
            (21.5, "VC", 2000),
            (23.3, "VC", 2000),
            (29.5, "VC", 2000),
            (15.2, "OJ", 500),
            (21.5, "OJ", 500),
            (17.6, "OJ", 500),
            (9.7, "OJ", 500),
            (14.5, "OJ", 500),
            (10, "OJ", 500),
            (8.2, "OJ", 500),
            (9.4, "OJ", 500),
            (16.5, "OJ", 500),
            (9.7, "OJ", 500),
            (19.7, "OJ", 1000),
            (23.3, "OJ", 1000),
            (23.6, "OJ", 1000),
            (26.4, "OJ", 1000),
            (20, "OJ", 1000),
            (25.2, "OJ", 1000),
            (25.8, "OJ", 1000),
            (21.2, "OJ", 1000),
            (14.5, "OJ", 1000),
            (27.3, "OJ", 1000),
            (25.5, "OJ", 2000),
            (26.4, "OJ", 2000),
            (22.4, "OJ", 2000),
            (24.5, "OJ", 2000),
            (24.8, "OJ", 2000),
            (30.9, "OJ", 2000),
            (26.4, "OJ", 2000),
            (27.3, "OJ", 2000),
            (29.4, "OJ", 2000),
            (23, "OJ", 2000),
        )

        for row_no, row_data in enumerate(values):
            for col_no, value in enumerate(row_data):
                dataset.set_value(row_no, col_no, value)
    finally:
        dataset.detach()

    stream: ProgressStream = session.pool.add(request)
    results: AnalysisResponse = await stream

    assert results.instanceId == request.instanceId
    assert results.analysisId == request.analysisId
