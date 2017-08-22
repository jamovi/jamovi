
# flake8: noqa

from enum import Enum

from .parser import Parser
from .transmogrifier import Transmogrifier
from .checker import Checker
from .exfiltrator import Exfiltrator
from .reticulator import Reticulator
from .evaluator import Evaluator


class FormulaStatus(Enum):
    EMPTY = 0
    OK = 1
    ERROR = 2
