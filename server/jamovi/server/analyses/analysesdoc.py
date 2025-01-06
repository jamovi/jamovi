
import y_py as Y

class AnalysesDoc:
    '''Analyses documnent'''

    _doc: Y.YDoc

    def __init__(self):
        self._doc = Y.YDoc()

    def get_changes(self, state_vector: bytes | None = None) -> tuple[bytes, bytes]:
        """return the state of the document"""
        vector = Y.encode_state_vector(self._doc)
        update = Y.encode_state_as_update(self._doc, state_vector)
        return (vector, update)

    def apply_changes(self, changes: bytes):
        """apply changes to the document"""
        Y.apply_update(self._doc, changes)
