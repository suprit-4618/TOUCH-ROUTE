export interface Project {
  id: string;
  name: string;
  description?: string;
  building_name: string;
  address?: string;
  is_demo: boolean;
  status: 'draft' | 'analyzing' | 'verified' | 'ready';
  floor_plans_count: number;
  spatial_nodes_count: number;
  verified_nodes_count: number;
  created_at: string;
  updated_at: string;
}

export interface FloorPlanSummary {
  id: string;
  project_id: string;
  name: string;
  original_filename: string;
  file_size: number;
  mime_type: string;
  width?: number;
  height?: number;
  level_number?: number;
  level_name?: string;
  sort_order?: number;
  scale_meters_per_pixel?: number;
  is_scale_calibrated?: boolean;
  processed_file_path?: string;
  analysis_status: 'uploaded' | 'processed' | 'ready_for_ai' | 'completed' | 'failed' | string;
  preprocessing_metadata?: string;
  calibration_metadata?: string;
  created_at: string;
}

export interface ProjectDetail extends Project {
  floor_plans: FloorPlanSummary[];
  spatial_nodes: SpatialNode[];
}

export interface BoundingBox {
  min_x: number;
  min_y: number;
  max_x: number;
  max_y: number;
}

export interface SpatialNode {
  id: string;
  project_id: string;
  floor_plan_id?: string;
  level_number: number;
  level_name?: string;
  label: string;
  node_type: 'room' | 'corridor' | 'door' | 'entrance' | 'exit' | 'stairs' | 'elevator' | 'restroom' | 'hazard' | 'reception' | 'emergency_exit';
  room_number?: string;
  x: number;
  y: number;
  bounding_box?: BoundingBox;
  polygon_points?: number[][];
  detection_source: 'ai_detected' | 'geometry_validated' | 'manual_annotation';
  is_geometry_validated: boolean;
  is_user_verified: boolean;
  confidence: number;
  is_accessible: boolean;
  notes?: string;
  raw_ai_metadata?: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
}

export interface SpatialNodeCreate {
  project_id: string;
  floor_plan_id?: string;
  level_number?: number;
  level_name?: string;
  label: string;
  node_type: string;
  room_number?: string;
  x: number;
  y: number;
  bounding_box?: BoundingBox;
  polygon_points?: number[][];
  detection_source?: 'ai_detected' | 'geometry_validated' | 'manual_annotation';
  is_geometry_validated?: boolean;
  is_user_verified?: boolean;
  confidence?: number;
  is_accessible?: boolean;
  notes?: string;
}

export interface SpatialNodeUpdate {
  label?: string;
  node_type?: string;
  room_number?: string;
  x?: number;
  y?: number;
  bounding_box?: BoundingBox;
  polygon_points?: number[][];
  detection_source?: string;
  is_geometry_validated?: boolean;
  is_user_verified?: boolean;
  confidence?: number;
  is_accessible?: boolean;
  notes?: string;
}

export interface SpatialEdge {
  id: string;
  project_id: string;
  floor_plan_id?: string;
  source_node_id: string;
  target_node_id: string;
  connection_type: 'door' | 'corridor' | 'opening' | 'stairs' | 'elevator';
  distance_meters: number;
  is_accessible: boolean;
  is_bidirectional: boolean;
  level_number: number;
  is_inter_floor: boolean;
  confidence: number;
  detection_source: 'ai_detected' | 'geometry_validated' | 'manual_annotation';
  is_geometry_validated?: boolean;
  is_user_verified: boolean;
  notes?: string;
  created_at?: string;
}

export interface SpatialEdgeCreate {
  project_id: string;
  floor_plan_id?: string;
  source_node_id: string;
  target_node_id: string;
  connection_type?: string;
  distance_meters?: number;
  is_accessible?: boolean;
  is_bidirectional?: boolean;
  level_number?: number;
  is_inter_floor?: boolean;
  confidence?: number;
  detection_source?: string;
  is_geometry_validated?: boolean;
  is_user_verified?: boolean;
  notes?: string;
}

export interface SpatialEdgeUpdate {
  connection_type?: string;
  distance_meters?: number;
  is_accessible?: boolean;
  is_bidirectional?: boolean;
  confidence?: number;
  is_user_verified?: boolean;
  notes?: string;
}

export interface AIInterpretationRequest {
  floorplan_id: string;
  provider?: string;
  confidence_threshold?: number;
  auto_connect_topology?: boolean;
  building_name_hint?: string;
}

export interface AIInterpretationResponse {
  project_id: string;
  floor_plan_id: string;
  floorplan_id?: string;
  level_number: number;
  model_used: string;
  provider: string;
  elements_detected_count: number;
  nodes_persisted_count: number;
  edges_persisted_count: number;
  nodes_detected?: number;
  edges_detected?: number;
  geometry_validation_errors: string[];
  nodes: SpatialNode[];
  edges: SpatialEdge[];
  status: string;
  message: string;
}

export interface BatchVerifyRequest {
  project_id: string;
  floor_plan_id?: string;
  level_number?: number;
  node_ids?: string[];
  verify_all_geometry_validated?: boolean;
  verify_associated_edges?: boolean;
}

export interface BatchVerifyResponse {
  nodes_verified_count: number;
  edges_verified_count: number;
  total_verified_nodes: number;
  total_nodes: number;
  is_fully_verified: boolean;
  message: string;
}

export interface ProjectStats {
  total_projects: number;
  demo_projects: number;
  verified_buildings: number;
  total_accessible_routes: number;
  print_ready_tactile_maps: number;
}

