
import typing
from jamovi.server.instancemodel import InstanceModel


# from rich import inspect
# from rich.console import Console
from .pipeline.orchestration import import_sav_to_jamovi_in_chunks

# Create a console with a fixed width (e.g., 80 characters)
# custom_console = Console(width=500)


# jamovi core uses 32 bit integers in the c implementation
# leaving that as is, could swap to longs in future
JAMOVI_MAX_BITS = 32
CHUNK_SIZE = 10000

def read(model: InstanceModel, path: str, prog_cb: typing.Callable[[float], None], *, format: str, **kwargs) -> None:
    import_sav_to_jamovi_in_chunks(path, model, CHUNK_SIZE)
