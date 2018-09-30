
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


def write(data, path, html=None):

    with ZipFile(path, 'w', zipfile.ZIP_DEFLATED) as zip:

        content = io.StringIO()
        content.write('Manifest-Version: 1.0\n')
        content.write('Data-Archive-Version: 1.0.2\n')
        content.write('jamovi-Archive-Version: 5.0\n')
        content.write('Created-By: ' + str(app_info) + '\n')
        zip.writestr('META-INF/MANIFEST.MF', bytes(content.getvalue(), 'utf-8'), zipfile.ZIP_DEFLATED)

        if html is not None:
            zip.writestr('index.html', html)

        content = None
        string_table_required = False

        fields = [ ]
        for column in data:
            if column.is_virtual is True:
                continue

            field = { }
            field['name'] = column.name
            field['columnType'] = ColumnType.stringify(column.column_type)
            field['dataType'] = DataType.stringify(column.data_type)
            field['measureType'] = MeasureType.stringify(column.measure_type)
            field['formula'] = column.formula
            field['formulaMessage'] = column.formula_message
            if column.data_type == DataType.DECIMAL:
                field['type'] = 'number'
            elif column.data_type == DataType.TEXT and column.measure_type == MeasureType.ID:
                field['type'] = 'string'
                string_table_required = True
            else:
                field['type'] = 'integer'
            field['importName'] = column.import_name
            field['description'] = column.description

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
        metadataset['fields'] = fields

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

        for column in data:
            if column.is_virtual is True:
                continue
            if column.data_type == DataType.DECIMAL:
                for i in range(0, row_count):
                    value = column.raw(i)
                    byts = struct.pack('<d', value)
                    temp_file.write(byts)
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
            else:
                for i in range(0, row_count):
                    value = column.raw(i)
                    byts = struct.pack('<i', value)
                    temp_file.write(byts)

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


def read(data, path, prog_cb):

    data.title = os.path.splitext(os.path.basename(path))[0]

    with ZipFile(path, 'r') as zip:
        manifest = zip.read('META-INF/MANIFEST.MF').decode('utf-8')

        regex = r'^jamovi-Archive-Version: ?([0-9]+)\.([0-9]+) ?$'
        jav   = re.search(regex, manifest, re.MULTILINE)

        if not jav:
            raise Exception('File is corrupt (no JAV)')

        jav = (int(jav.group(1)), int(jav.group(2)))
        if jav[0] > 5:
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

        for meta_column in meta_dataset['fields']:
            name = meta_column['name']
            import_name = meta_column.get('importName', name)

            column = data.append_column(name, import_name)

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

            column.formula = meta_column.get('formula', '')
            column.formula_message = meta_column.get('formulaMessage', '')
            column.description = meta_column.get('description', '')

            if column.is_filter:
                column.filter_no = meta_column.get('filterNo', 0)
                column.active = meta_column.get('active', True)
                column.hidden = meta_column.get('hidden', False)
            else:
                column.trim_levels = meta_column.get('trimLevels', True)

        row_count = meta_dataset['rowCount']

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

        prog_cb(0.3)

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

                    prog_cb(0.3 + 0.65 * (col_no + row_offset / row_count) / ncols)

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
