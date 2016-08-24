
import formatio.csv
import formatio.osilky


def read(dataset, path):
    if path.endswith('.csv'):
        formatio.csv.read(dataset, path)
    elif path.endswith('.jasp'):
        formatio.osilky.read(dataset, path)
    else:
        formatio.osilky.read(dataset, path)


def write(dataset, path):
    formatio.osilky.write(dataset, path)


def is_supported(filename):
    return filename.endswith('.csv') or filename.endswith('.osilky') or filename.endswith('.jasp')
