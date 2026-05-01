from typing import Any

from jamovi.server.formatio.pyreadstat_pipeline.data_types.types import PyreadstatMeta, SourceFormatType

#KEEP  


def format_type(meta: PyreadstatMeta, column_name: str) -> SourceFormatType:
    """
    Infer a simplified format family from SPSS original format codes.

    Goal:
    - Collapse many SPSS format strings into a small semantic family.

    Example:
        DATETIME20 -> DATETIME
        DATE11 -> DATE
        A20 -> STRING
        F8.2 -> NUMERIC
         FORMAT F8.0
        [test] | FORMAT F8.0
        [test] | FORMAT F8.2

    """
    fmt = getattr(meta, "original_variable_types", {}).get(column_name)
    
    #print('FORMAT', fmt)
    
    if not fmt:
        return SourceFormatType.UNKNOWN

    f = fmt.upper()
    
    if f.startswith("DATETIME") or f.startswith("YMDHMS"):
        return SourceFormatType.DATETIME

    if f.startswith(("DATE", "ADATE", "EDATE", "JDATE", "SDATE", "QYR", "YRMO", "MONTH", "WKDAY", "WKYR")):
        return SourceFormatType.DATE

    if f.startswith(("TIME", "DTIME")):
        return SourceFormatType.TIME

    if f.startswith("A"):
        return SourceFormatType.STRING

    if f.startswith(("DOLLAR", "CCA", "CCB", "CCC", "CCD", "CCE", "N", "PCT")):
        # You may want to refine this later.
        if f.startswith("PCT"):
                return SourceFormatType.PERCENT
        return SourceFormatType.CURRENCY

    if f.startswith(("E", "F", "COMMA", "DOT")):
        if f.endswith('.0'):
            return SourceFormatType.NUMERIC_INTEGER
        else:
            return SourceFormatType.NUMERIC_DECIMAL

    return SourceFormatType.NUMERIC_INTEGER