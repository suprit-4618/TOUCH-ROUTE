import uuid
from datetime import datetime
from sqlalchemy import Boolean, Column, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship
from app.database.session import Base


class SpatialNode(Base):
    __tablename__ = "spatial_nodes"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    project_id = Column(String(36), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    floor_plan_id = Column(String(36), ForeignKey("floor_plans.id", ondelete="SET NULL"), nullable=True)
    
    # Multi-floor attributes
    level_number = Column(Integer, default=1, nullable=False)
    level_name = Column(String(100), default="Level 1", nullable=False)

    # Entity classification
    label = Column(String(255), nullable=False)
    node_type = Column(String(50), nullable=False)  # room, corridor, door, entrance, exit, stairs, elevator, restroom, reception, hazard
    room_number = Column(String(50), nullable=True)
    
    # Coordinates (Original floor-plan pixel coordinate system)
    x = Column(Float, nullable=False)
    y = Column(Float, nullable=False)
    bounding_box = Column(Text, nullable=True)  # JSON: {"min_x": float, "min_y": float, "max_x": float, "max_y": float}
    polygon_points = Column(Text, nullable=True)  # JSON-encoded array of points [[x, y], ...]
    
    # Verification & Provenance Lifecycle
    detection_source = Column(String(50), default="ai_detection", nullable=False)  # ai_detection, manual_entry, geometry_validation
    is_geometry_validated = Column(Boolean, default=False, nullable=False)
    is_user_verified = Column(Boolean, default=False, nullable=False)
    confidence = Column(Float, default=1.0, nullable=False)
    is_accessible = Column(Boolean, default=True, nullable=False)
    notes = Column(Text, nullable=True)
    raw_ai_metadata = Column(Text, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    project = relationship("Project", back_populates="spatial_nodes")
    marker = relationship("LocationMarker", back_populates="spatial_node", uselist=False, cascade="all, delete-orphan")


class SpatialEdge(Base):
    __tablename__ = "spatial_edges"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    project_id = Column(String(36), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    source_node_id = Column(String(36), ForeignKey("spatial_nodes.id", ondelete="CASCADE"), nullable=False)
    target_node_id = Column(String(36), ForeignKey("spatial_nodes.id", ondelete="CASCADE"), nullable=False)
    
    # Multi-floor routing
    level_number = Column(Integer, default=1, nullable=False)
    is_inter_floor = Column(Boolean, default=False, nullable=False)
    source_floor_id = Column(String(36), nullable=True)
    target_floor_id = Column(String(36), nullable=True)

    # Edge properties
    distance_meters = Column(Float, nullable=False, default=1.0)
    edge_type = Column(String(50), nullable=False, default="door")  # door, corridor_walkway, stair_transition, elevator_transition
    confidence = Column(Float, default=1.0, nullable=False)
    
    # Lifecycle & Verification
    detection_source = Column(String(50), default="ai_detection", nullable=False)  # ai_detection, manual_entry, geometry_validation
    is_geometry_validated = Column(Boolean, default=False, nullable=False)
    is_user_verified = Column(Boolean, default=False, nullable=False)
    is_accessible = Column(Boolean, default=True, nullable=False)
    
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    project = relationship("Project", back_populates="spatial_edges")
