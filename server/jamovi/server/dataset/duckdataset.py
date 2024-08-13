from __future__ import annotations

from typing import Iterator
from typing import Iterable
from typing import Union
from typing import TYPE_CHECKING
from typing import cast
from typing import Literal
from typing import Sequence

from collections import OrderedDict
from numbers import Number

import itertools
import re
import math

from jamovi.server.logging import logger

from .core import ColumnType
from .core import DataType
from .core import MeasureType

from .dataset import DataSet
from .duckcolumn import DuckColumn
from .duckcolumn import DuckLevel
from .duckcolumn import Level
from .datacache import DataCache


if TYPE_CHECKING:
    from .duckstore import DuckStore


REGEX_WHITESPACE = re.compile(r"\s+")


SQL_TYPES = {
    DataType.INTEGER: "INTEGER",
    DataType.DECIMAL: "DOUBLE",
    DataType.TEXT: "VARCHAR",
}

NULL_VALUES = {
    DataType.INTEGER: "-2147483648",
    DataType.DECIMAL: "cast('NaN' as double)",
    DataType.TEXT: "''",
}


def vvv(value: int | float | str) -> str:
    """Convert to SQL value"""
    if isinstance(value, str):
        return f"""'{ re.sub("'", "''", value) }'"""
    elif isinstance(value, float):
        if math.isnan(value):
            return "cast('NaN' as double)"
    return repr(value)


def stripw(value: str) -> str:
    """strips whitespace"""
    return re.sub(REGEX_WHITESPACE, " ", value)


