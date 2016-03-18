from protobuf3.fields import MessageField, EnumField, StringField, BytesField, Int32Field
from protobuf3.message import Message
from enum import Enum


class Request(Message):
    pass


class AnalysisRequest(Message):

    class Perform(Enum):
        INIT = 1
        RUN = 2


class AnalysisResults(Message):

    class Status(Enum):
        INITED = 1
        RUNNING = 2
        COMPLETE = 3
        ERROR = 4
        ABORTED = 5

Request.add_field('id', Int32Field(field_number=1, optional=True))
Request.add_field('analysis', MessageField(field_number=2, optional=True, message_cls=AnalysisRequest))
AnalysisRequest.add_field('id', Int32Field(field_number=1, optional=True))
AnalysisRequest.add_field('revision', Int32Field(field_number=2, optional=True))
AnalysisRequest.add_field('name', StringField(field_number=3, optional=True))
AnalysisRequest.add_field('ns', StringField(field_number=4, optional=True))
AnalysisRequest.add_field('perform', EnumField(field_number=5, optional=True, enum_cls=AnalysisRequest.Perform))
AnalysisRequest.add_field('options', StringField(field_number=6, optional=True))
AnalysisResults.add_field('id', Int32Field(field_number=1, optional=True))
AnalysisResults.add_field('revision', Int32Field(field_number=2, optional=True))
AnalysisResults.add_field('status', EnumField(field_number=3, optional=True, enum_cls=AnalysisResults.Status))
AnalysisResults.add_field('results', BytesField(field_number=4, optional=True))
AnalysisResults.add_field('error', BytesField(field_number=5, optional=True))
