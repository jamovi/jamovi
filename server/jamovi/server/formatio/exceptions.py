
from ..i18n import _

class FileIOError(Exception):
    pass


class FileReadError(FileIOError):
    pass


class FileWriteError(FileIOError):
    pass


class FileCorruptError(FileReadError):
    def __init__(self, message=None):
        if message is None:
            message = _('File is corrupt')
        super().__init__(message)


class FileFormatNotSupportedError(FileReadError):
    def __init__(self, message=None):
        if message is None:
            message = _('File format is not supported')
        super().__init__(message)
