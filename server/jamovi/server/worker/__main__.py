import os
import sys

from asyncio import run

from .worker import Worker


WORK_PATH = sys.argv[2]
R_LIBS = os.environ["R_LIBS"]
MODULES_ROOT = os.environ["JAMOVI_MODULES_PATH"]

module_roots = MODULES_ROOT.split(os.pathsep)


async def main():
    """main method"""
    worker = Worker(
        work_path=WORK_PATH,
        module_roots=module_roots,
        r_libs=R_LIBS,
        reader=sys.stdin,
        writer=sys.stdout,
    )
    await worker.run()


if __name__ == "__main__":
    run(main())
