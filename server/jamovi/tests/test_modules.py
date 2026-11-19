"""tests for addons, and the versions of their parents they support"""

import pytest

from jamovi.server.modules import modules as modules_module
from jamovi.server.modules.modules import Modules
from jamovi.server.appinfo import app_info


@pytest.fixture(autouse=True)
def compatible(monkeypatch):
    """every module's R version is the app's, so its analyses are read"""
    monkeypatch.setattr(modules_module, 'determine_r_version', lambda v: app_info.r_version)


def module_defn(name, *analyses):
    return {
        'name': name,
        'title': name.upper(),
        'version': '1.0.0',
        'analyses': [ {
            'ns': name,
            'title': analysis['name'].title(),
            'menuGroup': name,
            'menuTitle': analysis['name'],
            'options': [ ],
            **analysis,
        } for analysis in analyses ],
    }


def read(*defns):
    modules = Modules(None)
    modules._modules = [ modules._parse_module_defn(defn) for defn in defns ]
    modules._attach_addons()
    return modules


def anova(modules):
    return next(a for a in next(m for m in modules if m.name == 'jmv').analyses if a.name == 'anova')


def test_interface_version_and_addon_for_are_read():
    """addonFor is ns::name, or an object with the versions it supports"""

    modules = read(
        module_defn('jmv', { 'name': 'anova', 'interfaceVersion': 3 }),
        module_defn('jdmrt',
            { 'name': 'dmrt', 'addonFor': 'jmv::anova' },
            { 'name': 'other', 'addonFor': { 'analysis': 'jmv::anova', 'versions': [ 2, 3 ] } }))

    assert anova(modules).interface_version == 3
    jdmrt = next(m for m in modules if m.name == 'jdmrt')
    (dmrt, other) = jdmrt.analyses
    assert dmrt.addon_for == [ 'jmv', 'anova' ]
    assert dmrt.addon_versions is None
    assert other.addon_for == [ 'jmv', 'anova' ]
    assert other.addon_versions == (2, 3)


def test_an_analysis_without_an_interface_version_is_version_1():

    modules = read(module_defn('jmv', { 'name': 'anova' }))

    assert anova(modules).interface_version == 1


def test_an_addon_without_versions_supports_any():

    modules = read(
        module_defn('jmv', { 'name': 'anova', 'interfaceVersion': 7 }),
        module_defn('jdmrt', { 'name': 'dmrt', 'addonFor': 'jmv::anova' }))

    assert anova(modules).addons == [ ('jdmrt', 'dmrt') ]
    assert anova(modules).skipped_addons == [ ]


def test_an_addon_is_attached_to_a_version_it_supports():

    modules = read(
        module_defn('jmv', { 'name': 'anova', 'interfaceVersion': 3 }),
        module_defn('jdmrt', { 'name': 'dmrt', 'addonFor': { 'analysis': 'jmv::anova', 'versions': [ 2, 3 ] } }))

    assert anova(modules).addons == [ ('jdmrt', 'dmrt') ]
    assert anova(modules).skipped_addons == [ ]


def test_an_addon_is_skipped_for_a_version_it_doesnt_support():

    modules = read(
        module_defn('jmv', { 'name': 'anova', 'interfaceVersion': 4 }),
        module_defn('jdmrt', { 'name': 'dmrt', 'addonFor': { 'analysis': 'jmv::anova', 'versions': [ 2, 3 ] } }))

    assert anova(modules).addons == [ ]
    assert anova(modules).skipped_addons == [ ('jdmrt', 'dmrt', (2, 3)) ]
