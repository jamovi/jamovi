
# receiving uploaded files -- shared by /open and /<instance>/upload

import os
import re
from tempfile import NamedTemporaryFile

from aiohttp import web


class UploadedFile:
    # a file received by read_upload_form(). path is where it is now;
    # filename is the name the user chose. ours is whether we wrote it (and
    # so are responsible for it), as opposed to an nginx upload accelerator
    # having written it before handing the request to us
    __slots__ = ('path', 'filename', 'ours')

    def __init__(self, path: str, filename: str, ours: bool):
        self.path = path
        self.filename = filename
        self.ours = ours


def safe_ext(filename: str) -> str:
    # the extension of an uploaded file, as a suffix for the temp file we
    # write it to: it's the only part of the user's name that reaches the
    # filesystem, so keep it to characters we trust
    _unused, dot_ext = os.path.splitext(filename)
    return re.sub(r'[^A-Za-z0-9.]', '', dot_ext)[:16]


async def read_upload_form(request: web.Request, dest_dir: str) -> tuple[dict[str, str], list[UploadedFile]]:
    """Reads a form with files in it, streaming the files to disk.

    Returns the text fields, and the files. A file arrives one of two ways:

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

    if request.content_type == 'multipart/form-data':
        reader = await request.multipart()
        async for part in reader:
            if part.name is None:
                continue
            if part.filename:
                filename = os.path.basename(part.filename)
                with NamedTemporaryFile(suffix=safe_ext(filename), delete=False, dir=dest_dir) as tmp:
                    while True:
                        chunk = await part.read_chunk()
                        if not chunk:
                            break
                        tmp.write(chunk)
                files.append(UploadedFile(tmp.name, filename, ours=True))
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
                with NamedTemporaryFile(suffix=safe_ext(filename), delete=False, dir=dest_dir) as tmp:
                    tmp.write(value.file.read())
                files.append(UploadedFile(tmp.name, filename, ours=True))
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
