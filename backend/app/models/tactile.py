import uuid
from datetime import datetime
from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship
from app.database.session import Base


class TactileJob(Base):
    __tablename__ = "tactile_jobs"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    project_id = Column(String(36), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    status = Column(String(50), default="pending", nullable=False)  # pending, generating, completed, failed
    output_format = Column(String(20), default="stl", nullable=False)  # stl, svg, tactile_pdf
    braille_enabled = Column(Boolean, default=True, nullable=False)
    layer_thickness_mm = Column(String(20), default="2.0", nullable=False)
    file_path = Column(String(500), nullable=True)
    parameters_json = Column(Text, nullable=True)
    error_message = Column(Text, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    project = relationship("Project", back_populates="tactile_jobs")

