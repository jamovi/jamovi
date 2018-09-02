
# flake8: noqa

from enum import Enum

from .parser import Parser
from .transmogrifier import Transmogrifier
from .transfilterifier import Transfilterifier
from .transfudgifier import Transfudgifier
from .checker import Checker
from .messages import Messages


class FormulaStatus(Enum):
    EMPTY = 0
    OK = 1
    ERROR = 2
