
import os, sys

tld = os.path.realpath(os.path.join(os.path.dirname(__file__), '../../..'))
sys.path.append(os.path.join(tld, 'lib/python3.5/site-packages'))

import glob

from distutils.core import setup
from distutils.extension import Extension
from Cython.Build import cythonize

here = os.path.dirname(os.path.realpath(__file__))
os.chdir(here)

source_files = glob.glob('./silky/*.cpp', recursive=True)
source_files.extend(glob.glob('../common/**/*.cpp', recursive=True))
source_files.append('silky.pyx')

include_dirs = [ here, here + '/../common/', tld + '/include' ]

if os.name == 'nt':  # windows
    libraries = [ "libboost_filesystem-vc140-mt-1_60", "libboost_system-vc140-mt-1_60" ]
    library_dirs = [ tld + '/lib/libvc' ]
    extra_compile_args = ["/D", "UNICODE"]

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
        language="c++")
]

setup(
    name = 'silky',
    ext_modules = cythonize(
        extensions,
        language="c++")
)
