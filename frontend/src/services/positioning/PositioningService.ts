/**
 * TouchRoute Indoor Positioning Service.
 *
 * Implements a provider-based positioning architecture separating
 * continuous physical localization from static route calculation.
 *
 * Supports:
 * - Real DeviceMotion accelerometer step-detection.
 * - DeviceOrientation compass heading tracking.
 * - Controlled Walking Simulation along route waypoints (for testing & development).
 * - Map-matching and cross-track error validation via backend safety gates.
 * - Uncertainty and Relocalization state triggers.
 */

import { api } from '../api';
import {
  PositioningState,
  PositionUpdatePayload,
  PositionUpdateResult,
  SpatialNode,
} from '../../types';

export type PositioningSubscriber = (result: PositionUpdateResult) => void;

export class PositioningService {
  private sessionId: string;
  private projectId: string;
  private currentLevel: number = 1;
  private routeNodes: SpatialNode[] = [];
  private activeStepIndex: number = 0;

  // Spatial coordinates
  private currentX: number = 0;
  private currentY: number = 0;
  private currentHeading: number = 0;
  private stepCount: number = 0;
  private currentState: PositioningState = 'INITIALIZING';

  // Real sensor tracking
  private isListeningSensors: boolean = false;
  private lastAccelMag: number = 0;
  private stepThreshold: number = 11.8; // m/s^2 peak threshold
  private lastStepTime: number = 0;

  // Simulation state
  private isSimulating: boolean = false;
  private simInterval: any = null;
  private simProgress: number = 0.0; // 0.0 to 1.0 along current segment
  private simSegmentIndex: number = 0;

  private subscribers: Set<PositioningSubscriber> = new Set();

