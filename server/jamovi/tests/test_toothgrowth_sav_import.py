"""
Test the pyreadstat pipeline import with ToothGrowth.sav file.

This test is specifically designed to debug issues when importing
the Tooth Growth SPSS dataset.
"""

from pathlib import Path
import pytest

from jamovi.server.dataset import DataType, MeasureType
from jamovi.server.formatio.pyreadstat_pipeline import read


def resolve_test_data(filename: str) -> str:
    """Resolve path to test data file."""
    here_dir = Path(__file__).parent
    return str(here_dir / "data" / filename)


def progress_callback(value: float) -> None:
    """Simple progress callback that prints to stdout."""
    print(f"Progress: {value:.1%}")


def test_tooth_growth_sav_import(instance_model):
    """Test import of ToothGrowth.sav file using pyreadstat pipeline."""
    sav_path = resolve_test_data("Tooth Growth.sav")
    
    print(f"\nImporting file: {sav_path}")
    
    # Import the file
    read(instance_model, sav_path, progress_callback, format='sav')
    
    # Verify basic structure
    assert instance_model.row_count > 0, "No rows imported"
    print(f"✓ Row count: {instance_model.row_count}")
    
    # Get the dataset
    dataset = instance_model.dataset
    assert dataset.column_count > 0, "No columns imported"
    print(f"✓ Column count: {dataset.column_count}")
    
    # Print all columns for debugging
    for col_idx, column in enumerate(dataset):
        print(f"\n  Column {col_idx}: {column.name}")
        print(f"    Data type: {column.data_type}")
        print(f"    Measure type: {column.measure_type}")
        print(f"    Level count: {len(list(column.levels))}")
        
        # Print first few values
        if column.row_count > 0:
            values = list(column.get_values(0, min(3, column.row_count)))
            print(f"    Sample values: {values}")
        
        # Print levels if categorical
        if len(list(column.levels)) > 0:
            level_list = list(column.levels)[:5]
            print(f"    Levels (first 5): {level_list}")


def test_tooth_growth_column_names(instance_model):
    """Test that ToothGrowth column names are preserved."""
    sav_path = resolve_test_data("Tooth Growth.sav")
    read(instance_model, sav_path, progress_callback, format='sav')
    
    dataset = instance_model.dataset
    column_names = [col.name for col in dataset]
    
    print(f"\nColumn names: {column_names}")
    
    # ToothGrowth should have len, supp, and dose columns
    expected_names = {"len", "supp", "dose"}
    actual_names = set(column_names)
    
    # Check that at least some expected columns are present
    assert len(actual_names & expected_names) > 0, \
        f"Expected some of {expected_names}, got {actual_names}"


def test_tooth_growth_row_count(instance_model):
    """Test that ToothGrowth has the correct row count (60 rows)."""
    sav_path = resolve_test_data("Tooth Growth.sav")
    read(instance_model, sav_path, progress_callback, format='sav')
    
    # ToothGrowth has 60 rows
    print(f"\nRow count: {instance_model.row_count}")
    assert instance_model.row_count == 60, \
        f"Expected 60 rows, got {instance_model.row_count}"


def test_tooth_growth_numeric_column(instance_model):
    """Test that numeric column (len) is imported correctly."""
    sav_path = resolve_test_data("Tooth Growth.sav")
    read(instance_model, sav_path, progress_callback, format='sav')
    
    dataset = instance_model.dataset
    len_col = None
    for col in dataset:
        if col.name.lower() == "len":
            len_col = col
            break
    
    assert len_col is not None, "Column 'len' not found"
    print(f"\nFound 'len' column")
    print(f"  Data type: {len_col.data_type}")
    print(f"  Measure type: {len_col.measure_type}")
    
    # len should be numeric (INTEGER or DECIMAL)
    assert len_col.data_type in (DataType.INTEGER, DataType.DECIMAL), \
        f"Expected numeric type for 'len', got {len_col.data_type}"
    
    # Collect sample values to verify they import
    values = list(len_col.get_values(0, min(10, len_col.row_count)))
    print(f"  Sample values: {values}")
    assert len(values) > 0, "No values imported for 'len' column"


def test_tooth_growth_categorical_column(instance_model):
    """Test that categorical column (supp) is imported correctly."""
    sav_path = resolve_test_data("Tooth Growth.sav")
    read(instance_model, sav_path, progress_callback, format='sav')
    
    dataset = instance_model.dataset
    supp_col = None
    for col in dataset:
        if col.name.lower() == "supp":
            supp_col = col
            break
    
    assert supp_col is not None, "Column 'supp' not found"
    print(f"\nFound 'supp' column")
    print(f"  Data type: {supp_col.data_type}")
    print(f"  Measure type: {supp_col.measure_type}")
    
    # supp should be categorical (NOMINAL or ORDINAL)
    assert supp_col.measure_type in (MeasureType.NOMINAL, MeasureType.ORDINAL), \
        f"Expected categorical measure for 'supp', got {supp_col.measure_type}"
    
    # Check levels
    levels = list(supp_col.levels)
    print(f"  Level count: {len(levels)}")
    if levels:
        print(f"  Levels: {levels[:10]}")
    
    # Collect sample values
    values = list(supp_col.get_values(0, min(10, supp_col.row_count)))
    print(f"  Sample values: {values}")


def test_tooth_growth_all_values_importable(instance_model):
    """Test that all cell values can be read without errors."""
    sav_path = resolve_test_data("Tooth Growth.sav")
    read(instance_model, sav_path, progress_callback, format='sav')
    
    dataset = instance_model.dataset
    error_count = 0
    total_cells = 0

    # Read each column via supported bulk API and count values.
    for col in dataset:
        try:
            values = list(col.get_values(0, col.row_count))
            total_cells += len(values)
        except Exception as e:
            error_count += col.row_count
            print(f"Error reading column {col.name}: {e}")
    
    print(f"\nRead {total_cells} cells, {error_count} errors")
    assert error_count == 0, f"Encountered {error_count} errors reading cell values"


if __name__ == "__main__":
    pytest.main([__file__, "-v", "-s"])
