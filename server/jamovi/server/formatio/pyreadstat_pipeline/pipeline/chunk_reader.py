from pyreadstat import pyreadstat
from collections.abc import Iterator
import polars as pl

from jamovi.server.formatio.pyreadstat_pipeline.data_types.types import PyreadstatMeta

def get_chunk_generator(path: str, chunk_size: int) -> Iterator[tuple[pl.DataFrame, PyreadstatMeta]]:
    """Yield Polars dataframe chunks and metadata from a SAV file."""
    return pyreadstat.read_file_in_chunks(
        pyreadstat.read_sav,
        path,
        chunksize=chunk_size,
        offset = 0,
        output_format="polars",
        user_missing=True,
    )

