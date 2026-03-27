"""Tests for dataset/instance column weights behavior."""

from jamovi.server.dataset import DataSet
from jamovi.server.instancemodel import InstanceModel


def test_dataset_weights_roundtrip(empty_dataset: DataSet):
    """Setting weights on the dataset stores the selected column id."""
    ds = empty_dataset

    col_a = ds.append_column("a")
    col_b = ds.append_column("b")

    assert ds.weights == 0

    ds.set_weights(col_a.id)
    assert ds.weights == col_a.id

    ds.set_weights(col_b.id)
    assert ds.weights == col_b.id

    ds.set_weights(0)
    assert ds.weights == 0


def test_instance_model_set_weights_by_name(instance_model: InstanceModel):
    """InstanceModel resolves column names to weight ids and exposes helpers."""
    im = instance_model

    col_a = im.append_column("a")
    col_b = im.append_column("weights_col")

    assert im.weights == 0
    assert im.weights_name is None
    assert im.has_weights is False

    im.set_weights_by_name("weights_col")

    assert im.weights == col_b.id
    assert im.weights_name == "weights_col"
    assert im.has_weights is True

    # Switching by id should also update the reported name.
    im.set_weights(col_a.id)
    assert im.weights == col_a.id
    assert im.weights_name == "a"

    im.set_weights_by_name(None)
    assert im.weights == 0
    assert im.weights_name is None
    assert im.has_weights is False
