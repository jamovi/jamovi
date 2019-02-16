
import zipfile
from zipfile import ZipFile
import io
import json
from tempfile import NamedTemporaryFile
from tempfile import TemporaryDirectory
import struct
import os
import os.path
import re

from jamovi.core import ColumnType
from jamovi.core import DataType
from jamovi.core import MeasureType
from jamovi.server.appinfo import app_info


def write(data, path, prog_cb, html=None):

    with ZipFile(path, 'w', zipfile.ZIP_DEFLATED) as zip:

        content = io.StringIO()
        content.write('Manifest-Version: 1.0\n')
        content.write('Data-Archive-Version: 1.0.2\n')
        content.write('jamovi-Archive-Version: 7.0\n')
        content.write('Created-By: ' + str(app_info) + '\n')
        zip.writestr('META-INF/MANIFEST.MF', bytes(content.getvalue(), 'utf-8'), zipfile.ZIP_DEFLATED)

        if html is not None:
            zip.writestr('index.html', html)

        content = None
        string_table_required = False

        transforms = [ ]
        for transform in data.transforms:
            transform_field = { }
            transform_field['name'] = transform.name
            transform_field['id'] = transform.id
            transform_field['suffix'] = transform.suffix

            transform_field['formula'] = transform.formula
            transform_field['formulaMessage'] = transform.formula_message
            transform_field['measureType'] = MeasureType.stringify(transform.measure_type)

            transform_field['description'] = transform.description

            transforms.append(transform_field)

        fields = [ ]
        for column in data:
            if column.is_virtual is True:
                continue

            field = { }
            field['name'] = column.name
            field['id'] = column.id
            field['columnType'] = ColumnType.stringify(column.column_type)
            field['dataType'] = DataType.stringify(column.data_type)
            field['measureType'] = MeasureType.stringify(column.measure_type)
            field['formula'] = column.formula
            field['formulaMessage'] = column.formula_message
            field['parentId'] = column.parent_id
            if column.data_type == DataType.DECIMAL:
                field['type'] = 'number'
            elif column.data_type == DataType.TEXT and column.measure_type == MeasureType.ID:
                field['type'] = 'string'
                string_table_required = True
            else:
                field['type'] = 'integer'
            field['importName'] = column.import_name
            field['description'] = column.description
            field['transform'] = column.transform
            field['edits'] = column.cell_tracker.edited_cell_ranges

            if column.is_filter:
                field['filterNo'] = column.filter_no
                field['hidden'] = column.hidden
                field['active'] = column.active
            else:
                if column.has_levels:
                    field['trimLevels'] = column.trim_levels

            fields.append(field)

        metadata = { }

        metadataset = { }
        metadataset['rowCount'] = data.row_count
        metadataset['columnCount'] = data.column_count
        metadataset['removedRows'] = data.row_tracker.removed_row_ranges
        metadataset['addedRows'] = data.row_tracker.added_row_ranges
        metadataset['fields'] = fields
        metadataset['transforms'] = transforms

        # if data.import_path is not '':
        #     metadataset['importPath'] = data.import_path
        # if data.embedded_path is not '':
        #     metadataset['embeddedPath'] = data.embedded_path
        # if data.embedded_name is not '':
        #     metadataset['embeddedName'] = data.embedded_name

        metadata['dataSet'] = metadataset

        zip.writestr('metadata.json', json.dumps(metadata), zipfile.ZIP_DEFLATED)

        metadata = None

        xdata = { }
        for column in data:
            if column.is_virtual is True:
                continue
            if column.has_levels:
                xdata[column.name] = { 'labels': column.levels }
        zip.writestr('xdata.json', json.dumps(xdata), zipfile.ZIP_DEFLATED)
        xdata = None

        row_count = data.row_count
        required_bytes = 0
        for column in data:
            if column.is_virtual is True:
                continue
            if column.data_type == DataType.DECIMAL:
                required_bytes += (8 * row_count)
            else:
                required_bytes += (4 * row_count)

        if string_table_required:
            cursor = 0
            string_file = NamedTemporaryFile(delete=False)

        temp_file = NamedTemporaryFile(delete=False)
        temp_file.truncate(required_bytes)

        for col_no in range(data.column_count):
            column = data[col_no]
            if column.is_virtual is True:
                continue
            if column.data_type == DataType.DECIMAL:
                for i in range(0, row_count):
                    value = column.raw(i)
                    byts = struct.pack('<d', value)
                    temp_file.write(byts)
                    if i % 100000 == 0:
                        prog_cb((col_no + i / row_count) / data.column_count)
            elif column.data_type == DataType.TEXT and column.measure_type == MeasureType.ID:
                for i in range(0, row_count):
                    value = column[i]
                    if value != '':
                        string_file.write(value.encode('utf-8'))
                        string_file.write(bytes(1))
                        n = len(value) + 1
                        byts = struct.pack('<i', cursor)
                        temp_file.write(byts)
                        cursor += n
                    else:
                        byts = struct.pack('<i', -2147483648)
                        temp_file.write(byts)
                    if i % 100000 == 0:
                        prog_cb((col_no + i / row_count) / data.column_count)
            else:
                for i in range(0, row_count):
                    value = column.raw(i)
                    byts = struct.pack('<i', value)
                    temp_file.write(byts)
                    if i % 100000 == 0:
                        prog_cb((col_no + i / row_count) / data.column_count)

        temp_file.close()
        zip.write(temp_file.name, 'data.bin')
        os.remove(temp_file.name)

        if string_table_required:
            string_file.close()
            zip.write(string_file.name, 'strings.bin')
            os.remove(string_file.name)

        resources = [ ]

        for analysis in data.analyses:
            if analysis.has_results is False:
                continue
            analysis_dir = '{:02} {}/analysis'.format(analysis.id, analysis.name)
            zip.writestr(analysis_dir, analysis.serialize(), zipfile.ZIP_DEFLATED)
            resources += analysis.resources

        for rel_path in resources:
            abs_path = os.path.join(data.instance_path, rel_path)
            zip.write(abs_path, rel_path)

        # if data.embedded_path is not '':
        #     try:
        #         path = os.path.join(data.instance_path, data.embedded_path)
        #         zip.write(path, data.embedded_path)
        #     except Exception:
        #         pass


