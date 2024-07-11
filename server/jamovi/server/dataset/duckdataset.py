
from __future__ import annotations

from typing import Iterator
from typing import Iterable
from typing import Union
from typing import TYPE_CHECKING
from typing import cast

from collections import OrderedDict

import itertools
from uuid import uuid4
from duckdb import DuckDBPyConnection

from .core import DataType
from .core import MeasureType

from .dataset import DataSet
from .duckcolumn import DuckColumn
from .datacache import DataCache


SQL_TYPES = {
    DataType.INTEGER: {
        MeasureType.CONTINUOUS: 'INTEGER',
        MeasureType.NOMINAL: 'INTEGER',
        MeasureType.ORDINAL: 'INTEGER',
    },
    DataType.DECIMAL: {
        MeasureType.CONTINUOUS: 'DOUBLE',
        MeasureType.NOMINAL: 'DOUBLE',
        MeasureType.ORDINAL: 'DOUBLE',
    },
    DataType.TEXT: {
        MeasureType.NOMINAL: 'INTEGER',
        MeasureType.ORDINAL: 'INTEGER',
        MeasureType.ID: 'VARCHAR',
    }
}

NULL_VALUES = {
    DataType.INTEGER: {
        MeasureType.CONTINUOUS: '-2147483648',
        MeasureType.NOMINAL: '-2147483648',
        MeasureType.ORDINAL: '-2147483648',
    },
    DataType.DECIMAL: {
        MeasureType.CONTINUOUS: "cast('NaN' as double)",
        MeasureType.NOMINAL: "cast('NaN' as double)",
        MeasureType.ORDINAL: "cast('NaN' as double)",
    },
    DataType.TEXT: {
        MeasureType.NOMINAL: '-2147483648',
        MeasureType.ORDINAL: '-2147483648',
        MeasureType.ID: "''",
    }
}


def batched(iterable, n):
    # batched('ABCDEFG', 3) → ABC DEF G
    if n < 1:
        raise ValueError('n must be at least one')
    iterator = iter(iterable)
    while batch := tuple(itertools.islice(iterator, n)):
        yield batch


