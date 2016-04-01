
from tornado.websocket import WebSocketHandler

import silkycoms


class ClientConnection(WebSocketHandler):

    number_of_connections = 0

    def initialize(self, instance):
        self._instance = instance
        self._transactions = { }
        self._listeners = [ ]

        self._instance.set_coms(self)

    def check_origin(self, origin):
        return True

    def open(self):

        ClientConnection.number_of_connections += 1

        print('websocket opened')
        self.set_nodelay(True)

    def on_close(self):

        ClientConnection.number_of_connections -= 1

        print('websocket closed')

    def on_message(self, message):
        m = silkycoms.ComsMessage.create_from_bytes(message)
        clas = getattr(silkycoms, m.payloadType)
        request = clas.create_from_bytes(m.payload)
        self._transactions[m.id] = request
        self._instance.on_request(request)

    def send(self, message=None, response_to=None, complete=True):

        if message is None and response_to is None:
            return

        m = silkycoms.ComsMessage()

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

