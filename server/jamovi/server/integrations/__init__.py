
from .qp import Handler as QPHandler

from re import fullmatch
from urllib.parse import urlsplit


def get_special_handler(url):

    url = urlsplit(url)

    if fullmatch(r'.*\.?questionpro\.com$', url.netloc):
        return QPHandler()

    return None
