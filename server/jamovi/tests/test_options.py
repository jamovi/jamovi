"""Tests for analysis option definitions"""

from jamovi.server.options import create_option


def test_color_default():
    """a Color option defaults to black, unless a default is given"""
    assert create_option({ 'name': 'color', 'type': 'Color' }).default == '#000000'
    assert create_option({ 'name': 'color', 'type': 'Color', 'default': '#3e6da9' }).default == '#3e6da9'
