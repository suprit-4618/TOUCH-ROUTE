import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  ArrowLeft,
  Play,
  Pause,
  RotateCcw,
  Volume2,
  VolumeX,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  AlertTriangle,
  Compass,
  Footprints,
  Accessibility,
  ArrowUp,
  CornerUpLeft,
  CornerUpRight,
  DoorOpen,
  Building,
  CheckCircle2,
  Sliders,
  SlidersHorizontal,
} from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Card } from '../../components/ui/Card';
import { VoiceDestinationPicker } from './VoiceDestinationPicker';
import { DestinationItem, NavigationStep, ProjectDetail, RouteResult } from '../../types';
import { api } from '../../services/api';
import { voiceSynthesizer } from '../../services/voiceNavigation';
import { useAccessibility } from '../../context/AccessibilityContext';

interface NavigationSessionViewProps {
  projectId: string;
  onBack: () => void;
  initialDestinationId?: string;
}

export const NavigationSessionView: React.FC<NavigationSessionViewProps> = ({
  projectId,
  onBack,
  initialDestinationId,
}) => {
  const { announce, playFeedbackTone } = useAccessibility();

  // Project & Destinations
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [destinations, setDestinations] = useState<DestinationItem[]>([]);

  // Navigation Points
  const [startNodeId, setStartNodeId] = useState<string>('');
  const [destNodeId, setDestNodeId] = useState<string>(initialDestinationId || '');
  const [accessibleOnly, setAccessibleOnly] = useState<boolean>(true);

  // Route State
  const [calculating, setCalculating] = useState<boolean>(false);
  const [route, setRoute] = useState<RouteResult | null>(null);
  const [routeError, setRouteError] = useState<string | null>(null);

  // Active Guidance Step
  const [currentStepIndex, setCurrentStepIndex] = useState<number>(0);
  const [isGuidanceActive, setIsGuidanceActive] = useState<boolean>(false);
  const [isSpeaking, setIsSpeaking] = useState<boolean>(false);
  const [speechRate, setSpeechRate] = useState<number>(0.95);
  const [autoAdvance, setAutoAdvance] = useState<boolean>(false);

  // Load project detail and destinations
  useEffect(() => {
    let active = true;
    setLoading(true);
    Promise.all([
      api.getProjectDetail(projectId),
      api.getVerifiedDestinations(projectId),
    ])
      .then(([projDetail, destList]) => {
        if (!active) return;
        setProject(projDetail);
        setDestinations(destList);

        // Default start node: entrance or first verified node
        const entrance = destList.find((d) => d.node_type === 'entrance') || destList[0];
        if (entrance) {
          setStartNodeId(entrance.id);
        }

        // Default destination: initial or last verified node
        if (initialDestinationId) {
          setDestNodeId(initialDestinationId);
        } else if (destList.length >= 2) {
          const target = destList.find((d) => d.id !== entrance?.id) || destList[destList.length - 1];
          setDestNodeId(target.id);
        }
      })
      .catch((err) => {
        console.error('Failed to load navigation context:', err);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
      voiceSynthesizer.cancel();
    };
  }, [projectId, initialDestinationId]);

  // Compute Route
  const handleCalculateRoute = useCallback(async (startId: string, destId: string) => {
    if (!startId || !destId || startId === destId) return;

    setCalculating(true);
    setRouteError(null);
    try {
      const res = await api.calculateRoute({
        project_id: projectId,
        start_node_id: startId,
        destination_node_id: destId,
        accessible_only: accessibleOnly,
        verified_only: true, // Strict safety constraint
      });

      setRoute(res);
      setCurrentStepIndex(0);
      setIsGuidanceActive(false);
      playFeedbackTone('success');
      announce(`Accessible route computed: ${res.steps.length} guidance steps.`);
    } catch (err: unknown) {
      console.error('Route calculation error:', err);
      const msg = err instanceof Error ? err.message : 'No verified route could be calculated.';
      setRouteError(msg);
      setRoute(null);
      playFeedbackTone('error');
      announce(`Routing error: ${msg}`);
    } finally {
      setCalculating(false);
    }
  }, [projectId, accessibleOnly, announce, playFeedbackTone]);

  // Re-calculate route when endpoints change
  useEffect(() => {
    if (startNodeId && destNodeId && startNodeId !== destNodeId) {
      handleCalculateRoute(startNodeId, destNodeId);
    }
  }, [startNodeId, destNodeId, accessibleOnly, handleCalculateRoute]);

  // Current Step Item
  const currentStep: NavigationStep | null =
    route && route.steps && route.steps[currentStepIndex] ? route.steps[currentStepIndex] : null;

  // Speak Current Step
  const speakCurrentStep = useCallback(() => {
    if (!currentStep) return;

    setIsSpeaking(true);
    voiceSynthesizer.speak(currentStep.instruction, {
      rate: speechRate,
      onStart: () => setIsSpeaking(true),
      onEnd: () => {
        setIsSpeaking(false);
        if (autoAdvance && route && currentStepIndex < route.steps.length - 1) {
          setCurrentStepIndex((idx) => idx + 1);
        }
      },
      onError: () => setIsSpeaking(false),
    });
    announce(currentStep.instruction);
  }, [currentStep, speechRate, autoAdvance, route, currentStepIndex, announce]);

  // Start / Pause Guidance
  const handleToggleGuidance = () => {
    if (isGuidanceActive) {
      voiceSynthesizer.cancel();
      setIsGuidanceActive(false);
      setIsSpeaking(false);
      playFeedbackTone('click');
      announce('Navigation guidance paused.');
    } else {
      setIsGuidanceActive(true);
      playFeedbackTone('success');
      announce('Navigation guidance started.');
      speakCurrentStep();
    }
  };

  // Step Navigation
  const handleNextStep = () => {
    if (route && currentStepIndex < route.steps.length - 1) {
      const nextIdx = currentStepIndex + 1;
      setCurrentStepIndex(nextIdx);
      playFeedbackTone('step');
      if (isGuidanceActive) {
        // Speak next step
        const step = route.steps[nextIdx];
        voiceSynthesizer.speak(step.instruction, {
          rate: speechRate,
          onStart: () => setIsSpeaking(true),
          onEnd: () => setIsSpeaking(false),
        });
      }
    }
  };

  const handlePrevStep = () => {
    if (route && currentStepIndex > 0) {
      const prevIdx = currentStepIndex - 1;
      setCurrentStepIndex(prevIdx);
      playFeedbackTone('step');
      if (isGuidanceActive) {
        const step = route.steps[prevIdx];
        voiceSynthesizer.speak(step.instruction, {
          rate: speechRate,
          onStart: () => setIsSpeaking(true),
          onEnd: () => setIsSpeaking(false),
        });
      }
    }
  };

  const handleRepeatStep = () => {
    playFeedbackTone('click');
    speakCurrentStep();
  };

  // Keyboard shortcut listener for accessible navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept if user is typing in an input
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) {
        return;
      }

      if (e.code === 'Space') {
        e.preventDefault();
        handleToggleGuidance();
      } else if (e.key === 'r' || e.key === 'R') {
        e.preventDefault();
        handleRepeatStep();
      } else if (e.key === 'n' || e.key === 'N' || e.key === 'ArrowRight') {
        e.preventDefault();
        handleNextStep();
      } else if (e.key === 'p' || e.key === 'P' || e.key === 'ArrowLeft') {
        e.preventDefault();
        handlePrevStep();
      } else if (e.key === 'Escape') {
        voiceSynthesizer.cancel();
        onBack();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleToggleGuidance, handleRepeatStep, handleNextStep, handlePrevStep, onBack]);

  // Step Action Icon Helper
  const getActionIcon = (action: string) => {
    switch (action) {
      case 'turn_left':
      case 'slight_left':
        return <CornerUpLeft className="w-8 h-8 text-zinc-700" />;
      case 'turn_right':
      case 'slight_right':
        return <CornerUpRight className="w-8 h-8 text-zinc-700" />;
      case 'enter_door':
        return <DoorOpen className="w-8 h-8 text-emerald-500" />;
      case 'elevator':
      case 'stairs':
        return <Building className="w-8 h-8 text-cyan-500" />;
      case 'arrive':
        return <CheckCircle2 className="w-8 h-8 text-emerald-500" />;
      default:
        return <ArrowUp className="w-8 h-8 text-zinc-100" />;
    }
  };

  // Remaining Distance Calculation
  const remainingMeters = route
    ? route.steps
        .slice(currentStepIndex)
        .reduce((acc, s) => acc + s.distance_meters, 0)
    : 0;

  if (loading) {
    return (
      <div className="py-24 text-center text-zinc-500 space-y-3">
        <div className="w-8 h-8 rounded-full border-2 border-zinc-800 border-t-transparent animate-spin mx-auto" />
        <p className="text-sm font-medium">Loading voice navigation session...</p>
      </div>
    );
  }

  return (
    <div className="py-6 bg-zinc-50 min-h-screen">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
        
        {/* Top Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-zinc-200">
          <div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                voiceSynthesizer.cancel();
                onBack();
              }}
              icon={<ArrowLeft className="w-4 h-4 text-zinc-700" />}
              className="-ml-2 mb-1.5 text-zinc-600"
            >
              Exit Navigation Session
            </Button>
            <h1 className="text-2xl font-bold text-zinc-900 tracking-tight flex items-center gap-2">
              Voice Navigation Session
            </h1>
            <p className="text-xs text-zinc-600 mt-0.5">
              Building: <strong className="text-zinc-900">{project?.building_name}</strong> &bull; Planned Accessible Wayfinding
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Badge variant="success">
              <ShieldCheck className="w-3.5 h-3.5 mr-1" />
              Verified Safe Topology
            </Badge>
          </div>
        </div>

        {/* Safety Disclaimer Banner */}
        <div className="p-3.5 bg-zinc-100 border border-zinc-200 rounded-xl text-xs text-zinc-700 flex items-start gap-2.5">
          <Footprints className="w-4 h-4 text-zinc-600 shrink-0 mt-0.5" />
          <div>
            <strong className="text-zinc-900">Planned Route Guidance (Non-Tracking):</strong>{' '}
            Turn-by-turn guidance based on confirmed architectural floor plans. Follow tactile floor indicators, handrails, and door Braille plaques.
            This application does not track or simulate live indoor positioning without positioning sensors.
          </div>
        </div>

        {/* Waypoint Selectors: Start and Destination */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-white border border-zinc-200 rounded-xl p-4 shadow-sm">
          <div>
            <label className="block text-xs font-semibold text-zinc-800 mb-1">
              Starting Location
            </label>
            <select
              value={startNodeId}
              onChange={(e) => setStartNodeId(e.target.value)}
              className="w-full px-3 py-2 text-xs sm:text-sm bg-white border border-zinc-300 rounded-xl focus:ring-2 focus:ring-zinc-900 focus:outline-none"
            >
              {destinations.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.label} {d.room_number ? `(#${d.room_number})` : ''} — {d.level_name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <VoiceDestinationPicker
              projectId={projectId}
              selectedDestinationId={destNodeId}
              onSelectDestination={(dest) => setDestNodeId(dest.id)}
              excludeNodeId={startNodeId}
              label="Destination (Voice or Type)"
              placeholder="Speak e.g. 'Audiology' or 'Room 204'..."
            />
          </div>
        </div>

        {routeError && (
          <div
            role="alert"
            className="p-4 bg-red-50 border border-red-200 text-red-900 text-xs rounded-xl font-medium flex items-center gap-2"
          >
            <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
            <span>{routeError}</span>
          </div>
        )}

        {/* Dedicated Turn-by-Turn Guidance Hero Card */}
        {route && currentStep && (
          <div className="bg-zinc-900 text-zinc-50 rounded-2xl p-6 sm:p-8 shadow-xl space-y-6 border border-zinc-800">
            {/* Top Status Ribbon */}
            <div className="flex items-center justify-between text-xs font-mono text-zinc-400 border-b border-zinc-800 pb-3">
              <span className="uppercase tracking-wider font-semibold text-zinc-400">
                Step {currentStep.step_number} of {route.steps.length}
              </span>
              <div className="flex items-center gap-3">
                {route.is_scale_calibrated ? (
                  <span>
                    Remaining: <strong className="text-white">{remainingMeters.toFixed(1)}m</strong>
                  </span>
                ) : (
                  <span className="text-zinc-400">Relative Spatial Route</span>
                )}
                <span>&bull;</span>
                <span className="text-zinc-300">{currentStep.level_name}</span>
              </div>
            </div>

            {/* Main Spoken Instruction Card */}
            <div className="flex items-start gap-4 sm:gap-6">
              <div className="p-3.5 bg-zinc-800 border border-zinc-700 rounded-2xl shrink-0 flex items-center justify-center">
                {getActionIcon(currentStep.action)}
              </div>

              <div className="space-y-2 flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  {currentStep.landmark_cue && (
                    <span className="px-2 py-0.5 bg-zinc-800 text-amber-300 text-[11px] font-medium rounded-full border border-zinc-700">
                      {currentStep.landmark_cue}
                    </span>
                  )}
                  {isSpeaking && (
                    <span className="flex items-center gap-1 text-[11px] text-emerald-400 animate-pulse">
                      <Volume2 className="w-3.5 h-3.5" />
                      <span>Speaking...</span>
                    </span>
                  )}
                </div>

                <h2
                  className="text-xl sm:text-2xl font-bold tracking-tight text-white leading-relaxed"
                  tabIndex={0}
                  aria-live="assertive"
                >
                  {currentStep.instruction}
                </h2>

                {currentStep.distance_meters > 0 && route.is_scale_calibrated && (
                  <p className="text-xs text-zinc-400 font-mono">
                    Segment Distance: {currentStep.distance_meters.toFixed(1)} meters
                  </p>
                )}
              </div>
            </div>

            {/* High-Contrast Large Navigation Controls */}
            <div className="pt-4 border-t border-zinc-800 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <button
                  onClick={handlePrevStep}
                  disabled={currentStepIndex === 0}
                  className="px-4 py-2.5 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-30 disabled:cursor-not-allowed text-zinc-200 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors"
                  title="Previous Step (P or Left Arrow)"
                >
                  <ChevronLeft className="w-4 h-4" />
                  <span>Prev</span>
                </button>

                <button
                  onClick={handleToggleGuidance}
                  className={`px-5 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 transition-all shadow-md ${
                    isGuidanceActive
                      ? 'bg-zinc-900 hover:bg-zinc-900 text-white'
                      : 'bg-emerald-600 hover:bg-emerald-500 text-white'
                  }`}
                  title="Play / Pause Guidance (Spacebar)"
                >
                  {isGuidanceActive ? (
                    <>
                      <Pause className="w-4 h-4" />
                      <span>Pause Guidance</span>
                    </>
                  ) : (
                    <>
                      <Play className="w-4 h-4" />
                      <span>Start Voice Guidance</span>
                    </>
                  )}
                </button>

                <button
                  onClick={handleRepeatStep}
                  className="px-4 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors"
                  title="Repeat Instruction (R)"
                >
                  <RotateCcw className="w-4 h-4 text-zinc-400" />
                  <span>Repeat</span>
                </button>

                <button
                  onClick={handleNextStep}
                  disabled={currentStepIndex === route.steps.length - 1}
                  className="px-4 py-2.5 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-30 disabled:cursor-not-allowed text-zinc-200 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors"
                  title="Next Step (N or Right Arrow)"
                >
                  <span>Next</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>

              {/* Speech Rate & Audio Controls */}
              <div className="flex items-center gap-3 text-xs text-zinc-400">
                <div className="flex items-center gap-1.5">
                  <SlidersHorizontal className="w-3.5 h-3.5 text-zinc-500" />
                  <span>Speech Speed:</span>
                  <select
                    value={speechRate}
                    onChange={(e) => setSpeechRate(parseFloat(e.target.value))}
                    className="bg-zinc-800 text-zinc-200 border border-zinc-700 rounded px-1.5 py-0.5 text-xs font-mono"
                  >
                    <option value="0.8">0.8x</option>
                    <option value="0.95">Normal</option>
                    <option value="1.15">Fast</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Keyboard Shortcuts Hint */}
            <div className="text-[11px] text-zinc-500 font-mono flex items-center justify-between border-t border-zinc-800/80 pt-2">
              <span>Keyboard: [Space] Play/Pause &bull; [R] Repeat &bull; [N] Next &bull; [P] Prev &bull; [Esc] Exit</span>
              <span>Screen reader live region active</span>
            </div>
          </div>
        )}

        {/* Route Steps Overview List */}
        {route && (
          <div className="bg-white border border-zinc-200 rounded-xl p-4 shadow-sm space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-zinc-100">
              <h3 className="text-sm font-bold text-zinc-900 tracking-tight">
                Complete Route Overview ({route.steps.length} Steps)
              </h3>
              <span className="text-xs text-zinc-500 font-mono">
                {route.is_scale_calibrated
                  ? `Total: ${route.total_distance_meters.toFixed(1)}m (~${Math.round(route.estimated_walking_seconds / 60)} min)`
                  : 'Relative verified path'}
              </span>
            </div>

            <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
              {route.steps.map((s, idx) => (
                <button
                  key={s.step_number}
                  onClick={() => {
                    setCurrentStepIndex(idx);
                    playFeedbackTone('step');
                  }}
                  className={`w-full text-left p-2.5 rounded-lg border text-xs flex items-center justify-between transition-colors ${
                    currentStepIndex === idx
                      ? 'bg-zinc-50 border-zinc-300 text-zinc-950 font-semibold'
                      : 'bg-white border-zinc-100 hover:bg-zinc-50 text-zinc-700'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="w-5 h-5 rounded-full bg-zinc-200 text-zinc-800 flex items-center justify-center font-mono text-[10px] shrink-0">
                      {s.step_number}
                    </span>
                    <span className="truncate max-w-md">{s.instruction}</span>
                  </div>

                  <div className="shrink-0 font-mono text-[11px] text-zinc-500 ml-2">
                    {s.distance_meters > 0 ? `${s.distance_meters.toFixed(1)}m` : ''}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

      </div>
    </div>
  );
};
