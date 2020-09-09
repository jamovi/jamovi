
import os
from os import path
import sys

tld = path.realpath(path.join(path.dirname(__file__), '../..'))
sys.path.append(path.join(tld, 'lib/python3.5/site-packages'))

import glob
import subprocess

from distutils.core import setup
from distutils.extension import Extension
from Cython.Build import cythonize

here = os.path.dirname(os.path.realpath(__file__))

source_files = glob.glob('./jamovi/core/*.cpp')
source_files.extend(glob.glob('./jamovi/common/*.cpp'))

if os.name != 'nt' and os.uname()[0] == "Darwin":  # obj c
    source_files.extend(glob.glob('./jamovi/common/*.m'))

source_files.append('./jamovi/core.pyx')

# exclude the generated core.cpp (made from core.pyx)
source_files = list(filter(lambda file: not file.endswith('core.cpp'), source_files))

include_dirs = [
    path.join(here, './jamovi/core'),
    path.join(here, './jamovi/common'),
    path.join(tld, 'include') ]

if os.name == 'nt':  # windows
    libraries = [ "libboost_filesystem-vc141-mt-x64-1_74", "libboost_system-vc141-mt-x64-1_74", "shell32" ]
    library_dirs = [ tld + '/lib/libvc' ]
    extra_compile_args = ["/D", "UNICODE"]
    extra_link_args = [ ]

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

here = path.abspath(path.dirname(__file__))

# build server/jamovi_pb.py

rc = subprocess.call([
    'protoc',
    '--proto_path=' + path.join(here, 'jamovi/server'),
    '--python_out=' + path.join(here, 'jamovi/server'),
    path.join(here, 'jamovi/server/jamovi.proto')])

if rc != 0:
    raise(RuntimeError('protoc failed!'))

if path.exists(path.join(here, 'jamovi/hydra')):
    hydra = [ 'jamovi.hydra' ]
else:
    hydra = [ ]

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

    packages=[
        'jamovi.core',
        'jamovi.server',
        'jamovi.server.formatio',
        'jamovi.server.utils',
        'jamovi.server.compute',
        'jamovi.server.integrations',
    ] + hydra,

    ext_modules=cythonize(
        extensions,
        language="c++"),

    # install_requires=[
    #     'tornado',
    #     'protobuf',
    #     'nanomsg',
    #     'PyYAML'],

    # extras_require={
    #     'dev': ['cython'],
    #     'test': ['flake8'],
    # },

    package_data={
        'jamovi.server': [ 'jamovi.proto' ]
    },

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
