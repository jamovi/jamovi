from protobuf3.fields import StringField, MessageField, EnumField, BoolField, DoubleField, UInt32Field, Int32Field
from protobuf3.message import Message
from enum import Enum


class Request(Message):
    pass


class Response(Message):
    pass


class OpenReqParams(Message):
    pass


class OpenResParams(Message):
    pass


class DataSetEntry(Message):
    pass


class SettingsReqParams(Message):
    pass


class SettingsResParams(Message):
    pass


class SetSettingsReqParams(Message):
    pass


class SetSettingsResParams(Message):
    pass


class InfoReqParams(Message):
    pass


class InfoResParams(Message):

    class Schema(Message):

        class Field(Message):

            class MeasureType(Enum):
                MISC = 0
                NOMINAL_TEXT = 1
                NOMINAL = 2
                ORDINAL = 3
                CONTINUOUS = 4


class CellsReqParams(Message):
    pass


class CellsResParams(Message):

    class Column(Message):

        class Ints(Message):
            pass

        class Doubles(Message):
            pass

        class Strings(Message):
            pass


class AnalysisReqParams(Message):
    pass


class Status(Enum):
    COMPLETE = 1
    IN_PROGRESS = 2
    FAILED = 3

Request.add_field('id', Int32Field(field_number=1, required=True))
Request.add_field('settings', MessageField(field_number=2, optional=True, message_cls=SettingsReqParams))
Request.add_field('open', MessageField(field_number=3, optional=True, message_cls=OpenReqParams))
Request.add_field('info', MessageField(field_number=4, optional=True, message_cls=InfoReqParams))
Request.add_field('cells', MessageField(field_number=5, optional=True, message_cls=CellsReqParams))
Request.add_field('analysis', MessageField(field_number=6, optional=True, message_cls=AnalysisReqParams))
Response.add_field('id', Int32Field(field_number=1, required=True))
Response.add_field('settings', MessageField(field_number=2, optional=True, message_cls=SettingsResParams))
Response.add_field('open', MessageField(field_number=3, optional=True, message_cls=OpenResParams))
Response.add_field('info', MessageField(field_number=4, optional=True, message_cls=InfoResParams))
Response.add_field('cells', MessageField(field_number=5, optional=True, message_cls=CellsResParams))
OpenReqParams.add_field('filename', StringField(field_number=1, optional=True))
OpenResParams.add_field('status', EnumField(field_number=1, optional=True, enum_cls=Status))
OpenResParams.add_field('errorMessage', StringField(field_number=2, optional=True))
OpenResParams.add_field('progress', Int32Field(field_number=3, optional=True))
OpenResParams.add_field('progress_task', StringField(field_number=4, optional=True))
DataSetEntry.add_field('name', StringField(field_number=1, optional=True))
DataSetEntry.add_field('path', StringField(field_number=2, optional=True))
DataSetEntry.add_field('location', StringField(field_number=3, optional=True))
SettingsResParams.add_field('recents', MessageField(field_number=1, repeated=True, message_cls=DataSetEntry))
SettingsResParams.add_field('localFSRecents', MessageField(field_number=2, repeated=True, message_cls=DataSetEntry))
SetSettingsReqParams.add_field('recents', MessageField(field_number=1, repeated=True, message_cls=DataSetEntry))
SetSettingsReqParams.add_field('localFSRecents', MessageField(field_number=2, repeated=True, message_cls=DataSetEntry))
InfoResParams.Schema.Field.add_field('name', StringField(field_number=1, optional=True))
InfoResParams.Schema.Field.add_field('measureType', EnumField(field_number=2, optional=True, enum_cls=InfoResParams.Schema.Field.MeasureType))
InfoResParams.Schema.Field.add_field('width', Int32Field(field_number=3, optional=True))
InfoResParams.Schema.add_field('fields', MessageField(field_number=1, repeated=True, message_cls=InfoResParams.Schema.Field))
InfoResParams.add_field('hasDataSet', BoolField(field_number=1, optional=True))
InfoResParams.add_field('schema', MessageField(field_number=2, optional=True, message_cls=InfoResParams.Schema))
InfoResParams.add_field('rowCount', UInt32Field(field_number=3, optional=True))
InfoResParams.add_field('columnCount', UInt32Field(field_number=4, optional=True))
CellsReqParams.add_field('rowStart', UInt32Field(field_number=1, optional=True))
CellsReqParams.add_field('columnStart', UInt32Field(field_number=2, optional=True))
CellsReqParams.add_field('rowEnd', UInt32Field(field_number=3, optional=True))
CellsReqParams.add_field('columnEnd', UInt32Field(field_number=4, optional=True))
CellsResParams.Column.Ints.add_field('values', Int32Field(field_number=1, repeated=True))
CellsResParams.Column.Doubles.add_field('values', DoubleField(field_number=1, repeated=True))
CellsResParams.Column.Strings.add_field('values', StringField(field_number=1, repeated=True))
CellsResParams.Column.add_field('ints', MessageField(field_number=1, optional=True, message_cls=CellsResParams.Column.Ints))
CellsResParams.Column.add_field('doubles', MessageField(field_number=2, optional=True, message_cls=CellsResParams.Column.Doubles))
CellsResParams.Column.add_field('strings', MessageField(field_number=3, optional=True, message_cls=CellsResParams.Column.Strings))
CellsResParams.add_field('reqParams', MessageField(field_number=1, optional=True, message_cls=CellsReqParams))
CellsResParams.add_field('columns', MessageField(field_number=2, repeated=True, message_cls=CellsResParams.Column))
AnalysisReqParams.add_field('name', StringField(field_number=1, optional=True))
AnalysisReqParams.add_field('ns', StringField(field_number=2, optional=True))
