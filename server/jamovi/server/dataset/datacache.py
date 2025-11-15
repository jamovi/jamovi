from __future__ import annotations

from typing import Callable
from typing import TypeAlias
from collections import OrderedDict
from collections import namedtuple
from dataclasses import dataclass

import logging


CACHE_AREA_ROWS = 100
CACHE_AREA_COLUMNS = 50


@dataclass(frozen=True)
class CellRange:
    """Cell range representing a rectangular selection"""

    row_start: int
    column_start: int
    row_end: int
    column_end: int


# FIXME: None is possibly not an option. Missing values will come through as '', -21..., and float('nan'). 
CellValue: TypeAlias = str | int | float | None


# NOTE: A dataclass could be used instead of namedtuple to make future refactoring easier
# NOTE: Unless you want to use (row_index, col_iid) as an index, CellCoordinate could be renamed 
# to Cell and changed to include the cell's value: i.e. Cell = namedtuple("Cell", ["row", "column", "value"])
CellCoordinate = namedtuple("CellCoordinate", ["row_index", "col_iid"])


log = logging.getLogger(__name__)
log.setLevel(logging.INFO)


class LRUCache:
    """LRU Cache with a clear() method"""

    _maxitems: int
    _cache: OrderedDict

    def __init__(self, maxitems=9):
        self._maxitems = maxitems
        self._cache = OrderedDict()

    def __getitem__(self, key):
        value = self._cache[key]
        self._cache.move_to_end(key)
        return value

    def __setitem__(self, key, value):
        self._cache[key] = value
        while len(self._cache) > self._maxitems:
            self._cache.popitem(last=False)

    def clear(self):
        """Clear the cache"""
        self._cache.clear()


class DataReadCache:
    """A cache for spreadsheet cell values"""

    _cache: LRUCache
    _get_values: Callable[[int, int, int, int], tuple[tuple]]

    def __init__(self, get_values: Callable[[int, int, int, int], tuple[tuple]]):
        self._cache = LRUCache(maxitems=9)
        self._get_values = get_values

    def clear(self):
        """Clears the cache"""
        self._cache.clear()

    def get_value(self, row: int, column: int) -> CellValue:
        """Retrieves a value from the cache"""
        row_start = (row // CACHE_AREA_ROWS) * CACHE_AREA_ROWS
        row_end = row_start + CACHE_AREA_ROWS
        column_start = (column // CACHE_AREA_COLUMNS) * CACHE_AREA_COLUMNS
        column_end = column_start + CACHE_AREA_COLUMNS
        cell_range = CellRange(row_start, column_start, row_end, column_end)
        try:
            values = self._cache[cell_range]
            # log.info('cache hit %s', cell_range)
        except KeyError:
            log.info("cache miss %s", cell_range)
            values = self._get_values(row_start, column_start, row_end, column_end)
            self._cache[cell_range] = values
        value = values[row - row_start][column - column_start]
        return value
    

class DataWriteBuffer:
    
    _write_buffer: dict[CellCoordinate, CellValue]
    _set_values: Callable[[dict[CellCoordinate, CellValue]], None]
    _max_items: int

    def __init__(
            self, 
            set_values_method: Callable[[dict[CellCoordinate, CellValue]], None],
            max_items: int = 50
            ):
        self._write_buffer = {}
        self._set_values = set_values_method
        self._max_items = max_items

    def stage(self, cell_coordinate: CellCoordinate, value: CellValue):
        """Stage a value for writing to the database"""
        self._write_buffer[cell_coordinate] = value
        if len(self._write_buffer) >= self._max_items:
            self.commit()

    # commit the buffer
    def commit(self):
        """Write the contents of the buffer to the database using the set_values(...) 
        method injected to the constructor"""

        self._set_values(self._write_buffer)
        self._write_buffer.clear()
    
    def dump(self):
        """Clear the buffer without writing to the database"""
        self._write_buffer.clear()
