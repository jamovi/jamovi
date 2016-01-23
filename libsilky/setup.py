
import os
import glob

from distutils.core import setup
from distutils.extension import Extension
from Cython.Build import cythonize

here = os.path.dirname(os.path.realpath(__file__))
os.chdir(here)

source_files = glob.glob('silky/**/*.cpp', recursive=True)
source_files.append('silky.pyx')

if os.name == 'nt':  # windows
    include_dirs = [ here + '/silky', here + '/../../boost' ]
    libraries = [ "libboost_filesystem-vc140-mt-1_60", "libboost_system-vc140-mt-1_60" ]
    library_dirs = [ here + '/../../boost/lib64-msvc-14.0' ]
    extra_compile_args = ["/D", "UNICODE"]

else:
    include_dirs = [ here + '/silky', '/opt/local/include' ]
    libraries = [ "boost_filesystem-mt", "boost_system-mt" ]
    library_dirs = [ ]
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