class DuckDataSet(DataSet):

    @staticmethod
    def create(db: DuckDBPyConnection) -> DuckDataSet:
        dataset_id = str(uuid4())
        db.execute('CREATE SEQUENCE IF NOT EXISTS column_iids START WITH 1')
        db.execute(f'''
            CREATE TABLE "sheet_meta_{ dataset_id }" (
                name VARCHAR NOT NULL,
                ivalue INTEGER,
            );
            INSERT INTO "sheet_meta_{ dataset_id }" BY NAME (SELECT 'weights' AS name, 0 AS ivalue);
            ''')
        db.execute(f'''
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
            ''')
        db.execute(f'''
            CREATE TABLE "sheet_data_{ dataset_id }" (
                index INTEGER NOT NULL,
                filter BOOLEAN NOT NULL DEFAULT true,
                index_ex_filtered INTEGER,
            )''')
        db.execute(f'''
            CREATE TABLE "sheet_levels_{ dataset_id }" (
                piid INTEGER NOT NULL,
                index INTEGER NOT NULL,
                value INTEGER NOT NULL,
                label VARCHAR NOT NULL,
                import_value VARCHAR,
                pinned BOOLEAN NOT NULL,
            )
        ''')
        return DuckDataSet(dataset_id, db)

    _id: str
    _db: DuckDBPyConnection
    _columns_by_index: list[DuckColumn]
    _columns_by_iid: dict[int, DuckColumn]
    _column_count: int
    _row_count: int
    _row_count_ex_filtered: int

    _cache: DataCache
    _cache_ex_filtered: DataCache
    _cache_filter_state: OrderedDict[int, bool]

    def __init__(self, dataset_id: str, db: DuckDBPyConnection):
        self._id = dataset_id
        self._db = db
        self._columns_by_iid = { }
        self._columns_by_index = [ ]
        self._column_count = 0
        self._row_count = 0
        self._row_count_ex_filtered = 0
        self._cache = DataCache(self.get_values)

    def _execute(self, query: object, args: object=None, multiple_parameter_sets=False):
        #print(query)
        #if args:
        #    print(args)
        return self._db.execute(query, args, multiple_parameter_sets)

    def __getitem__(self, index_or_name: Union[str, int]) -> DuckColumn:
        if isinstance(index_or_name, int):
            return self._columns_by_index[index_or_name]
        else:
            for column in self._columns_by_index:
                if column.name == index_or_name:
                    return column
        raise KeyError

    def __iter__(self) -> Iterator[DuckColumn]:
        for column in self._columns_by_index:
            yield column

    def set_value(self, row: int, column: int, value, initing=False):
        col = self._columns_by_index[column]

        if isinstance(value, str) and col.data_type is DataType.TEXT and col.has_levels:
            try:
                raw = col.get_value_for_label(value)
            except KeyError:
                raw = self.column_add_level(col, value)
            value = raw

        self._execute(f'''
            UPDATE "sheet_data_{ self._id }"
            SET "{ col.iid }" = (SELECT $value)
            WHERE index = $index
            ''',
            { 'value': value, 'index': row }
        )
        self._cache.clear()

    def get_value(self, row: int, column: int | DuckColumn):
        column = column if isinstance(column, int) else column.index
        return self._cache.get_value(row, 2 + column)

    def is_row_filtered(self, index: int) -> bool:
        return not self._cache.get_value(index, 1)

    def get_index_ex_filtered(self, index: int) -> int:
        # TODO
        return index

    def get_indices_ex_filtered(self, row_start: int, row_count: int) -> Iterable[int]:
        return list(map(self.get_index_ex_filtered, range(row_start, row_start + row_count)))

    def column_set_attribute(self, column: DuckColumn, name: str, value):

        if name == 'data_type' or name == 'measure_type':
            data_type = DataType(value) if name == 'data_type' else column.data_type
            measure_type = MeasureType(value) if name == 'measure_type' else column.measure_type

            sql_type = SQL_TYPES[data_type][measure_type]
            null_value = NULL_VALUES[data_type][measure_type]

            self._execute(f'''
                ALTER TABLE "sheet_data_{ self._id }"
                DROP COLUMN "{ column.iid }";

                ALTER TABLE "sheet_data_{ self._id }"
                ADD COLUMN "{ column.iid }" { sql_type } DEFAULT { null_value };
                '''
            )

        self._execute(f'''
            UPDATE "sheet_columns_{ self._id }"
            SET { name } = (SELECT $value)
            WHERE iid = $iid
            ''',
            { 'value': value, 'iid': column.iid }
        )
        column.notify_attribute_changed(name, value)

    def get_values_ex_filtered(self, row_start: int, column_start: int, row_end: int, column_end: int) -> tuple[tuple]:
        return self._get_values(row_start, column_start, row_end, column_end, 'index_ex_filtered')

    def get_values(self, row_start: int, column_start: int, row_end: int, column_end: int) -> tuple[tuple]:
        values = self._get_values(row_start, column_start, row_end, column_end, 'index')
        print(values)
        return values

    def _get_values(self, row_start: int, column_start: int, row_end: int, column_end: int, index_name: str) -> tuple[tuple]:

        column_end = min(column_end, self._column_count - 1)

        queries = [ f'''
            SELECT { index_name }, filter FROM "sheet_data_{ self._id }"
            WHERE { index_name } >= { row_start } AND { index_name } <= { row_end }
            ORDER BY { index_name }
            ''',
        ]

        for column_no in range(column_start, column_end+1):
            column = self._columns_by_index[column_no]
            if column.data_type is DataType.TEXT and column.has_levels:
                queries.append(f'''
                    SELECT levels.label
                    FROM "sheet_levels_{ self._id }" levels
                    LEFT JOIN "sheet_data_{ self._id }" data ON levels.value == data."{ column.iid }"
                    WHERE data.{ index_name } >= { row_start } AND data.{ index_name } <= { row_end } AND levels.piid = { column.iid }
                    ORDER BY data.{ index_name }
                ''')
            else:
                queries.append(f'''
                    SELECT "{ column.iid }"
                    FROM "sheet_data_{ self._id }" data
                    WHERE data.{ index_name } >= { row_start } AND data.{ index_name } <= { row_end }
                    ORDER BY data.{ index_name }
                ''')

        sql = f'''SELECT * FROM ({ ') POSITIONAL JOIN ('.join(queries) })'''
        query = self._execute(sql)
        return cast(tuple[tuple], query.fetchall())

    def append_column(self, name: str, import_name: str='') -> DuckColumn:
        return self.insert_column(self.column_count, name, import_name)

    def insert_column(self, index: int, name: str, import_name: str='') -> DuckColumn:
        self._execute('BEGIN TRANSACTION')
        self._execute(f'UPDATE "sheet_columns_{ self._id }" SET index = index + 1 WHERE index >= $index', { 'index': index })
        query = self._execute(f'INSERT INTO "sheet_columns_{ self._id }" BY NAME (SELECT $index AS index, $name AS name, $import_name AS import_name) RETURNING iid', { 'index': index, 'name': name, 'import_name': import_name })
        result = query.fetchall()
        first = next(iter(result))
        (iid,) = first
        self._execute(f'ALTER TABLE "sheet_data_{ self._id }" ADD COLUMN "{ iid }" INTEGER DEFAULT -2147483648')
        self._execute('COMMIT')

        self._update_column_index()
        return self._columns_by_index[index]

    def column_change(self, column: DuckColumn, *, data_type: DataType=DataType.NONE, measure_type: MeasureType=MeasureType.NONE):

        if data_type is DataType.NONE:
            data_type = column.data_type
        if measure_type is MeasureType.NONE:
            measure_type = column.measure_type

        sql_type = SQL_TYPES[data_type][measure_type]
        null_value = NULL_VALUES[data_type][measure_type]

        self._execute(f'''
            BEGIN TRANSACTION;

            ALTER TABLE "sheet_data_{ self._id }"
            RENAME COLUMN "{ column.iid }" TO temp;

            ALTER TABLE "sheet_data_{ self._id }"
            ADD COLUMN "{ column.iid }" { sql_type } DEFAULT { null_value };
        ''')

        self._execute(f'''
            UPDATE "sheet_data_{ self._id }" AS main
            SET "{ column.iid }" = new.value
            FROM (
                SELECT CASE WHEN value IS NULL THEN { null_value } ELSE value END AS value, index FROM (
                    SELECT TRY_CAST(temp AS { sql_type }) AS value, index FROM "sheet_data_{ self._id }"
                )
            ) AS new
            WHERE main.index = new.index;
        ''')

        self._execute(f'''
            UPDATE "sheet_columns_{ self._id }"
            SET data_type = { data_type.value }, measure_type = { measure_type.value }
            WHERE iid = $iid
            ''',
            { 'iid': column.iid }
        )

        column.notify_attribute_changed('data_type', data_type.value)
        column.notify_attribute_changed('measure_type', measure_type.value)

        self._execute(f'''
            ALTER TABLE "sheet_data_{ self._id }" DROP COLUMN temp;
            COMMIT;
            '''
        )

    def column_add_level(self, column, value):
        if not column.has_levels:
            raise ValueError
        if column.data_type is DataType.TEXT:
            assert isinstance(value, str)
            raw = column.level_count
            self.column_append_level(column, raw, value, value, False)
            return raw
        else:
            # TODO
            raise NotImplementedError

    def column_append_level(self, column, raw, label, import_value=None, pinned=False):
        self._execute(f'''
            INSERT INTO "sheet_levels_{ self._id }" BY NAME (
                SELECT { column.iid } AS piid, $value AS value, $label AS label, $import_value AS import_value, $pinned AS pinned,
                    (SELECT count(*) FROM "sheet_levels_{ self._id }") AS index)
            ''',
            { 'value': raw, 'label': label, 'import_value': import_value, 'pinned': pinned }
        )
        self._column_refresh_levels(column)

    def _column_refresh_levels(self, column):
        query = self._execute(f'''
            SELECT index, value, label, import_value, pinned FROM "sheet_levels_{ self._id }"
            WHERE piid == { column.iid }
            ORDER BY index
            ''')
        levels = [ ]
        if column.data_type is DataType.TEXT:
            for index, _, label, import_value, pinned in query.fetchall():
                if import_value is None:
                    import_value = label
                levels.append((index, label, import_value, pinned))
        else:
            for _, value, label, import_value, pinned in query.fetchall():
                if import_value is None:
                    import_value = label
                levels.append((value, label, import_value, pinned))
        column.notify_levels_changed(levels)

    def _update_column_index(self):

        fields = DuckColumn.sql_fields()
        query = self._execute(f'''
            SELECT { ', '.join(fields) }
            FROM "sheet_columns_{ self._id }"
            ORDER BY index
            ''',
        )

        columns_by_iid = { }
        columns_by_index = [ ]

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
        self._execute(f'''
            BEGIN TRANSACTION ;

            DELETE FROM "sheet_columns_{ self._id }"
            WHERE index >= { col_start } AND index <= { col_end } ;

            UPDATE "sheet_columns_{ self._id }"
            SET index = index - { n }
            WHERE index >= { col_start } ;

            COMMIT ;
            ''',
        )

    @property
    def column_count(self) -> int:
        return self._column_count

    def set_row_count(self, count: int) -> None:
        row_count = self.row_count
        if count > row_count:
            indices = range(self.row_count, count)

            # # slow
            # self._executemany(f'''INSERT INTO "sheet_data_{ self._id }" DEFAULT VALUES''', list(itertools.repeat(tuple(), 15000)))

            # # slow
            # sql = f'''INSERT INTO "sheet_data_{ self._id }" VALUES { ','.join(itertools.repeat('(?)', 1000)) }'''
            # print(sql)
            # for batch in batched(indices, 1000):
            #     self._execute(sql, batch)

            for batch in batched(indices, 5000):
                bracketed = map(lambda x: f'({ x })', batch)
                joined = ','.join(bracketed)
                sql = f'''INSERT INTO "sheet_data_{ self._id }" (index) VALUES { joined }'''
                self._execute(sql)

        elif count < row_count:
            self._execute(f'''
                DELETE FROM "sheet_data_{ self._id }"
                WHERE index >= { count }
            ''')
        self._row_count = count

    def insert_rows(self, row_start: int, row_end: int) -> None:
        n = row_end - row_start + 1
        self._db.sql('BEGIN TRANSACTION')
        self._db.sql(f'''
            UPDATE "sheet_data_{ self._id }"
            SET index = index + { n } WHERE index >= { row_start };
            ''')
        indices = range(row_start, row_end + 1)
        for batch in batched(indices, 1000):
            bracketed = map(lambda x: f'({ x })', batch)
            joined = ','.join(bracketed)
            self._execute(f'''INSERT INTO "sheet_data_{ self._id }" VALUES { joined }''')
        self._db.sql('COMMIT')
        self._row_count += n

    def delete_rows(self, row_start: int, row_end: int) -> None:
        n = row_end - row_start + 1
        self._execute(f'''
            BEGIN TRANSACTION ;

            DELETE FROM "sheet_data_{ self._id }"
            WHERE index >= { row_start } AND index <= { row_end } ;

            UPDATE "sheet_data_{ self._id }"
            SET index = index - { n }
            WHERE index >= { row_end } ;

            COMMIT ;
            '''
        )
        self._row_count -= n

    @property
    def row_count(self) -> int:
        return self._row_count

    @property
    def row_count_ex_filtered(self) -> int:
        # TODO
        return self.row_count

    @property
    def weights(self) -> int:
        result = self._execute(f'''
            SELECT ivalue
            FROM "sheet_meta_{ self._id }"
            WHERE name = 'weights'
            '''
        ).fetchall()
        (w,) = next(iter(result))
        return w

    def set_weights(self, weights_id: int) -> None:
        self._execute(f'''
            UPDATE "sheet_meta_{ self._id }"
            SET ivalue = (SELECT ?)
            WHERE name = 'weights'
            ''',
            (weights_id,)
        )

    def refresh_filter_state(self) -> None:
        pass
        #self._row_count_ex_filtered = self.row_count
