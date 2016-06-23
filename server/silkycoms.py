from protobuf3.message import Message
from protobuf3.fields import UInt32Field, EnumField, BoolField, MessageField, BytesField, Int32Field, StringField, DoubleField
from enum import Enum


class Error(Message):
    pass


class ComsMessage(Message):
    pass


class InstanceRequest(Message):
    pass


class InstanceResponse(Message):
    pass


class OpenRequest(Message):
    pass


class OpenProgress(Message):
    pass


class DataSetEntry(Message):
    pass


class SettingsRequest(Message):
    pass


class SettingsResponse(Message):
    pass


class InfoRequest(Message):
    pass


class InfoResponse(Message):

    class Schema(Message):

        class Field(Message):

            class MeasureType(Enum):
                MISC = 0
                NOMINAL_TEXT = 1
                NOMINAL = 2
                ORDINAL = 3
                CONTINUOUS = 4


class CellsRequest(Message):
    pass


class CellsResponse(Message):

    class Column(Message):

        class Ints(Message):
            pass

        class Doubles(Message):
            pass

        class Strings(Message):
            pass


class AnalysisRequest(Message):

    class Perform(Enum):
        INIT = 1
        RUN = 2


class AnalysisResponse(Message):
    pass


class ResultsCell(Message):

    class Other(Enum):
        MISSING = 1
        NOT_A_NUMBER = 2


class ResultsColumn(Message):
    pass


class ResultsTable(Message):
    pass


class ResultsImage(Message):
    pass


class ResultsArray(Message):
    pass


class ResultsGroup(Message):
    pass


class ResultsElement(Message):
    pass


class Status(Enum):
    COMPLETE = 1
    IN_PROGRESS = 2
    FAILED = 3


class AnalysisStatus(Enum):
    ANALYSIS_NONE = 0
    ANALYSIS_INITED = 1
    ANALYSIS_RUNNING = 2
    ANALYSIS_COMPLETE = 3
    ANALYSIS_ERROR = 4
    ANALYSIS_ABORTED = 5

