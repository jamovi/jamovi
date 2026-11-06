"""tests for the svgs which get harvested from the results view"""

import asyncio
import re

from os import path

import pytest

from jamovi.server import jamovi_pb2 as jcoms
from jamovi.server.analyses import Analysis
from jamovi.server.analyses import Analyses
from jamovi.server.options import Options


class FakeDataset:
    """stands in for the InstanceModel, which set_svg() only needs a path from"""

    def __init__(self, instance_path: str):
        self.instance_path = instance_path


class FakeProject:
    """stands in for the project, which set_svg() only needs the data set from"""

    def __init__(self, instance_path: str):
        self._dataset = FakeDataset(instance_path)

    def get_dataset(self):
        return self._dataset


class FakeModules:
    """stands in for the module registry, which Analyses only subscribes to"""

    def add_listener(self, listener):
        pass


class FakeOptions:
    """stands in for the options, which serialize() only round-trips"""

    def compress(self):
        pass

    def as_pb(self):
        return jcoms.AnalysisOptions()

    def keep_file_ids(self, ids, pb=None):
        pass


@pytest.fixture
def analysis(temp_dir: str) -> Analysis:
    analysis = Analysis(
        FakeProject(temp_dir), 2, 'descriptives', 'jmv', FakeOptions(), None, enabled=True)
    analysis.results = jcoms.AnalysisResponse()
    return analysis


def serialize(analysis: Analysis, strip_content=False):
    """serialize an analysis, and read the first of its elements back"""
    saved_pb = jcoms.AnalysisResponse()
    saved_pb.ParseFromString(analysis.serialize(strip_content))
    return saved_pb.results.group.elements[0]


def add_svg(parent_pb, name: str):
    """add an svg element, as an analysis would have produced it"""
    element_pb = parent_pb.group.elements.add()
    element_pb.name = name
    element_pb.svg.content = '<div id="chart"></div>'
    element_pb.svg.scripts.append('chart.js')
    element_pb.svg.stylesheets.append('chart.css')
    return element_pb


def test_set_svg_stores_the_svg_as_a_resource(analysis, temp_dir):
    """the harvested svg is written alongside the analysis, as images are"""

    element_pb = add_svg(analysis.results.results, 'chart')

    rel_path = analysis.set_svg(['chart'], b'<svg><rect/></svg>')

    assert path.isfile(path.join(temp_dir, rel_path))
    with open(path.join(temp_dir, rel_path), 'rb') as file:
        assert file.read() == b'<svg><rect/></svg>'

    # and the results now point at it, so a save picks it up
    assert element_pb.svg.path == rel_path
    assert analysis.resources == [rel_path]


def test_stored_svgs_are_recognised_as_resources(analysis):
    """an .omv is read back with this pattern -- see formatio/omv.py"""

    add_svg(analysis.results.results, 'chart')
    rel_path = analysis.set_svg(['chart'], b'<svg/>')

    assert re.match('^[0-9][0-9]+ .+/resources/.+', rel_path)


def test_set_svg_addresses_elements_within_groups(analysis, temp_dir):
    """elements of the same name in different groups mustn't collide"""

    results_pb = analysis.results.results
    first_pb = results_pb.group.elements.add()
    first_pb.name = 'first'
    add_svg(first_pb, 'chart')
    second_pb = results_pb.group.elements.add()
    second_pb.name = 'second'
    add_svg(second_pb, 'chart')

    one = analysis.set_svg(['first', 'chart'], b'<svg>one</svg>')
    two = analysis.set_svg(['second', 'chart'], b'<svg>two</svg>')

    assert one != two
    with open(path.join(temp_dir, one), 'rb') as file:
        assert file.read() == b'<svg>one</svg>'


def test_set_svg_ignores_addresses_which_arent_svgs(analysis):
    """the client and the results can disagree, and mustn't blow up when they do"""

    results_pb = analysis.results.results
    table_pb = results_pb.group.elements.add()
    table_pb.name = 'table'
    table_pb.table.SetInParent()

    assert analysis.set_svg(['table'], b'<svg/>') is None
    assert analysis.set_svg(['nonexistent'], b'<svg/>') is None
    assert analysis.set_svg(['table', 'deeper'], b'<svg/>') is None
    assert analysis.resources == []


def test_serialize_keeps_the_html_alongside_the_svg(analysis):
    """the html draws the chart when reopened; the svg is only the fallback
    for when the module which drew it isn't installed"""

    add_svg(analysis.results.results, 'chart')
    rel_path = analysis.set_svg(['chart'], b'<svg/>')

    saved_svg_pb = serialize(analysis).svg

    assert saved_svg_pb.content == '<div id="chart"></div>'
    assert list(saved_svg_pb.scripts) == ['chart.js']
    assert list(saved_svg_pb.stylesheets) == ['chart.css']
    assert saved_svg_pb.path == rel_path


