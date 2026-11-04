import React, { useState } from 'react';
import {
  Brain,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Network,
} from 'lucide-react';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { api } from '../../services/api';
import { AIInterpretationRequest, AIInterpretationResponse } from '../../types';
import { useAccessibility } from '../../context/AccessibilityContext';

interface AIExtractionModalProps {
  isOpen: boolean;
  onClose: () => void;
  floorplanId: string;
  floorplanName: string;
  buildingName: string;
  onExtractionSuccess: (response: AIInterpretationResponse) => void;
}

export const AIExtractionModal: React.FC<AIExtractionModalProps> = ({
  isOpen,
  onClose,
  floorplanId,
  floorplanName,
  buildingName,
  onExtractionSuccess,
}) => {
  const { announce, playFeedbackTone } = useAccessibility();
  const [provider, setProvider] = useState<'gemini' | 'nvidia' | 'groq'>('gemini');
  const [confidenceThreshold, setConfidenceThreshold] = useState<number>(0.7);
  const [autoConnectTopology, setAutoConnectTopology] = useState<boolean>(true);
  const [buildingHint, setBuildingHint] = useState<string>(buildingName);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AIInterpretationResponse | null>(null);

  const handleStartAnalysis = async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    announce('Initiating architectural spatial analysis...');

    try {
      const payload: AIInterpretationRequest = {
        floorplan_id: floorplanId,
        provider: 'gemini',
        confidence_threshold: confidenceThreshold,
        auto_connect_topology: autoConnectTopology,
        building_name_hint: buildingHint.trim() || undefined,
      };

      const res = await api.interpretFloorPlan(payload);
      setResult(res);
      playFeedbackTone('success');
      const count =
        res.elements_detected_count ??
        (res.nodes_detected != null ? res.nodes_detected + (res.edges_detected ?? 0) : res.nodes?.length || 0);
      announce(`Spatial analysis complete. Detected ${count} elements.`);
      onExtractionSuccess(res);
    } catch (err: unknown) {
      console.error('Spatial analysis failed:', err);
      let errMsg = 'Spatial blueprint interpretation failed.';
      if (err instanceof Error) {
        errMsg = err.message;
      }
      setError(errMsg);
      playFeedbackTone('error');
      announce(`Error: ${errMsg}`);
    } finally {
      setLoading(false);
    }
  };

  const handleResetAndClose = () => {
    setResult(null);
    setError(null);
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleResetAndClose}
      title="Spatial Blueprint Interpretation"
      description="Extract architectural spaces, room numbers, corridors, doorways, and vertical transitions from the floor plan."
      maxWidth="md"
    >
      <div className="space-y-5">
        {!result ? (
          <div className="space-y-4">
            {/* Building Context Hint */}
            <div>
              <label htmlFor="building-hint" className="block text-xs font-semibold text-zinc-800 mb-1">
                Facility Name / Context (Optional)
              </label>
              <input
                id="building-hint"
                type="text"
                value={buildingHint}
                onChange={(e) => setBuildingHint(e.target.value)}
                placeholder="e.g. City Administration Hall, Ground Floor"
                className="w-full px-3 py-2 text-xs border border-zinc-300 rounded-lg focus:ring-2 focus:ring-zinc-900 focus:outline-none"
                disabled={loading}
              />
            </div>

            {/* Confidence Threshold */}
            <div>
              <label
                htmlFor="confidence-slider"
                className="block text-xs font-semibold text-zinc-800 mb-1 flex items-center justify-between"
              >
                <span>Detection Sensitivity:</span>
                <span className="font-mono text-zinc-800">{(confidenceThreshold * 100).toFixed(0)}%</span>
              </label>
              <input
                id="confidence-slider"
                type="range"
                min="0.5"
                max="0.95"
                step="0.05"
                value={confidenceThreshold}
                onChange={(e) => setConfidenceThreshold(parseFloat(e.target.value))}
                className="w-full accent-zinc-900 cursor-pointer"
                disabled={loading}
              />
              <span className="text-[11px] text-zinc-500">
                Recommended 70%. Higher values require clearer blueprint markings.
              </span>
            </div>

            {/* Topology Extraction Toggle */}
            <div className="pt-1">
              <label className="flex items-start gap-2.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={autoConnectTopology}
                  onChange={(e) => setAutoConnectTopology(e.target.checked)}
                  disabled={loading}
                  className="w-4 h-4 text-zinc-800 border-zinc-300 rounded focus:ring-zinc-900 mt-0.5"
                />
                <div>
                  <span className="text-xs font-semibold text-zinc-800 flex items-center gap-1.5">
                    <Network className="w-3.5 h-3.5 text-zinc-500" />
                    Extract Navigable Pathways &amp; Connections
                  </span>
                  <p className="text-[11px] text-zinc-500">
                    Connects adjacent rooms through visible doors and corridor junctions.
                  </p>
                </div>
              </label>
            </div>

            {error && (
              <div
                role="alert"
                className="p-3.5 bg-red-50 border border-red-200 text-red-900 text-xs rounded-lg font-medium flex items-start gap-2"
              >
                <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            {/* Loading Indicator */}
            {loading && (
              <div className="p-4 bg-zinc-50 border border-zinc-200 rounded-xl space-y-2 text-center">
                <Loader2 className="w-6 h-6 animate-spin text-zinc-800 mx-auto" />
                <p className="text-xs font-semibold text-zinc-800">
                  Interpreting architectural geometry...
                </p>
                <p className="text-[11px] text-zinc-500">
                  Detecting rooms, corridors, doorways, and accessible boundaries.
                </p>
              </div>
            )}
          </div>
        ) : (
          /* Results View */
          <div className="space-y-4">
            <div className="p-4 bg-zinc-50 border border-zinc-200 rounded-xl space-y-3">
              <div className="flex items-center gap-2 text-zinc-900 font-semibold text-sm">
                <CheckCircle2 className="w-4 h-4 text-zinc-900" />
                <span>Spatial Elements Detected</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-center text-xs">
                <div className="p-2.5 bg-white rounded-lg border border-zinc-200">
                  <div className="font-mono text-base font-bold text-zinc-900">
                    {result.nodes_persisted_count ?? result.nodes_detected ?? result.nodes?.length ?? 0}
                  </div>
                  <div className="text-[10px] text-zinc-500 uppercase font-medium">Rooms &amp; Spaces</div>
                </div>
                <div className="p-2.5 bg-white rounded-lg border border-zinc-200">
                  <div className="font-mono text-base font-bold text-zinc-900">
                    {result.edges_persisted_count ?? result.edges_detected ?? result.edges?.length ?? 0}
                  </div>
                  <div className="text-[10px] text-zinc-500 uppercase font-medium">Navigable Connections</div>
                </div>
              </div>
              <p className="text-[11px] text-zinc-500 pt-1 leading-relaxed">
                Detected elements are ready for human verification in the Spatial Editor before publishing to visitors.
              </p>
            </div>
          </div>
        )}

        {/* Action Controls */}
        <div className="flex items-center justify-end gap-3 pt-4 border-t border-zinc-200">
          <Button variant="outline" size="sm" onClick={handleResetAndClose} disabled={loading}>
            {result ? 'Close' : 'Cancel'}
          </Button>

          {!result ? (
            <Button
              variant="primary"
              size="sm"
              onClick={handleStartAnalysis}
              disabled={loading}
              icon={<Brain className="w-4 h-4 text-white" />}
            >
              {loading ? 'Analyzing...' : 'Extract Spatial Layout'}
            </Button>
          ) : (
            <Button variant="primary" size="sm" onClick={handleResetAndClose}>
              Inspect in Spatial Editor &rarr;
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
};
