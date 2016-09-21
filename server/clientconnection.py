#
# Copyright (C) 2016 Jonathon Love
#

from tornado.websocket import WebSocketHandler

from . import silkycoms_pb2 as silkycoms
from .instance import Instance


class ClientConnection(WebSocketHandler):

    number_of_connections = 0

    def initialize(self, session_path):

        self._session_path = session_path
        self._transactions = { }
        self._close_listeners = [ ]

    def check_origin(self, origin):
        return True

    def open(self):
        ClientConnection.number_of_connections += 1
        self.set_nodelay(True)

    def on_close(self):
        ClientConnection.number_of_connections -= 1
        for listener in self._close_listeners:
            listener()

    def on_message(self, m_bytes):
        message = silkycoms.ComsMessage()
        message.ParseFromString(m_bytes)
        clas = getattr(silkycoms, message.payloadType)
        request = clas()
        request.ParseFromString(message.payload)
        self._transactions[message.id] = request

        if type(request) == silkycoms.InstanceRequest:
            if message.HasField('instanceId'):
                instance = Instance.instances[message.instanceId]
            else:
                instance = Instance(session_path=self._session_path)  # create new
            instance.set_coms(self)
            response = silkycoms.InstanceResponse()
            self.send(response, instance.id, request)
        else:
            instance = Instance.instances[message.instanceId]
            instance.on_request(request)

    def send(self, message=None, instance_id=None, response_to=None, complete=True):

        if message is None and response_to is None:
            return

        m = silkycoms.ComsMessage()

        if instance_id is not None:
            m.instanceId = instance_id

        if response_to is not None:
            for key, value in self._transactions.items():
                if value is response_to:
                    m.id = key
                    if complete:
                        del self._transactions[key]
                    break
        else:
            m.id = 0

        if message is not None:
            m.payload = message.SerializeToString()
            m.payloadType = message.__class__.__name__

        if complete:
            m.status = silkycoms.Status.Value('COMPLETE')
        else:
            m.status = silkycoms.Status.Value('IN_PROGRESS')

        self.write_message(m.SerializeToString(), binary=True)

    def send_error(self, message=None, cause=None, instance_id=None, response_to=None):

        if message is None and response_to is None:
            return

        m = silkycoms.ComsMessage()

        if instance_id is not None:
            m.instanceId = instance_id

        if response_to is not None:
            for key, value in self._transactions.items():
                if value is response_to:
                    m.id = key
                    del self._transactions[key]
                    break
        else:
            m.id = 0

        if message is not None:
            m.error.message = message

        if cause is not None:
            m.error.cause = cause

        m.status = silkycoms.Status.Value('ERROR')

        self.write_message(m.SerializeToString(), binary=True)

    def add_close_listener(self, listener):
        self._close_listeners.append(listener)

    def remove_close_listener(self, listener):
        self._close_listeners.remove(listener)

    def discard(self, message):
        for key, value in self._transactions.items():
            if value is message:
                del self._transactions[key]
                break
