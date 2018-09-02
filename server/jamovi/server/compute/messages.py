
class Messages:

    @staticmethod
    def create_from(e: BaseException):
        if isinstance(e, RecursionError):
            return 'Circular reference detected'
        elif isinstance(e, SyntaxError):
            return 'The formula is mis-specified'
        elif isinstance(e, NameError) or isinstance(e, TypeError) or isinstance(e, ValueError):
            return str(e)
        else:
            return 'Unexpected error ({}, {})'.format(str(e), type(e).__name__)
