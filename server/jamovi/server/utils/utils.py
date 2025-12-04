
def parse_number(input_str):
    s = input_str.strip().replace(" ", "")
    comma = "," in s
    dot = "." in s

    if comma and dot:
        last_comma = s.rfind(",")
        last_dot = s.rfind(".")

        if last_comma > last_dot:
            s = s.replace(".", "").replace(",", ".")
        else:
            s = s.replace(",", "")

        try:
            value = float(s)
            return value
        except ValueError:
            pass
    
    elif comma:
            is_int = True
            parts = s.split(",")

            if len(parts) >= 2:
                for i, part in enumerate(parts):
                    if (i == 0 and len(part) > 3) or (i > 0 and len(part) != 3):
                        is_int = False
                        break

            if is_int:
                s = s.replace(",", "")
                try:
                    value = int(s)
                    return value
                except ValueError:
                    pass
            elif len(parts) == 2:
                s = s.replace(",", ".")
                try:
                    value = float(s)
                    return value
                except ValueError:
                    pass


    value = input_str
    if isinstance(input_str, str):
        value = value.strip()

    return value