  constructor(projectId: string, initialNode?: SpatialNode) {
    this.projectId = projectId;
    this.sessionId = `sess_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    if (initialNode) {
      this.currentX = initialNode.x;
      this.currentY = initialNode.y;
      this.currentLevel = initialNode.level_number || 1;
      this.currentState = 'POSITION_CONFIRMED';
    }
  }

  public subscribe(fn: PositioningSubscriber): () => void {
    this.subscribers.add(fn);
    return () => this.subscribers.delete(fn);
  }

  private notify(result: PositionUpdateResult) {
    this.currentState = result.state;
    this.currentX = result.snapped_x;
    this.currentY = result.snapped_y;
    this.subscribers.forEach((fn) => fn(result));
  }

  public setRoute(nodes: SpatialNode[], activeStepIndex: number = 0) {
    this.routeNodes = nodes;
    this.activeStepIndex = activeStepIndex;
    this.simSegmentIndex = 0;
    this.simProgress = 0.0;

    if (nodes.length > 0 && this.currentState === 'INITIALIZING') {
      this.currentX = nodes[0].x;
      this.currentY = nodes[0].y;
      this.currentLevel = nodes[0].level_number || 1;
      this.currentState = 'POSITION_CONFIRMED';
    }
  }

  public setActiveStep(stepIndex: number) {
    this.activeStepIndex = stepIndex;
  }

  /**
   * Manually anchor position (e.g. from NFC/QR marker scan or confirmed landmark).
   */
  public anchorToNode(node: SpatialNode, markerCode?: string) {
    this.currentX = node.x;
    this.currentY = node.y;
    this.currentLevel = node.level_number || 1;
    this.currentState = 'POSITION_CONFIRMED';

    const result: PositionUpdateResult = {
      session_id: this.sessionId,
      state: 'POSITION_CONFIRMED',
      confidence_score: 1.0,
      snapped_x: node.x,
      snapped_y: node.y,
      cross_track_error_meters: 0.0,
      along_track_distance_meters: this.stepCount * 0.75,
      nearest_node_id: node.id,
      nearest_node_label: node.label,
      current_step_index: this.activeStepIndex,
      is_uncertain: false,
      instruction: `Position established at ${node.label}.`,
      provider_type: markerCode ? 'marker_confirmed' : 'manual_anchor',
    };

    this.notify(result);
  }

  /**
   * Start listening to real smartphone accelerometer & orientation sensors.
   */
  public async startSensorTracking(): Promise<boolean> {
    if (typeof window === 'undefined') return false;

    // Check iOS permission request if applicable
    if (
      typeof (DeviceMotionEvent as unknown as { requestPermission?: () => Promise<string> }).requestPermission ===
      'function'
    ) {
      try {
        const perm = await (DeviceMotionEvent as unknown as { requestPermission: () => Promise<string> }).requestPermission();
        if (perm !== 'granted') return false;
      } catch {
        return false;
      }
    }

    this.isListeningSensors = true;
    window.addEventListener('devicemotion', this.handleDeviceMotion);
    window.addEventListener('deviceorientation', this.handleDeviceOrientation);
    return true;
  }

  public stopSensorTracking() {
    this.isListeningSensors = false;
    if (typeof window !== 'undefined') {
      window.removeEventListener('devicemotion', this.handleDeviceMotion);
      window.removeEventListener('deviceorientation', this.handleDeviceOrientation);
    }
  }

  private handleDeviceOrientation = (e: DeviceOrientationEvent) => {
    if (e.alpha !== null) {
      this.currentHeading = e.alpha;
    }
  };

  private handleDeviceMotion = (e: DeviceMotionEvent) => {
    if (!e.accelerationIncludingGravity) return;
    const { x, y, z } = e.accelerationIncludingGravity;
    if (x === null || y === null || z === null) return;

    const mag = Math.sqrt(x * x + y * y + z * z);
    const now = Date.now();

    // Simple peak detection for pedestrian step detection
    if (mag > this.stepThreshold && this.lastAccelMag <= this.stepThreshold && now - this.lastStepTime > 400) {
      this.lastStepTime = now;
      this.stepCount += 1;
      this.onSensorStepDetected();
    }
    this.lastAccelMag = mag;
  };

  private async onSensorStepDetected() {
    // Pedestrian Dead Reckoning: Stride ~0.75m scaled to pixels
    const stridePx = 0.75 / 0.05; // 15 pixels per step at 0.05 m/px
    const rad = ((this.currentHeading - 90) * Math.PI) / 180;
    this.currentX += Math.cos(rad) * stridePx;
    this.currentY += Math.sin(rad) * stridePx;

    await this.syncPositionWithBackend('sensor_pdr');
  }

  /**
   * Synchronize current coordinates with backend map-matching safety gate.
   */
  public async syncPositionWithBackend(providerSource: string = 'sensor_pdr'): Promise<PositionUpdateResult> {
    const payload: PositionUpdatePayload = {
      session_id: this.sessionId,
      project_id: this.projectId,
      estimated_x: this.currentX,
      estimated_y: this.currentY,
      current_level: this.currentLevel,
      heading_degrees: this.currentHeading,
      step_count: this.stepCount,
      active_step_index: this.activeStepIndex,
      route_node_ids: this.routeNodes.map((n) => n.id),
      provider_source: providerSource,
    };

    try {
      const result = await api.updatePosition(payload);
      this.notify(result);
      return result;
    } catch (err) {
      console.error('Failed to sync position with backend:', err);
      const fallback: PositionUpdateResult = {
        session_id: this.sessionId,
        state: this.currentState,
        confidence_score: 0.5,
        snapped_x: this.currentX,
        snapped_y: this.currentY,
        cross_track_error_meters: 0.0,
        along_track_distance_meters: this.stepCount * 0.75,
        current_step_index: this.activeStepIndex,
        is_uncertain: false,
        provider_type: providerSource,
      };
      this.notify(fallback);
      return fallback;
    }
  }

  /**
   * CONTROLLED SIMULATION CONTROLS
   * Allows examiners and developers to test real-time walking,
   * step-by-step progress, drift injection, and safety alarms.
   */
  public startSimulation(speedMs: number = 1000) {
    if (this.isSimulating) return;
    this.isSimulating = true;

    this.simInterval = setInterval(() => {
      this.advanceSimulationStep();
    }, speedMs);
  }

  public stopSimulation() {
    this.isSimulating = false;
    if (this.simInterval) {
      clearInterval(this.simInterval);
      this.simInterval = null;
    }
  }

  public advanceSimulationStep() {
    if (this.routeNodes.length < 2) return;

    if (this.simSegmentIndex >= this.routeNodes.length - 1) {
      this.stopSimulation();
      return;
    }

    const n1 = this.routeNodes[this.simSegmentIndex];
    const n2 = this.routeNodes[this.simSegmentIndex + 1];

    this.simProgress += 0.25; // 4 steps per corridor segment
    this.stepCount += 1;

    if (this.simProgress >= 1.0) {
      this.simProgress = 0.0;
      this.simSegmentIndex += 1;
      this.activeStepIndex = Math.min(this.simSegmentIndex, this.routeNodes.length - 1);
      this.currentLevel = n2.level_number || this.currentLevel;
      this.currentX = n2.x;
      this.currentY = n2.y;
    } else {
      this.currentX = n1.x + (n2.x - n1.x) * this.simProgress;
      this.currentY = n1.y + (n2.y - n1.y) * this.simProgress;
      this.currentLevel = n1.level_number || this.currentLevel;
    }

    this.syncPositionWithBackend('simulation');
  }

  /**
   * Intentionally inject lateral drift into coordinates to test the uncertainty safety alert.
   */
  public injectDrift(driftMeters: number = 4.0) {
    const driftPx = driftMeters / 0.05; // 80 pixels
    this.currentY += driftPx;
    this.syncPositionWithBackend('simulated_drift');
  }

  /**
   * Intentionally inject severe deviation (>7m) to test the emergency route lost alarm.
   */
  public injectSevereDeviation(deviationMeters: number = 8.0) {
    const devPx = deviationMeters / 0.05; // 160 pixels
    this.currentX += devPx;
    this.currentY += devPx;
    this.syncPositionWithBackend('simulated_deviation');
  }

  public getCurrentState(): PositioningState {
    return this.currentState;
  }

  public isSimActive(): boolean {
    return this.isSimulating;
  }
}
