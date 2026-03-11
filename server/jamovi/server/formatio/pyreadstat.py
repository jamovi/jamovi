
from collections import OrderedDict
import math
from numbers import Number
import typing
import polars as pl

from pyreadstat import pyreadstat

from jamovi.server.instancemodel import InstanceModel
from jamovi.server.dataset import ColumnType
from jamovi.server.dataset import DataType
from jamovi.server.dataset import MeasureType

from rich import inspect
from rich import inspect
from rich.console import Console

# Create a console with a fixed width (e.g., 80 characters)
custom_console = Console(width=500)


# jamovi core uses 32 bit integers in the c implementation
# leaving that as is, could swap to longs in future
JAMOVI_MAX_BITS = 32

def read(model: InstanceModel, path: str, prog_cb: typing.Callable[[float], None], *, format: str, **kwargs) -> None:

    chunk_size = 100
    offset = 0

    _, meta = pyreadstat.read_sav(
        path,
        user_missing=True,
        metadataonly=True,
        output_format="polars",  # crashes for me :/
    )

    setup_meta(model, meta)
    
    chunks = []
    while True:
        df, _ = pyreadstat.read_sav(
            path,
            row_offset=offset,
            row_limit=chunk_size,
            user_missing=True,
            output_format="polars",  # crashes for me :/
        )

        if df.shape[0] == 0:
            break

        chunks.append(read_chunk(model, df, meta, offset))

        # if df.shape[0] < chunk_size:
        #     break

        offset += chunk_size

    #set values for our instance module
    column_names = [x.name for x in model._columns]

    # vertical_relaxed resolves correct data types
    # vertical relaxed is slower when there's mixed data types
    all_data = pl.concat(chunks, how="vertical_relaxed")

    columns = []
    for col in all_data.iter_columns():
        columns.append(col)
    
    model.set_values(column_names, 0, columns)

    #inspect(all_data, console=custom_console)

    #model.set_values(column_names, 0, all_data)
    


def get_missing_ranges(meta, column_name, data_type):
    range_list = meta.missing_ranges.get(column_name, None)

    if range_list is None:
        return []
    # missing_ranges = {
    #     'int_col': [
    #             {'lo': -99.0, 'hi': -99.0},
    #             {'lo': -100.0, 'hi': -100.0},
    #             {'lo': -101.0, 'hi': -101.0}
    #         ],
    #     'int_col_2': [{'lo': -inf, 'hi': -99.0}]
    # }
    missings = []
    for lo, hi in range_list:
        if isinstance(lo, str):
            lo = "'{}'".format(lo)
        if isinstance(hi, str):
            hi = "'{}'".format(hi)

        if lo is None and hi is None:
            pass
        elif lo == hi:
            missings.append('== {}'.format(lo))
        elif isinstance(lo, Number):  # if it's a range
            # ranges are weird, and we don't understand why people would
            # want to use them. we also don't support them, so this is us
            # trying to figure out what is intended by the ranges
            if data_type == DataType.INTEGER:
                hi = int(hi) if math.isfinite(hi) else +2147483647
                lo = int(lo) if math.isfinite(lo) else -2147483647
                n_levels = abs(hi - lo)
                if n_levels > 12:
                    # then only treat the value closer to zero as relevant
                    if abs(hi) < abs(lo):
                        missings.append('<= {}'.format(hi))
                    else:
                        missings.append('>= {}'.format(lo))
                else:
                    # if the no. levels is low, then make lots of equals
                    for i in range(lo, hi + 1):
                        missings.append('== {}'.format(i))
            else:
                # treat the value closer to zero as relevant
                if abs(hi) < abs(lo):
                    missings.append('<= {}'.format(hi))
                else:
                    missings.append('>= {}'.format(lo))
        else:
            # shouldn't get here
            missings.append('== {}'.format(lo))
            missings.append('== {}'.format(hi))

    return missings



def append_labels_to_column(column, column_labels, is_float: bool = False):
    if is_float:
        new_labels = OrderedDict() # not sure why ordering is only floats?
        for value in column_labels:
            label = column_labels[value]
            new_labels[int(value)] = label
        column_labels = new_labels

    level_i = 0
    for value in column_labels:
        curr_label = column_labels[value]
        # choosing to str() the values, strings should be preserved
        column.append_level(level_i, curr_label, str(value), pinned=True)
        level_i += 1 

