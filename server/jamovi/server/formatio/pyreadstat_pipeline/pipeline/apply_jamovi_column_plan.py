# ============================================================================
# Step 8: Apply plan to jamovi column
# Replace the jamovi column API here with the real one in your project.
# ============================================================================

from server.instancemodel import InstanceModel

from server.formatio.pyreadstat_pipeline.data_types.data_types import *


def apply_jamovi_column_plan(model: InstanceModel, column_name: str, plan: JamoviColumnPlan) -> None:
    """
    Mutate the jamovi column using a precomputed plan.

    Responsibility:
    - jamovi mutation only
    - no source inference
    - no value cleanup

    Expected jamovi-like API:
    - column.auto_measure = False
    - column.set_data_type(...)
    - column.measure_type = ...
    - column.clear_levels()
    - column.append_level(raw, label)
    """
    
    column = model.append_column(column_name)
    #column.auto_measure = False
    column.set_data_type(plan.data_type)
    column.set_measure_type(plan.measure_type)
    column.width = plan.column_width

    column.clear_levels()
    for raw, label in plan.levels:
        column.append_level(raw, str(label))

    if plan.variable_label:
        # Replace with the real jamovi property if needed.
        column.description = plan.variable_label
    
    if plan.missing_values:
        #inspect(missings)
        column.set_missing_values(plan.missing_values)
    return model
