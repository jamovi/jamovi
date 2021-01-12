
class FileIOError(Exception):
    pass


class FileReadError(FileIOError):
    pass


class FileCorruptError(FileReadError):
    def __init__(self, message='File is corrupt'):
        super().__init__(message)
