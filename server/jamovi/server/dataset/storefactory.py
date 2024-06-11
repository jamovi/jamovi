
from .store import Store
from .shmemstore import SharedMemoryStore

class StoreFactory:

    @staticmethod
    def create(path: str, store_type: str) -> Store:
        if store_type == 'shmem':
            return SharedMemoryStore.create(path)
        elif store_type == 'duckdb':
            # pylint: disable-next=import-outside-toplevel
            from .duckstore import DuckStore
            return DuckStore.create(path)
        raise ValueError('Unrecognised store type')
