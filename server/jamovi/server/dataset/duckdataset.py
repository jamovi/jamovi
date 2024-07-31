from __future__ import annotations

from typing import Iterator
from typing import Iterable
from typing import Union
from typing import TYPE_CHECKING
from typing import cast
from typing import Literal

from collections import OrderedDict

import math

import itertools
from uuid import uuid4
import re
import math

from jamovi.server.logging import logger

# from jamovi.server import column # collides with class method parameters named column

from .core import ColumnType
from .core import DataType
from .core import MeasureType

from .dataset import DataSet
from .duckcolumn import DuckColumn
from .duckcolumn import DuckLevel

from .datacache import DataReadCache
from .datacache import DataWriteBuffer
from .datacache import CellValue
from .datacache import CellCoordinate

if TYPE_CHECKING:
    from .duckstore import DuckStore


REGEX_WHITESPACE = re.compile(r"\s+")


SQL_TYPES = {
    DataType.INTEGER: {
        MeasureType.CONTINUOUS: "INTEGER",
        MeasureType.NOMINAL: "INTEGER",
        MeasureType.ORDINAL: "INTEGER",
        MeasureType.ID: "INTEGER",
    },
    DataType.DECIMAL: {
        MeasureType.CONTINUOUS: "DOUBLE",
        MeasureType.NOMINAL: "DOUBLE",  # no such thing
        MeasureType.ORDINAL: "DOUBLE",  # no such thing
        MeasureType.ID: "DOUBLE",  # no such thing
    },
    DataType.TEXT: {
        MeasureType.CONTINUOUS: "VARCHAR",  # no such thing
        MeasureType.NOMINAL: "INTEGER",
        MeasureType.ORDINAL: "INTEGER",
        MeasureType.ID: "VARCHAR",
    },
}

SQL_NULL_VALUES = {
    DataType.INTEGER: {
        MeasureType.CONTINUOUS: "-2147483648",
        MeasureType.NOMINAL: "-2147483648",
        MeasureType.ORDINAL: "-2147483648",
        MeasureType.ID: "-2147483648",
    },
    DataType.DECIMAL: {
        MeasureType.CONTINUOUS: "cast('NaN' as double)",
        MeasureType.NOMINAL: "cast('NaN' as double)",
        MeasureType.ORDINAL: "cast('NaN' as double)",
        MeasureType.ID: "cast('NaN' as double)",
    },
    DataType.TEXT: {
        MeasureType.CONTINUOUS: "''",
        MeasureType.NOMINAL: "-2147483648",
        MeasureType.ORDINAL: "-2147483648",
        MeasureType.ID: "''",
    },
}


def vvv(value: int | float | str) -> str:
    "Convert to SQL value"
    if isinstance(value, str):
        # TODO, should escape string
        return f"'{ value }'"
    elif isinstance(value, float):
        if math.isnan(value):
            return "cast('NaN' as double)"
    return repr(value)


def stripw(value: str):
    """strips whitespace"""
    return re.sub(REGEX_WHITESPACE, " ", value)


def is_missing(value):
    "Is this a missing value"
    return value in (-2147483648, float("nan"), "")


def batched(iterable, n):
    """batched() from itertools"""
    # batched('ABCDEFG', 3) → ABC DEF G
    if n < 1:
        raise ValueError("n must be at least one")
    iterator = iter(iterable)
    while batch := tuple(itertools.islice(iterator, n)):
        yield batch