Error.add_field('message', StringField(field_number=1, optional=True))
Error.add_field('code', Int32Field(field_number=2, optional=True))
ComsMessage.add_field('id', Int32Field(field_number=1, optional=True))
ComsMessage.add_field('instanceId', StringField(field_number=2, optional=True))
ComsMessage.add_field('payload', BytesField(field_number=3, optional=True))
ComsMessage.add_field('payloadType', StringField(field_number=4, optional=True))
ComsMessage.add_field('status', EnumField(field_number=5, optional=True, enum_cls=Status, default=Status.COMPLETE))
ComsMessage.add_field('error', MessageField(field_number=6, optional=True, message_cls=Error))
OpenRequest.add_field('filename', StringField(field_number=1, optional=True))
DataSetEntry.add_field('name', StringField(field_number=1, optional=True))
DataSetEntry.add_field('path', StringField(field_number=2, optional=True))
DataSetEntry.add_field('location', StringField(field_number=3, optional=True))
SettingsResponse.add_field('recents', MessageField(field_number=1, repeated=True, message_cls=DataSetEntry))
SettingsResponse.add_field('localFSRecents', MessageField(field_number=2, repeated=True, message_cls=DataSetEntry))
InfoResponse.Schema.Field.add_field('name', StringField(field_number=1, optional=True))
InfoResponse.Schema.Field.add_field('measureType', EnumField(field_number=2, optional=True, enum_cls=InfoResponse.Schema.Field.MeasureType))
InfoResponse.Schema.Field.add_field('width', Int32Field(field_number=3, optional=True))
InfoResponse.Schema.add_field('fields', MessageField(field_number=1, repeated=True, message_cls=InfoResponse.Schema.Field))
InfoResponse.add_field('hasDataSet', BoolField(field_number=1, optional=True))
InfoResponse.add_field('schema', MessageField(field_number=2, optional=True, message_cls=InfoResponse.Schema))
InfoResponse.add_field('rowCount', UInt32Field(field_number=3, optional=True))
InfoResponse.add_field('columnCount', UInt32Field(field_number=4, optional=True))
CellsRequest.add_field('rowStart', UInt32Field(field_number=1, optional=True))
CellsRequest.add_field('columnStart', UInt32Field(field_number=2, optional=True))
CellsRequest.add_field('rowEnd', UInt32Field(field_number=3, optional=True))
CellsRequest.add_field('columnEnd', UInt32Field(field_number=4, optional=True))
CellsResponse.Column.Ints.add_field('values', Int32Field(field_number=1, repeated=True))
CellsResponse.Column.Doubles.add_field('values', DoubleField(field_number=1, repeated=True))
CellsResponse.Column.Strings.add_field('values', StringField(field_number=1, repeated=True))
CellsResponse.Column.add_field('ints', MessageField(field_number=1, optional=True, message_cls=CellsResponse.Column.Ints))
CellsResponse.Column.add_field('doubles', MessageField(field_number=2, optional=True, message_cls=CellsResponse.Column.Doubles))
CellsResponse.Column.add_field('strings', MessageField(field_number=3, optional=True, message_cls=CellsResponse.Column.Strings))
CellsResponse.add_field('request', MessageField(field_number=1, optional=True, message_cls=CellsRequest))
CellsResponse.add_field('columns', MessageField(field_number=2, repeated=True, message_cls=CellsResponse.Column))
AnalysisRequest.add_field('datasetId', StringField(field_number=1, optional=True))
AnalysisRequest.add_field('analysisId', Int32Field(field_number=2, optional=True))
AnalysisRequest.add_field('name', StringField(field_number=3, optional=True))
AnalysisRequest.add_field('ns', StringField(field_number=4, optional=True))
AnalysisRequest.add_field('perform', EnumField(field_number=5, optional=True, enum_cls=AnalysisRequest.Perform))
AnalysisRequest.add_field('options', StringField(field_number=6, optional=True))
AnalysisResponse.add_field('datasetId', StringField(field_number=1, optional=True))
AnalysisResponse.add_field('analysisId', Int32Field(field_number=2, optional=True))
AnalysisResponse.add_field('options', StringField(field_number=3, optional=True))
AnalysisResponse.add_field('results', MessageField(field_number=4, optional=True, message_cls=ResultsElement))
AnalysisResponse.add_field('status', EnumField(field_number=5, optional=True, enum_cls=AnalysisStatus))
AnalysisResponse.add_field('error', MessageField(field_number=6, optional=True, message_cls=Error))
ResultsCell.add_field('i', Int32Field(field_number=1, optional=True))
ResultsCell.add_field('d', DoubleField(field_number=2, optional=True))
ResultsCell.add_field('s', StringField(field_number=3, optional=True))
ResultsCell.add_field('o', EnumField(field_number=4, optional=True, enum_cls=ResultsCell.Other))
ResultsCell.add_field('footnotes', StringField(field_number=5, repeated=True))
ResultsColumn.add_field('name', StringField(field_number=1, optional=True))
ResultsColumn.add_field('title', StringField(field_number=2, optional=True))
ResultsColumn.add_field('type', StringField(field_number=3, optional=True))
ResultsColumn.add_field('format', StringField(field_number=4, optional=True))
ResultsColumn.add_field('cells', MessageField(field_number=7, repeated=True, message_cls=ResultsCell))
ResultsTable.add_field('columns', MessageField(field_number=1, repeated=True, message_cls=ResultsColumn))
ResultsTable.add_field('rowNames', StringField(field_number=2, repeated=True))
ResultsTable.add_field('swapRowsColumns', BoolField(field_number=3, optional=True))
ResultsImage.add_field('path', StringField(field_number=1, optional=True))
ResultsImage.add_field('width', Int32Field(field_number=2, optional=True))
ResultsImage.add_field('height', Int32Field(field_number=3, optional=True))
ResultsArray.add_field('elements', MessageField(field_number=1, repeated=True, message_cls=ResultsElement))
ResultsGroup.add_field('elements', MessageField(field_number=1, repeated=True, message_cls=ResultsElement))
ResultsElement.add_field('name', StringField(field_number=1, optional=True))
ResultsElement.add_field('title', StringField(field_number=2, optional=True))
ResultsElement.add_field('status', EnumField(field_number=3, optional=True, enum_cls=AnalysisStatus, default=AnalysisStatus.ANALYSIS_RUNNING))
ResultsElement.add_field('error', MessageField(field_number=4, optional=True, message_cls=Error))
ResultsElement.add_field('table', MessageField(field_number=6, optional=True, message_cls=ResultsTable))
ResultsElement.add_field('image', MessageField(field_number=7, optional=True, message_cls=ResultsImage))
ResultsElement.add_field('group', MessageField(field_number=8, optional=True, message_cls=ResultsGroup))
ResultsElement.add_field('array', MessageField(field_number=9, optional=True, message_cls=ResultsArray))
ResultsElement.add_field('text', StringField(field_number=10, optional=True))
