"""2D Tactile Vector SVG Generator for TouchRoute.

Generates high-contrast, publication-grade SVG tactile relief diagrams
optimized for swell-form (microcapsule) tactile paper and digital inspection.
Includes genuine 6-dot Braille matrices, tactile symbols, and orientation markers.
"""

import json
import math
from typing import Any, Dict, List, Optional, Tuple
from app.models.spatial import SpatialEdge, SpatialNode
from app.services.tactile.braille import (
    get_braille_dot_coordinates,
    text_to_braille_unicode,
)


def parse_bounding_box(bbox_raw: Any) -> Optional[Dict[str, float]]:
    """Safely extracts bounding box dictionary from JSON strings, dicts, or objects."""
    if not bbox_raw:
        return None
    if isinstance(bbox_raw, dict):
        return bbox_raw
    if isinstance(bbox_raw, str):
        try:
            val = json.loads(bbox_raw)
            if isinstance(val, dict):
                return val
        except Exception:
            return None
    if hasattr(bbox_raw, "__dict__"):
        return bbox_raw.__dict__
    return None


def generate_tactile_svg(
    nodes: List[SpatialNode],
    edges: List[SpatialEdge],
    width_mm: float = 180.0,
    height_mm: float = 180.0,
    scale_meters_per_pixel: Optional[float] = None,
    building_name: str = "Tactile Facility",
    floor_name: str = "Ground Level",
    braille_enabled: bool = True,
) -> str:
    """Generates an accessible, swell-form tactile SVG document."""
    # Filter strictly human-verified elements
    verified_nodes = [n for n in nodes if n.is_user_verified]
    verified_edges = [e for e in edges if e.is_user_verified]

    if not verified_nodes:
        # Return fallback empty state SVG
        return f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width_mm} {height_mm}" width="{width_mm}mm" height="{height_mm}mm">
          <rect width="{width_mm}" height="{height_mm}" fill="#f5f5f4" stroke="#d6d3d1" stroke-width="2"/>
          <text x="{width_mm/2}" y="{height_mm/2}" font-family="sans-serif" font-size="6" fill="#78716c" text-anchor="middle">No human-verified spatial geometry available</text>
        </svg>"""

    # Coordinate mapping from pixels to millimeters
    margin_x = 15.0
    margin_top = 22.0
    margin_bottom = 32.0

    build_w = width_mm - 2 * margin_x
    build_h = height_mm - (margin_top + margin_bottom)

    min_px_x = min(n.x for n in verified_nodes)
    max_px_x = max(n.x for n in verified_nodes)
    min_px_y = min(n.y for n in verified_nodes)
    max_px_y = max(n.y for n in verified_nodes)

    for n in verified_nodes:
        bbox = parse_bounding_box(n.bounding_box)
        if bbox:
            min_px_x = min(min_px_x, bbox.get("min_x", min_px_x))
            max_px_x = max(max_px_x, bbox.get("max_x", max_px_x))
            min_px_y = min(min_px_y, bbox.get("min_y", min_px_y))
            max_px_y = max(max_px_y, bbox.get("max_y", max_px_y))

    span_x = max(max_px_x - min_px_x, 50.0)
    span_y = max(max_px_y - min_px_y, 50.0)

    scale = min(build_w / span_x, build_h / span_y)
    offset_x = margin_x + (build_w - span_x * scale) / 2.0
    offset_y = margin_top + (build_h - span_y * scale) / 2.0

    def to_svg_coords(px_x: float, px_y: float) -> Tuple[float, float]:
        sx = offset_x + (px_x - min_px_x) * scale
        sy = offset_y + (px_y - min_px_y) * scale
        return round(sx, 2), round(sy, 2)

    # Physical scale calculation
    scale_caption = "Relative uncalibrated scale"
    if scale_meters_per_pixel and scale_meters_per_pixel > 0:
        meters_per_mm = (1.0 / scale) * scale_meters_per_pixel
        ratio = int(round(meters_per_mm * 1000.0))
        scale_caption = f"Scale 1:{ratio} (1 cm = {meters_per_mm * 10:.1f} m)"

    # Build SVG content
    svg_lines = [
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width_mm} {height_mm}" width="{width_mm}mm" height="{height_mm}mm" role="img" aria-label="Tactile Map for {building_name} {floor_name}">',
        f'  <title>Tactile Map: {building_name} - {floor_name}</title>',
        '  <defs>',
        '    <style>',
        '      .base { fill: #ffffff; stroke: #000000; stroke-width: 1.5; }',
        '      .wall { fill: none; stroke: #000000; stroke-width: 1.8; stroke-linejoin: round; stroke-linecap: round; }',
        '      .path { fill: none; stroke: #000000; stroke-width: 1.0; stroke-dasharray: 2.5, 1.5; }',
        '      .symbol-entrance { fill: #000000; stroke: #ffffff; stroke-width: 0.8; }',
        '      .symbol-room { fill: #000000; }',
        '      .symbol-wc { fill: #000000; stroke: #ffffff; stroke-width: 0.6; }',
        '      .braille-dot { fill: #000000; }',
        '      .label-text { font-family: sans-serif; font-size: 3.5px; font-weight: bold; fill: #000000; }',
        '      .braille-text { font-family: "Segoe UI Symbol", "Apple Braille", "DejaVu Sans", sans-serif; font-size: 5px; fill: #000000; }',
        '      .legend-text { font-family: sans-serif; font-size: 3.0px; fill: #000000; }',
        '    </style>',
        '  </defs>',
        '',
        '  <!-- LAYER 1: BASE PLATE & TACTILE ORIENTATION NOTCH -->',
        f'  <g id="base-plate">',
        f'    <rect width="{width_mm}" height="{height_mm}" class="base" rx="4"/>',
        f'    <!-- Tactile Orientation Notch (Top Center indicates North) -->',
        f'    <polygon points="{width_mm/2 - 8},{2} {width_mm/2},{8} {width_mm/2 + 8},{2}" fill="#000000"/>',
        f'    <text x="{width_mm/2}" y="{12}" class="label-text" text-anchor="middle">NORTH (TACTILE NOTCH)</text>',
        f'  </g>',
        '',
        '  <!-- LAYER 2: VERIFIED CONNECTING PATHWAYS -->',
        '  <g id="corridors-and-paths">',
    ]

    for e in verified_edges:
        src = next((n for n in verified_nodes if n.id == e.source_node_id), None)
        tgt = next((n for n in verified_nodes if n.id == e.target_node_id), None)
        if src and tgt:
            sx, sy = to_svg_coords(src.x, src.y)
            tx, ty = to_svg_coords(tgt.x, tgt.y)
            svg_lines.append(f'    <line x1="{sx}" y1="{sy}" x2="{tx}" y2="{ty}" class="path"/>')

    svg_lines.extend([
        '  </g>',
        '',
        '  <!-- LAYER 3: VERIFIED ROOM BOUNDARY WALLS -->',
        '  <g id="tactile-walls">',
    ])

    for n in verified_nodes:
        bbox = parse_bounding_box(n.bounding_box)
        if bbox:
            bx0, by0 = to_svg_coords(bbox.get("min_x", n.x), bbox.get("min_y", n.y))
            bx1, by1 = to_svg_coords(bbox.get("max_x", n.x), bbox.get("max_y", n.y))
            rx = min(bx0, bx1)
            ry = min(by0, by1)
            rw = abs(bx1 - bx0)
            rd = abs(by1 - by0)
            svg_lines.append(f'    <rect x="{rx}" y="{ry}" width="{rw}" height="{rd}" class="wall" rx="1"/>')

    svg_lines.extend([
        '  </g>',
        '',
        '  <!-- LAYER 4: TACTILE WAYPOINT SYMBOLS -->',
        '  <g id="tactile-symbols">',
    ])

    for n in verified_nodes:
        sx, sy = to_svg_coords(n.x, n.y)
        ntype = n.node_type.lower()
        if ntype in ("entrance", "exit"):
            # Double concentric ring for entrance
            svg_lines.append(f'    <circle cx="{sx}" cy="{sy}" r="4.0" class="symbol-entrance"/>')
            svg_lines.append(f'    <circle cx="{sx}" cy="{sy}" r="1.5" fill="#ffffff"/>')
        elif ntype == "restroom":
            svg_lines.append(f'    <rect x="{sx-3.5}" y="{sy-3.5}" width="7.0" height="7.0" class="symbol-wc" rx="0.5"/>')
            svg_lines.append(f'    <line x1="{sx-2}" y1="{sy}" x2="{sx+2}" y2="{sy}" stroke="#ffffff" stroke-width="0.8"/>')
            svg_lines.append(f'    <line x1="{sx}" y1="{sy-2}" x2="{sx}" y2="{sy+2}" stroke="#ffffff" stroke-width="0.8"/>')
        elif ntype in ("stairs", "elevator"):
            svg_lines.append(f'    <rect x="{sx-3.5}" y="{sy-3.5}" width="7.0" height="7.0" fill="#000000"/>')
            svg_lines.append(f'    <line x1="{sx-2.5}" y1="{sy-1.5}" x2="{sx+2.5}" y2="{sy-1.5}" stroke="#ffffff" stroke-width="0.6"/>')
            svg_lines.append(f'    <line x1="{sx-2.5}" y1="{sy+1.5}" x2="{sx+2.5}" y2="{sy+1.5}" stroke="#ffffff" stroke-width="0.6"/>')
        else:
            svg_lines.append(f'    <circle cx="{sx}" cy="{sy}" r="2.2" class="symbol-room"/>')

    svg_lines.extend([
        '  </g>',
        '',
        '  <!-- LAYER 5: BRAILLE LABELS (SWELL-PAPER DOTS & UNICODE) -->',
        '  <g id="braille-labels">',
    ])

    if braille_enabled:
        for n in verified_nodes:
            sx, sy = to_svg_coords(n.x, n.y)
            label_txt = ""
            if n.room_number:
                label_txt = str(n.room_number)[:4]
            elif n.node_type in ("entrance", "exit"):
                label_txt = "ent"
            elif n.node_type == "restroom":
                label_txt = "wc"
            elif len(n.label) <= 5:
                label_txt = n.label[:4]

            if label_txt:
                dots = get_braille_dot_coordinates(
                    text=label_txt,
                    origin_x=sx + 4.5,
                    origin_y=sy - 3.0,
                    dot_spacing=1.8,
                    cell_spacing=4.2,
                )
                for bx, by in dots:
                    svg_lines.append(f'    <circle cx="{bx}" cy="{by}" r="0.6" class="braille-dot"/>')
                # Also include Unicode Braille for screen readers
                unicode_b = text_to_braille_unicode(label_txt)
                svg_lines.append(f'    <text x="{sx + 4.5}" y="{sy + 5.0}" class="braille-text">{unicode_b}</text>')

    svg_lines.extend([
        '  </g>',
        '',
        '  <!-- LAYER 6: TACTILE LEGEND & REFERENCE -->',
        '  <g id="tactile-legend">',
        f'    <line x1="{margin_x}" y1="{height_mm - margin_bottom + 4}" x2="{width_mm - margin_x}" y2="{height_mm - margin_bottom + 4}" stroke="#000000" stroke-width="0.8"/>',
        f'    <circle cx="{margin_x + 5}" cy="{height_mm - margin_bottom + 12}" r="3.0" class="symbol-entrance"/>',
        f'    <text x="{margin_x + 10}" y="{height_mm - margin_bottom + 13}" class="legend-text">Entrance (⠢⠝⠞)</text>',
        f'    <rect x="{margin_x + 48}" y="{height_mm - margin_bottom + 9}" width="6.0" height="6.0" class="symbol-wc"/>',
        f'    <text x="{margin_x + 56}" y="{height_mm - margin_bottom + 13}" class="legend-text">Restroom (⠺⠉)</text>',
        f'    <circle cx="{margin_x + 95}" cy="{height_mm - margin_bottom + 12}" r="2.0" class="symbol-room"/>',
        f'    <text x="{margin_x + 100}" y="{height_mm - margin_bottom + 13}" class="legend-text">Room / Waypoint</text>',
        f'    <text x="{width_mm - margin_x}" y="{height_mm - margin_bottom + 22}" class="legend-text" text-anchor="end">{scale_caption}</text>',
        f'    <text x="{margin_x}" y="{height_mm - margin_bottom + 22}" class="legend-text">{building_name} &bull; {floor_name}</text>',
        '  </g>',
        '</svg>',
    ])

    return "\n".join(svg_lines)

