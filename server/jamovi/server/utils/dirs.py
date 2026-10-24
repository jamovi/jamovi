"""Platform directories (and platform info)

These don't require the (compiled) core, and match what its C++
implementation (common/dirs.cpp) provided.
"""

from __future__ import annotations

import os
import platform
import sys
from functools import cache

import appdirs


def _norm(path: str) -> str:
    if sys.platform == 'win32':
        path = path.replace('\\', '/')
    return path


def _win_known_folder(folder_id: str) -> str:
    """retrieve a windows 'known folder' (i.e. documents, downloads)"""
    # pylint: disable=import-outside-toplevel
    import ctypes
    from ctypes import wintypes
    from uuid import UUID

    class GUID(ctypes.Structure):  # pylint: disable=too-few-public-methods
        _fields_ = [
            ('data1', wintypes.DWORD),
            ('data2', wintypes.WORD),
            ('data3', wintypes.WORD),
            ('data4', wintypes.BYTE * 8),
        ]

    uuid = UUID(folder_id)
    guid = GUID()
    guid.data1, guid.data2, guid.data3 = uuid.fields[0], uuid.fields[1], uuid.fields[2]
    guid.data4[:] = uuid.bytes[8:]

    path_ptr = ctypes.c_wchar_p()
    shell32 = ctypes.windll.shell32  # type: ignore[attr-defined]
    ret = shell32.SHGetKnownFolderPath(ctypes.byref(guid), 0, None, ctypes.byref(path_ptr))
    if ret != 0:
        raise OSError(f'Could not retrieve known folder { folder_id }')
    path = path_ptr.value
    ctypes.windll.ole32.CoTaskMemFree(path_ptr)  # type: ignore[attr-defined]
    return path


def _xdg_user_dir(name: str, fallback: str) -> str:
    """look up an xdg user dir (i.e. DOCUMENTS) from user-dirs.dirs"""
    config_home = os.environ.get('XDG_CONFIG_HOME') or os.path.join(Dirs.home_dir(), '.config')
    try:
        with open(os.path.join(config_home, 'user-dirs.dirs'), encoding='utf-8') as file:
            for line in file:
                line = line.strip()
                key = f'XDG_{ name }_DIR='
                if not line.startswith(key):
                    continue
                value = line[len(key):].strip('"')
                if value.startswith('$HOME'):
                    value = Dirs.home_dir() + value[len('$HOME'):]
                elif not value.startswith('/'):
                    continue
                return value
    except OSError:
        pass
    return fallback


# the FOLDERIDs of the windows known folders
_WIN_DOCUMENTS = 'FDD39AD0-238F-46AF-ADB4-6C85480369C7'
_WIN_DOWNLOADS = '374DE290-123F-4565-9164-39C4925E467B'
_WIN_DESKTOP = 'B4BFCC3A-DB2C-424C-B029-7FE99A87C641'
_WIN_PROFILE = '5E6C858F-0E22-4760-9AFE-EA3317B67173'


class Dirs:
    """platform directories"""

    @staticmethod
    @cache
    def app_data_dir() -> str:
        if sys.platform == 'win32':
            # %APPDATA%/jamovi
            path = appdirs.user_data_dir('jamovi', appauthor=False, roaming=True)
        elif sys.platform == 'darwin':
            # ~/Library/Application Support/jamovi
            path = appdirs.user_data_dir('jamovi')
        else:
            path = os.path.join(Dirs.home_dir(), '.jamovi')
        os.makedirs(path, exist_ok=True)
        return _norm(path)

    @staticmethod
    @cache
    def home_dir() -> str:
        if sys.platform == 'win32':
            return _norm(_win_known_folder(_WIN_PROFILE))
        return os.path.expanduser('~')

    @staticmethod
    @cache
    def documents_dir() -> str:
        if sys.platform == 'win32':
            return _norm(_win_known_folder(_WIN_DOCUMENTS))
        fallback = os.path.join(Dirs.home_dir(), 'Documents')
        if sys.platform == 'darwin':
            return fallback
        return _xdg_user_dir('DOCUMENTS', fallback)

    @staticmethod
    @cache
    def downloads_dir() -> str:
        if sys.platform == 'win32':
            return _norm(_win_known_folder(_WIN_DOWNLOADS))
        return os.path.join(Dirs.home_dir(), 'Downloads')

    @staticmethod
    @cache
    def desktop_dir() -> str:
        if sys.platform == 'win32':
            return _norm(_win_known_folder(_WIN_DESKTOP))
        return os.path.join(Dirs.home_dir(), 'Desktop')


class PlatformInfo:  # pylint: disable=too-few-public-methods
    """the platforms modules can be built for"""

    @staticmethod
    def platform() -> list[str]:
        if sys.platform == 'win32':
            return ['win64']
        if sys.platform == 'darwin':
            return ['macos']
        platforms = ['linux']
        # i.e. 'GCC 13.2.0' -> linux13.2
        compiler = platform.python_compiler().split()
        if len(compiler) >= 2 and compiler[0] == 'GCC':
            major_minor = '.'.join(compiler[1].split('.')[:2])
            platforms.append(f'linux{ major_minor }')
        return platforms
