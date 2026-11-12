from __future__ import annotations

from collections import namedtuple
from typing import Any
from typing import Protocol
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from .datasetcontroller import DataSetController


# returned by a change's undo() or redo(), to say which analysis it changed.
# if it removed it, analysis_id is the analysis which was above it
Revealed = namedtuple('Revealed', 'analysis_id removed', defaults=(False,))


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


class AnalysisOptionsChange:
    """A change to an analysis' options. before and after are the option
    values the user can change (see Instance._user_option_values), and
    restore() puts one of them back. Changes to the same analysis in quick
    succession (typing, dragging) are merged into one"""

    MERGE_WITHIN = 1.0  # seconds

    def __init__(self, analysis_id: int, before: dict, after: dict, time: float, restore):
        self.analysis_id = analysis_id
        self.before = before
        self.after = after
        self.time = time
        self._restore = restore

    @property
    def is_noop(self) -> bool:
        return self.before == self.after

    def absorb(self, change) -> bool:
        if (not isinstance(change, AnalysisOptionsChange)
                or change.analysis_id != self.analysis_id
                or change.time - self.time > AnalysisOptionsChange.MERGE_WITHIN):
            return False
        self.after = change.after
        self.time = change.time
        return True

    async def undo(self):
        self._restore(self.analysis_id, self.after, self.before)
        return Revealed(self.analysis_id)

    async def redo(self):
        self._restore(self.analysis_id, self.before, self.after)
        return Revealed(self.analysis_id)


class AnalysisRemoval:
    """The removal of an analysis (along with its annotation and output
    columns). remove() takes it out, and returns what restore() needs to
    put it back"""

    def __init__(self, remove, restore, removed):
        self._remove = remove
        self._restore = restore
        self._removed = removed

    async def undo(self):
        revealed = Revealed(self._removed.analyses[0].id)
        self._restore(self._removed)
        self._removed = None
        return revealed

    async def redo(self):
        self._removed = self._remove()
        return Revealed(self._removed.above_id, removed=True)


class AnalysisAddition:
    """The addition of an analysis; the reverse of AnalysisRemoval"""

    def __init__(self, remove, restore):
        self._remove = remove
        self._restore = restore
        self._removed = None

    async def undo(self):
        self._removed = self._remove()
        return Revealed(self._removed.above_id, removed=True)

    async def redo(self):
        revealed = Revealed(self._removed.analyses[0].id)
        self._restore(self._removed)
        self._removed = None
        return revealed


class History:
    """The undo/redo history of a project, across all its stores (data sets,
    and later analyses). An entry is a list of changes, possibly to
    several stores, which are undone (and redone) together"""

    MAX_LENGTH = 1000

    def __init__(self):
        self._entries: list[list[Change]] = [ ]
        self._position = 0  # the entries before here can be undone
        self._can_merge = False

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
        self._can_merge = False

    def add(self, *changes: Change):
        del self._entries[self._position:]

        # a lone change may be merged into the lone change before it, so
        # long as nothing has been undone or redone in between
        if self._can_merge and len(changes) == 1 and len(self._entries[-1]) == 1:
            last = self._entries[-1][0]
            absorb = getattr(last, 'absorb', None)
            if absorb is not None and absorb(changes[0]):
                if getattr(last, 'is_noop', False):
                    # changed back to how it was; the entry before is
                    # unrelated, so isn't merged into either
                    del self._entries[-1]
                    self._can_merge = False
                self._position = len(self._entries)
                return

        self._entries.append(list(changes))
        self._can_merge = True
        if len(self._entries) > History.MAX_LENGTH:
            del self._entries[0]
        self._position = len(self._entries)

    async def undo(self) -> list[Any]:
        if not self.can_undo:
            return [ ]
        self._position -= 1
        self._can_merge = False
        entry = self._entries[self._position]
        return [ await change.undo() for change in reversed(entry) ]

    async def redo(self) -> list[Any]:
        if not self.can_redo:
            return [ ]
        entry = self._entries[self._position]
        self._position += 1
        self._can_merge = False
        return [ await change.redo() for change in entry ]
