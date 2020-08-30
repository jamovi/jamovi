

class Annotation:

    def __init__(self, id):
        self._id = 0  # an id of zero is unasigned
        self.content = ''

    @property
    def id(self):
        return self._id
