
import pkgutil
import importlib
from ssl import SSLContext

from aiohttp import ClientSession

import jamovi.server.syncs as syncs
from jamovi.server.syncs.http import HttpSync


# https://packaging.python.org/en/latest/guides/creating-and-discovering-plugins/#using-namespace-packages

def iter_namespace(ns_pkg):
    # Specifying the second argument (prefix) to iter_modules makes the
    # returned name an absolute name instead of a relative one. This allows
    # import_module to work without having to do additional modification to
    # the name.
    return pkgutil.iter_modules(ns_pkg.__path__, ns_pkg.__name__ + ".")


plugins = {
    name: importlib.import_module(name)
    for (_, name, _) in iter_namespace(syncs) if not name.endswith('.http')
}


def create_file_sync(url: str, options: dict, client: ClientSession, ssl_context: SSLContext):
    for plugin in plugins.values():
        if plugin.handles(url):
            return plugin.Sync(url, options, client, ssl_context)
    else:
        return HttpSync(url, options, client, ssl_context)

