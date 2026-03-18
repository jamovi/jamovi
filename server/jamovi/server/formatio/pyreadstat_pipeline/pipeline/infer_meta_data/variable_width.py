from server.formatio.pyreadstat_pipeline.data_types.data_types import *

def variable_width(meta: PyreadstatMeta, column_name: str):
    display_width = meta.variable_display_width[column_name]
    # this should be multiplied by 8, but we use larger fonts,
    # so i'm opting for 12
    width = display_width * 12

    if width == 0:
        width = 100 # 100?
    elif width < 32: # 32?
        width = 32

    return width
