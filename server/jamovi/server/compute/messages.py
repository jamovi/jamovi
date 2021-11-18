from ..i18n import _

class Messages:

    @staticmethod
    def create_from(e: BaseException):
        if isinstance(e, RecursionError):
            return _('Circular reference detected')
        elif isinstance(e, SyntaxError):
            return _('The formula is mis-specified')
        elif isinstance(e, NameError) or isinstance(e, TypeError) or isinstance(e, ValueError):
            return str(e)
        else:
            return '{} ({}, {})'.format(_('Unexpected error'), str(e), type(e).__name__)
