
from ..i18n import _

def read(project):
    n_cols = 3
    n_rows = 0

    dataset = project.add_dataset()

    for i in range(n_cols):
        name = chr(65 + i)
        # empty string import_name means not imported
        column = dataset.append_column(name, '')
        column.auto_measure = True

    dataset.dataset.set_row_count(n_rows)
    project.title = _('Untitled')
    project.is_blank = True
