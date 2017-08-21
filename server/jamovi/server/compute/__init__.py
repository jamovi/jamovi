
# flake8: noqa

from enum import Enum

from .evaluator import Evaluator
from .parser import Parser
from .transmogrifier import Transmogrifier
from .reticulator import Reticulator


class FormulaStatus(Enum):
    EMPTY = 0
    OK = 1
    ERROR = 2
