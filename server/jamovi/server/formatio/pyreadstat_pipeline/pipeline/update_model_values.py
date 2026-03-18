import polars as pl
from server.instancemodel import InstanceModel


def write_chunk_values(model: InstanceModel, chunk_df: pl.DataFrame, row_offset: int) -> None: 
    # model.set_values(
    #     [col.name for col in model._columns],
    #     row_offset,
    #     chunk_df
    #     )
    #for col in model._columns:
        # print(col, row_offset, chunk_df.get_column(col.name))
    #print(model._columns, row_offset, chunk_df)
    assert isinstance(chunk_df, pl.DataFrame)
    for col in model._columns:
        model.set_values([col.name], row_offset, [chunk_df[col.name]])
        # try:
            
        # except:
        #     print("BROKEN COL?", col.name)
        #     assert False

        
    
        #model.set_values(col.name, row_offset, chunk_df.get_column(col.name))