def test_serialize_keeps_the_html_when_no_svg_was_harvested(analysis):
    """without a harvested svg the html is all we have"""

    add_svg(analysis.results.results, 'chart')

    saved_svg_pb = serialize(analysis).svg

    assert saved_svg_pb.content == '<div id="chart"></div>'
    assert saved_svg_pb.path == ''


def test_templates_drop_the_svg(analysis):
    """as for images, a template keeps no rendered output"""

    add_svg(analysis.results.results, 'chart')
    analysis.set_svg(['chart'], b'<svg/>')

    saved_svg_pb = serialize(analysis, strip_content=True).svg

    assert saved_svg_pb.path == ''


def test_set_svgs_routes_each_part_to_its_analysis(temp_dir):
    """parts are addressed as '<analysis id>/<element address>'"""

    analyses = Analyses(FakeProject(temp_dir), FakeModules())

    first = Analysis(FakeProject(temp_dir), 2, 'first', 'jmv', None, None, enabled=True)
    first.results = jcoms.AnalysisResponse()
    add_svg(first.results.results, 'chart')

    second = Analysis(FakeProject(temp_dir), 3, 'second', 'jmv', None, None, enabled=True)
    second.results = jcoms.AnalysisResponse()
    add_svg(second.results.results, 'chart')

    analyses._analyses = [first, second]

    analyses.set_svgs({
        '2/chart': b'<svg>first</svg>',
        '3/chart': b'<svg>second</svg>',
        '9/chart': b'<svg>no such analysis</svg>',
        'notanid/chart': b'<svg>not an id</svg>',
    })

    assert first.resources != []
    assert second.resources != []
    with open(path.join(temp_dir, first.resources[0]), 'rb') as file:
        assert file.read() == b'<svg>first</svg>'
    with open(path.join(temp_dir, second.resources[0]), 'rb') as file:
        assert file.read() == b'<svg>second</svg>'


class FakeParent:
    """stands in for the Analyses, which rerun(), save() and set_results()
    notify"""

    def _notify_options_changed(self, analysis):
        pass

    def _notify_results_changed(self, analysis):
        pass

    def index_of(self, analysis):
        return 0


def test_state_is_dropped_from_files(temp_dir):
    """state from an .omv is R's serialization of arbitrary objects, which
    run the file's code when restored and used -- see drop_state()"""

    analysis_pb = jcoms.AnalysisResponse()
    analysis_pb.name = 'empty'
    analysis_pb.ns = 'jmv'
    analysis_pb.results.state = b'top'

    image_pb = analysis_pb.results.group.elements.add()
    image_pb.name = 'plot'
    image_pb.state = b'plot'
    image_pb.image.path = '01 empty/resources/plot.png'

    array_pb = analysis_pb.results.group.elements.add()
    array_pb.name = 'array'
    array_pb.array.header.state = b'header'
    item_pb = array_pb.array.elements.add()
    item_pb.group.elements.add().state = b'nested'

    analyses = Analyses(FakeProject(temp_dir), FakeModules())
    analysis = analyses.create_from_serial(analysis_pb.SerializeToString())

    results_pb = analysis.results.results
    assert results_pb.state == b''
    assert results_pb.group.elements[0].state == b''
    assert results_pb.group.elements[1].array.header.state == b''
    assert results_pb.group.elements[1].array.elements[0].group.elements[0].state == b''

    # the image still displays from the file
    assert results_pb.group.elements[0].image.path == '01 empty/resources/plot.png'

    # and the analysis runs from scratch before anything needs the state
    assert analysis.state_dropped is True


@pytest.mark.asyncio
async def test_export_runs_the_analysis_first(temp_dir):
    """an export renders from the state, so it must wait on a run"""

    analysis = Analysis(
        FakeProject(temp_dir), 2, 'descriptives', 'jmv', Options.create({}), FakeParent(), enabled=True)
    analysis.results = jcoms.AnalysisResponse()
    analysis.complete = True
    analysis.set_status(Analysis.Status.COMPLETE)
    analysis.state_dropped = True

    save = asyncio.create_task(analysis.save('/tmp/plot.png', 'plot'))
    await asyncio.sleep(0)

    assert analysis.complete is False
    assert analysis.status is Analysis.Status.NONE
    assert analysis.clear_state is True
    assert analysis.needs_op is False

    # neither the init, nor the results streamed during the run, release it
    analysis.set_results(jcoms.AnalysisResponse(), status=Analysis.Status.INITED)
    analysis.set_results(jcoms.AnalysisResponse(), False)
    await asyncio.sleep(0)
    assert analysis.needs_op is False

    # the run completing does
    analysis.set_results(jcoms.AnalysisResponse(), status=Analysis.Status.COMPLETE)
    await asyncio.sleep(0)
    assert analysis.needs_op is True

    analysis.op.set_result(None)
    await save


