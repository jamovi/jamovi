
# Verifies the ed25519 signature that jamovi-library embeds in a .jmo's
# end-of-central-directory comment:
#
#   {"alg":"ed25519","sig":"<signature, base64>"}
#
# The signature covers the zip file's bytes up to (but not including) the
# comment. See jamovi-library's scripts/sign.py for the signing side.

import base64
import json
import struct
from typing import BinaryIO

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives import serialization

from ..i18n import _


# Public half of the keypair jamovi-library signs .jmo files with — kept in
# sync with jamovi-library's verify-key.pem.
PUBLIC_KEY = serialization.load_pem_public_key(b"""-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAltapFl1CmG8YnWMVpolrKIWaIybOVHFxzkQYwGn39Ko=
-----END PUBLIC KEY-----
""")

EOCD_SIGNATURE = b'PK\x05\x06'
EOCD_SIZE = 22


class SignatureError(Exception):
    pass


def _split_eocd(data: bytes) -> tuple[bytes, bytes]:
    pos = data.rfind(EOCD_SIGNATURE)
    if pos == -1 or pos + EOCD_SIZE > len(data):
        raise SignatureError(_('not a valid module file'))

    comment_len = struct.unpack_from('<H', data, pos + 20)[0]
    if pos + EOCD_SIZE + comment_len != len(data):
        raise SignatureError(_('not a valid module file'))

    body = data[:pos + 20] + b'\x00\x00'
    comment = data[pos + EOCD_SIZE:]
    return body, comment


def verify_jmo(file: BinaryIO) -> None:
    """Verify the ed25519 signature embedded in a .jmo's zip comment.

    `file` is a file-like object open for reading in binary mode; its
    position is reset to the start before returning.

    Raises SignatureError if the file isn't signed, is malformed, or the
    signature doesn't match.
    """
    file.seek(0)
    data = file.read()
    file.seek(0)

    body, comment = _split_eocd(data)
    if not comment:
        raise SignatureError(_('module is not signed'))

    try:
        info = json.loads(comment.decode('utf-8'))
        if info.get('alg') != 'ed25519':
            raise ValueError()
        signature = base64.b64decode(info['sig'])
    except (ValueError, KeyError) as e:
        raise SignatureError(_('module signature is malformed')) from e

    try:
        PUBLIC_KEY.verify(signature, body)
    except InvalidSignature as e:
        raise SignatureError(_('module signature is invalid')) from e
