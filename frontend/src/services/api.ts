import {
  AIInterpretationRequest,
  AIInterpretationResponse,
  BatchVerifyRequest,
  BatchVerifyResponse,
  DestinationItem,
  DestinationMatchResponse,
  FloorPlanSummary,
  FloorPlanUploadResponse,
  LocationMarker,
  MarkerResolutionResult,
  MeshSummaryResponse,
  PositionUpdatePayload,
  PositionUpdateResult,
  PreprocessResponse,
  Project,
  ProjectDetail,
  ProjectStats,
  RouteResult,
  ScaleCalibrationResponse,
  SpatialEdge,
  SpatialEdgeCreate,
  SpatialEdgeUpdate,
  SpatialNode,
  SpatialNodeCreate,
  SpatialNodeUpdate,
  TactileJobCreate,
  TactileJobResponse,
} from '../types';

const BACKEND_URL = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');
const API_BASE = BACKEND_URL ? `${BACKEND_URL}/api/v1` : '/api/v1';

export const api = {
  async getHealth() {
    const res = await fetch(`${API_BASE}/health`);
    if (!res.ok) throw new Error('Failed to fetch backend health status');
    return res.json();
  },

  async getProjects(includeDemo: boolean = false): Promise<Project[]> {
    const res = await fetch(`${API_BASE}/projects?include_demo=${includeDemo}`);
    if (!res.ok) throw new Error('Failed to fetch projects');
    return await res.json();
  },

  async getProjectStats(): Promise<ProjectStats> {
    const res = await fetch(`${API_BASE}/projects/stats`);
    if (!res.ok) throw new Error('Failed to fetch stats');
    return await res.json();
  },

  async getProjectDetail(id: string): Promise<ProjectDetail> {
    const res = await fetch(`${API_BASE}/projects/${id}`);
    if (!res.ok) throw new Error(`Failed to load project details for ${id}`);
    return res.json();
  },

  async createProject(data: {
    name: string;
    building_name: string;
    description?: string;
    address?: string;
    is_demo?: boolean;
  }): Promise<Project> {
    const res = await fetch(`${API_BASE}/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || 'Failed to create project');
    }
    return res.json();
  },

  // --- Stage 2 Floor Plan Upload & Processing APIs ---

  async uploadFloorPlan(
    projectId: string,
    file: File,
    name?: string
  ): Promise<FloorPlanUploadResponse> {
    const formData = new FormData();
    formData.append('file', file);
    if (name) {
      formData.append('name', name);
    }

    const res = await fetch(`${API_BASE}/uploads/${projectId}`, {
      method: 'POST',
      body: formData,
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || 'Failed to upload floor plan');
    }
    return res.json();
  },

  async getFloorPlan(floorplanId: string): Promise<FloorPlanSummary> {
    const res = await fetch(`${API_BASE}/floorplans/${floorplanId}`);
    if (!res.ok) throw new Error(`Failed to fetch floor plan ${floorplanId}`);
    return res.json();
  },

  async preprocessFloorPlan(
    floorplanId: string,
    options: {
      enhance_contrast?: boolean;
      denoise?: boolean;
      sharpen_edges?: boolean;
      max_dimension?: number;
    } = {}
  ): Promise<PreprocessResponse> {
    const res = await fetch(`${API_BASE}/floorplans/${floorplanId}/preprocess`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        enhance_contrast: options.enhance_contrast ?? true,
        denoise: options.denoise ?? true,
        sharpen_edges: options.sharpen_edges ?? true,
        max_dimension: options.max_dimension ?? 2800,
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || 'Failed to preprocess floor plan with OpenCV');
    }
    return res.json();
  },

  async calibrateScale(
    floorplanId: string,
    data: {
      point1?: { x: number; y: number };
      point2?: { x: number; y: number };
      known_distance_meters?: number;
      manual_scale_meters_per_pixel?: number;
    }
  ): Promise<ScaleCalibrationResponse> {
    const res = await fetch(`${API_BASE}/floorplans/${floorplanId}/calibrate-scale`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || 'Failed to calibrate scale');
    }
    return res.json();
  },

  async deleteFloorPlan(floorplanId: string): Promise<void> {
    const res = await fetch(`${API_BASE}/floorplans/${floorplanId}`, {
      method: 'DELETE',
    });
    if (!res.ok) throw new Error('Failed to delete floor plan');
  },

  getFloorPlanRawUrl(floorplanId: string): string {
    return `${API_BASE}/uploads/${floorplanId}/file`;
  },

  getFloorPlanProcessedUrl(floorplanId: string): string {
    return `${API_BASE}/uploads/${floorplanId}/processed-image`;
  },

  // --- Stage 3 Spatial Intelligence & Map Editor APIs ---

  async interpretFloorPlan(data: AIInterpretationRequest): Promise<AIInterpretationResponse> {
    const res = await fetch(`${API_BASE}/analysis/interpret`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || 'Failed to interpret floor plan with AI provider');
    }
    return res.json();
  },

  async getSpatialNodes(
    projectId: string,
    floorPlanId?: string,
    levelNumber?: number
  ): Promise<SpatialNode[]> {
    const params = new URLSearchParams();
    if (floorPlanId) params.append('floor_plan_id', floorPlanId);
    if (levelNumber !== undefined) params.append('level_number', levelNumber.toString());

    const url = `${API_BASE}/analysis/${projectId}/nodes${params.toString() ? `?${params.toString()}` : ''}`;
    const res = await fetch(url);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || 'Failed to fetch spatial nodes');
    }
    return res.json();
  },

  async getSpatialEdges(
    projectId: string,
    levelNumber?: number
  ): Promise<SpatialEdge[]> {
    const params = new URLSearchParams();
    if (levelNumber !== undefined) params.append('level_number', levelNumber.toString());

    const url = `${API_BASE}/analysis/${projectId}/edges${params.toString() ? `?${params.toString()}` : ''}`;
    const res = await fetch(url);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || 'Failed to fetch spatial edges');
    }
    return res.json();
  },

  async createSpatialNode(data: SpatialNodeCreate): Promise<SpatialNode> {
    const res = await fetch(`${API_BASE}/analysis/nodes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || 'Failed to create spatial node');
    }
    return res.json();
  },

  async updateSpatialNode(nodeId: string, data: SpatialNodeUpdate): Promise<SpatialNode> {
    const res = await fetch(`${API_BASE}/analysis/nodes/${nodeId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || 'Failed to update spatial node');
    }
    return res.json();
  },

  async deleteSpatialNode(nodeId: string): Promise<void> {
    const res = await fetch(`${API_BASE}/analysis/nodes/${nodeId}`, {
      method: 'DELETE',
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || 'Failed to delete spatial node');
    }
  },

  async createSpatialEdge(data: SpatialEdgeCreate): Promise<SpatialEdge> {
    const res = await fetch(`${API_BASE}/analysis/edges`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || 'Failed to create spatial edge');
    }
    return res.json();
  },

  async updateSpatialEdge(edgeId: string, data: SpatialEdgeUpdate): Promise<SpatialEdge> {
    const res = await fetch(`${API_BASE}/analysis/edges/${edgeId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || 'Failed to update spatial edge');
    }
    return res.json();
  },

  async deleteSpatialEdge(edgeId: string): Promise<void> {
    const res = await fetch(`${API_BASE}/analysis/edges/${edgeId}`, {
      method: 'DELETE',
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || 'Failed to delete spatial edge');
    }
  },

  async batchVerify(data: BatchVerifyRequest): Promise<BatchVerifyResponse> {
    const res = await fetch(`${API_BASE}/analysis/batch-verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || 'Failed to batch verify elements');
    }
    return res.json();
  },

  // --- Stage 4 Voice Navigation & Tactile APIs ---

  async calculateRoute(data: {
    project_id: string;
    start_node_id: string;
    destination_node_id: string;
    accessible_only: boolean;
    verified_only?: boolean;
  }): Promise<RouteResult> {
    const res = await fetch(`${API_BASE}/navigation/route`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...data,
        verified_only: data.verified_only ?? true,
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || 'Failed to calculate indoor route');
    }
    return res.json();
  },

  async getVerifiedDestinations(projectId: string): Promise<DestinationItem[]> {
    const res = await fetch(`${API_BASE}/navigation/${projectId}/destinations`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || 'Failed to fetch verified destinations');
    }
    return res.json();
  },

  async matchSpokenDestination(projectId: string, spokenQuery: string): Promise<DestinationMatchResponse> {
    const res = await fetch(`${API_BASE}/navigation/${projectId}/match-destination`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ spoken_query: spokenQuery }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || 'Failed to match spoken destination');
    }
    return res.json();
  },

  async generateTactileMap(data: TactileJobCreate): Promise<TactileJobResponse> {
    const res = await fetch(`${API_BASE}/tactile/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || 'Failed to generate 3D tactile map geometry');
    }
    return res.json();
  },

  async getTactilePreviewSvg(jobId: string): Promise<string> {
    const res = await fetch(`${API_BASE}/tactile/${jobId}/preview`);
    if (!res.ok) throw new Error('Failed to load tactile preview SVG');
    return res.text();
  },

  async getProjectTactilePreviewSvg(projectId: string, floorPlanId?: string): Promise<string> {
    const url = `${API_BASE}/tactile/project/${projectId}/preview${floorPlanId ? `?floor_plan_id=${floorPlanId}` : ''}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('Failed to generate project tactile preview');
    return res.text();
  },

  async getTactileMeshSummary(jobId: string): Promise<MeshSummaryResponse> {
    const res = await fetch(`${API_BASE}/tactile/${jobId}/mesh-summary`);
    if (!res.ok) throw new Error('Failed to load 3D mesh geometry data');
    return res.json();
  },

  getTactileDownloadUrl(jobId: string, format: 'stl' | 'svg' | 'pdf'): string {
    return `${API_BASE}/tactile/${jobId}/download/${format}`;
  },

  // Location Markers (NFC & QR Access Points)
  async resolveMarker(markerCode: string): Promise<MarkerResolutionResult> {
    const res = await fetch(`${API_BASE}/markers/resolve/${encodeURIComponent(markerCode.trim().toUpperCase())}`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || 'Access marker not found or inactive');
    }
    return res.json();
  },

  async getProjectMarkers(projectId: string): Promise<LocationMarker[]> {
    const res = await fetch(`${API_BASE}/markers/project/${projectId}`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || 'Failed to fetch access markers');
    }
    return res.json();
  },

  async createMarker(data: Partial<LocationMarker>): Promise<LocationMarker> {
    const res = await fetch(`${API_BASE}/markers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || 'Failed to register location marker');
    }
    return res.json();
  },

  async deleteMarker(markerId: string): Promise<void> {
    const res = await fetch(`${API_BASE}/markers/${markerId}`, {
      method: 'DELETE',
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || 'Failed to delete marker');
    }
  },

  // Indoor Positioning & Relocalization
  async updatePosition(payload: PositionUpdatePayload): Promise<PositionUpdateResult> {
    const res = await fetch(`${API_BASE}/positioning/update`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || 'Failed to update indoor positioning');
    }
    return res.json();
  },

  async relocalizePosition(payload: {
    session_id: string;
    project_id: string;
    marker_code?: string;
    confirmed_node_id?: string;
  }): Promise<PositionUpdateResult> {
    const res = await fetch(`${API_BASE}/positioning/relocalize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || 'Failed to relocalize position');
    }
    return res.json();
  },
};
