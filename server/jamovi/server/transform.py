

class Transform:

    def __init__(self):
        self.name = ''
        self.id = 0  # an id of zero is unasigned
        self.description = ''
        self.formula = [ '' ]
        self.formula_message = [ '' ]

    @property
    def has_formula(self):
        return len(self.formula) > 0
