from typing import Protocol
from typing import Callable
from typing import Tuple
from typing import Iterable
from typing import TypeAlias

from jamovi.server.instancemodel import InstanceModel


ProgressCallback: TypeAlias = Callable[[float], None]


class ReadFunction(Protocol):
    def __call__(
        self, data: InstanceModel, path: str, prog_cb: ProgressCallback, **kwargs
    ) -> None:
        raise NotImplementedError


class WriteFunction(Protocol):
    def __call__(
        self, data: InstanceModel, path: str, prog_cb: ProgressCallback, **kwargs
    ) -> None:
        raise NotImplementedError


Reader: TypeAlias = Tuple[str, ReadFunction]
Writer: TypeAlias = Tuple[str, WriteFunction]


class GetReadersFunction(Protocol):
    def __call__(self) -> Iterable[Tuple[str, ReadFunction]]:
        raise NotImplementedError
