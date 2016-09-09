

def read(dataset):
    n_cols = 24
    n_rows = 50

    for i in range(n_cols):
        name = chr(65 + i)
        column = dataset.append_column(name)
        column.auto_measure = True

    dataset.set_row_count(n_rows)
