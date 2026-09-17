
# files chosen for 'File' analysis options. they live in the session temp
# dir (which the engine can read), named by their content: the hex sha-256
# plus the (sanitised) extension. that name is the file's id everywhere --
# in the option value, in the .omv it's saved to, and in the client's
# de-duplication -- so the same file selected twice, or in two projects,
# is one file, and nothing path-shaped ever leaves the server

import os
import re
import hashlib
from tempfile import NamedTemporaryFile
from typing import BinaryIO


FILE_ID_RE = re.compile(r'^[0-9a-f]{64}(\.[A-Za-z0-9]{1,16})?$')

# extensions there's no point deflating again when writing to an .omv
STORED_EXTS = frozenset(('.zip', '.gz', '.xz', '.bz2', '.7z', '.png', '.jpg', '.jpeg', '.omv', '.xlsx', '.docx'))

CHUNK_SIZE = 64 * 1024


class TooLargeError(Exception):
    pass


def safe_ext(filename: str) -> str:
    # the extension of a user-supplied filename, as a suffix for the file we
    # write: it's the only part of the user's name that reaches the
    # filesystem, so keep it to characters we trust
    _unused, dot_ext = os.path.splitext(filename)
    ext = re.sub(r'[^A-Za-z0-9]', '', dot_ext)[:16]
    return '.' + ext if ext else ''


def is_file_id(id: str) -> bool:
    return isinstance(id, str) and FILE_ID_RE.match(id) is not None


def file_id(digest: str, filename: str) -> str:
    return digest + safe_ext(filename)


class SessionFiles:

    def __init__(self, session_temp: str):
        self._dir = session_temp
        os.makedirs(session_temp, exist_ok=True)

    @property
    def dir(self) -> str:
        return self._dir

    def path(self, id: str) -> str:
        if not is_file_id(id):
            raise ValueError(f"'{ id }' is not a file id")
        return os.path.join(self._dir, id)

    def exists(self, id: str) -> bool:
        return is_file_id(id) and os.path.isfile(os.path.join(self._dir, id))

    def usage(self) -> int:
        # everything in session temp counts, not only our files: it's the
        # directory that's capped
        total = 0
        for root, _dirs, names in os.walk(self._dir):
            for name in names:
                try:
                    total += os.path.getsize(os.path.join(root, name))
                except OSError:
                    pass
        return total

    def add(self, source: BinaryIO, filename: str, max_bytes: float | None = None) -> str:
        """Reads source to the end, into a file named by its content, and returns the id.

        Nothing is kept if the content is already present (same id), or if
        it exceeds max_bytes, in which case TooLargeError is raised.
        """
        ext = safe_ext(filename)
        digest = hashlib.sha256()
        size = 0
        with NamedTemporaryFile(suffix=ext, delete=False, dir=self._dir) as tmp:
            try:
                while True:
                    chunk = source.read(CHUNK_SIZE)
                    if not chunk:
                        break
                    size += len(chunk)
                    if max_bytes is not None and size > max_bytes:
                        raise TooLargeError()
                    digest.update(chunk)
                    tmp.write(chunk)
            except BaseException:
                tmp.close()
                os.remove(tmp.name)
                raise
        return self._adopt(tmp.name, digest.hexdigest() + ext)

    def add_path(self, source_path: str, filename: str, max_bytes: float | None = None, move: bool = False) -> str:
        """add() for a file already on disk. With move, the source is removed afterwards."""
        if max_bytes is not None and os.path.getsize(source_path) > max_bytes:
            raise TooLargeError()
        with open(source_path, 'rb') as source:
            id = self.add(source, filename, max_bytes)
        if move:
            os.remove(source_path)
        return id

    def adopt(self, tmp_path: str, digest: str, filename: str) -> str:
        """Takes ownership of a file already in the session temp dir whose sha-256 is known."""
        return self._adopt(tmp_path, file_id(digest, filename))

    def verify_and_adopt(self, tmp_path: str, id: str) -> bool:
        """Takes ownership of a file claiming to be id, if its content agrees. Removes it otherwise."""
        digest = hashlib.sha256()
        with open(tmp_path, 'rb') as file:
            while True:
                chunk = file.read(CHUNK_SIZE)
                if not chunk:
                    break
                digest.update(chunk)
        stem, _ext = os.path.splitext(id)
        if digest.hexdigest() != stem:
            os.remove(tmp_path)
            return False
        self._adopt(tmp_path, id)
        return True

    def _adopt(self, tmp_path: str, id: str) -> str:
        dest = self.path(id)
        if os.path.exists(dest):
            os.remove(tmp_path)  # same content, by construction
        else:
            os.replace(tmp_path, dest)
        return id
