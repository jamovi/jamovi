from pyreadstat import pyreadstat

def get_chunk_generator(path: str, chunk_size: int):
    return pyreadstat.read_file_in_chunks(
        pyreadstat.read_sav,
        path,
        chunksize=chunk_size,
        offset = 0,
        output_format="polars"
    )

