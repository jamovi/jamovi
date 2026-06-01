#
# Copyright (C) 2016 Jonathon Love
#

from .session import NoSuchInstanceException

import aiohttp
from aiohttp import web

from . import jamovi_pb2 as coms
from .jamovi_pb2 import ComsMessage
from .jamovi_pb2 import Status as MessageStatus
from .jamovi_pb2 import InstanceRequest
from .jamovi_pb2 import InstanceResponse

from jamovi.server.utils import conf

from asyncio import create_task
import logging

log = logging.getLogger(__name__)


class ClientConnection:

    number_of_connections = 0

    def __init__(self, ws: web.WebSocketResponse, session, instance_id: str | None = None):
        self._ws = ws
        self._session = session
        self._transactions = {}
        self._close_listeners = []
        self._instance_id = instance_id

    async def on_message_async(self, m_bytes: bytes):
        try:
            message = ComsMessage()
            message.ParseFromString(m_bytes)
            if not message.payloadType:
                return
            clas = getattr(coms, message.payloadType)
            request = clas()
            request.ParseFromString(message.payload)
            self._transactions[message.id] = request

            if isinstance(request, InstanceRequest):
                if message.instanceId == '':
                    instance = self._session.create()
                elif message.instanceId not in self._session:
                    raise NoSuchInstanceException()
                else:
                    instance = self._session[message.instanceId]
                instance.set_coms(self)
                response = InstanceResponse()
                response.instanceId = instance.id
                self.send(response, instance.id, request)
            else:
                instance = self._session[message.instanceId]
                instance.set_coms(self)
                await instance.on_request(request)
        except NoSuchInstanceException:
            self.send_error(
                message='No such instance',
                instance_id=message.instanceId,
                response_to=request)
        except Exception as e:
            log.exception(e)

    def send(self, message=None, instance_id=None, response_to=None,
             complete=True, progress=(0, 0), status=None):

        if message is None and response_to is None:
            return

        m = ComsMessage()

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

        if status is not None:
            m.error.message, m.error.cause = status

        if complete:
            m.status = MessageStatus.Value('COMPLETE')
        else:
            m.status = MessageStatus.Value('IN_PROGRESS')

        m.progress = int(progress[0])
        m.progressTotal = int(progress[1])

        create_task(self._ws.send_bytes(m.SerializeToString()))

    def send_error(self, message=None, cause=None, instance_id=None, response_to=None):

        m = ComsMessage()

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

        m.status = MessageStatus.Value('ERROR')

        create_task(self._ws.send_bytes(m.SerializeToString()))

    def add_close_listener(self, listener):
        self._close_listeners.append(listener)

    def remove_close_listener(self, listener):
        self._close_listeners.remove(listener)

    def discard(self, message):
        for key, value in self._transactions.items():
            if value is message:
                del self._transactions[key]
                break

    def on_close(self, clean: bool):
        log.debug('Websocket closed (clean=%s)', clean)
        ClientConnection.number_of_connections -= 1
        for listener in self._close_listeners:
            # clean=False when the connection drops uncleanly (e.g. computer sleep);
            # callers use this to decide whether to garbage-collect the instance.
            listener(clean)


async def client_connection_handler(request: web.Request, session) -> web.WebSocketResponse:
    instance_id = request.match_info['instance_id']

    key_required = conf.get('access_key', '')
    if key_required:
        key_provided = request.cookies.get('access_key')
        if key_provided != key_required:
            raise web.HTTPUnauthorized()

    ws = web.WebSocketResponse()
    await ws.prepare(request)

    log.debug('Websocket opened')
    ClientConnection.number_of_connections += 1

    conn = ClientConnection(ws, session, instance_id)

    try:
        async for msg in ws:
            if msg.type == aiohttp.WSMsgType.BINARY:
                await conn.on_message_async(msg.data)
            elif msg.type in (aiohttp.WSMsgType.ERROR, aiohttp.WSMsgType.CLOSE):
                break
    finally:
        # close_code is None for unclean disconnections (e.g. computer sleep)
        conn.on_close(ws.close_code is not None)

    return ws
