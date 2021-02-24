
class FileIOError(Exception):
    pass


class FileReadError(FileIOError):
    pass


class FileWriteError(FileIOError):
    pass


class FileCorruptError(FileReadError):
    def __init__(self, message='File is corrupt'):
        super().__init__(message)


class FileFormatNotSupportedError(FileReadError):
    def __init__(self, message='File format is not supported'):
        super().__init__(message)
