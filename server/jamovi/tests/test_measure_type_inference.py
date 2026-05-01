"""Tests for metadata measure inference in pyreadstat pipeline."""

from types import SimpleNamespace

from jamovi.core import MeasureType

from jamovi.server.formatio.pyreadstat_pipeline.pipeline.infer_metadata.measure_type import measure_type


def test_scale_with_value_labels_is_treated_as_ordinal():
    """Legacy parity: scale + value labels should be interpreted as ordinal."""
    meta = SimpleNamespace(variable_measures={"x": "scale"})

    inferred = measure_type(meta, "x", level_labels={1: "Low", 2: "High"})

    assert inferred is MeasureType.ORDINAL


def test_unmapped_measure_with_labels_defaults_to_ordinal():
    """Legacy compatibility: unknown measure with labels should be ordinal."""
    meta = SimpleNamespace(variable_measures={"x": "unknown"})

    inferred = measure_type(meta, "x", level_labels={1: "A"})

    assert inferred is MeasureType.ORDINAL
