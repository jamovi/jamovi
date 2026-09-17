
from __future__ import annotations

import typing
from contextlib import asynccontextmanager, AsyncExitStack

from .datasetmodel import DataSetModel
from .analyses import Analyses

from .i18n import _

if typing.TYPE_CHECKING:
    from .instance import Instance
    from .syncs import HttpSync


class Project:
    """The document: the data sets, the analyses, and the state that
    describes the file they are saved to.

    A Project holds no connection state; that belongs to the owning Instance.
    """

    _instance: Instance
    _datasets: dict[int, DataSetModel]
    _next_dataset_id: int
    _analyses: Analyses
    _path: str
    _save_format: str
    _title: str
    _results_language: str
    _is_edited: bool
    _is_blank: bool
    file_sync: HttpSync | None

    def __init__(self, instance: Instance):
        self._instance = instance
        self._datasets = { }
        self._next_dataset_id = 1
        self._analyses = Analyses(self, instance.session.modules)
        self._path = ''
        self._save_format = ''
        self._title = ''
        self._results_language = ''
        self._is_edited = False
        self._is_blank = False
        self.file_sync = None

    @property
    def instance(self) -> Instance:
        return self._instance

    @property
    def instance_path(self) -> str:
        return self._instance.instance_path

    @property
    def session_temp(self) -> str:
        return self._instance.session.session_temp

    @property
    def analyses(self) -> Analyses:
        return self._analyses

    # -- data sets ------------------------------------------------------------

    @property
    def datasets(self) -> typing.Iterable[DataSetModel]:
        """The data sets, in tab order."""
        return self._datasets.values()

    @property
    def dataset_ids(self) -> list[int]:
        return list(self._datasets.keys())

    @property
    def has_datasets(self) -> bool:
        return len(self._datasets) > 0

    def get_dataset(self, id: int = 0) -> DataSetModel:
        """Return the data set with the given id. An id of 0 means the
        first data set (the protocol's default)."""
        if id == 0:
            return next(iter(self._datasets.values()))
        return self._datasets[id]

    def add_dataset(self, name: str | None = None, index: int | None = None) -> DataSetModel:
        id = self._next_dataset_id
        store = self._instance.create_store()
        self._next_dataset_id += 1

        dataset = DataSetModel(self)
        dataset.id = id
        dataset.name = self._gen_dataset_name(name)
        dataset.store = store
        dataset.dataset = store.create_dataset()

        if index is None or index >= len(self._datasets):
            self._datasets[id] = dataset
        else:
            items = list(self._datasets.items())
            items.insert(index, (id, dataset))
            self._datasets = dict(items)

        return dataset

    def remove_dataset(self, id: int) -> DataSetModel:
        dataset = self._datasets.pop(id)
        dataset.close()
        return dataset

    def _gen_dataset_name(self, name: str | None) -> str:
        if not name:
            name = _('Data')
        existing = set(ds.name for ds in self._datasets.values())
        checked = name
        i = 2
        while checked in existing:
            checked = f'{ name } ({ i })'
            i += 1
        return checked

    @asynccontextmanager
    async def attach(self, read_only: bool = False):
        """Acquire every data set's lock (in tab order)."""
        async with AsyncExitStack() as stack:
            for dataset in list(self._datasets.values()):
                await stack.enter_async_context(dataset.attach(read_only=read_only))
            yield

    def close(self):
        for dataset in self._datasets.values():
            dataset.close()
        self._datasets = { }

    # -- document state ---------------------------------------------------------

    @property
    def title(self) -> str:
        return self._title

    @title.setter
    def title(self, title: str):
        self._title = title

    @property
    def path(self) -> str:
        return self._path

    @path.setter
    def path(self, path: str):
        self._path = path

    @property
    def save_format(self) -> str:
        return self._save_format

    @save_format.setter
    def save_format(self, format: str):
        self._save_format = format

    @property
    def results_language(self) -> str:
        if self._results_language == '':
            self._results_language = self._instance.session.get_language()
            if self._results_language is None:
                self._results_language = ''
        return self._results_language

    @results_language.setter
    def results_language(self, language: str):
        self._results_language = language

    @property
    def is_edited(self) -> bool:
        """True if the document, or any of its data sets, has unsaved changes."""
        if self._is_edited:
            return True
        return any(ds.is_edited for ds in self._datasets.values())

    @is_edited.setter
    def is_edited(self, edited: bool):
        self._is_edited = edited
        if not edited:
            for dataset in self._datasets.values():
                dataset.is_edited = False

    @property
    def is_blank(self) -> bool:
        return self._is_blank

    @is_blank.setter
    def is_blank(self, blank: bool):
        self._is_blank = blank
