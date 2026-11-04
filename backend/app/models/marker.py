import uuid
from datetime import datetime
from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship
from app.database.session import Base


class LocationMarker(Base):
    """
    Physical NFC and QR Access Marker installed at hospital access points
    (entrances, reception desks, elevator vestibules, stairwells, and major junctions).
    Maps to an exact, human-verified spatial node in the building graph.
    """
    __tablename__ = "location_markers"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    project_id = Column(String(36), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    floor_plan_id = Column(String(36), ForeignKey("floor_plans.id", ondelete="SET NULL"), nullable=True)
    spatial_node_id = Column(String(36), ForeignKey("spatial_nodes.id", ondelete="CASCADE"), nullable=False)

    marker_code = Column(String(64), unique=True, index=True, nullable=False)  # e.g. "TR-HOSP-G-ENT"
    marker_type = Column(String(20), default="dual", nullable=False)  # nfc, qr, dual
    level_number = Column(Integer, default=1, nullable=False)
    level_name = Column(String(100), default="Ground Floor", nullable=False)
    location_description = Column(String(255), nullable=False)
    tactile_identifier = Column(String(255), nullable=True)  # e.g. "Braille tag at 140cm height, west door frame"
    is_active = Column(Boolean, default=True, nullable=False)

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    # Relationships
    project = relationship("Project", back_populates="markers")
    spatial_node = relationship("SpatialNode", back_populates="marker")

