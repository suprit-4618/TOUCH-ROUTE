from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, ConfigDict, Field


class ProjectBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=255, description="Project name")
    description: Optional[str] = Field(None, description="Detailed description")
    building_name: str = Field(..., min_length=1, max_length=255, description="Building name")
    address: Optional[str] = Field(None, max_length=500, description="Building physical address")
    is_demo: bool = Field(False, description="Whether this is sample demonstration data")


class ProjectCreate(ProjectBase):
    pass


class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    building_name: Optional[str] = None
    address: Optional[str] = None
    status: Optional[str] = None


class ProjectSummary(BaseModel):
    id: str
    name: str
    description: Optional[str] = None
    building_name: str
    address: Optional[str] = None
    is_demo: bool
    status: str
    floor_plans_count: int = 0
    spatial_nodes_count: int = 0
    verified_nodes_count: int = 0
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ProjectDetail(ProjectSummary):
    floor_plans: List[dict] = []
    spatial_nodes: List[dict] = []


class ProjectStats(BaseModel):
    total_projects: int
    demo_projects: int
    verified_buildings: int
    total_accessible_routes: int
    print_ready_tactile_maps: int
