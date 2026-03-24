import polars as pl
from server.instancemodel import InstanceModel

def write_chunk_values(model: InstanceModel, chunk_df: pl.DataFrame, row_offset: int) -> None: 
    assert isinstance(chunk_df, pl.DataFrame)
    print(chunk_df)
    chunks_list = [chunk_df[c.name].to_list() for c in model._columns]
    model.set_values([c.name for c in model._columns], row_offset, chunks_list)

    # for col in model._columns:
    #     row_off = row_offset
    #     for val in chunk_df[col.name]:
    #         #print('WRITE COL', col.name, row_off, val, col.measure_type, col.column_type, col.data_type)
    #         model.set_values([col.name], row_off, [[val]])
    #         row_off += 1

        
        