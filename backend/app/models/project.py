import uuid
from datetime import datetime
from sqlalchemy import Boolean, Column, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship
from app.database.session import Base


class Project(Base):
    __tablename__ = "projects"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    building_name = Column(String(255), nullable=False)
    address = Column(String(500), nullable=True)
    is_demo = Column(Boolean, default=False, nullable=False)
    status = Column(String(50), default="draft", nullable=False)  # draft, analyzing, verified, ready
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    # Relationships
    floor_plans = relationship("FloorPlan", back_populates="project", cascade="all, delete-orphan")
    spatial_nodes = relationship("SpatialNode", back_populates="project", cascade="all, delete-orphan")
    spatial_edges = relationship("SpatialEdge", back_populates="project", cascade="all, delete-orphan")
    tactile_jobs = relationship("TactileJob", back_populates="project", cascade="all, delete-orphan")
    markers = relationship("LocationMarker", back_populates="project", cascade="all, delete-orphan")


class FloorPlan(Base):
    __tablename__ = "floor_plans"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    project_id = Column(String(36), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(255), nullable=False)
    level_number = Column(Integer, default=1, nullable=False)
    level_name = Column(String(100), default="Level 1", nullable=False)
    sort_order = Column(Integer, default=0, nullable=False)
    original_filename = Column(String(255), nullable=False)
    file_path = Column(String(500), nullable=False)
    file_size = Column(Integer, nullable=False)
    mime_type = Column(String(100), nullable=False)
    width = Column(Integer, nullable=True)
    height = Column(Integer, nullable=True)
    scale_meters_per_pixel = Column(Float, nullable=True, default=0.05)
    is_scale_calibrated = Column(Boolean, default=False, nullable=False)
    calibration_metadata = Column(Text, nullable=True)  # JSON: points, reference distance
    processed_file_path = Column(String(500), nullable=True)
    processed_width = Column(Integer, nullable=True)
    processed_height = Column(Integer, nullable=True)
    preprocessing_metadata = Column(Text, nullable=True)  # JSON: steps applied
    analysis_status = Column(String(50), default="uploaded", nullable=False)  # uploaded, processed, ready_for_ai, completed, failed
    raw_analysis = Column(Text, nullable=True)  # JSON-encoded raw AI output
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    # Relationships
    project = relationship("Project", back_populates="floor_plans")

