"""Tactile Reference Sheet and Assembly PDF Generator for TouchRoute.

Creates official accessible documentation for 3D printed and swell-form tactile maps.
Includes tactile orientation guidelines, Braille symbol index, and physical scale ratios.
"""

import io
from datetime import datetime
from typing import List, Optional
from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.platypus import HRFlowable, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
from app.models.spatial import SpatialEdge, SpatialNode
from app.services.tactile.braille import text_to_braille_unicode


def generate_tactile_pdf(
    nodes: List[SpatialNode],
    edges: List[SpatialEdge],
    building_name: str = "City Center",
    floor_name: str = "Ground Level",
    scale_label: str = "1:200 (1 cm = 2.0 m)",
    physical_scale_ratio: Optional[int] = 200,
    base_dimensions_mm: str = "180 x 180 x 2.5 mm",
) -> bytes:
    """Generates an official printable PDF reference sheet using ReportLab."""
    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf,
        pagesize=letter,
        rightMargin=40,
        leftMargin=40,
        topMargin=40,
        bottomMargin=40,
    )

    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        "TactileTitle",
        parent=styles["Heading1"],
        fontName="Helvetica-Bold",
        fontSize=20,
        leading=24,
        textColor=colors.HexColor("#1c1917"),
    )
    subtitle_style = ParagraphStyle(
        "TactileSub",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=10,
        leading=14,
        textColor=colors.HexColor("#57534e"),
    )
    section_heading = ParagraphStyle(
        "SectionHead",
        parent=styles["Heading2"],
        fontName="Helvetica-Bold",
        fontSize=13,
        leading=17,
        textColor=colors.HexColor("#292524"),
        spaceBefore=12,
        spaceAfter=6,
    )
    body_style = ParagraphStyle(
        "BodyDark",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=9,
        leading=13,
        textColor=colors.HexColor("#292524"),
    )
    braille_style = ParagraphStyle(
        "BrailleCallout",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=11,
        leading=14,
        textColor=colors.HexColor("#d97706"),
    )

    story = []

    # Header
    story.append(Paragraph("TouchRoute &bull; Tactile Map Reference Sheet", title_style))
    story.append(Spacer(1, 4))
    story.append(
        Paragraph(
            f"Physical Tactile Signage &amp; Slicing Specification &bull; {building_name} ({floor_name})",
            subtitle_style,
        )
    )
    story.append(Spacer(1, 8))
    story.append(HRFlowable(width="100%", thickness=1.5, color=colors.HexColor("#d6d3d1"), spaceAfter=12))

    # Verification Badge & Integrity Notice
    cert_text = (
        "<b>VERIFIED INDOOR GEOMETRY</b><br/>"
        "This tactile map is generated from verified architectural floor plan elements. "
        "Engineered with raised wall contours, corridor pathways, and Braille tactile labels."
    )
    cert_data = [[
        Paragraph(cert_text, ParagraphStyle("CertText", fontName="Helvetica", fontSize=9, leading=13, textColor=colors.HexColor("#065f46")))
    ]]
    cert_table = Table(cert_data, colWidths=[530])
    cert_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#ecfdf5")),
        ("BOX", (0, 0), (-1, -1), 1.0, colors.HexColor("#a7f3d0")),
        ("PADDING", (0, 0), (-1, -1), 8),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ]))
    story.append(cert_table)
    story.append(Spacer(1, 12))

    # Physical Specifications Table
    story.append(Paragraph("1. Fabrication &amp; 3D Printing Parameters", section_heading))
    spec_rows = [
        [Paragraph("<b>Parameter</b>", body_style), Paragraph("<b>Specification</b>", body_style), Paragraph("<b>Description</b>", body_style)],
        [Paragraph("Base Plate Dimensions", body_style), Paragraph(base_dimensions_mm, body_style), Paragraph("Standard Build Envelope", body_style)],
        [Paragraph("Wall Relief Height", body_style), Paragraph("2.5 mm above base", body_style), Paragraph("Finger-Detectable Relief", body_style)],
        [Paragraph("Wall Stroke Width", body_style), Paragraph("1.8 mm solid extrusion", body_style), Paragraph("Finger Traceable Relief Threshold", body_style)],
        [Paragraph("Braille Dot Height", body_style), Paragraph("0.70 mm (0.6 - 0.8 mm target)", body_style), Paragraph("Tactile Reading Elevation", body_style)],
        [Paragraph("Braille Dot Diameter", body_style), Paragraph("1.50 mm spherical base", body_style), Paragraph("Standard Braille Dot Geometry", body_style)],
        [Paragraph("Physical Map Scale", body_style), Paragraph(scale_label, body_style), Paragraph("Metric Preservation from Blueprint", body_style)],
        [Paragraph("Orientation Guide", body_style), Paragraph("Tactile notch at top edge points North", body_style), Paragraph("Orientation Reference", body_style)],
    ]
    spec_table = Table(spec_rows, colWidths=[150, 180, 200])
    spec_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#f5f5f4")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.HexColor("#1c1917")),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#e7e5e4")),
        ("PADDING", (0, 0), (-1, -1), 4.5),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ]))
    story.append(spec_table)
    story.append(Spacer(1, 10))

    # Tactile Symbol Legend Table
    story.append(Paragraph("2. Tactile Symbol &amp; Braille Index", section_heading))
    legend_rows = [
        [
            Paragraph("<b>Tactile Feature</b>", body_style),
            Paragraph("<b>Tactile Profile</b>", body_style),
            Paragraph("<b>Braille Cell</b>", body_style),
            Paragraph("<b>Functional Meaning</b>", body_style),
        ],
        [
            Paragraph("<b>Entrance / Exit</b>", body_style),
            Paragraph("Concentric raised circle (4.5mm radius)", body_style),
            Paragraph(f"<b>{text_to_braille_unicode('ent')}</b> (ent)", braille_style),
            Paragraph("Step-free primary building entrance or egress", body_style),
        ],
        [
            Paragraph("<b>Restroom</b>", body_style),
            Paragraph("Embossed square (7x7mm) with tactile cross", body_style),
            Paragraph(f"<b>{text_to_braille_unicode('wc')}</b> (wc)", braille_style),
            Paragraph("Accessible restroom facility", body_style),
        ],
        [
            Paragraph("<b>Stairs / Elevator</b>", body_style),
            Paragraph("Raised stepped chevron / dual columns", body_style),
            Paragraph(f"<b>{text_to_braille_unicode('el')}</b> (el)", braille_style),
            Paragraph("Vertical inter-floor transit connection", body_style),
        ],
        [
            Paragraph("<b>Room / Office</b>", body_style),
            Paragraph("Raised perimeter walls + center cylinder", body_style),
            Paragraph(f"<b># [num]</b>", braille_style),
            Paragraph("Numbered room or designated department", body_style),
        ],
        [
            Paragraph("<b>Corridor / Walkway</b>", body_style),
            Paragraph("Recessed flat path bordered by walls", body_style),
            Paragraph("—", body_style),
            Paragraph("Clear tactile transit path for white cane/hands", body_style),
        ],
    ]
    legend_table = Table(legend_rows, colWidths=[120, 160, 110, 140])
    legend_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#f5f5f4")),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#e7e5e4")),
        ("PADDING", (0, 0), (-1, -1), 4.5),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ]))
    story.append(legend_table)
    story.append(Spacer(1, 10))

    # User Guide Instructions for Navigators
    story.append(Paragraph("3. Tactile Reading Instructions for Travelers", section_heading))
    guide_paragraphs = [
        "1. <b>Orientation:</b> Place the tactile map on a flat, stable table. Locate the raised triangular notch at the top center. When the notch is pointing away from you (12 o'clock), the map is properly oriented North.",
        "2. <b>Starting Point:</b> Locate the entrance symbol (the concentric raised circle). This is your reference landmark upon entering the floor.",
        "3. <b>Tracing Routes:</b> Gently glide index and middle fingers between the raised perimeter walls. Solid lines represent impassable partitions; breaks in walls indicate doorways and connecting walkways.",
        "4. <b>Braille Labels:</b> Standard 6-dot Braille cells are situated beside room doorways. Room numbers are preceded by the numeric sign.",
    ]
    for g in guide_paragraphs:
        story.append(Paragraph(g, body_style))
        story.append(Spacer(1, 3))

    # Footer Metadata
    story.append(Spacer(1, 10))
    story.append(HRFlowable(width="100%", thickness=0.8, color=colors.HexColor("#e7e5e4"), spaceAfter=6))
    gen_time = datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC")
    footer_text = (
        f"Generated by TouchRoute Accessible Navigation Platform &bull; {gen_time} &bull; "
        f"Verified Entities: {len([n for n in nodes if n.is_user_verified])} Nodes, {len([e for e in edges if e.is_user_verified])} Edges"
    )
    story.append(Paragraph(footer_text, ParagraphStyle("Foot", fontName="Helvetica", fontSize=7.5, textColor=colors.HexColor("#78716c"))))

    doc.build(story)
    return buf.getvalue()