class DuckDataSet(DataSet):
    
    """A data set backed by a duckdb database"""

    _id: int
    _store: "DuckStore"
    _columns_by_index: list[DuckColumn]
    _columns_by_iid: dict[int, DuckColumn]
    _column_count: int
    _row_count: int
    _row_count_ex_filtered: int

    _cache: DataReadCache
    _cache_ex_filtered: DataReadCache
    _cache_filter_state: OrderedDict[int, bool]

    _weights: int

    _write_buffer: DataWriteBuffer

    @staticmethod
    def create(store: "DuckStore", dataset_id: int) -> DuckDataSet:
        """Create a data set in the duckdb store"""

        store.attach()
        store.execute("CREATE SEQUENCE IF NOT EXISTS column_iids START WITH 1")
        store.execute(f"""
            CREATE TABLE "sheet_meta_{ dataset_id }" (
                name VARCHAR NOT NULL,
                ivalue INTEGER,
            );
            INSERT INTO "sheet_meta_{ dataset_id }" BY NAME (SELECT 'weights' AS name, 0 AS ivalue);
            """)
        store.execute(f"""
            CREATE TABLE "sheet_columns_{ dataset_id }" (
                iid INTEGER PRIMARY KEY DEFAULT nextval('column_iids'),
                index INTEGER,
                column_id INTEGER,
                dataset_id VARCHAR,
                name VARCHAR,
                import_name VARCHAR NOT NULL DEFAULT '',
                description VARCHAR NOT NULL DEFAULT '',
                column_type INTEGER NOT NULL DEFAULT 1,
                data_type INTEGER NOT NULL DEFAULT 1,
                measure_type INTEGER NOT NULL DEFAULT 2,
                auto_measure BOOLEAN NOT NULL DEFAULT false,
                formula VARCHAR NOT NULL DEFAULT '',
                formula_message VARCHAR NOT NULL DEFAULT '',
                dps INTEGER NOT NULL DEFAULT 0,
                trim_levels BOOLEAN NOT NULL DEFAULT true
            )
            """)
        store.execute(f"""
            CREATE TABLE "sheet_data_{ dataset_id }" (
                index INTEGER NOT NULL,
                filter INT1 NOT NULL DEFAULT 1,
                index_ex_filtered INTEGER,
            )""")
        store.execute(f"""
            CREATE TABLE "sheet_levels_{ dataset_id }" (
                piid INTEGER NOT NULL,
                index INTEGER NOT NULL,
                value INTEGER NOT NULL,
                label VARCHAR NOT NULL,
                import_value VARCHAR,
                pinned BOOLEAN NOT NULL,
                count INTEGER NOT NULL DEFAULT 0,
                count_ex_filtered INTEGER NOT NULL DEFAULT 0,
            )
        """)
        store.detach()
        return DuckDataSet(dataset_id, store)

    def __init__(self, dataset_id: int, store: "DuckStore"):
        self._id = dataset_id
        self._store = store
        self._columns_by_iid = {}
        self._columns_by_index = []
        self._column_count = 0
        self._row_count = 0
        self._row_count_ex_filtered = 0
        self._cache = DataReadCache(self.get_values)
        self._write_buffer = DataWriteBuffer(self.set_values)
        self._weights = 0

    def attach(self, read_only: bool = False) -> None:
        self._store.attach(read_only)

    def detach(self) -> None:
        self._store.detach()

    def _execute(
        self, query: object, args: object = None, multiple_parameter_sets=False
    ):
        # print(query)
        # if args:
        #    print(args)
        return self._store.execute(query, args, multiple_parameter_sets)

    def __getitem__(self, index_or_name: Union[str, int]) -> DuckColumn:
        if isinstance(index_or_name, int):
            return self._columns_by_index[index_or_name]
        for column in self._columns_by_index:
            if column.name == index_or_name:
                return column
        raise KeyError

    def __iter__(self) -> Iterator[DuckColumn]:
        for column in self._columns_by_index:
            yield column

    def set_value(
        self,
        row: int,
        column: int | DuckColumn,
        raw_value: int | float | str,
        initing=False,
    ):
        """set a value in the data set"""

        if isinstance(column, int):
            column = self._columns_by_index[column]

        value = raw_value
        level_to_remove: int | None = None

        if column.has_levels:
            if not isinstance(raw_value, int):
                raise ValueError
            if column.data_type is DataType.TEXT:
                if raw_value == -2147483648:
                    value = ""
                else:
                    value = column.get_label(raw_value)

            old_value = self.get_value(row, column)
            if value == old_value:
                return

            row_filtered = self.is_row_filtered(row)

            if not initing and not is_missing(old_value):
                for index, level in enumerate(column.dlevels):
                    if column.data_type is DataType.TEXT:
                        level_value = level.import_value
                    else:
                        level_value = level.value

                    if old_value == level_value:
                        # decrement count for old value
                        level.count -= 1
                        if level.count == 0:
                            # delay removal until after the new value is set
                            level_to_remove = index
                        if not row_filtered:
                            level.count_ex_filtered -= 1
                        break
                else:
                    logger.warning("Shouldn't get here")

            for level in column.dlevels:
                if column.data_type is DataType.TEXT:
                    level_value = level.import_value
                else:
                    level_value = level.value
                if value == level_value:
                    # increment count for new value
                    level.count += 1
                    if not row_filtered:
                        level.count_ex_filtered += 1

        # assign the value
        self._execute(
            f"""
            UPDATE "sheet_data_{ self._id }"
            SET "{ column.iid }" = ?
            WHERE index = { row }
            """,
            (raw_value,),
        )

        if column.has_levels:
            self.column_update_levels(column, level_to_remove)

        self._cache.clear()

    def set_values(self, values:dict[tuple, CellValue]):
        self._set_values(values, index_name="index")

    def _set_values(self, values:dict[CellCoordinate, CellValue], index_name):
        
        # Values written one column at a time base on the assumption that cells 
        # to be set are not neccessarily adjacent.
         
        # NOTE: Performance could be improved by updating groups of columns that have 
        # updates for all the same rows as each other (instead updating columns one at a time)
        col_iids = set([t[1] for t in values.keys()])
        for col_i in col_iids:
            col_updates:dict[int,CellValue] = {index:value for (index, col_j), value in values.items() if col_i==col_j}
            self._update_column_values(col_i, col_updates, index_name)

    def _update_column_values(self, col, updates:dict[int,CellValue], index_name):
        col = self._columns_by_iid[col]
        data_type = col.data_type
        measure_type = col.measure_type

        values = ",".join(
            [f"({row_index},{self.as_sql_string(value, data_type=data_type, measure_type=measure_type)})" 
                for row_index, value in updates.items()])
        query = \
            f"""
            UPDATE "sheet_data_{self._id}"
            SET "{col.iid}" = t.col_iid
            FROM (VALUES {values}) AS t(index_col, col_iid)
            WHERE "sheet_data_{self._id}".{index_name} = t.index_col
            """
        self._execute(query)

    def commit_set_values(self):
        self._write_buffer.commit()

    def _convert_value_to_raw(self, value, parent_column: DuckColumn):

        if isinstance(value, str) and parent_column.data_type is DataType.TEXT and parent_column.has_levels:
            try:
                raw = parent_column.get_value_for_label(value)
            except KeyError:
                raw = self.column_add_level(parent_column, value)
        else:
            raw = value
        return raw        

    def column_trim_unused_levels(self, column: DuckColumn):
        """trim unused, unpinned levels"""
        self.column_update_levels(column, trim="all")

    def column_update_levels(
        self, column: DuckColumn, trim: Literal["all"] | int | None = None
    ):
        """update level counts, and trim if requested"""

        if not column.has_levels:
            raise ValueError(f"Column '{ column.name }' doesn't support levels")

        levels = column.dlevels

        to_retain: list[DuckLevel] = []
        original_indices: list[int] = []
        offset_at: list[int] = []

        if trim == "all":
            # trim all levels with zero counts
            for index, level in enumerate(levels):
                # we don't trim levels when we're initing
                if level.count == 0 and not level.pinned:
                    offset_at.append(index)
                else:
                    to_retain.append(level)
                    original_indices.append(index)
        elif trim is None:
            # don't trim any
            to_retain = levels
            original_indices = list(range(len(levels)))
        else:
            # trim only the specified index
            for index, level in enumerate(levels):
                if index == trim and level.count == 0 and not level.pinned:
                    offset_at.append(index)
                else:
                    to_retain.append(level)
                    original_indices.append(index)

        self._execute("BEGIN TRANSACTION")

        if column.data_type is DataType.TEXT:
            for index in offset_at:
                self._execute(f"""
                    UPDATE "sheet_data_{ self._id }"
                    SET "{ column.iid }" = "{ column.iid }" - 1
                    WHERE "{ column.iid }" > { index }
                """)

        self._execute(f"""
            DELETE FROM "sheet_levels_{ self._id }"
            WHERE piid = { column.iid }
        """)

        def to_sql(index: int, value: int, level: DuckLevel) -> str:
            return stripw(f"""
                ({ column.iid },
                    { index },
                    { value },
                    { vvv(level.label) },
                    { vvv(level.import_value) },
                    { vvv(level.pinned) },
                    { level.count },
                    { level.count_ex_filtered })
            """)

        if column.data_type is DataType.TEXT:
            lines = [
                to_sql(index, index, level) for index, level in enumerate(to_retain)
            ]
        else:
            lines = [
                to_sql(index, level.value, level)
                for index, level in enumerate(to_retain)
            ]

        if lines:
            values_fragment = ", ".join(lines)
            self._execute(f"""
                INSERT INTO "sheet_levels_{ self._id }" VALUES { values_fragment }
                """)

        self._execute("COMMIT")

        new_levels = []
        for new_index, old_index in enumerate(original_indices):
            level = levels[old_index]
            if column.data_type is DataType.TEXT:
                level.value = new_index
            new_levels.append(level)

        column.notify_levels_changed(new_levels)

    def get_value(self, row: int, column: int | DuckColumn) -> int | float | str:
        """retrieve a value from the data set"""
        column = column if isinstance(column, int) else column.index
        return self._cache.get_value(row, 2 + column)

    def is_row_filtered(self, index: int) -> bool:
        return not self._cache.get_value(index, 1)

    def get_index_ex_filtered(self, index: int) -> int:
        # TODO
        return index

    def get_indices_ex_filtered(self, row_start: int, row_count: int) -> Iterable[int]:
        return list(
            map(self.get_index_ex_filtered, range(row_start, row_start + row_count))
        )

    def column_clear_levels(self, column: DuckColumn):
        """clear the levels of a column in the database"""
        self._execute(
            f"""
            DELETE FROM "sheet_levels_{ self._id }"
            WHERE piid = ?
        """,
            (column.iid,),
        )
        column.notify_levels_changed([])

    def column_set_attribute(self, column: DuckColumn, name: str, value):
        """change a column's attribute in the database"""

        if name == "data_type" or name == "measure_type":
            data_type = DataType(value) if name == "data_type" else column.data_type
            measure_type = (
                MeasureType(value) if name == "measure_type" else column.measure_type
            )

            sql_type = SQL_TYPES[data_type][measure_type]
            null_value = SQL_NULL_VALUES[data_type][measure_type]

            self._execute(f"""
                ALTER TABLE "sheet_data_{ self._id }"
                DROP COLUMN "{ column.iid }";

                ALTER TABLE "sheet_data_{ self._id }"
                ADD COLUMN "{ column.iid }" { sql_type } DEFAULT { null_value };
                """)

        self._execute(
            f"""
            UPDATE "sheet_columns_{ self._id }"
            SET { name } = (SELECT $value)
            WHERE iid = $iid
            """,
            {"value": value, "iid": column.iid},
        )
        column.notify_attribute_changed(name, value)

    def get_values(
        self, row_start: int, column_start: int, row_end: int, column_end: int
    ) -> tuple[tuple]:
        """retrieve a range of data set values"""
        return self._get_values(row_start, column_start, row_end, column_end, "index")

    def get_values_ex_filtered(
        self, row_start: int, column_start: int, row_end: int, column_end: int
    ) -> tuple[tuple]:
        """retrieve a range of data set values, excluding filtered rows"""
        return self._get_values(
            row_start, column_start, row_end, column_end, "index_ex_filtered"
        )

    def _get_values(
        self,
        row_start: int,
        column_start: int,
        row_end: int,
        column_end: int,
        index_name: str,
    ) -> tuple[tuple]:
        column_end = min(column_end, self._column_count - 1)

        queries = [
            f"""
            SELECT { index_name }, filter FROM "sheet_data_{ self._id }"
            WHERE { index_name } >= { row_start } AND { index_name } <= { row_end }
            ORDER BY { index_name }
            """,
        ]

        for column_no in range(column_start, column_end + 1):
            column = self._columns_by_index[column_no]
            if column.data_type is DataType.TEXT and column.has_levels:
                queries.append(f"""
                    SELECT ifnull(levels.label, '')
                    FROM "sheet_data_{ self._id }" data
                    LEFT JOIN "sheet_levels_{ self._id }" levels
                    ON levels.value = data."{ column.iid }" AND data.{ index_name } >= { row_start } AND data.{ index_name } <= { row_end } AND levels.piid = { column.iid }
                    ORDER BY data.{ index_name }
                """)
            else:
                queries.append(f"""
                    SELECT "{ column.iid }"
                    FROM "sheet_data_{ self._id }" data
                    WHERE data.{ index_name } >= { row_start } AND data.{ index_name } <= { row_end }
                    ORDER BY data.{ index_name }
                """)

        sql = f"""SELECT * FROM ({ ') POSITIONAL JOIN ('.join(queries) })"""
        query = self._execute(sql)
        values = cast(tuple[tuple], query.fetchall())
        # for v in values:
        #     for vv in itertools.islice(v, 2, None):
        #         assert vv is not None
        return values

    def append_column(self, name: str, import_name: str = "") -> DuckColumn:
        return self.insert_column(self.column_count, name, import_name)

    def insert_column(self, index: int, name: str, import_name: str = "") -> DuckColumn:
        self._execute("BEGIN TRANSACTION")
        self._execute(
            f'UPDATE "sheet_columns_{ self._id }" SET index = index + 1 WHERE index >= $index',
            {"index": index},
        )
        query = self._execute(
            f'INSERT INTO "sheet_columns_{ self._id }" BY NAME (SELECT $index AS index, $name AS name, $import_name AS import_name) RETURNING iid',
            {"index": index, "name": name, "import_name": import_name},
        )
        result = query.fetchall()
        first = next(iter(result))
        (iid,) = first
        self._execute(
            f'ALTER TABLE "sheet_data_{ self._id }" ADD COLUMN "{ iid }" INTEGER DEFAULT -2147483648'
        )
        self._execute("COMMIT")

        self._update_column_index()
        return self._columns_by_index[index]

    def column_change(
        self,
        column: DuckColumn,
        *,
        data_type: DataType | None = None,
        measure_type: MeasureType | None = None,
    ):
        """change a column's data type and/or measure type"""

        if data_type is None:
            data_type = column.data_type
        if measure_type is None:
            measure_type = column.measure_type

        sql_type = SQL_TYPES[data_type][measure_type]
        null_value = SQL_NULL_VALUES[data_type][measure_type]

        self._execute(f"""
            BEGIN TRANSACTION;

            ALTER TABLE "sheet_data_{ self._id }"
            RENAME COLUMN "{ column.iid }" TO temp;

            ALTER TABLE "sheet_data_{ self._id }"
            ADD COLUMN "{ column.iid }" { sql_type } DEFAULT { null_value };
        """)

        self._execute(f"""
            UPDATE "sheet_data_{ self._id }" AS main
            SET "{ column.iid }" = new.value
            FROM (
                SELECT CASE WHEN value IS NULL THEN { null_value } ELSE value END AS value, index FROM (
                    SELECT TRY_CAST(temp AS { sql_type }) AS value, index FROM "sheet_data_{ self._id }"
                )
            ) AS new
            WHERE main.index = new.index;
        """)

        self._execute(
            f"""
            UPDATE "sheet_columns_{ self._id }"
            SET data_type = { data_type.value }, measure_type = { measure_type.value }
            WHERE iid = $iid
            """,
            {"iid": column.iid},
        )

        column.notify_attribute_changed("data_type", data_type.value)
        column.notify_attribute_changed("measure_type", measure_type.value)

        self._execute(f"""
            ALTER TABLE "sheet_data_{ self._id }" DROP COLUMN temp;
            COMMIT;
            """)

    def column_insert_level(
        self,
        column: DuckColumn,
        value: int,
        label=None,
        import_value=None,
        pinned=False,
        *,
        append=False,
    ):
        """insert a new level to the column"""
        if not column.has_levels:
            raise ValueError
        if label is None:
            label = str(value)
        if import_value is None:
            import_value = label

        index = column.level_count

        if not append and column.data_type is DataType.INTEGER:
            ascending = True
            descending = True

            # establish if the levels are asending or descending
            for i in range(0, column.level_count - 1):
                if column.levels[i] > column.levels[i + 1]:
                    ascending = False
                else:
                    descending = False

            if ascending and descending:
                descending = False

            if ascending or descending:
                index = 0
                for level_info in column.levels:
                    level_value = level_info[0]
                    if (ascending and value < level_value) or (
                        descending and value > level_value
                    ):
                        break
                    else:
                        index += 1

        self._execute("BEGIN TRANSACTION")

        if index < column.level_count:
            self._execute(
                f"""
                UPDATE "sheet_levels_{ self._id }"
                SET index = index + 1
                WHERE index >= ? AND piid = ?
                """,
                (index, column.iid),
            )

        self._execute(
            f"""
            INSERT INTO "sheet_levels_{ self._id }" BY NAME (
                SELECT { column.iid } AS piid, $value AS value, $label AS label, $import_value AS import_value, $pinned AS pinned, $index AS index
            )
            """,
            {
                "value": value,
                "label": label,
                "import_value": import_value,
                "pinned": pinned,
                "index": index,
            },
        )
        self._execute("COMMIT")

        levels = column.dlevels
        new_level = DuckLevel(value, label, import_value, pinned)
        levels.insert(index, new_level)
        column.notify_levels_changed(levels)

    def column_append_level(
        self, column, value, label, import_value=None, pinned=False
    ):
        """append a level to the column"""
        self.column_insert_level(
            column, value, label, import_value, pinned, append=True
        )

    def _column_refresh_levels(self, column):
        query = self._execute(f"""
            SELECT
                levels.value,
                label,
                import_value,
                pinned,
                ifnull(counts.count, 0) AS count,
                CASE WHEN counts.count_ex_filtered IS NULL THEN 0 ELSE counts.count_ex_filtered END AS count_ex_filtered
            FROM
                (
                    SELECT value, label, import_value, pinned, index FROM "sheet_levels_{ self._id }"
                    WHERE piid == { column.iid }
                    ORDER BY index
                ) levels
                LEFT JOIN
                (
                    SELECT
                        unfiltered.value AS value,
                        unfiltered.count AS count,
                        filtered.count AS count_ex_filtered,
                    FROM (
                        SELECT "{ column.iid }" AS value, count("{ column.iid }") AS count
                        FROM "sheet_data_{ self._id }"
                        GROUP BY value
                    ) unfiltered
                    LEFT JOIN
                    (
                        SELECT "{ column.iid }" AS value, count("{ column.iid }") AS count
                        FROM "sheet_data_{ self._id }"
                        WHERE filter == 1
                        GROUP BY value
                    ) filtered
                    ON filtered.value = unfiltered.value
                ) counts
                ON levels.value = counts.value
            ORDER BY index
            """)
        results = query.fetchall()
        levels = [DuckLevel(*row) for row in results]
        column.notify_levels_changed(levels)

    def _update_column_index(self):
        fields = DuckColumn.sql_fields()
        query = self._execute(
            f"""
            SELECT { ', '.join(fields) }
            FROM "sheet_columns_{ self._id }"
            ORDER BY index
            """,
        )

        columns_by_iid = {}
        columns_by_index = []

        for column_values in query.fetchall():
            column_iid = column_values[0]  # first value is iid
            column: DuckColumn
            try:
                column = self._columns_by_iid[column_iid]
            except KeyError:
                column = DuckColumn(self)
            column.setup(*column_values)
            columns_by_iid[column_iid] = column
            columns_by_index.append(column)

        self._columns_by_iid.clear()
        self._columns_by_iid.update(columns_by_iid)
        self._columns_by_index[:] = columns_by_index
        self._column_count = len(self._columns_by_index)
        self._cache.clear()

    def delete_columns(self, col_start: int, col_end: int) -> None:
        n = col_end - col_start + 1
        logger.debug(f"deleting columns { col_start } { col_end }")
        self._execute(
            f"""
            BEGIN TRANSACTION ;

            DELETE FROM "sheet_columns_{ self._id }"
            WHERE index >= { col_start } AND index <= { col_end } ;

            UPDATE "sheet_columns_{ self._id }"
            SET index = index - { n }
            WHERE index >= { col_start } ;

            COMMIT ;
            """,
        )
        self._update_column_index()

    @property
    def column_count(self) -> int:
        return self._column_count

    def set_row_count(self, count: int) -> None:
        row_count = self.row_count
        if count > row_count:
            indices = range(self.row_count, count)
            for batch in batched(indices, 5000):
                bracketed = map(lambda x: f"({ x })", batch)
                joined = ",".join(bracketed)
                sql = f"""INSERT INTO "sheet_data_{ self._id }" (index) VALUES { joined }"""
                self._execute(sql)

        elif count < row_count:
            self._execute(f"""
                DELETE FROM "sheet_data_{ self._id }"
                WHERE index >= { count }
            """)
        self._row_count = count
        self._cache.clear()

    def insert_rows(self, row_start: int, row_end: int) -> None:
        n = row_end - row_start + 1
        self._store.execute("BEGIN TRANSACTION")
        self._store.execute(f"""
            UPDATE "sheet_data_{ self._id }"
            SET index = index + { n } WHERE index >= { row_start };
            """)
        indices = range(row_start, row_end + 1)
        for batch in batched(indices, 1000):
            bracketed = map(lambda x: f"({ x })", batch)
            joined = ",".join(bracketed)
            self._execute(
                f"""INSERT INTO "sheet_data_{ self._id }" VALUES { joined }"""
            )
        self._store.execute("COMMIT")
        self._row_count += n

    def delete_rows(self, row_start: int, row_end: int) -> None:
        n = row_end - row_start + 1
        self._execute(f"""
            BEGIN TRANSACTION ;

            DELETE FROM "sheet_data_{ self._id }"
            WHERE index >= { row_start } AND index <= { row_end } ;

            UPDATE "sheet_data_{ self._id }"
            SET index = index - { n }
            WHERE index >= { row_end } ;

            COMMIT ;
            """)
        self._row_count -= n

    @property
    def row_count(self) -> int:
        return self._row_count

    @property
    def row_count_ex_filtered(self) -> int:
        return self._row_count_ex_filtered

    @property
    def weights(self) -> int:
        return self._weights
        # result = self._execute(f"""
        #     SELECT ivalue
        #     FROM "sheet_meta_{ self._id }"
        #     WHERE name = 'weights'
        #     """).fetchall()
        # (w,) = next(iter(result))
        # return w

    def set_weights(self, weights_id: int) -> None:
        self._weights = weights_id
        self._execute(
            f"""
            UPDATE "sheet_meta_{ self._id }"
            SET ivalue = (SELECT ?)
            WHERE name = 'weights'
            """,
            (weights_id,),
        )

    def refresh_filter_state(self) -> None:
        logger.debug("resfreshing filter state")

        filter_iids = []
        factor_iids = []

        for column in self._columns_by_index:
            if column.column_type == ColumnType.FILTER:
                filter_iids.append(column.iid)
            elif column.has_levels:
                factor_iids.append(column.iid)

        if len(filter_iids) == 0:
            self._execute(f"""
                UPDATE "sheet_data_{ self._id }" AS data
                SET filter = 1
            """)
        else:
            equals_one = [f""""{ iid }" == 1""" for iid in filter_iids]
            all_equals_one = " AND ".join(equals_one)

            self._execute(
                f"""
                UPDATE "sheet_data_{ self._id }" AS data
                SET filter = (
                    SELECT filter_state.filter
                    FROM (
                        SELECT IF({ all_equals_one }, 1, 0) AS filter, index
                        FROM "sheet_data_{ self._id }" filter
                    ) AS filter_state
                    WHERE data.index = filter_state.index
                )""",
            )

        for factor_iid in factor_iids:
            column = self._columns_by_iid[factor_iid]
            self._column_refresh_levels(column)

        results = self._execute(f"""
            SELECT count(*)
            FROM "sheet_data_{ self._id }"
            WHERE filter == 1
        """).fetchall()

        row_count_ex = results[0][0]
        self._row_count_ex_filtered = row_count_ex

    def as_sql_string(self, value, data_type,measure_type):
        if self.is_null_value(value, data_type):
            return SQL_NULL_VALUES[data_type][measure_type]
        # TODO: Add more cases for other data types
        ...

        return value

    def is_null_value(self, value, data_type):
        if data_type is DataType.DECIMAL: 
            return math.isnan(value)
        elif data_type is DataType.INTEGER:
            return value == -2147483648
        elif data_type is DataType.TEXT:
            return value == ""

        return False