_buffer = bytearray(512)


def _read_string_from_table(stream, pos):
    final_pos = stream.seek(pos)
    if pos != final_pos:
        return ''
    stream.readinto(_buffer)
    try:
        end = _buffer.index(bytes(1))  # find string terminator
        return _buffer[0:end].decode('utf-8', errors='ignore')
    except ValueError:
        return _buffer.decode('utf-8', errors='ignore')


def replace_single_equals(formula):
    if formula == '':
        return ''

    new_formula = []
    is_string = False
    safe = False
    safe_count = 0

    for index in range(0, len(formula)):
        char = formula[index]
        if safe_count == 0:
            safe = False

        if char == '`':
            is_string = not is_string
            safe = is_string
            safe_count = -1

        if not safe:
            if char == '!' or char == '<' or char == '>':
                safe = True
                safe_count = 2
            elif char == '=':
                if index < (len(formula) - 1) and formula[index + 1] == '=':
                    safe = True
                    safe_count = 2
                else:
                    new_formula.append(formula[:index])
                    new_formula.append('=')
                    new_formula.append(formula[index:])

        safe_count -= 1

    if len(new_formula) > 0:
        return ''.join(new_formula)

    return formula


def read(data, path, prog_cb):

    data.title = os.path.splitext(os.path.basename(path))[0]

    with ZipFile(path, 'r') as zip:
        manifest = zip.read('META-INF/MANIFEST.MF').decode('utf-8')

        regex = r'^jamovi-Archive-Version: ?([0-9]+)\.([0-9]+) ?$'
        jav   = re.search(regex, manifest, re.MULTILINE)

        if not jav:
            raise Exception('File is corrupt (no JAV)')

        jav = (int(jav.group(1)), int(jav.group(2)))
        if jav[0] > 7:
            raise Exception('A newer version of jamovi is required')

        meta_content = zip.read('metadata.json').decode('utf-8')
        metadata = json.loads(meta_content)
        meta_dataset = metadata['dataSet']

        # if 'importPath' in meta_dataset:
        #     try:
        #         import_path = meta_dataset.get('importPath')
        #         if os.path.isfile(import_path):
        #             data.import_path = import_path
        #     except Exception:
        #         pass
        #
        # if 'embeddedPath' in meta_dataset:
        #     try:
        #         embedded_path = meta_dataset.get('embeddedPath')
        #         embedded_name = meta_dataset.get('embeddedName', embedded_path)
        #         zip.extract(embedded_path, data.instance_path)
        #         data.embedded_path = embedded_path
        #         data.embedded_name = embedded_name
        #
        #         prog_cb(0.1)
        #     except Exception:
        #         pass

        if 'transforms' in meta_dataset:
            for meta_transform in meta_dataset['transforms']:
                name = meta_transform['name']
                id = meta_transform['id']
                transform = data.append_transform(name, id)
                transform.formula = meta_transform.get('formula', [''])
                if jav[0] <= 6:
                    transform.formula = list(map(replace_single_equals, transform.formula))
                transform.formula_message = meta_transform.get('formulaMessage', [''])
                measure_type_str = meta_transform.get('measureType', 'None')
                transform.measure_type = MeasureType.parse(measure_type_str)
                transform.description = meta_transform.get('description', '')
                transform.suffix = meta_transform.get('suffix', '')

        for meta_column in meta_dataset['fields']:
            name = meta_column['name']
            id = meta_column.get('id', 0)
            import_name = meta_column.get('importName', name)

            column = data.append_column(name, import_name, id)

            column_type = ColumnType.parse(meta_column.get('columnType', 'Data'))
            column.column_type = column_type

            measure_type_str = meta_column.get('measureType', 'Nominal')
            data_type_str = meta_column.get('dataType', None)

            if data_type_str is None:
                # NominalText is an old way we used to do things
                if measure_type_str == 'NominalText':
                    data_type = DataType.TEXT
                    measure_type = MeasureType.NOMINAL
                elif measure_type_str == 'Continuous':
                    data_type = DataType.DECIMAL
                    measure_type = MeasureType.CONTINUOUS
                else:
                    data_type = DataType.INTEGER
                    measure_type = MeasureType.parse(measure_type_str)
            else:
                data_type = DataType.parse(data_type_str)
                measure_type = MeasureType.parse(measure_type_str)

            column.change(data_type=data_type, measure_type=measure_type)
            formula = meta_column.get('formula', '')
            if jav[0] <= 6:
                formula = replace_single_equals(formula)
            column.formula = formula
            column.formula_message = meta_column.get('formulaMessage', '')
            column.description = meta_column.get('description', '')
            column.transform = meta_column.get('transform', 0)
            column.parent_id = meta_column.get('parentId', 0)
            column.cell_tracker.edited_cell_ranges = meta_column.get('edits', [])

            if column.is_filter:
                column.filter_no = meta_column.get('filterNo', 0)
                column.active = meta_column.get('active', True)
                column.hidden = meta_column.get('hidden', False)
            else:
                column.trim_levels = meta_column.get('trimLevels', True)

        row_count = meta_dataset['rowCount']
        data.row_tracker.removed_row_ranges = meta_dataset.get('removedRows', [])
        data.row_tracker.added_row_ranges = meta_dataset.get('addedRows', [])

        data.set_row_count(row_count)

        columns_w_bad_levels = [ ]  # do some repair work

        try:
            xdata_content = zip.read('xdata.json').decode('utf-8')
            xdata = json.loads(xdata_content)

            for column in data:
                if column.name in xdata:
                    try:
                        meta_labels = xdata[column.name]['labels']
                        if meta_labels:
                            for meta_label in meta_labels:
                                import_value = meta_label[1]
                                if len(meta_label) > 2:
                                    import_value = meta_label[2]
                                column.append_level(meta_label[0], meta_label[1],  import_value)
                        else:
                            columns_w_bad_levels.append(column.id)
                    except Exception:
                        columns_w_bad_levels.append(column.id)
        except Exception:
            columns_w_bad_levels = filter(lambda col: col.measure_type is not MeasureType.CONTINUOUS, data.dataset)
            columns_w_bad_levels = map(lambda col: col.id, columns_w_bad_levels)

        prog_cb(0.03)

        with TemporaryDirectory() as dir:
            zip.extract('data.bin', dir)
            data_path = os.path.join(dir, 'data.bin')
            data_file = open(data_path, 'rb')

            try:
                zip.extract('strings.bin', dir)
                string_table_present = True
                string_table_path = os.path.join(dir, 'strings.bin')
                string_table = open(string_table_path, 'rb')
            except Exception:
                string_table_present = False

            BUFF_SIZE = 65536
            buff = memoryview(bytearray(BUFF_SIZE))

            ncols = data.dataset.column_count
            col_no = 0

            for column in data.dataset:

                if column.data_type == DataType.DECIMAL:
                    elem_fmt = '<d'
                    elem_width = 8
                    repair_levels = False
                    transform = None
                elif column.data_type == DataType.TEXT and column.measure_type == MeasureType.ID:
                    elem_fmt = '<i'
                    elem_width = 4
                    repair_levels = False
                    if string_table_present:
                        def transform(x):
                            if x == -2147483648:
                                return ''
                            else:
                                return _read_string_from_table(string_table, x)
                    else:
                        def transform(x):
                            if x == -2147483648:
                                return ''
                            else:
                                return str(x)
                else:
                    elem_fmt = '<i'
                    elem_width = 4
                    repair_levels = column.id in columns_w_bad_levels
                    transform = None

                for row_offset in range(0, row_count, int(BUFF_SIZE / elem_width)):
                    n_bytes_to_read = min(elem_width * (row_count - row_offset), BUFF_SIZE)
                    buff_view = buff[0:n_bytes_to_read]
                    data_file.readinto(buff_view)

                    # 'if' surrounding loops, rather than an 'if' inside one loop
                    # gives a performance improvement (i expect)
                    if repair_levels:
                        i = 0
                        for values in struct.iter_unpack(elem_fmt, buff_view):
                            v = values[0]
                            if v != -2147483648:  # missing value
                                column.append_level(v, str(v))
                            column.set_value(row_offset + i, v)
                            i += 1
                    elif transform:
                        i = 0
                        for values in struct.iter_unpack(elem_fmt, buff_view):
                            value = transform(values[0])
                            column.set_value(row_offset + i, value)
                            i += 1
                    else:
                        i = 0
                        for values in struct.iter_unpack(elem_fmt, buff_view):
                            column.set_value(row_offset + i, values[0])
                            i += 1

                    prog_cb(0.1 + 0.85 * (col_no + row_offset / row_count) / ncols)

                col_no += 1

            data_file.close()
            if string_table_present:
                string_table.close()

        for column in data:
            column.determine_dps()

        is_analysis = re.compile('^[0-9][0-9]+ .+/analysis$')
        is_resource = re.compile('^[0-9][0-9]+ .+/resources/.+')

        for entry in zip.infolist():
            if is_analysis.match(entry.filename):
                zip.extract(entry, data.instance_path)
                serial = zip.read(entry.filename)
                data.analyses.create_from_serial(serial)
            elif is_resource.match(entry.filename):
                zip.extract(entry, data.instance_path)
