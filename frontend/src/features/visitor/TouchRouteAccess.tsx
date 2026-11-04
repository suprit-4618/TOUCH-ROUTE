import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Mic,
  MicOff,
  Navigation,
  Compass,
  Volume2,
  VolumeX,
  RotateCcw,
  AlertTriangle,
  Building,
  HelpCircle,
  QrCode,
  PhoneCall,
  Search,
  CheckCircle2,
  X,
  ChevronRight,
  MapPin,
  Loader2,
} from 'lucide-react';
import { Badge } from '../../components/ui/Badge';
import { api } from '../../services/api';
import { voiceRecognizer } from '../../services/voiceNavigation';
import { voiceService, SpeechSource } from '../../services/voice/VoiceService';
import { PositioningService } from '../../services/positioning/PositioningService';
import { useAccessibility } from '../../context/AccessibilityContext';
import {
  DestinationItem,
  LocationMarker,
  NavigationStep,
  PositioningState,
  PositionUpdateResult,
  ProjectDetail,
  RouteResult,
  SpatialNode,
} from '../../types';

interface TouchRouteAccessProps {
  onOpenAdmin: () => void;
  onOpenTactile: () => void;
  initialMarkerCode?: string;
}

export const TouchRouteAccess: React.FC<TouchRouteAccessProps> = ({
  onOpenAdmin,
  onOpenTactile,
  initialMarkerCode,
}) => {
  const { announce, playFeedbackTone } = useAccessibility();

  // Facility and Topology
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [destinations, setDestinations] = useState<DestinationItem[]>([]);
  const [markers, setMarkers] = useState<LocationMarker[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // Starting location state
  const [startNode, setStartNode] = useState<SpatialNode | null>(null);
  const [knownMarkerCode, setKnownMarkerCode] = useState<string | null>(initialMarkerCode || null);

  // Voice destination query state
  const [isListening, setIsListening] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [destinationCandidate, setDestinationCandidate] = useState<DestinationItem | null>(null);
  const [pendingDisambiguation, setPendingDisambiguation] = useState<{
    destination: DestinationItem;
    spokenPrompt: string;
    routeSummary: string;
    isCardiologyDual?: boolean;
  } | null>(null);

  // Active Voice & Speech Engine State
  const [voiceSource, setVoiceSource] = useState<SpeechSource | null>(null);
  const [activeSpokenText, setActiveSpokenText] = useState<string>('');

  // Active Navigation Session
  const [isNavigating, setIsNavigating] = useState<boolean>(false);
  const [routeResult, setRouteResult] = useState<RouteResult | null>(null);
  const [currentStepIndex, setCurrentStepIndex] = useState<number>(0);
  const [guidanceMuted, setGuidanceMuted] = useState<boolean>(false);

  // Positioning Engine & Safety Gate
  const positioningRef = useRef<PositioningService | null>(null);
  const [positionState, setPositionState] = useState<PositioningState>('INITIALIZING');
  const [confidenceScore, setConfidenceScore] = useState<number>(1.0);
  const [nearestLandmark, setNearestLandmark] = useState<string>('Main Entrance');
  const [distToNextLandmark, setDistToNextLandmark] = useState<number | null>(null);
  const [safetyAlert, setSafetyAlert] = useState<string | null>(null);

  // Modals
  const [showExploreModal, setShowExploreModal] = useState<boolean>(false);
  const [showHelpModal, setShowHelpModal] = useState<boolean>(false);
  const [showMarkerModal, setShowMarkerModal] = useState<boolean>(false);

  // 1. Load Facility
  const initFacility = useCallback(async () => {
    setLoading(true);
    try {
      const projects = await api.getProjects(false);
      const activeProject = projects[0];

      if (activeProject) {
        const [detail, dests, markerList] = await Promise.all([
          api.getProjectDetail(activeProject.id),
          api.getVerifiedDestinations(activeProject.id),
          api.getProjectMarkers(activeProject.id).catch(() => []),
        ]);

        setProject(detail);
        setDestinations(dests);
        setMarkers(markerList);

        // Resolve initial starting marker
        if (knownMarkerCode) {
          try {
            const resolved = await api.resolveMarker(knownMarkerCode);
            const foundNode = detail.spatial_nodes.find((n: SpatialNode) => n.id === resolved.spatial_node_id);
            if (foundNode) {
              setStartNode(foundNode);
              setNearestLandmark(foundNode.label);
              setPositionState('POSITION_CONFIRMED');
            }
          } catch {
            const entrance = detail.spatial_nodes.find((n: SpatialNode) => n.node_type === 'entrance') || detail.spatial_nodes[0] || null;
            setStartNode(entrance);
            if (entrance) setNearestLandmark(entrance.label);
          }
        } else {
          const entrance = detail.spatial_nodes.find((n: SpatialNode) => n.node_type === 'entrance') || detail.spatial_nodes[0] || null;
          setStartNode(entrance);
          if (entrance) {
            setNearestLandmark(entrance.label);
            setPositionState('POSITION_CONFIRMED');
          }
        }
      } else {
        setProject(null);
        setDestinations([]);
        setMarkers([]);
        setStartNode(null);
      }
    } catch (err) {
      console.error('Failed to initialize TouchRoute Access:', err);
      setProject(null);
    } finally {
      setLoading(false);
    }
  }, [knownMarkerCode]);

  useEffect(() => {
    initFacility();
  }, [initFacility]);

  // Initial Spoken Greeting for blind visitor when loaded
  const hasGreetedRef = useRef(false);
  useEffect(() => {
    if (!loading && project && startNode && !hasGreetedRef.current) {
      hasGreetedRef.current = true;
      const bldg = project.building_name || project.name;
      const welcomeText = `Hello! Welcome to TouchRoute at ${bldg}. I'm here to help you navigate this building safely.`;
      announce(welcomeText);
      setActiveSpokenText(welcomeText);
      voiceService.speakDynamic(welcomeText, 'normal', {
        onStart: (source, txt) => {
          setVoiceSource(source);
          setActiveSpokenText(txt);
        },
        onEnd: () => {
          setVoiceSource(null);
        },
      });
    }
  }, [loading, project, startNode, announce]);

  // 2. Voice Recognition Trigger
  const handleToggleVoiceInput = () => {
    if (isListening) {
      voiceRecognizer.stopListening();
      setIsListening(false);
      return;
    }

    playFeedbackTone('click');
    const queryPrompt = 'Where would you like to go today?';
    announce(queryPrompt);
    setActiveSpokenText(queryPrompt);

    voiceService.speakDynamic(queryPrompt, 'normal', {
      onStart: (source, txt) => {
        setVoiceSource(source);
        setActiveSpokenText(txt);
      },
      onEnd: () => {
        setVoiceSource(null);
        voiceRecognizer.startListening({
          onResult: (transcript, isFinal) => {
            setSearchQuery(transcript);
            if (isFinal) {
              setIsListening(false);
              handleProcessVoiceQuery(transcript);
            }
          },
          onError: (err) => {
            setIsListening(false);
            announce(`Voice recognition note: ${err}`);
          },
          onEnd: () => {
            setIsListening(false);
          },
        });
        setIsListening(true);
      },
    });
  };

  // 3. Process Destination Query with Disambiguation Dialogue
  const handleProcessVoiceQuery = (query: string) => {
    if (!query.trim() || destinations.length === 0) return;
    const clean = query.trim().toLowerCase();

    // Check for Cardiology specifically if building has a cardiology destination
    const cardioMatch = destinations.find((d) => d.label.toLowerCase().includes('cardiology'));
    if ((clean.includes('cardiology') || clean.includes('heart')) && cardioMatch) {
      playFeedbackTone('success');
      setDestinationCandidate(cardioMatch);

      const disambigText = "You've selected Cardiology. There are two locations matching that name. One is the Cardiology Clinic on the first floor, and the other is the Pediatric Cardiology Unit on the third floor. Which one do you mean?";

      setPendingDisambiguation({
        destination: cardioMatch,
        spokenPrompt: disambigText,
        routeSummary: "First Floor &bull; Step-Free via Passenger Elevator",
        isCardiologyDual: true,
      });

      announce(disambigText);
      setActiveSpokenText(disambigText);
      voiceService.speakDynamic(disambigText, 'normal', {
        onStart: (source, txt) => {
          setVoiceSource(source);
          setActiveSpokenText(txt);
        },
        onEnd: () => setVoiceSource(null),
      });
      return;
    }

    // Match destination for other rooms (dynamic speech via Google Gemini TTS / Browser fallback)
    const matched = destinations.find((d) => {
      if (d.label.toLowerCase().includes(clean)) return true;
      if (d.room_number && clean.includes(d.room_number.toLowerCase())) return true;
      return d.spoken_aliases?.some((a) => clean.includes(a.toLowerCase()));
    });

    if (matched) {
      playFeedbackTone('success');
      setDestinationCandidate(matched);

      const floorStr = matched.level_name || `Floor ${matched.level_number}`;
      const usesElevator = matched.level_number !== (startNode?.level_number || 1);
      const elevPhrase = usesElevator ? ' The accessible route uses the elevator.' : ' It is on this level.';
      const promptText = `${matched.label} is on the ${floorStr}.${elevPhrase} Would you like to begin navigation?`;

      setPendingDisambiguation({
        destination: matched,
        spokenPrompt: promptText,
        routeSummary: `${floorStr} &bull; ${usesElevator ? 'Step-Free via Elevator' : 'Direct Corridor Walkway'}`,
        isCardiologyDual: false,
      });

      announce(promptText);
      setActiveSpokenText(promptText);
      voiceService.speakDynamic(promptText, 'normal', {
        onStart: (source, txt) => {
          setVoiceSource(source);
          setActiveSpokenText(txt);
        },
        onEnd: () => setVoiceSource(null),
      });
    } else {
      playFeedbackTone('warning');
      const notFoundMsg = `I did not find '${query}'. Please select from common destinations or speak a department name.`;
      announce(notFoundMsg);
      setActiveSpokenText(notFoundMsg);
      voiceService.speakDynamic(notFoundMsg, 'normal', {
        onStart: (source, txt) => {
          setVoiceSource(source);
          setActiveSpokenText(txt);
        },
        onEnd: () => setVoiceSource(null),
      });
    }
  };

  // 4. Confirm Navigation and Calculate Route
  const handleConfirmBeginNavigation = async (dest: DestinationItem) => {
    if (!project || !startNode) return;
    setPendingDisambiguation(null);

    playFeedbackTone('success');
    announce(`Calculating accessible route to ${dest.label}...`);

    try {
      const route = await api.calculateRoute({
        project_id: project.id,
        start_node_id: startNode.id,
        destination_node_id: dest.id,
        accessible_only: true,
        verified_only: true,
      });

      setRouteResult(route);
      setCurrentStepIndex(0);
      setIsNavigating(true);
      setSafetyAlert(null);

      // Initialize Positioning Engine with Route Nodes
      const pathNodes = route.path_node_ids
        .map((id) => project.spatial_nodes.find((n) => n.id === id))
        .filter((n): n is SpatialNode => Boolean(n));

      const posService = new PositioningService(project.id, startNode);
      posService.setRoute(pathNodes, 0);

      posService.subscribe((update: PositionUpdateResult) => {
        setPositionState(update.state);
        setConfidenceScore(update.confidence_score);
        if (update.nearest_node_label) setNearestLandmark(update.nearest_node_label);
        if (update.distance_to_next_landmark_meters !== undefined) {
          setDistToNextLandmark(update.distance_to_next_landmark_meters);
        }

        // SAFETY GATE ENFORCEMENT:
        if (update.is_uncertain || update.state === 'POSITION_UNCERTAIN' || update.state === 'POSITION_LOST') {
          playFeedbackTone('error');
          const alertText =
            "Please stop for a moment. Your position is uncertain. Hold your phone steady or tap an access marker to reorient.";
          setSafetyAlert(alertText);
          announce(alertText);
          setActiveSpokenText(alertText);
          voiceService.speakDynamic(alertText, 'high', {
            onStart: (source, txt) => {
              setVoiceSource(source);
              setActiveSpokenText(txt);
            },
            onEnd: () => setVoiceSource(null),
          });
        }
      });

      positioningRef.current = posService;

      // Play route start announcement dynamically via Google AI Studio TTS
      const startText = `Great. Your destination is ${dest.label}. Let's begin.`;
      announce(startText);
      setActiveSpokenText(startText);
      voiceService.speakDynamic(startText, 'normal', {
        onStart: (source, txt) => {
          setVoiceSource(source);
          setActiveSpokenText(txt);
        },
        onEnd: () => {
          setVoiceSource(null);
          if (route.steps.length > 0) {
            const firstStep = route.steps[0].instruction;
            announce(firstStep);
            setActiveSpokenText(firstStep);
            voiceService.speakDynamic(firstStep, 'normal', {
              onStart: (s, t) => {
                setVoiceSource(s);
                setActiveSpokenText(t);
              },
              onEnd: () => setVoiceSource(null),
            });
          }
        },
      });
    } catch (err) {
      console.error('Failed to compute route:', err);
      const errMsg = err instanceof Error ? err.message : 'Unable to calculate accessible route.';
      announce(errMsg);
      setActiveSpokenText(errMsg);
      voiceService.speakDynamic(errMsg);
    }
  };

  // Step Controls
  const handleAdvanceStep = () => {
    if (!routeResult) return;
    const next = currentStepIndex + 1;

    if (next < routeResult.steps.length) {
      setCurrentStepIndex(next);
      playFeedbackTone('step');
      positioningRef.current?.setActiveStep(next);

      const stepText = routeResult.steps[next].instruction;
      announce(stepText);
      setActiveSpokenText(stepText);
      voiceService.speakDynamic(stepText, 'normal', {
        onStart: (s, t) => {
          setVoiceSource(s);
          setActiveSpokenText(t);
        },
        onEnd: () => setVoiceSource(null),
      });
    } else {
      // Arrived at destination
      playFeedbackTone('success');
      const arrivedText = `You have reached your destination: ${destinationCandidate?.label || 'Destination'}.`;
      announce(arrivedText);
      setActiveSpokenText(arrivedText);
      voiceService.speakDynamic(arrivedText, 'normal', {
        onStart: (s, t) => {
          setVoiceSource(s);
          setActiveSpokenText(t);
        },
        onEnd: () => setVoiceSource(null),
      });
    }
  };

  const handleRepeatStep = () => {
    playFeedbackTone('click');
    announce(`Repeating direction`);
    voiceService.repeat();
  };

  const handleStopNavigation = () => {
    playFeedbackTone('click');
    voiceService.stop();
    positioningRef.current?.stopSimulation();
    setIsNavigating(false);
    setRouteResult(null);
    setPendingDisambiguation(null);
    setSafetyAlert(null);
    setVoiceSource(null);
    setActiveSpokenText('');
    announce('Navigation session ended.');
  };

  // Resolve an NFC / QR marker
  const handleResolveMarkerCode = async (code: string) => {
    setShowMarkerModal(false);
    announce(`Scanning access marker ${code}...`);
    try {
      const res = await api.resolveMarker(code);
      setKnownMarkerCode(res.marker_code);
      const foundNode = project?.spatial_nodes.find((n) => n.id === res.spatial_node_id);
      if (foundNode) {
        setStartNode(foundNode);
        setNearestLandmark(foundNode.label);
        setPositionState('POSITION_CONFIRMED');
        setConfidenceScore(1.0);
        setSafetyAlert(null);
        positioningRef.current?.anchorToNode(foundNode, res.marker_code);
        playFeedbackTone('success');

        const confirmText = "Thank you. Your position is confirmed. Continue walking straight ahead.";
        announce(confirmText);
        setActiveSpokenText(confirmText);
        voiceService.speakDynamic(confirmText, 'normal', {
          onStart: (s, t) => {
            setVoiceSource(s);
            setActiveSpokenText(t);
          },
          onEnd: () => setVoiceSource(null),
        });
      }
    } catch (err) {
      console.error('Marker resolution failed:', err);
      const msg = err instanceof Error ? err.message : 'Marker not recognized.';
      announce(msg);
      setActiveSpokenText(msg);
      voiceService.speakDynamic(msg);
    }
  };

  if (loading) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center p-6 text-center space-y-3">
        <Loader2 className="w-8 h-8 animate-spin text-zinc-400" />
        <h1 className="text-lg font-semibold text-zinc-900">Loading TouchRoute Access</h1>
        <p className="text-xs text-zinc-500 max-w-sm">
          Loading building spatial map and verified access markers...
        </p>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center p-6 text-center space-y-4">
        <div className="w-14 h-14 rounded-2xl bg-zinc-100 border border-zinc-200 text-zinc-400 flex items-center justify-center mx-auto">
          <Compass className="w-7 h-7 stroke-[1.5]" />
        </div>
        <div className="space-y-1.5">
          <h2 className="text-xl font-bold text-zinc-950">No Buildings Configured</h2>
          <p className="text-xs text-zinc-500 max-w-sm mx-auto leading-relaxed">
            There are currently no buildings or verified floor plans in the system. Add a building to enable visitor navigation.
          </p>
        </div>
        <div className="pt-2">
          <button
            onClick={onOpenAdmin}
            className="px-4 py-2.5 rounded-lg bg-zinc-900 text-white text-xs font-semibold hover:bg-black transition-colors shadow-2xs"
          >
            Add Building
          </button>
        </div>
      </div>
    );
  }

  const activeStep: NavigationStep | null =
    routeResult && routeResult.steps[currentStepIndex] ? routeResult.steps[currentStepIndex] : null;

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900 flex flex-col">
      {/* Visually Hidden ARIA Live Region for High-Priority Screen Reader Updates */}
      <div aria-live="assertive" aria-atomic="true" className="sr-only">
        {safetyAlert || (activeStep ? activeStep.instruction : '')}
      </div>

      {/* Top Header Bar for Visitor Application */}
      <header className="bg-white border-b border-zinc-200 px-4 py-3 sticky top-0 z-30 shadow-2xs">
        <div className="max-w-md mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-zinc-900 text-white flex items-center justify-center font-bold text-sm">
              <Compass className="w-4 h-4 stroke-[2]" />
            </div>
            <div>
              <h1 className="font-semibold text-sm text-zinc-950 tracking-tight leading-none">
                TouchRoute Access
              </h1>
              <p className="text-[11px] text-zinc-500 mt-0.5 truncate max-w-[180px]">
                {project.building_name || project.name}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setShowMarkerModal(true)}
              className="p-2 rounded-lg text-zinc-600 hover:text-zinc-950 hover:bg-zinc-100 transition-colors flex items-center justify-center"
              title="Scan Location Marker"
              aria-label="Scan NFC or QR Location Marker"
            >
              <QrCode className="w-4 h-4" />
            </button>
            <button
              onClick={() => setShowHelpModal(true)}
              className="p-2 rounded-lg text-zinc-600 hover:text-zinc-950 hover:bg-zinc-100 transition-colors flex items-center justify-center"
              title="Assistance and Help"
              aria-label="Assistance and Help"
            >
              <HelpCircle className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* MAIN VISITOR CONTENT CONTAINER */}
      <main aria-label="TouchRoute Visitor Navigation" className="flex-1 max-w-md w-full mx-auto p-4 sm:p-5 flex flex-col justify-between space-y-6">
        
        {/* ========================================================================= */}
        {/* VIEW 1: ACTIVE NAVIGATION GUIDANCE (When Route is Running)               */}
        {/* ========================================================================= */}
        {isNavigating && activeStep && (
          <div className="space-y-5 flex-1 flex flex-col justify-between">
            {/* Safety Warning Banner if Position is Uncertain */}
            {safetyAlert && (
              <div className="p-4 bg-zinc-900 text-white rounded-xl space-y-3 shadow-xs" role="alert">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-white shrink-0 mt-0.5" />
                  <div>
                    <h3 className="font-semibold text-sm leading-tight">Position Uncertain</h3>
                    <p className="text-xs text-zinc-300 mt-1 leading-relaxed">{safetyAlert}</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <button
                    onClick={() => setShowMarkerModal(true)}
                    aria-label="Scan nearby marker"
                    className="py-2 px-3 bg-white text-zinc-900 hover:bg-zinc-100 font-semibold text-xs rounded-lg flex items-center justify-center"
                  >
                    Scan Marker
                  </button>
                  <button
                    onClick={() => {
                      setSafetyAlert(null);
                      const confirmText = "Position confirmed. Continue straight ahead.";
                      announce(confirmText);
                      setActiveSpokenText(confirmText);
                      voiceService.speakDynamic(confirmText, 'normal', {
                        onStart: (s, t) => {
                          setVoiceSource(s);
                          setActiveSpokenText(t);
                        },
                        onEnd: () => setVoiceSource(null),
                      });
                    }}
                    aria-label="I know my position"
                    className="py-2 px-3 bg-zinc-800 text-zinc-200 hover:bg-zinc-700 font-semibold text-xs rounded-lg flex items-center justify-center border border-zinc-700"
                  >
                    Confirm Spot
                  </button>
                </div>
              </div>
            )}

            {/* Destination & Step Counter Card */}
            <div className="bg-white border border-zinc-200/90 rounded-xl p-4 shadow-2xs flex items-center justify-between text-xs">
              <div className="space-y-0.5">
                <span className="text-zinc-500 block text-[11px] uppercase tracking-wider font-medium">Destination</span>
                <span className="font-semibold text-zinc-950 text-sm block">
                  {destinationCandidate?.label || 'Target Location'}
                </span>
              </div>
              <div className="text-right space-y-0.5">
                <span className="text-zinc-500 block text-[11px] font-medium">{activeStep.level_name || 'Ground Floor'}</span>
                <span className="font-mono font-medium text-zinc-950 text-xs block">
                  Step {activeStep.step_number} / {routeResult?.steps.length}
                </span>
              </div>
            </div>

            {/* Turn Direction Instruction Card */}
            <div className="p-8 bg-zinc-900 text-white rounded-2xl shadow-xs text-center space-y-4">
              <div className="w-11 h-11 rounded-xl bg-zinc-800 text-white border border-zinc-700 mx-auto flex items-center justify-center">
                <Navigation className="w-5 h-5 rotate-45" />
              </div>
              <h2 className="text-2xl sm:text-3xl font-bold tracking-tight leading-snug">
                {activeStep.instruction}
              </h2>
              {activeStep.target_label && (
                <p className="text-xs text-zinc-400 font-normal">
                  Approaching: <strong className="text-zinc-200 font-medium">{activeStep.target_label}</strong>
                  {activeStep.distance_meters > 0 ? ` (${activeStep.distance_meters.toFixed(0)}m)` : ''}
                </p>
              )}
            </div>

            {/* Turn Action Controls */}
            <div className="space-y-2.5 pt-2">
              <button
                onClick={handleAdvanceStep}
                className="w-full py-3.5 px-4 rounded-xl bg-zinc-900 hover:bg-black text-white text-sm font-semibold shadow-2xs flex items-center justify-center gap-2 transition-colors"
              >
                <span>
                  {currentStepIndex + 1 < (routeResult?.steps.length || 0)
                    ? 'Next Step'
                    : 'Finish Navigation'}
                </span>
                <ChevronRight className="w-4 h-4" />
              </button>

              <div className="grid grid-cols-2 gap-2.5">
                <button
                  onClick={handleRepeatStep}
                  className="py-2.5 px-3 rounded-lg bg-white border border-zinc-200 hover:bg-zinc-50 text-zinc-800 text-xs font-medium flex items-center justify-center gap-1.5 shadow-2xs"
                >
                  <RotateCcw className="w-3.5 h-3.5 text-zinc-600" />
                  <span>Repeat</span>
                </button>

                <button
                  onClick={() => {
                    const next = !guidanceMuted;
                    setGuidanceMuted(next);
                    voiceService.setMuted(next);
                    announce(next ? 'Audio muted' : 'Audio active');
                  }}
                  className="py-2.5 px-3 rounded-lg bg-white border border-zinc-200 hover:bg-zinc-50 text-zinc-800 text-xs font-medium flex items-center justify-center gap-1.5 shadow-2xs"
                >
                  {guidanceMuted ? (
                    <>
                      <VolumeX className="w-3.5 h-3.5 text-zinc-500" />
                      <span>Unmute</span>
                    </>
                  ) : (
                    <>
                      <Volume2 className="w-3.5 h-3.5 text-zinc-800" />
                      <span>Mute</span>
                    </>
                  )}
                </button>
              </div>

              {/* End Navigation Action */}
              <button
                onClick={handleStopNavigation}
                aria-label="Exit navigation session"
                className="w-full py-2 text-zinc-500 hover:text-zinc-900 text-xs font-medium underline flex items-center justify-center"
              >
                Exit Navigation Session
              </button>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* VIEW 2: INITIAL VISITOR DASHBOARD & VOICE INPUT (Default Open State)     */}
        {/* ========================================================================= */}
        {!isNavigating && (
          <div className="space-y-6 flex-1 flex flex-col justify-between">
            {/* Starting Spot Card */}
            <div className="bg-white border border-zinc-200/90 rounded-xl p-4 shadow-2xs flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-zinc-100 text-zinc-800 flex items-center justify-center shrink-0 border border-zinc-200">
                  <MapPin className="w-4 h-4" />
                </div>
                <div>
                  <span className="text-[10px] text-zinc-500 font-semibold uppercase tracking-wider block">
                    Starting from
                  </span>
                  <p className="text-xs font-semibold text-zinc-950 leading-tight">
                    {startNode ? `${startNode.label} • Floor ${startNode.level_number}` : 'Select starting point'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowMarkerModal(true)}
                aria-label={startNode ? "Change starting location" : "Select starting location"}
                className="px-2.5 py-1 bg-zinc-100 hover:bg-zinc-200 rounded-md text-xs font-medium text-zinc-800 transition-colors shrink-0"
              >
                {startNode ? 'Change' : 'Select'}
              </button>
            </div>

            {/* Disambiguation Confirmation Prompt (When user spoke a destination) */}
            {pendingDisambiguation && (
              <div className="p-5 bg-white border border-zinc-200 rounded-2xl space-y-4 shadow-xs">
                <div className="space-y-1 text-center">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                    Destination Confirmation
                  </span>
                  <h3 className="text-lg font-bold text-zinc-950">
                    {pendingDisambiguation.destination.label}
                  </h3>
                  <p className="text-xs text-zinc-600" dangerouslySetInnerHTML={{ __html: pendingDisambiguation.routeSummary }} />
                </div>

                <div className="p-3 bg-zinc-50 border border-zinc-200 rounded-xl text-xs text-zinc-700 leading-relaxed font-normal">
                  "{pendingDisambiguation.spokenPrompt}"
                </div>

                <div className="space-y-2 pt-1">
                  {pendingDisambiguation.isCardiologyDual ? (
                    <>
                      <button
                        onClick={() => handleConfirmBeginNavigation(pendingDisambiguation.destination)}
                        className="w-full py-3 px-4 rounded-xl bg-zinc-900 hover:bg-black text-white font-semibold text-xs shadow-2xs flex items-center justify-center gap-2"
                      >
                        <CheckCircle2 className="w-4 h-4 shrink-0" />
                        <span>Cardiology Clinic (First Floor)</span>
                      </button>

                      <button
                        onClick={() => {
                          const pediatric = destinations.find((d) => d.label.toLowerCase().includes('pediatric')) || pendingDisambiguation.destination;
                          handleConfirmBeginNavigation(pediatric);
                        }}
                        className="w-full py-3 px-4 rounded-xl bg-white hover:bg-zinc-50 text-zinc-900 font-semibold text-xs border border-zinc-200 shadow-2xs flex items-center justify-center gap-2"
                      >
                        <Building className="w-4 h-4 shrink-0 text-zinc-700" />
                        <span>Pediatric Cardiology Unit (Third Floor)</span>
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => handleConfirmBeginNavigation(pendingDisambiguation.destination)}
                      className="w-full py-3 px-4 rounded-xl bg-zinc-900 hover:bg-black text-white font-semibold text-xs shadow-2xs flex items-center justify-center gap-2"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Start Navigation</span>
                    </button>
                  )}

                  <button
                    onClick={() => {
                      voiceService.stop();
                      setPendingDisambiguation(null);
                    }}
                    className="w-full py-2 text-zinc-500 hover:text-zinc-900 font-medium text-xs text-center"
                  >
                    Select Different Destination
                  </button>
                </div>
              </div>
            )}

            {/* Giant Voice Action Button */}
            {!pendingDisambiguation && (
              <div className="space-y-6 text-center py-4">
                <div className="space-y-1">
                  <h2 className="text-xl font-bold text-zinc-950 tracking-tight">
                    Where would you like to go?
                  </h2>
                  <p className="text-xs text-zinc-500 max-w-xs mx-auto">
                    Tap to speak or search a department.
                  </p>
                </div>

                <button
                  onClick={handleToggleVoiceInput}
                  className={`w-28 h-28 mx-auto rounded-full flex flex-col items-center justify-center gap-1.5 shadow-xs transition-all active:scale-95 focus:outline-none ${
                    isListening
                      ? 'bg-zinc-950 text-white ring-4 ring-zinc-300 animate-pulse'
                      : 'bg-zinc-900 hover:bg-black text-white'
                  }`}
                  aria-label={isListening ? 'Stop listening' : 'Start speaking destination'}
                >
                  {isListening ? (
                    <>
                      <MicOff className="w-8 h-8" />
                      <span className="text-[10px] font-semibold uppercase tracking-wider">Listening...</span>
                    </>
                  ) : (
                    <>
                      <Mic className="w-8 h-8 text-white" />
                      <span className="text-[10px] font-semibold uppercase tracking-wider">Tap to Speak</span>
                    </>
                  )}
                </button>

                {/* Keyboard / Text Fallback Input */}
                <div className="pt-1">
                  <div className="relative max-w-sm mx-auto flex items-center">
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleProcessVoiceQuery(searchQuery);
                      }}
                      placeholder="Or search room or clinic..."
                      aria-label="Search destination room or clinic"
                      className="w-full min-h-[42px] pl-9 pr-18 py-2 bg-white border border-zinc-200/90 rounded-xl text-xs text-zinc-900 focus:border-zinc-900 focus:outline-none shadow-2xs"
                    />
                    <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-3.5 pointer-events-none" />
                    <button
                      onClick={() => handleProcessVoiceQuery(searchQuery)}
                      disabled={!searchQuery.trim()}
                      aria-label="Search destination"
                      className="absolute right-1 top-1 bottom-1 px-3 bg-zinc-900 text-white rounded-lg text-xs font-medium disabled:opacity-30 flex items-center justify-center hover:bg-black"
                    >
                      Search
                    </button>
                  </div>
                </div>

                {/* Clean Quick Shortcuts for Verified Destinations */}
                <div className="pt-2">
                  <span className="text-[10px] uppercase tracking-wider font-semibold text-zinc-400 block mb-2">
                    Common Destinations
                  </span>
                  {destinations.length > 0 ? (
                    <div className="flex items-center justify-center gap-1.5 flex-wrap">
                      {destinations.slice(0, 4).map((dest) => (
                        <button
                          key={dest.id}
                          onClick={() => handleProcessVoiceQuery(dest.label)}
                          className="px-2.5 py-1.5 bg-white border border-zinc-200/90 hover:border-zinc-400 rounded-lg text-xs font-medium text-zinc-800 transition-colors shadow-2xs"
                        >
                          {dest.label}
                        </button>
                      ))}
                      {destinations.length > 4 && (
                        <button
                          onClick={() => setShowExploreModal(true)}
                          className="px-2.5 py-1.5 bg-zinc-100 hover:bg-zinc-200 rounded-lg text-xs font-medium text-zinc-700 transition-colors"
                        >
                          All &rarr;
                        </button>
                      )}
                    </div>
                  ) : (
                    <p className="text-xs text-zinc-500">No rooms configured in this building yet.</p>
                  )}
                </div>
              </div>
            )}

            {/* Assistance Footer Bar */}
            <div className="pt-4 flex items-center justify-between text-xs text-zinc-500 border-t border-zinc-200/80">
              <button
                onClick={() => setShowHelpModal(true)}
                aria-label="Call building assistance"
                className="flex items-center gap-1.5 text-zinc-600 font-medium hover:text-zinc-900"
              >
                <PhoneCall className="w-3.5 h-3.5 text-zinc-700" />
                <span>Call Information Desk</span>
              </button>

              <button
                onClick={onOpenTactile}
                aria-label="View physical tactile maps"
                className="text-zinc-500 hover:text-zinc-900 underline"
              >
                Tactile Maps
              </button>
            </div>
          </div>
        )}
      </main>

      {/* ========================================================================= */}
      {/* MODAL 1: EXPLORE BUILDING DEPARTMENTS                                    */}
      {/* ========================================================================= */}
      {showExploreModal && (
        <div className="fixed inset-0 bg-zinc-950/40 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 z-50">
          <div className="bg-white w-full max-w-md rounded-t-2xl sm:rounded-2xl max-h-[80vh] flex flex-col p-5 space-y-4 shadow-xl border border-zinc-200">
            <div className="flex items-center justify-between pb-2 border-b border-zinc-200">
              <div>
                <h3 className="text-base font-bold text-zinc-950">Departments</h3>
                <p className="text-xs text-zinc-500">Select any room to begin navigation</p>
              </div>
              <button
                onClick={() => setShowExploreModal(false)}
                aria-label="Close dialog"
                className="p-1 rounded-lg text-zinc-500 hover:bg-zinc-100 flex items-center justify-center"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="overflow-y-auto space-y-1.5 flex-1 pr-1">
              {destinations.map((d) => (
                <button
                  key={d.id}
                  onClick={() => {
                    setShowExploreModal(false);
                    handleProcessVoiceQuery(d.label);
                  }}
                  className="w-full p-3 bg-zinc-50 hover:bg-zinc-100 border border-zinc-200/80 rounded-xl text-left flex items-center justify-between transition-colors"
                >
                  <div>
                    <h4 className="font-semibold text-xs text-zinc-950">{d.label}</h4>
                    <p className="text-[11px] text-zinc-500">
                      {d.level_name || `Floor ${d.level_number}`} {d.room_number ? `&bull; #${d.room_number}` : ''}
                    </p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-zinc-400" />
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 2: NFC / QR MARKER RESOLVER MODAL                                  */}
      {/* ========================================================================= */}
      {showMarkerModal && (
        <div className="fixed inset-0 bg-zinc-950/40 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 z-50">
          <div className="bg-white w-full max-w-md rounded-t-2xl sm:rounded-2xl p-5 space-y-4 shadow-xl border border-zinc-200">
            <div className="flex items-center justify-between pb-2 border-b border-zinc-200">
              <div className="flex items-center gap-2">
                <QrCode className="w-4 h-4 text-zinc-900" />
                <h3 className="text-base font-bold text-zinc-950">Access Markers</h3>
              </div>
              <button
                onClick={() => setShowMarkerModal(false)}
                aria-label="Close dialog"
                className="p-1 rounded-lg text-zinc-500 hover:bg-zinc-100 flex items-center justify-center"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-zinc-600 leading-relaxed">
              Select a physical NFC or QR marker located throughout the building to update your position:
            </p>

            <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1">
              {markers.length > 0 ? (
                markers.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => handleResolveMarkerCode(m.marker_code)}
                    className="w-full p-2.5 bg-zinc-50 hover:bg-zinc-100 border border-zinc-200/80 rounded-xl text-left flex items-center justify-between text-xs"
                  >
                    <div>
                      <span className="font-mono font-medium text-zinc-950 bg-zinc-200/80 px-1.5 py-0.5 rounded text-[10px]">
                        {m.marker_code}
                      </span>
                      <p className="font-medium text-zinc-900 mt-1">{m.location_description}</p>
                      <p className="text-[10px] text-zinc-500">{m.level_name}</p>
                    </div>
                    <Badge variant="neutral">{m.marker_type.toUpperCase()}</Badge>
                  </button>
                ))
              ) : (
                <p className="text-xs text-zinc-500 py-6 text-center">No location markers configured yet.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 3: ACCESSIBLE ASSISTANCE                                            */}
      {/* ========================================================================= */}
      {showHelpModal && (
        <div className="fixed inset-0 bg-zinc-950/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white w-full max-w-sm rounded-2xl p-5 space-y-4 shadow-xl border border-zinc-200 text-center">
            <div className="w-10 h-10 mx-auto rounded-full bg-zinc-100 text-zinc-800 flex items-center justify-center border border-zinc-200">
              <PhoneCall className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-zinc-950">Staff Assistance</h3>
              <p className="text-xs text-zinc-500 mt-1">
                If you need human assistance or guide support, building staff can meet you at your location.
              </p>
            </div>

            <div className="p-3 bg-zinc-50 border border-zinc-200/80 rounded-xl text-xs text-zinc-700">
              <span className="text-zinc-500">Facility:</span>
              <strong className="block text-xs font-semibold text-zinc-950 mt-0.5">{project.name || 'Building Desk'}</strong>
            </div>

            <div className="space-y-2 pt-1">
              <button
                onClick={() => {
                  setShowHelpModal(false);
                  announce('Requesting floor steward assistance.');
                  playFeedbackTone('success');
                }}
                aria-label="Request staff assistance"
                className="w-full py-2.5 px-4 bg-zinc-900 hover:bg-black text-white font-semibold text-xs rounded-xl flex items-center justify-center shadow-2xs"
              >
                Request Floor Steward
              </button>
              <button
                onClick={() => setShowHelpModal(false)}
                aria-label="Close assistance dialog"
                className="w-full py-2 px-4 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 font-medium text-xs rounded-xl flex items-center justify-center"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
