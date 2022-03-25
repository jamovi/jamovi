
from .jamovi_pb2 import Notification as NotificationPB
from .jamovi_pb2 import ValueType

INT = ValueType.Value('INT')
DOUBLE = ValueType.Value('DOUBLE')
STRING = ValueType.Value('STRING')
BOOL = ValueType.Value('BOOL')


SESSION_SHUTDOWN_IDLE = 1
SESSION_SHUTDOWN_MAINTENANCE = 2


class Notification:

    TRANSIENT = 0
    DISMISS = 1
    INDEFINITE = 2

    def __init__(self, id, status=0, values={}):
        self.id = id
        self.status = status
        self.values = values

    def dismiss(self):
        self.status = Notification.DISMISS
        return self

    def as_pb(self):
        pb = NotificationPB()
        pb.id = self.id
        pb.status = self.status

        for name, value in self.values.items():
            if isinstance(value, int):
                v_pb = pb.values.add()
                v_pb.name = name
                v_pb.valueType = INT
                v_pb.i = value
            elif isinstance(value, float):
                v_pb = pb.values.add()
                v_pb.name = name
                v_pb.valueType = DOUBLE
                v_pb.d = value
            elif isinstance(value, string):
                v_pb = pb.values.add()
                v_pb.name = name
                v_pb.valueType = STRING
                v_pb.s = value
            elif isinstance(value, bool):
                v_pb = pb.values.add()
                v_pb.name = name
                v_pb.valueType = BOOL
                v_pb.b = value

        return pb


class SessionShutdownNotification(Notification):
    def __init__(self, id, shutdown_in):
        values = { }
        if shutdown_in is not None:
            values = { 'shutdownIn': shutdown_in }
        super().__init__(id, Notification.INDEFINITE, values)


class SessionShutdownIdleNotification(SessionShutdownNotification):
    def __init__(self, shutdown_in=None):
        super().__init__(SESSION_SHUTDOWN_IDLE, shutdown_in)


class SessionShutdownMaintenanceNotification(SessionShutdownNotification):
    def __init__(self, shutdown_in=None):
        super().__init__(SESSION_SHUTDOWN_MAINTENANCE, shutdown_in)
