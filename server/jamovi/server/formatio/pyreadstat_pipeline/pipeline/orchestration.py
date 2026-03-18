from numbers import Number

from server.formatio.pyreadstat_pipeline.data_types.data_types import *
from jamovi.server.instancemodel import InstanceModel

from .build_column_ingest_plan import build_column_ingest_plan
from .build_source_column_info import build_source_column_info
from .normalize_source_dataframe import normalize_source_dataframe
from .apply_jamovi_column_plan import apply_jamovi_column_plan
from .infer_source_meaning import infer_semantic_column_kind
from .update_model_values import write_chunk_values
from .profiling import profile_sav_columns
from .build_jamovi_column_plan import build_jamovi_column_plan

from .file_io import get_chunk_generator, read_sav_chunks, read_sav_metadata

import polars as pl

def orchestrate_meta_pipeline(
        model: InstanceModel,
        initial_df: pl.DataFrame,
        meta: PyreadstatMeta,
        chunk_size: int):
    
    assert isinstance(model, InstanceModel)
    assert isinstance(initial_df, pl.DataFrame)
    #assert isinstance(meta, PyreadstatMeta)

    source_info = build_source_column_info(initial_df, meta)
    #print('one', source_info)
    ingest_plans:  dict[str, ColumnIngestPlan] = {}
    for key, val in source_info.items():
        plan = build_column_ingest_plan(val)
        ingest_plans[key] = plan

    #df = normalize_source_dataframe(initial_df, ingest_plans)
    
    #source_infos, profile_states = profile_sav_columns(source_info, chunk_size)
    #print('two', source_info)
    for key, info in source_info.items():
        #print(key, info)
        kind = infer_semantic_column_kind(info)
        jamovi_plan = build_jamovi_column_plan(info, kind)
        
        model = apply_jamovi_column_plan(model, key, jamovi_plan)
    
    print(ingest_plans)
    
    return ingest_plans, model
    

def orchestrate_high_level(path: str,
        model: InstanceModel,
        chunk_size: int):
    initial_df, meta = read_sav_metadata(path, chunk_size)

    model.set_row_count(meta.number_rows)

    ingest_plans, model = orchestrate_meta_pipeline(model, initial_df, meta, chunk_size)

    gen = get_chunk_generator(path, chunk_size)

    offset = 0
    for chunk_df, _ in gen:
        normalized_chunk = normalize_source_dataframe(chunk_df, ingest_plans)
        print(offset)
        if offset > meta.number_rows:
            return
        write_chunk_values(model, normalized_chunk, offset)
        offset += chunk_size


def import_sav_to_jamovi_in_chunks(
    path: str,
    model: InstanceModel,
    chunk_size: int
) -> None:
    orchestrate_high_level(path, model, chunk_size)
     
     
    
