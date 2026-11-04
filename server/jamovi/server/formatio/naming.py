
def make_unique(name, used):
    """Return name, or name with a ' (n)' suffix, such that it is not in used."""
    unique = name
    c = 2
    while unique in used:
        unique = '{} ({})'.format(name, c)
        c += 1
    return unique
