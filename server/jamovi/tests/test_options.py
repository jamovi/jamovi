"""Tests for analysis option definitions"""

from jamovi.server.options import create_option


def test_color_default():
    """a Color option defaults to black, unless a default is given"""
    assert create_option({ 'name': 'color', 'type': 'Color' }).default == '#000000'
    assert create_option({ 'name': 'color', 'type': 'Color', 'default': '#3e6da9' }).default == '#3e6da9'


from jamovi.server.options import Options
from jamovi.server.options import read_values_from_pb


DUNCAN = 'addons/jdmrt/dmrt/'


def anova_options():
    """the options of an analysis with an addon (as _construct() builds them)"""
    return Options.create([
        { 'name': 'dep', 'type': 'Variable' },
        { 'name': 'factors', 'type': 'Variables' },
        { 'name': 'modelTerms', 'type': 'Terms' },
        { 'name': DUNCAN + 'duncanTerms', 'type': 'Terms' },
        { 'name': DUNCAN + 'blk', 'type': 'Variable' },
        { 'name': DUNCAN + 'alpha', 'type': 'Number', 'default': 0.05 },
    ])


def set_values(options, values):
    for name, value in values.items():
        options.set_value(name, value)


def test_own_pb_leaves_out_the_addons_options():
    """the analysis itself is sent none of its addons' options"""
    options = anova_options()
    own = read_values_from_pb(options.own_pb())
    assert set(own) == { 'dep', 'factors', 'modelTerms' }


def test_addon_pb_is_named_as_the_addon_knows_it():
    """an addon is sent its own options, without the prefix"""
    options = anova_options()
    options.set_value(DUNCAN + 'alpha', 0.01)
    values = read_values_from_pb(options.addon_pb('jdmrt', 'dmrt'))
    assert values == { 'duncanTerms': None, 'blk': None, 'alpha': 0.01 }
    assert read_values_from_pb(options.addon_pb('other', 'dmrt')) == { }


def test_addon_pb_carries_the_settings():
    """an addon renders and translates as its analysis does"""
    options = anova_options()
    set_values(options, { '.ppi': 144, 'theme': 'iheartspss', '.lang': 'de' })
    values = read_values_from_pb(options.addon_pb('jdmrt', 'dmrt'))
    assert values['.ppi'] == 144
    assert values['theme'] == 'iheartspss'
    assert values['.lang'] == 'de'


def test_addon_pb_removes_variables_the_analysis_isnt_using():
    """an addon may only use the analysis' variables"""
    options = anova_options()
    set_values(options, {
        'dep': 'yield',
        'factors': [ 'fert', 'block' ],
        DUNCAN + 'duncanTerms': [ [ 'fert' ], [ 'fert', 'variety' ], [ 'block' ] ],
        DUNCAN + 'blk': 'variety',
    })

    values = read_values_from_pb(options.addon_pb('jdmrt', 'dmrt'))
    assert values['duncanTerms'] == [ [ 'fert' ], [ 'block' ] ]
    assert values['blk'] is None

    # but the options themselves are untouched, so they come back if the
    # analysis takes the variable up again
    assert options.get_value(DUNCAN + 'blk') == 'variety'


def test_get_using_can_leave_out_the_addons():
    options = anova_options()
    set_values(options, { 'dep': 'yield', DUNCAN + 'blk': 'block' })
    assert options.get_using() == { 'yield', 'block' }
    assert options.get_using(include_addons=False) == { 'yield' }


def test_rename_using_renames_the_addons_variables():
    """a column rename reaches the addons' options too"""
    options = anova_options()
    set_values(options, {
        'factors': [ 'fert' ],
        DUNCAN + 'duncanTerms': [ [ 'fert' ] ],
    })
    options.rename_using({ 'fert': 'treatment' })
    assert options.get_value(DUNCAN + 'duncanTerms') == [ [ 'treatment' ] ]


def test_set_keeps_the_addons_options():
    """the engine sends back the analysis' own options only; the addons'
    options must survive that"""
    options = anova_options()
    options.set_value(DUNCAN + 'alpha', 0.01)
    options.set(options.own_pb())
    assert options.get_value(DUNCAN + 'alpha') == 0.01


def test_set_of_an_addons_option_is_a_change():
    """changing an addon's option reruns the analysis"""
    options = anova_options()
    incoming = Options.create([ { 'name': DUNCAN + 'alpha', 'type': 'Number', 'default': 0.01 } ])
    assert options.set(incoming.as_pb()) is True
