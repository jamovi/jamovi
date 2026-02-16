
import typing

from pyreadstat import pyreadstat

from jamovi.server.instancemodel import InstanceModel
from jamovi.server.dataset import ColumnType
from jamovi.server.dataset import DataType
from jamovi.server.dataset import MeasureType


def read(model: InstanceModel, path: str, prog_cb: typing.Callable[[float], None], *, format: str, **kwargs) -> None:

    chunk_size = 100
    offset = 0

    _, meta = pyreadstat.read_sav(
        path,
        user_missing=True,
        metadataonly=True,
        # output_format="polars",  # crashes for me :/
    )

    setup(model, meta)

    while True:
        df, _ = pyreadstat.read_sav(
            path,
            row_offset=offset,
            row_limit=chunk_size,
            user_missing=True,
            # output_format="polars",  # crashes for me :/
        )

        if df.shape[0] == 0:
            break

        read_chunk(model, df, meta)

        if df.shape[0] < chunk_size:
            break

        offset += chunk_size


def setup(model: InstanceModel, meta) -> None:

    model.set_row_count(meta.number_rows)
    # number_rows can't be relied upon
    # with some files, it comes through as zero

    for name in meta.column_names:
        column = model.append_column(name)
        column.column_type = ColumnType.DATA
        column.set_data_type(DataType.DECIMAL)
        column.set_measure_type(MeasureType.CONTINUOUS)


def read_chunk(model: InstanceModel, df, meta):
    pass
