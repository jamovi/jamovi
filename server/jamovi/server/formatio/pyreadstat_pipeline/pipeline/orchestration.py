from server.formatio.pyreadstat_pipeline.data_types.data_types import *
from jamovi.server.instancemodel import InstanceModel

from .initialize_columns import initialize_columns
from .normalize_source_dataframe import normalize_source_dataframe
from .update_model_values import write_chunk_values
from .update_chunk_levels import update_chunk_levels
from .profiling import profile_sav_column

from .finalize_column_plan import finalize_column_plan
from .infer_source_meaning import infer_semantic_column_kind
from .file_io import *

import polars as pl


def first_pass(path: str,
        model: InstanceModel,
        chunk_size: int) -> list[ImportColumn]:
    
    gen = get_chunk_generator(path, chunk_size)

    columns = []
    offset = 0
    first_chunk = True
    for chunk_df, meta in gen:
        if first_chunk:
            columns = initialize_columns(chunk_df, meta, model)
            first_chunk = False
        
        for column in columns:
            column = infer_semantic_column_kind(column)
            column = profile_sav_column(column, chunk_df)
            column = finalize_column_plan(column)

        offset += chunk_df.height
    
    #finalize row count
    model.set_row_count(offset)

    return columns

def second_pass(
        path: str,
        model: InstanceModel,
        chunk_size: int,
        columns: list[ImportColumn]):
    
    gen = get_chunk_generator(path, chunk_size)

    offset = 0
    for chunk_df, _ in gen:
        normalized_chunk = normalize_source_dataframe(chunk_df, columns)
        update_chunk_levels(model, normalized_chunk)
        write_chunk_values(model, normalized_chunk, offset)
        offset += chunk_df.height
    


def import_sav_to_jamovi_in_chunks(
    path: str,
    model: InstanceModel,
    chunk_size: int
) -> None:
    columns = first_pass(path, model, chunk_size)
    second_pass(path, model, chunk_size, columns)
     
     
    
