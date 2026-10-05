from __future__ import annotations

from typing import Any
from typing import Protocol
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from .datasetcontroller import DataSetController


class Change(Protocol):
    """One store's part of a history entry. undo() and redo() return
    whatever the store produces in response (e.g. a DataSetRR), so the
    caller can send it on"""

    async def undo(self) -> Any:
        ...

    async def redo(self) -> Any:
        ...


class DataSetChange:
    """A change to a data set. The data set's ModTracker holds the inverse
    operations; this just records that the change happened, and where it
    sits relative to changes to other stores. The ModTrackers stay in step
    with the History, because every change to a data set goes through
    it"""

    def __init__(self, controller: DataSetController):
        self._controller = controller

    async def undo(self):
        return await self._controller.undo()

    async def redo(self):
        return await self._controller.redo()


class History:
    """The undo/redo history of a project, across all its stores (data sets,
    and later analyses). An entry is a list of changes, possibly to
    several stores, which are undone (and redone) together"""

    MAX_LENGTH = 1000

    def __init__(self):
        self._entries: list[list[Change]] = [ ]
        self._position = 0  # the entries before here can be undone

    @property
    def can_undo(self) -> bool:
        return self._position > 0

    @property
    def can_redo(self) -> bool:
        return self._position < len(self._entries)

    @property
    def count(self) -> int:
        # the client expects ModTracker's numbering, which counts the
        # initial state as an entry
        return len(self._entries) + 1

    @property
    def position(self) -> int:
        return self._position

    def clear(self):
        self._entries = [ ]
        self._position = 0

    def add(self, *changes: Change):
        del self._entries[self._position:]
        self._entries.append(list(changes))
        if len(self._entries) > History.MAX_LENGTH:
            del self._entries[0]
        self._position = len(self._entries)

    async def undo(self) -> list[Any]:
        if not self.can_undo:
            return [ ]
        self._position -= 1
        entry = self._entries[self._position]
        return [ await change.undo() for change in reversed(entry) ]

    async def redo(self) -> list[Any]:
        if not self.can_redo:
            return [ ]
        entry = self._entries[self._position]
        self._position += 1
        return [ await change.redo() for change in entry ]
