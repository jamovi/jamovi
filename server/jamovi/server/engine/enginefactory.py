
from typing import Mapping
from typing import TypeAlias
from typing import TYPE_CHECKING

from .enginemanager import EngineManager
from .shmemmanager import ShMemManager


Config: TypeAlias = Mapping[str, str]

if TYPE_CHECKING:
    from jamovi.server.pool import Pool


class EngineFactory:
    '''Factory for creating EngineManagers'''

    @staticmethod
    def create(em_type: str, path: str, pool: 'Pool', config: Config) -> EngineManager:
        ''' create an engine manager of the specified type'''
        if em_type == 'shmem':
            return ShMemManager(path, pool, config)
        elif em_type == 'remote':
            # pylint: disable-next=import-outside-toplevel,import-error
            from .remotepool import RemotePool
            return RemotePool(path, pool)
        elif em_type == 'duckdb':
            # pylint: disable-next=import-outside-toplevel
            from .duckmanager import DuckManager
            return DuckManager(path, pool, config)
        raise ValueError('Unrecognised em type type')
