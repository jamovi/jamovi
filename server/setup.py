
import os
import sys
from os import path

include_core = True
include_server = True

if os.environ.get('SETUP_CORE_ONLY', '0') == '1':
    include_server = False

if os.environ.get('SETUP_SERVER_ONLY', '0') == '1':
    include_core = False

tld = path.realpath(path.join(path.dirname(__file__), '../..'))

import glob
import subprocess

from distutils.core import setup
from distutils.extension import Extension
from Cython.Build import cythonize

here = os.path.dirname(os.path.realpath(__file__))


include_dirs = [
    path.join(here, './jamovi/core'),
    path.join(here, './jamovi/common'),
    path.join(tld, 'include') ]

if os.name == 'nt':  # windows
    libraries = [ "libboost_filesystem-vc143-mt-x64-1_81", "libboost_system-vc143-mt-x64-1_81", "shell32" ]
    library_dirs = [ 'C:/local/boost_1_81_0/lib64-msvc-14.3' ]
    extra_compile_args = ["/D", "UNICODE"]
    extra_link_args = [ ]
    include_dirs += [ 'C:/local/boost_1_81_0' ]

elif os.uname()[0] == "Linux":
    libraries = [ "boost_filesystem", "boost_system" ]
    library_dirs = [ ]
    extra_compile_args = [ ]
    extra_link_args = [ "-Wl,-rpath,'$$ORIGIN/../lib'" ]

elif os.uname()[0] == "Darwin":
    libraries = [ "boost_filesystem", "boost_system" ]
    library_dirs = [ tld + '/../Frameworks' ]
    extra_compile_args = [ '-mmacosx-version-min=10.13' ]
    extra_link_args = [ "-framework", "Foundation", '-mmacosx-version-min=10.13' ]
else:
    raise RuntimeError("Shouldn't get here!")


source_files = [ ]
packages = [ ]
package_data = { }


if include_core:
    packages += ['jamovi.core']

    source_files = glob.glob('./jamovi/core/*.cpp')
    source_files.extend(glob.glob('./jamovi/common/*.cpp'))

    if os.name != 'nt' and os.uname()[0] == "Darwin":  # obj c
        source_files.extend(glob.glob('./jamovi/common/*.m'))

    source_files.append('./jamovi/core.pyx')

    # exclude the generated core.cpp (made from core.pyx)
    source_files = list(filter(lambda file: not file.endswith('core.cpp'), source_files))

if include_server:

    here = path.abspath(path.dirname(__file__))

    # build server/jamovi_pb.py

    rc = subprocess.call([
        'protoc',
        '--proto_path=' + path.join(here, 'jamovi/server'),
        '--python_out=' + path.join(here, 'jamovi/server'),
        path.join(here, 'jamovi/server/jamovi.proto')])

    if rc != 0:
        raise(RuntimeError('protoc failed!'))

    packages += [
        'jamovi.server',
        'jamovi.server.analyses',
        'jamovi.server.formatio',
        'jamovi.server.utils',
        'jamovi.server.compute',
        'jamovi.server.syncs',
        'jamovi.server.modules',
        'jamovi.server.dataset',
        'jamovi.server.engine',
        'jamovi.tests',
    ]
    package_data['jamovi.server'] = [ 'jamovi.proto', 'resources/chain.pem' ]

if path.exists(path.join(here, 'jamovi/hydra')):
    packages += [ 'jamovi.hydra' ]

extensions = [
    Extension('jamovi.core',
              source_files,
              include_dirs=include_dirs,
              libraries=libraries,
              library_dirs=library_dirs,
              extra_compile_args=extra_compile_args,
              extra_link_args=extra_link_args,
              language="c++",
              undef_macros=[ "NDEBUG" ])
]

setup(
    name='jamovi',
    version='0.1.0',

    description='jamovi statistical software',
    long_description='jamovi statistical software',
    url='https://jamovi.org',

    author='Jonathon Love',
    author_email='jon@thon.cc',

    license='AGPL3',

    classifiers=[
        'Development Status :: 3 - Alpha',
        'Intended Audience :: Science/Research',
        'Topic :: Scientific/Engineering',
        'License :: OSI Approved :: GNU Affero General Public License v3 or later (AGPLv3+)',
        'Programming Language :: Python :: 3.5',
    ],

    keywords='statistics analysis spreadsheet',

    packages=packages,

    ext_modules=cythonize(
        extensions,
        language="c++"),

    package_data=package_data,

    # install_requires=[
    #     'tornado',
    #     'protobuf',
    #     'nanomsg',
    #     'PyYAML'],

    # extras_require={
    #     'dev': ['cython'],
    #     'test': ['flake8'],
    # },

    # data_files=[
    #     ('jamovi/server/resources/client', glob.glob('jamovi/server/resources/client/*.*')),
    #     ('jamovi/server/resources/client/assets', glob.glob('jamovi/server/resources/client/assets/*.*'))
    # ],

    # entry_points={
    #     'console_scripts': [
    #         'jamovi-server=jamovi.server:start',
    #     ],
    # },
)
