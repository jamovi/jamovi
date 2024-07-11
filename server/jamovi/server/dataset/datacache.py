
from __future__ import annotations

from typing import Callable
from typing import TypeAlias
from collections import OrderedDict
from dataclasses import dataclass

import logging

CACHE_AREA_ROWS = 100
CACHE_AREA_COLUMNS = 50

@dataclass(frozen=True)
class CellRange:
    row_start: int
    column_start: int
    row_end: int
    column_end: int

CellValue: TypeAlias = str | int | float | None


log = logging.getLogger(__name__)
log.setLevel(logging.INFO)


class LRUCache:

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
        self._cache.clear()


class DataCache:

    _cache: LRUCache
    _get_values: Callable[[int, int, int, int], tuple[tuple]]

    def __init__(self, get_values: Callable[[int, int, int, int], tuple[tuple]]):
        self._cache = LRUCache(maxitems=9)
        self._get_values = get_values

    def clear(self):
        self._cache.clear()

    def get_value(self, row: int, column: int) -> CellValue:
        row_start = (row // CACHE_AREA_ROWS) * CACHE_AREA_ROWS
        row_end = row_start + CACHE_AREA_ROWS
        column_start = (column // CACHE_AREA_COLUMNS) * CACHE_AREA_COLUMNS
        column_end = column_start + CACHE_AREA_COLUMNS
        cell_range = CellRange(row_start, column_start, row_end, column_end)
        try:
            values = self._cache[cell_range]
            # log.info('cache hit %s', cell_range)
        except KeyError:
            log.info('cache miss %s', cell_range)
            values = self._get_values(row_start, column_start, row_end, column_end)
            self._cache[cell_range] = values
        value = values[row - row_start][column - column_start]
        return value

