
from .enginemanager import EngineManager
from jamovi.server.pool import Pool

class RemotePool(EngineManager):
    def __init__(self, path: str, pool: Pool):
        pass
