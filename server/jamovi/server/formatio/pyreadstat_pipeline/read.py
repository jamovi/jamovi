
import typing
from jamovi.server.instancemodel import InstanceModel
from .pipeline.orchestration import import_sav_to_jamovi_in_chunks

CHUNK_SIZE = 10000

def read(model: InstanceModel, path: str, prog_cb: typing.Callable[[float], None], *, format: str, **kwargs) -> None:
    """Validate format and execute the SAV import pipeline with progress updates."""
    normalized_format = format.lower()
    if normalized_format != "sav":
        raise ValueError(f"Unsupported format for pyreadstat pipeline: {format}")

    prog_cb(0.0)
    import_sav_to_jamovi_in_chunks(path, model, CHUNK_SIZE, progress_callback=prog_cb)
    prog_cb(1.0)
