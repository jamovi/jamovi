import logging
from typing import TYPE_CHECKING

LOG_FORMAT = "%(asctime)s %(name)s %(filename)s:%(funcName)s %(levelname)s %(message)s"

logging.basicConfig(level=logging.DEBUG, format=LOG_FORMAT, force=True)
# optionally create package logger
logger = logging.getLogger("pyreadstat_pipeline")
logger.setLevel(logging.DEBUG)
logger.propagate = True

if TYPE_CHECKING:
	from .read import read as read


def read(*args, **kwargs):
	from .read import read as _read

	return _read(*args, **kwargs)

__all__ = ["read", "logger"]