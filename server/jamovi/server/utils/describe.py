
from ..jamovi_pb2 import DataSetRR
from ..jamovi_pb2 import DataSetSchema

REMOVE_ROW = DataSetRR.RowData.RowDataAction.Value('REMOVE')
INSERT_ROW = DataSetRR.RowData.RowDataAction.Value('INSERT')

REMOVE_COLUMN = DataSetSchema.ColumnSchema.Action.Value('REMOVE')
INSERT_COLUMN = DataSetSchema.ColumnSchema.Action.Value('INSERT')
MODIFY_COLUMN = DataSetSchema.ColumnSchema.Action.Value('MODIFY')

def describe_datasetrr(request: DataSetRR):

    rows_to_remove = [ ]
    rows_to_add = [ ]
    columns_to_remove = [ ]
    columns_to_add = [ ]
    columns_to_modify = [ ]
    data_to_modify = [ ]
    data_values = [ ]

    for row_data in request.rows:
        if row_data.action == REMOVE_ROW:
            rows_to_remove.append((row_data.rowStart, row_data.rowStart + row_data.rowCount - 1))
        elif row_data.action == INSERT_ROW:
            rows_to_add.append((row_data.rowStart, row_data.rowStart + row_data.rowCount - 1))

    for column in request.schema.columns:

        if column.id == 0:
            column_desc = {'index': column.index}
        else:
            column_desc = {'id': column.id}

        if column.action == REMOVE_COLUMN:
            columns_to_remove.append(column_desc)
        elif column.action == INSERT_COLUMN:
            columns_to_add.append(column_desc)
        elif column.action == MODIFY_COLUMN:
            columns_to_modify.append(column_desc)

    if request.incData:
        for block in request.data:
            data_to_modify.append((block.rowStart,
                block.columnStart,
                block.rowStart + block.rowCount - 1,
                block.columnStart + block.columnCount - 1))
            if block.rowCount == 1 and block.columnCount == 1:
                if block.incCBData:
                    data_values.append({'paste': True})
                elif block.values:
                    cell = block.values[0]
                    value_type = cell.WhichOneof('type')
                    value = getattr(cell, value_type)
                    data_values.append({'value': value})

    summary = { }
    if rows_to_remove:
        summary['rows_to_remove'] = rows_to_remove
    if rows_to_add:
        summary['rows_to_add'] = rows_to_add
    if columns_to_remove:
        summary['columns_to_remove'] = columns_to_remove
    if columns_to_add:
        summary['columns_to_add'] = columns_to_add
    if columns_to_modify:
        summary['columns_to_modify'] = columns_to_modify
    if data_to_modify:
        summary['data_to_modify'] = data_to_modify
    if data_values:
        summary['data_values'] = data_values

    return str(summary)
