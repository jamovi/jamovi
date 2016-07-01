
import formatio.csv
import formatio.osilky


class FileIO:
    @staticmethod
    def read(dataset, path):
        if path.endswith('.csv'):
            formatio.csv.read(dataset, path)
        elif path.endswith('.jasp'):
            formatio.osilky.read(dataset, path)
        else:
            formatio.osilky.read(dataset, path)

    @staticmethod
    def write(dataset, path):
        formatio.osilky.write(dataset, path)
