
import re

from typing import Literal


UNAMBIGUOUS_EURO_INT = re.compile(r"^-?[1-9]\d{0,2}(?:\.\d{3}){2,}$")
UNAMBIGIOUS_INT = re.compile(r"^-?[1-9]\d{0,2}(?:,\d{3}){2,}$")

# # Matches
# 1,234,567
# 12,345,678
# 123,456,789
# 1,234,567,890
# 12,345,678,901,234

# # Won't match
# 999,999


def parse_number(input_str: str, dec_symbol: Literal['.', ',']='.') -> float | int | str:

    input_str = input_str.strip()

    s = input_str.replace(" ", "")
    comma = "," in s
    dot = "." in s

    try:
        if comma and dot:
            last_comma = s.rfind(",")
            last_dot = s.rfind(".")

            if last_comma > last_dot:
                # 123.456,78 => 123456.78
                s = s.replace(".", "").replace(",", ".")
            else:
                # 123,456.78 => 123456.78
                s = s.replace(",", "")

            return float(s)

        elif comma:
            if UNAMBIGIOUS_INT.match(s):
                # i.e. 1,234,567 => 1234567
                s = s.replace(",", "")
                return int(s)
            else:
                if dec_symbol == ",":
                    # i.e. 123,45 => 123.45
                    s = s.replace(",", ".")
                    return float(s)
                else:
                    # i.e. 123,45 => 12345
                    s = s.replace(",", "")
                    return int(s)

        elif dot:
            if dec_symbol == "," and UNAMBIGUOUS_EURO_INT.match(s):
                # i.e. 1.234.567 => 1234567
                s = s.replace(".", "")
                return int(s)
            else:
                return float(s)

        else:
           return int(input_str)

    except ValueError:
        pass

    return input_str
