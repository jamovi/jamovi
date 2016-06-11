
from tornado.websocket import WebSocketHandler

import silkycoms
from instance import Instance


class ClientConnection(WebSocketHandler):

    number_of_connections = 0

    def initialize(self, session_path):

        self._session_path = session_path
        self._transactions = { }
        self._listeners = [ ]

    def check_origin(self, origin):
        return True

    def open(self):

        ClientConnection.number_of_connections += 1

        print('websocket opened')
        self.set_nodelay(True)

    def on_close(self):

        ClientConnection.number_of_connections -= 1

        print('websocket closed')

    def on_message(self, m_bytes):
        message = silkycoms.ComsMessage.create_from_bytes(m_bytes)
        clas = getattr(silkycoms, message.payloadType)
        request = clas.create_from_bytes(message.payload)
        self._transactions[message.id] = request

        if type(request) == silkycoms.InstanceRequest:
            if 'instanceId' not in message:
                instance = Instance(session_path=self._session_path)  # create new
            else:
                instance = Instance.instances[message.instanceId]
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
            m.payload = message.encode_to_bytes()
            m.payloadType = message.__class__.__name__

        if complete:
            m.status = silkycoms.Status.COMPLETE
        else:
            m.status = silkycoms.Status.IN_PROGRESS

        self.write_message(m.encode_to_bytes(), binary=True)

    def discard(self, message):
        for key, value in self._transactions.items():
            if value is message:
                del self._transactions[key]
                break
