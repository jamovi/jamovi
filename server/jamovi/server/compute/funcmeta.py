

# row function decorator
def row_wise(func):
    func.is_row_wise = True
    func.is_column_wise = False
    return func


# column function decorator
def column_wise(func):
    func.is_row_wise = False
    func.is_column_wise = True
    return func
