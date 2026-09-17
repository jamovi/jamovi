
# receiving uploaded files -- shared by /open and /<instance>/upload

import os
import re
import hashlib
from dataclasses import dataclass
from tempfile import NamedTemporaryFile

from aiohttp import web

from .sessionfiles import safe_ext


class UploadTooLargeError(Exception):
    pass


@dataclass(slots=True)
class UploadedFile:
    # a file received by read_upload_form(). path is where it is now;
    # filename is the name the user chose. ours is whether we wrote it (and
    # so are responsible for it), as opposed to an nginx upload accelerator
    # having written it before handing the request to us. sha256 is the hex
    # digest of the content when ours (it's hashed as it lands), else None
    path: str
    filename: str
    ours: bool
    sha256: str | None = None


async def read_upload_form(request: web.Request, dest_dir: str, max_bytes: float | None = None) -> tuple[dict[str, str], list[UploadedFile]]:
    """Reads a form with files in it, streaming the files to disk.

    Returns the text fields, and the files. If the files streamed in total
    more than max_bytes, they're removed and UploadTooLargeError is raised.
    A file arrives one of two ways:

    - as a 'file' part with a body, which is streamed chunk by chunk into a
      random name under dest_dir (keeping the extension), so it's never
      held in memory, and isn't subject to aiohttp's client_max_size
    - as a 'file.path' / 'file.name' pair of text fields, set by an nginx
      upload accelerator that has already written the body to disk (into
      upload_path, on the shared spool) and replaced it with the path

    Either way the caller sees an UploadedFile. Anything not multipart is
    read the ordinary (buffered) way.
    """

    fields: dict[str, str] = {}
    files: list[UploadedFile] = []
    acc_paths: list[str] = []
    acc_names: list[str] = []
    received = 0

    def too_large():
        for f in files:
            if f.ours:
                try:
                    os.remove(f.path)
                except OSError:
                    pass
        return UploadTooLargeError()

    if request.content_type == 'multipart/form-data':
        reader = await request.multipart()
        async for part in reader:
            if part.name is None:
                continue
            if part.filename:
                filename = os.path.basename(part.filename)
                digest = hashlib.sha256()
                with NamedTemporaryFile(suffix=safe_ext(filename), delete=False, dir=dest_dir) as tmp:
                    while True:
                        chunk = await part.read_chunk()
                        if not chunk:
                            break
                        received += len(chunk)
                        if max_bytes is not None and received > max_bytes:
                            tmp.close()
                            os.remove(tmp.name)
                            raise too_large()
                        digest.update(chunk)
                        tmp.write(chunk)
                files.append(UploadedFile(tmp.name, filename, ours=True, sha256=digest.hexdigest()))
            else:
                value = await part.text()
                if part.name == 'file.path':
                    acc_paths.append(value)
                elif part.name == 'file.name':
                    acc_names.append(value)
                else:
                    fields[part.name] = value
    else:
        data = await request.post()
        for name, value in data.items():
            if isinstance(value, web.FileField):
                filename = os.path.basename(value.filename)
                content = value.file.read()
                received += len(content)
                if max_bytes is not None and received > max_bytes:
                    raise too_large()
                with NamedTemporaryFile(suffix=safe_ext(filename), delete=False, dir=dest_dir) as tmp:
                    tmp.write(content)
                files.append(UploadedFile(tmp.name, filename, ours=True, sha256=hashlib.sha256(content).hexdigest()))
            elif name == 'file.path':
                acc_paths.append(str(value))
            elif name == 'file.name':
                acc_names.append(str(value))
            else:
                fields[name] = str(value)

    if len(acc_paths) != len(acc_names):
        raise ValueError('file.path and file.name fields must be paired')
    for acc_path, acc_name in zip(acc_paths, acc_names):
        files.append(UploadedFile(acc_path, os.path.basename(acc_name), ours=False))

    return fields, files