def is_any_label_bits_too_wide(level_labels):
    if level_labels is not None:
        for value in level_labels:
            if isinstance(value, Number) and int(value).bit_length() > JAMOVI_MAX_BITS:
                return True

def get_level_labels(meta, column_name: str):
    return meta.variable_value_labels.get(column_name, None) 

def get_measure_type(meta, column_name: str, variable_type: str, has_labels: bool):
    #treat strings as nominal
    continuous_type = MeasureType.NOMINAL if variable_type == 'string' else MeasureType.CONTINUOUS
    
    # if scale w/ levels, treat it as ordinal
    # https://github.com/jamovi/jamovi/issues/487
    derived_scale_type = MeasureType.ORDINAL if has_labels else continuous_type

    #treat dates as integers
    derived_ordinal_type = MeasureType.INTEGER if variable_type == 'date' else MeasureType.ORDINAL

    string_to_variable_measures = {
           'scale': derived_scale_type,
           'ordinal': derived_ordinal_type,
           'nominal': MeasureType.NOMINAL
    }

    column_measure = meta.variable_measure[column_name]
    measure_type = string_to_variable_measures.get(column_measure, MeasureType.NOMINAL)
    
    
    return measure_type


def get_data_type(meta, column_name: str):
        string_to_data_type = {
            'string': DataType.TEXT,
            'date': DataType.INTEGER,
            'double': DataType.DECIMAL,
            'int': DataType.INTEGER,
            'float': DataType.DECIMAL
        }

        var_type = meta.readstat_variable_types[column_name]
        data_type = string_to_data_type.get(var_type)

        inspect(data_type)
        return data_type, var_type

def get_column_width(meta, column_name: str):
        display_width = meta.variable_display_width[column_name]
        # this should be multiplied by 8, but we use larger fonts,
        # so i'm opting for 12
        width = display_width * 12

        if width == 0:
            width = 100 # 100?
        elif width < 32: # 32?
            width = 32

        return width

def setup_meta(model: InstanceModel, meta) -> None:

    model.set_row_count(meta.number_rows)
    # number_rows can't be relied upon
    # with some files, it comes through as zero

    inspect(meta)

    # parrallel for each??
    for column_name in meta.column_names:
        column = model.append_column(column_name)

        label = meta.column_names_to_labels[column_name]

        if label is not None:
            column.description = label
        
        #should always be data
        column.column_type = ColumnType.DATA
        
        data_type, var_type = get_data_type(meta, column_name)
        column.set_data_type(data_type)
        
        column.width = get_column_width(meta, column_name)

        # extract the labels early to help choose measure type
        column_labels = get_level_labels(meta, column_name)

        column_has_labels = column_labels is not None

        column.set_measure_type(get_measure_type(meta, column_name, var_type, column_has_labels))

        #add each of the columns levels if string
        if column_has_labels:
            append_labels_to_column(column, column_labels, var_type == 'float')
            if is_any_label_bits_too_wide(column_labels):
                # if any of the label values are greater than MAX,
                # then treat column as text
                column.set_data_type(DataType.TEXT)

        missings = get_missing_ranges(meta, column, column.data_type)
        if missings:
            column.set_missing_values(missings)

def read_chunk(model: InstanceModel, df, meta, offset):
    column_names = [x.name for x in model._columns]
    data_types  = [x.data_type for x in model._columns]

    #map columns to the correct datatype
    map_to_polars = {
        DataType.TEXT: pl.String,
        DataType.INTEGER: pl.Int32, # columns not picked up as int, is this a bug in pyreadstat?
        DataType.DECIMAL: pl.Float32
    }

    column_with_polars_data_type = [(col, map_to_polars.get(dt, pl.String)) for col, dt in zip(column_names, data_types)]

    #perform operations on values data frame

    #inspect(column_with_polars_data_type)

    # Use a list comprehension to apply cast to all desired columns
    df = df.with_columns([
        pl.col(name).cast(dt) for name, dt in column_with_polars_data_type
    ])

    #inspect(df)

    return df


