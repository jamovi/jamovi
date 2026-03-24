import polars as pl
from server.instancemodel import InstanceModel
from jamovi.server.dataset import DataType

def update_chunk_levels(model: InstanceModel, chunk_df: pl.DataFrame) -> None: 
    for column in model._columns:
        col_chunk = chunk_df[column.name]

        for n, value in enumerate(col_chunk):
            if column.value_levels is not None:
                label = column.value_levels[value] or ''
                if column.data_type == DataType.TEXT:
                    column.append_level(n, str(label), str(value), pinned=True)
                else:
                    column.append_level(value, label, str(value), pinned=False)
