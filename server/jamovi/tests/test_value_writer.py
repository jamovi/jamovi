"""Tests for storage writer adapters used by pass-two writes."""

from unittest.mock import Mock

import polars as pl

from jamovi.server.formatio.pyreadstat_pipeline.pipeline.pass_two.value_writer import InstanceModelValueWriter


def test_instance_model_value_writer_prefers_initing_path():
    """Writer should call set_values_initing when the model supports it."""
    model = Mock()
    writer = InstanceModelValueWriter(model)

    payload = [pl.Series("a", [1, 2])]
    writer.write_values([0], 5, payload)

    model.set_values_initing.assert_called_once_with([0], 5, payload)
    model.set_values.assert_not_called()


def test_instance_model_value_writer_falls_back_without_initing_path():
    """Writer should fallback to set_values when initing path is not available."""
    model = Mock()
    model.set_values_initing.side_effect = AttributeError("missing")
    writer = InstanceModelValueWriter(model)

    payload = [pl.Series("a", [1, 2])]
    writer.write_values(["a"], 1, payload)

    model.set_values.assert_called_once_with(["a"], 1, payload)
