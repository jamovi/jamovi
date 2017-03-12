

def read(data):
    n_cols = 3
    n_rows = 0

    for i in range(n_cols):
        name = chr(65 + i)
        column = data.dataset.append_column(name)
        column.auto_measure = True

    data.dataset.set_row_count(n_rows)
    data.title = 'Untitled'
    data.dataset.is_blank = True
