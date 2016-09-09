#
# Copyright (C) 2016 Jonathon Love
#

import os, sys

tld = os.path.realpath(os.path.join(os.path.dirname(__file__), '../../..'))
sys.path.append(os.path.join(tld, 'lib/python3.5/site-packages'))

import glob

from distutils.core import setup
from distutils.extension import Extension
from Cython.Build import cythonize

here = os.path.dirname(os.path.realpath(__file__))
os.chdir(here)

source_files = glob.glob('./silky/*.cpp')
source_files.extend(glob.glob('../common/*.cpp'))
#source_files.extend(glob.glob('../common/boost/nowide/*.cpp'))
source_files.append('silky.pyx')

include_dirs = [ here + '/silky', here + '/../common/', tld + '/include' ]

if os.name == 'nt':  # windows
    libraries = [ "libboost_filesystem-vc140-mt-1_60", "libboost_system-vc140-mt-1_60" ]
    library_dirs = [ tld + '/lib/libvc' ]
    extra_compile_args = ["/D", "UNICODE"]

elif os.uname()[0] == "Linux":
    libraries = [ "boost_filesystem", "boost_system" ]
    library_dirs = [ ]
    extra_compile_args = [ ]

else:
    libraries = [ "boost_filesystem-mt", "boost_system-mt" ]
    library_dirs = [ tld + '/../Frameworks' ]
    extra_compile_args = [ ]

extensions = [
    Extension("*",
        source_files,
        include_dirs = include_dirs,
        libraries = libraries,
        library_dirs = library_dirs,
        extra_compile_args = extra_compile_args,
        language = "c++",
        undef_macros = [ "NDEBUG" ])
]

setup(
    name = 'silky',
    ext_modules = cythonize(
        extensions,
        language="c++")
)