class FakeAnalysisMeta:
    """stands in for an analysis' entry in the module registry"""

    def __init__(self, ns, name, options, addons=()):
        self.ns = ns
        self.name = name
        self.defn = { 'options': options }
        self.addons = list(addons)

    def translate_defaults(self, module_meta, code):
        pass


class FakeModuleMeta:

    def __init__(self, *analyses):
        self.analyses = analyses

    def get(self, name):
        return next(filter(lambda a: a.name == name, self.analyses), None)


class FakeModuleRegistry:
    """stands in for the module registry, with modules in it"""

    def __init__(self, **modules):
        self._modules = modules
        self._listeners = [ ]

    def add_listener(self, listener):
        self._listeners.append(listener)

    def get(self, name):
        return self._modules[name]

    def notify(self, event):
        for listener in self._listeners:
            listener(event)


def anova_with_duncan():
    anova = FakeAnalysisMeta('jmv', 'anova', [
        { 'name': 'dep', 'type': 'Variable' },
        { 'name': 'factors', 'type': 'Variables' },
    ], addons=[ ('jdmrt', 'dmrt') ])
    dmrt = FakeAnalysisMeta('jdmrt', 'dmrt', [
        { 'name': 'data', 'type': 'Data' },
        { 'name': 'alpha', 'type': 'Number', 'default': 0.05 },
    ])
    modules = FakeModuleRegistry(
        jmv=FakeModuleMeta(anova),
        jdmrt=FakeModuleMeta(dmrt))
    return (modules, anova)


def test_an_analysis_carries_its_addons_options(temp_dir):
    """an addon's options are part of its analysis' options, named
    addons/<ns>/<name>/<option>, and the active addons go to the client"""

    modules, _ = anova_with_duncan()
    analyses = Analyses(FakeDataset(temp_dir), modules)
    analysis = analyses._construct(2, 'anova', 'jmv')

    assert [ (a.ns, a.name) for a in analysis.addons ] == [ ('jdmrt', 'dmrt') ]
    assert analysis.options.get_value('addons/jdmrt/dmrt/alpha') == 0.05
    assert analysis.options.get_value('addons/jdmrt/dmrt/data') is None

    response = jcoms.AnalysisResponse()
    analysis.write_addons_pb(response)
    assert [ (a.ns, a.name) for a in response.addons ] == [ ('jdmrt', 'dmrt') ]


def test_an_unreadable_addon_is_left_out(temp_dir):
    """an addon which can't be read doesn't take its analysis down with it"""

    modules, anova = anova_with_duncan()
    anova.addons.append(('missing', 'addon'))
    analyses = Analyses(FakeDataset(temp_dir), modules)
    analysis = analyses._construct(2, 'anova', 'jmv')

    assert analysis.load_error is False
    assert [ (a.ns, a.name) for a in analysis.addons ] == [ ('jdmrt', 'dmrt') ]


def test_an_analysis_cant_use_the_addons_names(temp_dir):
    """addons/ (and results/) names are reserved"""

    modules, anova = anova_with_duncan()
    anova.defn['options'].append({ 'name': 'addons/jdmrt/dmrt/alpha', 'type': 'Number' })
    analyses = Analyses(FakeDataset(temp_dir), modules)
    analysis = analyses._construct(2, 'anova', 'jmv')

    assert analysis.load_error is True


def test_analyses_are_recreated_when_their_addons_change(temp_dir):
    """installing an addon reaches the analyses already open"""

    modules, anova = anova_with_duncan()
    anova.addons.clear()
    analyses = Analyses(FakeDataset(temp_dir), modules)

    options = Options.create(anova.defn['options'])
    options.set_value('dep', 'yield')
    analyses.create(2, 'anova', 'jmv', options.as_pb())
    assert analyses[2].addons == [ ]

    anova.addons.append(('jdmrt', 'dmrt'))
    modules.notify({ 'type': 'addonsChanged' })

    analysis = analyses[2]
    assert [ (a.ns, a.name) for a in analysis.addons ] == [ ('jdmrt', 'dmrt') ]
    assert analysis.options.get_value('dep') == 'yield'
    assert analysis.options.get_value('addons/jdmrt/dmrt/alpha') == 0.05