def is_missing(value: int | float | str) -> bool:
    """Is this a missing value"""
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

    _cache: DataCache
    _cache_ex_filtered: DataCache
    _cache_filter_state: OrderedDict[int, bool]

    _weights: int

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
                trim_levels BOOLEAN NOT NULL DEFAULT true,
                active BOOLEAN NOT NULL DEFAULT true,
            )
            """)
        store.execute(f"""
            CREATE TABLE "sheet_data_{ dataset_id }" (
                index INTEGER NOT NULL,
                filter INT1 NOT NULL DEFAULT 1,
                index_ex_filtered INTEGER NOT NULL DEFAULT -2147483648,
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
        self._cache = DataCache(self.get_values)
        self._weights = 0

    def attach(self, read_only: bool = False) -> None:
        self._store.attach(read_only)

    def detach(self) -> None:
        self._store.detach()

    def _execute(
        self, query: object, args: object = None, multiple_parameter_sets=False
    ):
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

    def _column_resolve_value_from_raw(
        self, column: DuckColumn, raw_value: int
    ) -> int | str:
        if column.data_type is DataType.TEXT:
            if raw_value == -2147483648:
                return ""
            return column.get_label(raw_value)
        return raw_value

    def set_value(
        self,
        row: int,
        column: int | DuckColumn,
        raw_value: int | float | str,
        initing=False,
    ) -> None:
        """set a value in the data set"""

        if isinstance(column, int):
            column = self._columns_by_index[column]

        if column.data_type is DataType.DECIMAL:
            assert isinstance(raw_value, Number)
        elif (
            column.data_type is DataType.TEXT and column.measure_type is MeasureType.ID
        ):
            assert isinstance(raw_value, str)
        else:
            assert isinstance(raw_value, int)

        value = raw_value
        levels_changed: bool = False
        level_to_remove: int | None = None

        if column.has_levels:
            if not isinstance(raw_value, int):
                raise ValueError

            value = self._column_resolve_value_from_raw(column, raw_value)
            row_filtered = self.is_row_filtered(row)

            if not initing:
                old_value = self.get_value(row, column)
                if value == old_value:
                    return
                if not is_missing(old_value):
                    old_value = cast(int | str, old_value)
                    level_to_remove = self._column_change_level_use_counts(
                        column, old_value, -1, 0 if row_filtered else -1
                    )
                    levels_changed = True

            if not is_missing(value):
                self._column_change_level_use_counts(
                    column, value, 1, 0 if row_filtered else 1
                )
                levels_changed = True

        # assign the value
        self._execute(
            f"""
            UPDATE "sheet_data_{ self._id }"
            SET "{ column.iid }" = ?
            WHERE index = { row }
            """,
            (value,),
        )

        if levels_changed:
            self._write_levels_to_db(column, trim=level_to_remove)

        self._cache.clear()

    def column_trim_unused_levels(self, column: DuckColumn) -> None:
        """trim unused, unpinned levels"""
        self._write_levels_to_db(column, trim="all")

    def _write_levels_to_db(
        self,
        column: DuckColumn,
        *,
        levels: list[DuckLevel] | None = None,
        trim: Literal["all"] | int | None = None,
    ) -> None:
        """update level counts, and trim if requested"""

        if levels and not column.has_levels:
            raise ValueError(
                f"Column '{ column.name }' does not support levels ({ column.data_type }, { column.measure_type })"
            )

        if levels is None:
            levels = column.dlevels

        to_retain: list[DuckLevel] = []

        if trim == "all":
            for index, level in enumerate(levels):
                if level.count > 0 or level.pinned:
                    to_retain.append(level)
        elif trim is None:
            # don't trim any
            to_retain = levels
        else:
            # trim only the specified index
            for index, level in enumerate(levels):
                if index != trim or level.count > 0 or level.pinned:
                    to_retain.append(level)

        levels = to_retain
        if column.data_type is DataType.TEXT:
            for index, level in enumerate(levels):
                level.value = index

        self._execute(f"""
            BEGIN TRANSACTION
            ;
            DELETE FROM "sheet_levels_{ self._id }"
            WHERE piid = { column.iid }
        """)

        def to_sql(index: int, level: DuckLevel) -> str:
            return stripw(f"""
                ({ column.iid },
                    { index },
                    { level.value },
                    { vvv(level.label) },
                    { vvv(level.import_value) },
                    { vvv(level.pinned) },
                    { level.count },
                    { level.count_ex_filtered })
            """)

        lines = [to_sql(index, level) for index, level in enumerate(levels)]

        if lines:
            values_fragment = ", ".join(lines)
            self._execute(f"""
                INSERT INTO "sheet_levels_{ self._id }" VALUES { values_fragment }
                """)

        self._execute("COMMIT")
        column.notify_levels_changed(levels)

    def get_value(self, row: int, column: int | DuckColumn) -> int | float | str:
        """retrieve a value from the data set"""
        column = column if isinstance(column, int) else column.index
        return self._cache.get_value(row, 2 + column)

    def delete_columns(self, col_start: int, col_end: int) -> None:
        n = col_end - col_start + 1
        logger.debug(f"deleting columns { col_start } { col_end }")

        factor_iids = []
        for col_no in range(col_start, col_end + 1):
            column = self._columns_by_index[col_no]
            if column.has_levels:
                factor_iids.append(str(column.iid))

        factor_iids_joined = ", ".join(factor_iids)

        self._execute(
            f"""
            BEGIN TRANSACTION
            ;
            DELETE FROM "sheet_columns_{ self._id }"
            WHERE index >= { col_start } AND index <= { col_end }
            ;
            UPDATE "sheet_columns_{ self._id }"
            SET index = index - { n }
            WHERE index >= { col_start }
            ;
            DELETE FROM "sheet_levels_{ self._id }"
            WHERE piid IN ({ factor_iids_joined })
            ;
            COMMIT
            """,
        )
        self._sync_columns_from_db()

    def get_raw_value(self, row: int, column: int | DuckColumn) -> int | float | str:
        """return raw value"""
        if isinstance(column, int):
            column = self._columns_by_index[column]
        value = self.get_value(row, column)
        if column.data_type is DataType.TEXT and column.has_levels:
            assert isinstance(value, str)
            if value == "":
                return -2147483648
            return column.get_value_for_label(value)
        else:
            return value

    def is_row_filtered(self, index: int) -> bool:
        return not self._cache.get_value(index, 1)

    def get_index_ex_filtered(self, index: int) -> int:
        # TODO
        return index

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
                self._execute(f"""
                    INSERT INTO "sheet_data_{ self._id }" (index)
                    VALUES { joined }""")

        elif count < row_count:
            self._execute(f"""
                DELETE FROM "sheet_data_{ self._id }"
                WHERE index >= { count }
            """)
        self._row_count = count
        self._cache.clear()

    def insert_rows(self, row_start: int, row_end: int) -> None:
        n = row_end - row_start + 1
        self._store.execute(f"""
            BEGIN TRANSACTION
            ;
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

        for column in self._columns_by_index:
            if column.has_levels:
                # necessary to do clear values to update level counts
                self.column_set_values(
                    row_start, column, itertools.repeat(-2147483648, n)
                )

        self._execute(f"""
            BEGIN TRANSACTION
            ;
            DELETE FROM "sheet_data_{ self._id }"
            WHERE index >= { row_start } AND index <= { row_end }
            ;
            UPDATE "sheet_data_{ self._id }"
            SET index = index - { n }
            WHERE index >= { row_end }
            ;
            COMMIT
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

    def get_indices_ex_filtered(self, row_start: int, row_count: int) -> Iterable[int]:
        return [
            self.get_index_ex_filtered(index)
            for index in range(row_start, row_start + row_count)
        ]

    def refresh_filter_state(self) -> None:
        logger.debug("resfreshing filter state")

        filter_iids = []
        factor_iids = []

        for column in self._columns_by_index:
            if column.column_type == ColumnType.FILTER:
                if column.active:
                    filter_iids.append(column.iid)
            elif column.has_levels:
                factor_iids.append(column.iid)

        if len(filter_iids) == 0:
            self._execute(f"""
                UPDATE "sheet_data_{ self._id }" AS data
                SET filter = 1
            """)
        else:
            equals_one = [f""""{ iid }" = 1""" for iid in filter_iids]
            all_equals_one = " AND ".join(equals_one)

            self._execute(
                f"""
                CREATE OR REPLACE SEQUENCE index_ex START WITH 0 MINVALUE 0;
                ;
                UPDATE "sheet_data_{ self._id }" AS data
                SET filter = state.filter, index_ex_filtered = state.index_ex
                FROM (
                    SELECT
                        IF({ all_equals_one }, 1, 0) AS filter,
                        IF({ all_equals_one }, nextval('index_ex'), -2147483648) AS index_ex,
                        index
                    FROM "sheet_data_{ self._id }"
                ) state
                WHERE data.index = state.index
                """,
            )

        for factor_iid in factor_iids:
            column = self._columns_by_iid[factor_iid]
            self._sync_levels_from_column_values(column)

        results = self._execute(f"""
            SELECT count(*)
            FROM "sheet_data_{ self._id }"
            WHERE filter == 1
        """).fetchall()

        row_count_ex = results[0][0]
        self._row_count_ex_filtered = row_count_ex
        self._cache.clear()

    def column_set_values(
        self,
        row: int,
        column: DuckColumn,
        values: Iterable[int] | Iterable[float] | Iterable[str],
    ):
        """set values of a column"""
        for offset, value in enumerate(values):
            column.set_value(row + offset, value)

    def column_clear_levels(self, column: DuckColumn) -> None:
        """clear the levels of a column in the database"""
        self._execute(
            f"""
            DELETE FROM "sheet_levels_{ self._id }"
            WHERE piid = ? """,
            (column.iid,),
        )
        column.notify_levels_changed([])

    def column_set_attribute(self, column: DuckColumn, name: str, value) -> None:
        """change a column's attribute in the database"""

        if name == "data_type":
            data_type = DataType(value)
            sql_type = SQL_TYPES[data_type]
            null_value = NULL_VALUES[data_type]

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
        self._cache.clear()

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

    def append_column(self, name: str, import_name: str = "") -> DuckColumn:
        return self.insert_column(self.column_count, name, import_name)

    def insert_column(self, index: int, name: str, import_name: str = "") -> DuckColumn:
        self._execute(
            f"""
            BEGIN TRANSACTION
            ;
            UPDATE "sheet_columns_{ self._id }"
            SET index = index + 1
            WHERE index >= ?
        """,
            (index,),
        )

        query = self._execute(
            f"""
            INSERT INTO "sheet_columns_{ self._id }" BY NAME (
                SELECT $index AS index, $name AS name, $import_name AS import_name
            )
            RETURNING iid
        """,
            {"index": index, "name": name, "import_name": import_name},
        )

        result = query.fetchall()
        first = next(iter(result))
        (iid,) = first

        self._execute(f"""
            ALTER TABLE "sheet_data_{ self._id }"
            ADD COLUMN "{ iid }" INTEGER DEFAULT -2147483648
            ;
            COMMIT
        """)

        self._sync_columns_from_db()
        return self._columns_by_index[index]

    def _get_values(
        self,
        row_start: int,
        column_start: int,
        row_end: int,
        column_end: int,
        index_name: str,
    ) -> tuple[tuple]:
        column_end = min(column_end, self._column_count - 1)

        filter_iids = []
        column_iids = []

        for column in self._columns_by_index:
            if column.column_type is ColumnType.FILTER and column.active:
                filter_iids.append(column.iid)
            else:
                break

        if filter_iids:
            equals_one = map(lambda x: f'"{ x }" = 1', filter_iids)
            filter_sql = " AND ".join(equals_one)
        else:
            filter_sql = "1"

        for column_no in range(column_start, column_end + 1):
            column = self._columns_by_index[column_no]
            column_iids.append(column.iid)

        column_iids = map(lambda x: f'"{ x }"', column_iids)
        columns_sql = ", ".join(column_iids)
        if columns_sql:
            columns_sql = f", { columns_sql }"

        query = self._execute(f"""
            SELECT { index_name }, { filter_sql } AS filter { columns_sql }
            FROM "sheet_data_{ self._id }"
            WHERE { index_name } >= { row_start } AND { index_name } <= { row_end }
            ORDER BY { index_name }
        """)

        values = query.fetchall()
        return values

    def _column_change_measure_type(
        self, column: DuckColumn, measure_type: MeasureType
    ):
        self._execute(
            f"""
            UPDATE "sheet_columns_{ self._id }"
            SET measure_type = { measure_type.value }
            WHERE iid = $iid """,
            {"iid": column.iid},
        )

        column.notify_attribute_changed("measure_type", measure_type.value)

        if measure_type in (MeasureType.NOMINAL, MeasureType.ORDINAL):
            null_value = NULL_VALUES[column.data_type]
            if column.data_type is DataType.TEXT:
                value_sql = "row_number() OVER (ORDER BY value) - 1"
            else:
                value_sql = "value"

            self._execute(f"""
                DELETE FROM "sheet_levels_{ self._id }"
                WHERE piid = { column.iid }
                ;
                INSERT INTO "sheet_levels_{ self._id }" (
                    piid, index, value, label, import_value, pinned
                )
                FROM (
                    SELECT
                        { column.iid } AS piid,
                        row_number() OVER (ORDER BY value) - 1 AS index,
                        { value_sql } AS value,
                        CAST(value AS VARCHAR) AS label,
                        CAST(value AS VARCHAR) AS import_value,
                        FALSE AS pinned
                    FROM (
                        SELECT DISTINCT "{ column.iid }" AS value
                        FROM "sheet_data_{ self._id }"
                        WHERE "{ column.iid }" != { null_value } AND "{ column.iid }" IS NOT NULL
                    )
                    ORDER BY { value_sql }
                )
            """)

            self._sync_levels_from_column_values(column)
        else:
            column.clear_levels()

        if (
            column.data_type is DataType.DECIMAL
            and measure_type is MeasureType.CONTINUOUS
        ):
            column.determine_dps()

    def _column_change_data_type(self, column: DuckColumn, data_type: DataType):
        sql_type = SQL_TYPES[data_type]
        null_value = NULL_VALUES[data_type]
        prev_null = NULL_VALUES[column.data_type]

        self._execute(f"""
            BEGIN TRANSACTION
            ;
            ALTER TABLE "sheet_data_{ self._id }"
            RENAME COLUMN "{ column.iid }" TO temp
            ;
            ALTER TABLE "sheet_data_{ self._id }"
            ADD COLUMN "{ column.iid }" { sql_type } DEFAULT { null_value }
        """)

        select = f"""
            SELECT temp AS value, index
            FROM "sheet_data_{ self._id }"
        """

        select = f"""
            -- 1. convert missings to NULL
            SELECT
                nullif(value, { prev_null }) AS value,
                index
            FROM ({ select })
        """

        if data_type is DataType.TEXT and column.data_type is DataType.DECIMAL:
            select = f"""
                -- 2. perform the cast
                SELECT
                    printf('%.{ column.dps }f', value) AS value,
                    index
                FROM ({ select })
            """
        else:
            select = f"""
                -- 2. perform the cast
                SELECT
                    TRY_CAST(value AS { sql_type }) AS value,
                    index
                FROM ({ select })
            """

        select = f"""
            -- 3. convert NULLs back to missings
            SELECT
                ifnull(value, { null_value }) AS value,
                index
            FROM ({ select })
        """

        self._execute(f"""
            UPDATE "sheet_data_{ self._id }" AS main
            SET "{ column.iid }" = new.value
            FROM ({ select }) AS new
            WHERE main.index = new.index
            ;
            ALTER TABLE "sheet_data_{ self._id }" DROP COLUMN temp
            ;
            COMMIT
        """)

        self._execute(
            f"""
            UPDATE "sheet_columns_{ self._id }"
            SET data_type = { data_type.value }
            WHERE iid = $iid
        """,
            {"iid": column.iid},
        )

        column.notify_attribute_changed("data_type", data_type.value)
        column.determine_dps()

    def column_change(
        self,
        column: DuckColumn,
        *,
        data_type: DataType | None = None,
        measure_type: MeasureType | None = None,
        levels: Sequence[Level] | None = None,
    ) -> None:
        """change a column's data type and/or measure type"""

        if data_type is None or data_type == column.data_type:
            if (
                measure_type is MeasureType.CONTINUOUS
                and column.data_type is not DataType.INTEGER
            ):
                data_type = DataType.DECIMAL
            elif (
                measure_type is not MeasureType.CONTINUOUS
                and column.data_type is DataType.DECIMAL
            ):
                data_type = DataType.TEXT
            else:
                data_type = column.data_type

        if measure_type is None:
            measure_type = column.measure_type

        if data_type is DataType.DECIMAL:
            measure_type = MeasureType.CONTINUOUS
        elif data_type is DataType.TEXT and measure_type is MeasureType.CONTINUOUS:
            measure_type = MeasureType.NOMINAL

        if data_type != column.data_type:
            self._column_change_data_type(column, data_type)
            self._column_change_measure_type(column, measure_type)
        elif measure_type != column.measure_type:
            self._column_change_measure_type(column, measure_type)

        if levels is not None:
            self.column_set_levels(column, levels)
            self._sync_levels_from_column_values(column)

        self.column_trim_unused_levels(column)
        self._cache.clear()

    def column_insert_level(
        self,
        column: DuckColumn,
        value: int,
        label: str | None = None,
        import_value: str | None = None,
        pinned: bool = False,
        *,
        append=False,
    ) -> None:
        """insert a new level to the column"""
        if not column.has_levels:
            raise ValueError
        if label is None:
            label = str(value)
        if import_value is None:
            import_value = label

        index = column.level_count

        if not append:
            ascending = True
            descending = True

            # establish if the levels are asending or descending
            for i in range(0, column.level_count - 1):
                level1 = column.dlevels[i]
                level2 = column.dlevels[i + 1]
                if column.data_type is DataType.INTEGER:
                    if level1.value > level2.value:
                        ascending = False
                    else:
                        descending = False
                else:
                    if level1.import_value > level2.import_value:
                        ascending = False
                    else:
                        descending = False

            if ascending and descending:
                # if both, then pick one
                descending = False

            if ascending or descending:
                index = 0
                if column.data_type is DataType.INTEGER:
                    for level in column.dlevels:
                        if (ascending and value < level.value) or (
                            descending and value > level.value
                        ):
                            break
                        else:
                            index += 1
                else:
                    for level in column.dlevels:
                        if (ascending and import_value < level.import_value) or (
                            descending and import_value > level.import_value
                        ):
                            break
                        else:
                            index += 1
                    value = index  # important!

        self._execute("BEGIN TRANSACTION")

        if index < column.level_count:
            if column.data_type is DataType.INTEGER:
                set_sql = "index = index + 1"
            else:
                set_sql = "index = index + 1, value = index + 1"
            self._execute(
                f"""
                UPDATE "sheet_levels_{ self._id }"
                SET { set_sql }
                WHERE index >= ? AND piid = ?
                """,
                (index, column.iid),
            )

        self._execute(
            f"""
            INSERT INTO "sheet_levels_{ self._id }" BY NAME (
                SELECT
                    { column.iid } AS piid,
                    $value AS value,
                    $label AS label,
                    $import_value AS import_value,
                    $pinned AS pinned,
                    $index AS index
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

        if column.data_type is DataType.TEXT:
            for level in levels:
                if level.value >= index:
                    level.value += 1

        new_level = DuckLevel(value, label, import_value, pinned)
        levels.insert(index, new_level)
        column.notify_levels_changed(levels)

    def column_append_level(
        self, column, value, label, import_value=None, pinned=False
    ) -> None:
        """append a level to the column"""
        self.column_insert_level(
            column, value, label, import_value, pinned, append=True
        )

    def column_determine_dps(self, column) -> None:
        """determine decimal places"""
        if column.data_type is DataType.DECIMAL:
            dps_ifs = map(
                lambda i: f'IF(@(round("{ column.iid }", { i }) - "{ column.iid }") < 10e-9, { i }, 8)',
                range(8),
            )
            dps_ifs_joined = ", ".join(dps_ifs)

            dps_sql = f"least({ dps_ifs_joined })"
            dps_sql = f'IF(isnan("{ column.iid }"), 0, { dps_sql })'
            dps_sql = f"max({ dps_sql })"
            dps_sql = f"ifnull({ dps_sql }, 0)"

            query = self._execute(f"""
                SELECT { dps_sql }
                FROM "sheet_data_{ self._id }"
            """)
            (dps,) = query.fetchall()[0]
        else:
            dps = 0
        self.column_set_attribute(column, "dps", dps)

    def column_clear(self, column: DuckColumn) -> None:
        """clear a column of all data"""
        missing_value = NULL_VALUES[column.data_type]

        self._execute(f"""
            BEGIN TRANSACTION
            ;
            UPDATE "sheet_data_{ self._id }"
            SET "{ column.iid }" = { missing_value }
            ;
            DELETE FROM "sheet_levels_{ self._id }"
            WHERE piid = { column.iid }
            ;
            COMMIT
        """)
        if column.has_levels:
            column.notify_levels_changed([])
        self._cache.clear()

    def column_set_levels(
        self, column: DuckColumn, levels: Iterable[Level], trim: bool = False
    ) -> None:
        """set a columns levels"""
        if not column.has_levels:
            raise ValueError

        counts: dict[int | str, tuple[int, int]] = {}
        for dlevel in column.dlevels:
            level_value = (
                dlevel.value
                if column.data_type is DataType.INTEGER
                else dlevel.import_value
            )
            counts[level_value] = (dlevel.count, dlevel.count_ex_filtered)

        new_dlevels = []
        for level in levels:
            value, label, import_value, pinned = level
            level_value = (
                value if column.data_type is DataType.INTEGER else import_value
            )
            count, count_ex_filtered = counts.get(value, (0, 0))
            dlevel = DuckLevel(
                value, label, import_value, pinned, count, count_ex_filtered
            )
            new_dlevels.append(dlevel)

        self._write_levels_to_db(
            column, levels=new_dlevels, trim="all" if trim else None
        )

    def _sync_levels_from_column_values(self, column) -> None:
        """Constructs levels from the values in the column, and populates the counts"""

        value_name = "value"
        raw_value_name = "value"
        if column.data_type is DataType.TEXT:
            value_name = "import_value"
            raw_value_name = "index"

        query = self._execute(f"""
            SELECT
                levels.{ raw_value_name },
                label,
                import_value,
                pinned,
                ifnull(counts.count, 0) AS count,
                CASE
                    WHEN counts.count_ex_filtered IS NULL THEN 0
                    ELSE counts.count_ex_filtered
                END AS count_ex_filtered
            FROM
                (
                    SELECT
                        { value_name } AS value,
                        label,
                        import_value,
                        pinned,
                        index
                    FROM "sheet_levels_{ self._id }"
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
                        SELECT
                            "{ column.iid }" AS value,
                            count("{ column.iid }") AS count
                        FROM "sheet_data_{ self._id }"
                        GROUP BY value
                    ) unfiltered
                    LEFT JOIN
                    (
                        SELECT
                            "{ column.iid }" AS value,
                            count("{ column.iid }") AS count
                        FROM "sheet_data_{ self._id }"
                        WHERE filter = 1
                        GROUP BY value
                    ) filtered
                    ON filtered.value = unfiltered.value
                ) counts
                ON levels.value = counts.value
            ORDER BY levels.index
            """)
        results = query.fetchall()
        levels = [DuckLevel(*row) for row in results]
        self._write_levels_to_db(column, levels=levels)

    def _sync_columns_from_db(self) -> None:
        """Synchronises the _columns_by_id and _columns_by_index variables with the database.
        This should be called whenever there's a change to the number of columns."""

        fields = DuckColumn.sql_fields()
        query = self._execute(
            f"""
            SELECT { ", ".join(fields) }
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

    def _column_change_level_use_counts(
        self, column: DuckColumn, value: int | str, delta: int, delta_filtered: int
    ) -> int | None:
        """Change the level use counts, return the index if the column should be removed."""
        for index, level in enumerate(column.dlevels):
            level_value = (
                level.import_value if column.data_type is DataType.TEXT else level.value
            )
            if value == level_value:
                level.count += delta
                level.count_ex_filtered += delta_filtered
                if level.count == 0 and not level.pinned:
                    # should remove
                    return index
                else:
                    return None
        raise ValueError("No such level")
