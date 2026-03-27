import logging

LOG_FORMAT = "%(asctime)s %(name)s %(filename)s:%(funcName)s %(levelname)s %(message)s"

logging.basicConfig(level=logging.DEBUG, format=LOG_FORMAT, force=True)
# optionally create package logger
logger = logging.getLogger("pyreadstat_pipeline")
logger.setLevel(logging.DEBUG)
logger.propagate = True

from .read import read

__all__ = ["read", "logger"]