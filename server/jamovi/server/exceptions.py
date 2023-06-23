
class SessionTerminatedException(Exception):
    pass


class AnalysisServiceTerminatedException(SessionTerminatedException):
    pass


class UserException(Exception):

    message: str
    cause: str

    def __init__(self, message: str, cause: str):
        self.message = message
        self.cause = cause

    def __str__(self):
        return self.cause


class FileExistsException(Exception):
    pass