export interface NavigationStep {
  step_number: number;
  instruction: string;
  action: 'start' | 'straight' | 'turn_left' | 'turn_right' | 'slight_left' | 'slight_right' | 'enter_door' | 'stairs' | 'elevator' | 'arrive';
  distance_meters: number;
  target_node_id: string;
  target_label: string;
  orientation_degrees?: number;
  landmark_cue?: string;
  level_name?: string;
  is_verified?: boolean;
}

export interface RouteResult {
  project_id: string;
  start_node_id: string;
  destination_node_id: string;
  total_distance_meters: number;
  estimated_walking_seconds: number;
  accessible: boolean;
  is_scale_calibrated?: boolean;
  is_verified_safe: boolean;
  has_unverified_segments: boolean;
  unverified_warning?: string;
  path_node_ids: string[];
  steps: NavigationStep[];
  disclaimer: string;
}

export interface DestinationItem {
  id: string;
  label: string;
  room_number?: string;
  node_type: string;
  level_number: number;
  level_name: string;
  is_accessible: boolean;
  spoken_aliases: string[];
}

export interface DestinationMatchResponse {
  spoken_query: string;
  exact_match?: DestinationItem;
  candidates: DestinationItem[];
  is_ambiguous: boolean;
  clarification_prompt?: string;
}

export interface TactileJobCreate {
  project_id: string;
  floor_plan_id?: string;
  output_format?: 'stl' | 'svg' | 'pdf' | 'all' | string;
  braille_enabled?: boolean;
  base_width_mm?: number;
  base_depth_mm?: number;
  base_thickness_mm?: number;
  wall_height_mm?: number;
  wall_thickness_mm?: number;
}

export interface TactileJobResponse {
  id: string;
  project_id: string;
  floor_plan_id?: string;
  status: string;
  output_format: string;
  braille_enabled: boolean;
  dimensions_mm: {
    width: number;
    depth?: number;
    height: number;
    base_depth?: number;
    relief_height?: number;
  };
  triangle_count?: number;
  estimated_print_time_minutes: number;
  validation_status: string;
  scale_label?: string;
  physical_scale_ratio?: number;
  verified_nodes_count?: number;
  verified_edges_count?: number;
  preview_svg_url?: string;
  download_urls?: {
    stl: string;
    svg: string;
    pdf: string;
  };
}

export interface MeshFacet {
  normal: [number, number, number];
  v1: [number, number, number];
  v2: [number, number, number];
  v3: [number, number, number];
}

export interface MeshSummaryResponse {
  total_triangles: number;
  sampled_triangles: number;
  facets: MeshFacet[];
}

export interface FloorPlanUploadResponse {
  id: string;
  project_id: string;
  name: string;
  filename: string;
  file_size_bytes: number;
  mime_type: string;
  width?: number;
  height?: number;
  status: string;
  message: string;
}

export interface PreprocessResponse {
  floorplan_id: string;
  original_dimensions: { width: number; height: number };
  processed_dimensions: { width: number; height: number };
  preprocessing_steps: string[];
  contrast_metric: number;
  status: string;
  processed_image_url: string;
}

export interface ScaleCalibrationResponse {
  floorplan_id: string;
  scale_meters_per_pixel: number;
  pixels_per_meter: number;
  pixel_distance_measured?: number;
  known_distance_meters?: number;
  is_scale_calibrated: boolean;
  status: string;
  message: string;
}

export type PositioningState =
  | 'INITIALIZING'
  | 'POSITION_CONFIRMED'
  | 'POSITION_ESTIMATED'
  | 'POSITION_UNCERTAIN'
  | 'POSITION_LOST'
  | 'RELOCALIZATION_REQUIRED';

export interface LocationMarker {
  id: string;
  project_id: string;
  floor_plan_id?: string;
  spatial_node_id: string;
  marker_code: string;
  marker_type: 'nfc' | 'qr' | 'dual';
  level_number: number;
  level_name: string;
  location_description: string;
  tactile_identifier?: string;
  is_active: boolean;
  building_name?: string;
  node_label?: string;
  node_type?: string;
  room_number?: string;
  x?: number;
  y?: number;
  created_at?: string;
  updated_at?: string;
}

export interface MarkerResolutionResult {
  success: boolean;
  marker_id: string;
  marker_code: string;
  marker_type: string;
  project_id: string;
  building_name: string;
  floor_plan_id?: string;
  level_number: number;
  level_name: string;
  spatial_node_id: string;
  node_label: string;
  node_type: string;
  room_number?: string;
  x: number;
  y: number;
  location_description: string;
  tactile_identifier?: string;
  voice_announcement: string;
  disclaimer: string;
}

export interface PositionUpdatePayload {
  session_id: string;
  project_id: string;
  estimated_x: number;
  estimated_y: number;
  current_level: number;
  heading_degrees: number;
  step_count: number;
  active_step_index: number;
  route_node_ids?: string[];
  provider_source: string;
}

export interface PositionUpdateResult {
  session_id: string;
  state: PositioningState;
  confidence_score: number;
  snapped_x: number;
  snapped_y: number;
  cross_track_error_meters: number;
  along_track_distance_meters: number;
  nearest_node_id?: string;
  nearest_node_label?: string;
  distance_to_next_landmark_meters?: number;
  next_landmark_label?: string;
  current_step_index: number;
  instruction?: string;
  is_uncertain: boolean;
  safety_alert?: string;
  relocalization_prompt?: string;
  provider_type: string;
  disclaimer?: string;
}

