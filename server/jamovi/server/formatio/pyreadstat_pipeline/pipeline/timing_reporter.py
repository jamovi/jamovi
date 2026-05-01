from dataclasses import dataclass


@dataclass
class PipelineTimingStats:
    """Aggregated timing counters for pipeline stages."""

    first_pass_profile_chunks_seconds: float = 0.0
    first_pass_finalize_columns_seconds: float = 0.0
    first_pass_total_seconds: float = 0.0
    first_pass_rows: int = 0
    first_pass_chunks: int = 0

    write_levels_seconds: float = 0.0
    write_normalize_seconds: float = 0.0
    write_values_seconds: float = 0.0
    write_pass_total_seconds: float = 0.0
    write_rows: int = 0
    write_chunks: int = 0

    pipeline_total_seconds: float = 0.0


def get_timing_parts(timing: PipelineTimingStats) -> dict[str, float]:
    """Return named timing components used for bottleneck detection."""
    return {
        "first_pass.profile_chunks": timing.first_pass_profile_chunks_seconds,
        "first_pass.finalize_columns": timing.first_pass_finalize_columns_seconds,
        "write_pass.write_levels": timing.write_levels_seconds,
        "write_pass.normalize": timing.write_normalize_seconds,
        "write_pass.write_values": timing.write_values_seconds,
    }


def get_bottleneck_stage(timing: PipelineTimingStats) -> tuple[str, float]:
    """Return the slowest stage name and duration."""
    timing_parts = get_timing_parts(timing)
    return max(timing_parts.items(), key=lambda item: item[1])


def format_pipeline_timing_summary(timing: PipelineTimingStats) -> str:
    """Render the final one-line timing summary."""
    bottleneck_stage, bottleneck_seconds = get_bottleneck_stage(timing)

    return (
        "pipeline_timing_summary "
        f"total_seconds={timing.pipeline_total_seconds:.6f} "
        f"first_pass_seconds={timing.first_pass_total_seconds:.6f} "
        f"write_pass_seconds={timing.write_pass_total_seconds:.6f} "
        f"profile_chunks_seconds={timing.first_pass_profile_chunks_seconds:.6f} "
        f"finalize_columns_seconds={timing.first_pass_finalize_columns_seconds:.6f} "
        f"write_levels_seconds={timing.write_levels_seconds:.6f} "
        f"normalize_seconds={timing.write_normalize_seconds:.6f} "
        f"write_values_seconds={timing.write_values_seconds:.6f} "
        f"first_pass_rows={timing.first_pass_rows} "
        f"write_rows={timing.write_rows} "
        f"first_pass_chunks={timing.first_pass_chunks} "
        f"write_chunks={timing.write_chunks} "
        f"bottleneck_stage={bottleneck_stage} "
        f"bottleneck_seconds={bottleneck_seconds:.6f}"
    )
