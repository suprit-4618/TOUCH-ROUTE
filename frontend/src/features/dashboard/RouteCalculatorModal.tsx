import React, { useEffect, useState } from 'react';
import { Navigation, Play, Volume2, ArrowRight, CheckCircle2, AlertCircle, Loader2, RotateCcw } from 'lucide-react';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { api } from '../../services/api';
import { Project, ProjectDetail, RouteResult, SpatialNode } from '../../types';
import { useAccessibility } from '../../context/AccessibilityContext';

interface RouteCalculatorModalProps {
  isOpen: boolean;
  onClose: () => void;
  project: Project | null;
}

export const RouteCalculatorModal: React.FC<RouteCalculatorModalProps> = ({
  isOpen,
  onClose,
  project,
}) => {
  const { announce, playFeedbackTone } = useAccessibility();
  const [projectDetail, setProjectDetail] = useState<ProjectDetail | null>(null);
  const [startNodeId, setStartNodeId] = useState<string>('');
  const [destNodeId, setDestNodeId] = useState<string>('');
  const [accessibleOnly, setAccessibleOnly] = useState<boolean>(true);
  const [loading, setLoading] = useState<boolean>(false);
  const [calculating, setCalculating] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [routeResult, setRouteResult] = useState<RouteResult | null>(null);
  const [isSpeaking, setIsSpeaking] = useState<boolean>(false);

  useEffect(() => {
    if (isOpen && project) {
      setLoading(true);
      setError(null);
      setRouteResult(null);
      api.getProjectDetail(project.id)
        .then((detail) => {
          setProjectDetail(detail);
          const nodes = detail.spatial_nodes || [];
          if (nodes.length >= 2) {
            setStartNodeId(nodes[0].id);
            setDestNodeId(nodes[nodes.length - 1].id);
          }
        })
        .catch((err) => {
          console.error('Failed to load project detail:', err);
          setError('Unable to load project nodes for navigation.');
        })
        .finally(() => setLoading(false));
    }
  }, [isOpen, project]);

  const handleCalculateRoute = async () => {
    if (!project || !startNodeId || !destNodeId) return;
    if (startNodeId === destNodeId) {
      setError('Start point and Destination point must be distinct.');
      announce('Start point and destination point cannot be the same.');
      return;
    }

    setCalculating(true);
    setError(null);
    try {
      const result = await api.calculateRoute({
        project_id: project.id,
        start_node_id: startNodeId,
        destination_node_id: destNodeId,
        accessible_only: accessibleOnly,
      });
      playFeedbackTone('success');
      setRouteResult(result);
      announce(
        `Route calculated: ${result.total_distance_meters} meters, ${result.steps.length} navigation steps.`
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Pathfinding failed.';
      setError(msg);
      announce(`Navigation error: ${msg}`);
    } finally {
      setCalculating(false);
    }
  };

  const handleSpeakInstructions = () => {
    if (!routeResult || typeof window === 'undefined' || !('speechSynthesis' in window)) {
      announce('Speech synthesis is not supported on this browser.');
      return;
    }

    window.speechSynthesis.cancel();
    const fullText = routeResult.steps.map((s) => s.instruction).join(' ');
    const utterance = new SpeechSynthesisUtterance(fullText);
    utterance.rate = 0.95;
    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);
    window.speechSynthesis.speak(utterance);
    announce('Playing spoken navigation instructions.');
  };

  const handleStopSpeaking = () => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
      announce('Spoken navigation stopped.');
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => {
        handleStopSpeaking();
        onClose();
      }}
      title={`Deterministic Route Planner: ${project?.name || ''}`}
      description="Calculates guaranteed step-free indoor routes using NetworkX A* pathfinding over validated spatial geometry."
      maxWidth="lg"
    >
      <div className="space-y-6 text-zinc-800 text-sm">
        {loading ? (
          <div className="py-12 flex flex-col items-center justify-center text-zinc-500 gap-2">
            <Loader2 className="w-6 h-6 animate-spin text-zinc-700" />
            <span>Loading verified building topology...</span>
          </div>
        ) : (
          <>
            {error && (
              <div
                role="alert"
                className="p-3 bg-red-50 border border-red-200 text-red-800 text-xs rounded-lg font-medium flex items-center gap-2"
              >
                <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
                <span>{error}</span>
              </div>
            )}

            {/* Selection Controls */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 rounded-xl bg-zinc-50 border border-zinc-200">
              <div>
                <label htmlFor="start-node" className="block text-xs font-semibold text-zinc-900 mb-1">
                  Start Location
                </label>
                <select
                  id="start-node"
                  value={startNodeId}
                  onChange={(e) => setStartNodeId(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-zinc-300 rounded-lg text-sm text-zinc-900 focus:outline-none focus:border-zinc-900"
                >
                  {projectDetail?.spatial_nodes.map((node) => (
                    <option key={node.id} value={node.id}>
                      {node.label} ({node.node_type})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="dest-node" className="block text-xs font-semibold text-zinc-900 mb-1">
                  Destination
                </label>
                <select
                  id="dest-node"
                  value={destNodeId}
                  onChange={(e) => setDestNodeId(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-zinc-300 rounded-lg text-sm text-zinc-900 focus:outline-none focus:border-zinc-900"
                >
                  {projectDetail?.spatial_nodes.map((node) => (
                    <option key={node.id} value={node.id}>
                      {node.label} ({node.node_type})
                    </option>
                  ))}
                </select>
              </div>

              <div className="sm:col-span-2 flex items-center justify-between flex-wrap gap-3 pt-2">
                <label className="flex items-center gap-2 text-xs text-zinc-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={accessibleOnly}
                    onChange={(e) => setAccessibleOnly(e.target.checked)}
                    className="w-4 h-4 rounded text-zinc-700 border-zinc-300 focus:ring-zinc-900"
                  />
                  <span>Step-Free Accessible Only (Avoid stairs &amp; narrow hazards)</span>
                </label>

                <Button
                  variant="primary"
                  size="md"
                  onClick={handleCalculateRoute}
                  disabled={calculating || !startNodeId || !destNodeId}
                  icon={
                    calculating ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Navigation className="w-4 h-4 text-zinc-300" />
                    )
                  }
                >
                  {calculating ? 'Calculating A* Path...' : 'Calculate Route'}
                </Button>
              </div>
            </div>

            {/* Calculated Route Results */}
            {routeResult && (
              <div className="space-y-4 pt-2 border-t border-zinc-200">
                <div className="flex items-center justify-between flex-wrap gap-2 p-3 rounded-lg bg-zinc-50 border border-zinc-200 text-zinc-950">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-5 h-5 text-zinc-900 shrink-0" />
                    <div>
                      <span className="font-semibold text-xs block">
                        Verified A* Route Found
                      </span>
                      <span className="text-xs text-zinc-900">
                        Total Distance: <strong>{routeResult.total_distance_meters}m</strong> &bull; Approx. Walking Time: <strong>{routeResult.estimated_walking_seconds}s</strong>
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {isSpeaking ? (
                      <Button variant="danger" size="sm" onClick={handleStopSpeaking}>
                        Stop Voice
                      </Button>
                    ) : (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={handleSpeakInstructions}
                        icon={<Volume2 className="w-3.5 h-3.5 text-zinc-800" />}
                      >
                        Read Aloud
                      </Button>
                    )}
                  </div>
                </div>

                {/* Step by step list */}
                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-700 mb-3">
                    Turn-By-Turn Wayfinding Guidance
                  </h4>
                  <ol className="space-y-2.5">
                    {routeResult.steps.map((step) => (
                      <li
                        key={step.step_number}
                        className="flex items-start gap-3 p-3.5 rounded-lg bg-white border border-zinc-200 shadow-sm"
                      >
                        <span className="w-6 h-6 rounded-full bg-zinc-900 text-zinc-300 font-mono text-xs flex items-center justify-center font-bold shrink-0 mt-0.5">
                          {step.step_number}
                        </span>
                        <div className="flex-1">
                          <p className="text-sm font-medium text-zinc-900">
                            {step.instruction}
                          </p>
                          {step.distance_meters > 0 && (
                            <span className="text-xs text-zinc-500 font-mono mt-0.5 block">
                              Segment: {step.distance_meters} meters {step.orientation_degrees ? `&bull; Bearing: ${step.orientation_degrees}&deg;` : ''}
                            </span>
                          )}
                        </div>
                      </li>
                    ))}
                  </ol>
                </div>

                <div className="p-3 rounded bg-zinc-100 text-[11px] text-zinc-600 border border-zinc-200">
                  <em>{routeResult.disclaimer}</em>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </Modal>
  );
};

