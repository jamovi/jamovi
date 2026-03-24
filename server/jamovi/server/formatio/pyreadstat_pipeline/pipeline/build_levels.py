import polars as pl
from server.jamovi.server.formatio.pyreadstat_pipeline.data_types.data_types import ImportColumn

def extract_chunk_levels(name: str, df_chunk: pl.DataFrame):
    return df_chunk.select(
        pl.col(name)
            .drop_nulls()
            .unique()
            .alias('levels'))

def append_column_levels(column: ImportColumn, df_chunk: pl.DataFrame):
    chunk_levels = extract_chunk_levels(column.name, df_chunk)

    column.seen_levels = (
        pl.concat([column.seen_levels, chunk_levels])
            .unique(subset=[column.name])
            .sort(column.name)
    )

# def update_column_levels(column: Column, chunk_df: pl.DataFrame) -> Column: 
#     col_chunk = chunk_df[column.name]

#     for value in col_chunk:
#         if value is str:
#             column.value_levels[value] = value
#         else:
#             column.value_levels[value] = 1  
#     return column

#level_labels



        #              elif var_type is int or var_type is float:
        #     if var_meas is Measure.NOMINAL or var_meas is Measure.ORDINAL or level_labels:

        #             elif var_type is float:
        #                 new_labels = OrderedDict()
        #                 for value in level_labels:
        #                     label = level_labels[value]
        #                     new_labels[int(value)] = label
        #                 level_labels = new_labels
    
