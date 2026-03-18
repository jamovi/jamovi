from typing import Any, Iterable, Tuple
import polars as pl
from pyreadstat import pyreadstat


def read_sav_metadata(path: str, chunk_size: int) -> Any:
    df, meta = pyreadstat.read_sav(
        path, 
        user_missing=True,
        output_format="polars"
        )
    return df, meta

def get_chunk_generator(path: str, chunk_size: int):
    return pyreadstat.read_file_in_chunks(
        pyreadstat.read_sav,
        path,
        chunksize=chunk_size,
        offset = 0,
        output_format="polars"
    )

def read_sav_chunks(generator) -> Iterable[pl.DataFrame]:
    # Remove output_format="polars" here to use the more stable pandas default

    for df, _ in generator:
        # Convert to Polars manually inside the loop
        yield df

