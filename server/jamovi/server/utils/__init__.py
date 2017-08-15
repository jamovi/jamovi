
from enum import Enum


class FileEntry:

    class Type(Enum):
        FILE = 1
        FOLDER = 2
        SPECIAL_FOLDER = 3
        DRIVE = 4

    def __init__(self):
        self.name = None
        self.path = None
        self.type = None

    def __lt__(self, other):
        if self.type is FileEntry.Type.DRIVE:
            if other.type is FileEntry.Type.DRIVE:
                return self.lower() < other.lower()
            else:
                return True
        if self.type is not FileEntry.FILE:
            if other.type is FileEntry.FILE:
                return True
            else:
                return self.lower() < other.lower()
        if self.type is FileEntry.FILE:
            if other.type is not FileEntry.FILE:
                return False
            else:
                return self.lower() < other.lower()
