"""Repeatable Floor-Plan Validation Runner for TouchRoute.

Executes ground truth benchmark evaluation across synthetic and real-world floor plans.
Records:
1. Original floor-plan dimensions.
2. Number of manually identified rooms.
3. AI-detected rooms.
4. Correct and incorrect detections (Precision, Recall, F1).
5. Door and corridor connectivity accuracy.
6. Coordinate transformation accuracy.
7. Graph connectivity errors.
8. Route correctness.
9. Multi-floor transition correctness.
"""

import json
from pathlib import Path
from typing import List, Optional
from app.models.spatial import SpatialEdge, SpatialNode
from app.services.spatial.coordinates import CoordinateTransformer
from app.services.validation.evaluator import FloorPlanEvaluator
from app.services.validation.schemas import FloorPlanGroundTruth, ValidationMetricReport


def load_ground_truth(file_path: str) -> FloorPlanGroundTruth:
    """Loads a ground truth specification from JSON."""
    with open(file_path, "r", encoding="utf-8") as f:
        data = json.load(f)
    return FloorPlanGroundTruth(**data)


def run_benchmark_validation(
    ground_truth_file: str,
    detected_nodes: List[SpatialNode],
    detected_edges: List[SpatialEdge],
    transformer: Optional[CoordinateTransformer] = None,
) -> ValidationMetricReport:
    """Runs evaluation over provided detected spatial topology against ground truth."""
    gt = load_ground_truth(ground_truth_file)
    evaluator = FloorPlanEvaluator(match_distance_threshold_px=80.0)
    report = evaluator.evaluate(
        ground_truth=gt,
        detected_nodes=detected_nodes,
        detected_edges=detected_edges,
        transformer=transformer,
    )
    return report


def format_report_as_markdown(report: ValidationMetricReport) -> str:
    """Formats the validation metric report into a clear markdown table."""
    status_emoji = "[PASS]" if report.summary_status == "PASS" else ("[MARGINAL]" if report.summary_status == "MARGINAL" else "[FAIL]")
    dataset_badge = "**SYNTHETIC BENCHMARK**" if report.dataset_type == "synthetic" else "**REAL-WORLD EXTERNAL BLUEPRINT**"

    lines = [
        f"### TouchRoute Floor Plan Validation Report: `{report.test_id}`",
        f"- **Dataset Classification**: {dataset_badge}",
        f"- **Facility**: {report.building_name}",
        f"- **Overall Evaluation Status**: {status_emoji}",
        "",
        "| Evaluation Metric | Measured Value | Benchmark Target | Result |",
        "| :--- | :--- | :--- | :--- |",
        f"| **Original Dimensions** | `{report.original_dimensions['width']} x {report.original_dimensions['height']} px` | Exact CAD Reference | Validated |",
        f"| **Scale Calibration** | `{report.scale_meters_per_pixel or 'Uncalibrated'}` m/px | Known Reference Distance | {'Metric Ready' if report.scale_meters_per_pixel else 'Relative'} |",
        f"| **Ground Truth Rooms** | `{report.manual_rooms_count}` | Manually Identified | Verified Baseline |",
        f"| **Detected Spaces** | `{report.detected_rooms_count}` | AI / Extraction Pipeline | Complete |",
        f"| **Correct Detections (TP)** | `{report.correct_detections}` | >= 80% of manual | {'Pass' if report.detection_recall >= 0.8 else 'Check'} |",
        f"| **Incorrect Detections (FP)** | `{report.incorrect_detections}` | <= 20% false alarm | {'Pass' if report.detection_precision >= 0.8 else 'Warning'} |",
        f"| **Missed Rooms (FN)** | `{report.missed_detections}` | Minimised | {'Pass' if report.missed_detections == 0 else 'Notice'} |",
        f"| **Detection Precision / Recall** | `{report.detection_precision:.1%}` / `{report.detection_recall:.1%}` (F1: `{report.detection_f1:.2f}`) | >= 80% | {'Pass' if report.detection_f1 >= 0.8 else 'Needs Review'} |",
        f"| **Doorway Connectivity Accuracy** | `{report.door_connectivity_accuracy:.1%}` | >= 75% | {'Pass' if report.door_connectivity_accuracy >= 0.75 else 'Deficient'} |",
        f"| **Corridor Connectivity Accuracy** | `{report.corridor_connectivity_accuracy:.1%}` | >= 80% | {'Pass' if report.corridor_connectivity_accuracy >= 0.80 else 'Deficient'} |",
        f"| **Multi-Floor Transition Correctness** | `{report.multi_floor_transition_correctness:.1%}` | 100% stair/elevator links | {'Pass' if report.multi_floor_transition_correctness >= 0.99 else 'Deficient'} |",
        f"| **Coordinate Transformation Accuracy** | `{report.coordinate_transformation_accuracy:.2f}%` (Max Error: `{report.max_coordinate_pixel_error:.1f}px`) | >= 99.0% | {'Pass' if report.coordinate_transformation_accuracy >= 99.0 else 'Inaccurate'} |",
        f"| **Deterministic Route Correctness** | `{report.route_correctness:.1%}` | 100% valid safe paths | {'Pass' if report.route_correctness >= 0.99 else 'Check'} |",
        "",
    ]

    if report.graph_connectivity_errors:
        lines.append("**Graph Connectivity Diagnostics:**")
        for err in report.graph_connectivity_errors:
            lines.append(f"- [WARNING] {err}")
        lines.append("")

    lines.append("**Audit Notes & Provenance:**")
    for note in report.audit_notes:
        lines.append(f"- {note}")

    return "\n".join(lines)
