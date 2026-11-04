import React, { useState, useEffect } from 'react';
import {
  Mic,
  MicOff,
  Search,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  X,
  MapPin,
  Accessibility,
  ArrowRight,
  Loader2,
} from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { DestinationItem, DestinationMatchResponse } from '../../types';
import { api } from '../../services/api';
import { voiceRecognizer, voiceSynthesizer } from '../../services/voiceNavigation';
import { useAccessibility } from '../../context/AccessibilityContext';

interface VoiceDestinationPickerProps {
  projectId: string;
  selectedDestinationId: string | null;
  onSelectDestination: (destination: DestinationItem) => void;
  label?: string;
  placeholder?: string;
  excludeNodeId?: string;
}

export const VoiceDestinationPicker: React.FC<VoiceDestinationPickerProps> = ({
  projectId,
  selectedDestinationId,
  onSelectDestination,
  label = 'Select Destination',
  placeholder = 'Speak or type room name, number, or landmark...',
  excludeNodeId,
}) => {
  const { announce, playFeedbackTone } = useAccessibility();

  // All verified destinations for this building
  const [destinations, setDestinations] = useState<DestinationItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // Search & Speech State
  const [query, setQuery] = useState<string>('');
  const [isListening, setIsListening] = useState<boolean>(false);
  const [recognizedTranscript, setRecognizedTranscript] = useState<string | null>(null);
  const [matchingState, setMatchingState] = useState<DestinationMatchResponse | null>(null);
  const [isMatching, setIsMatching] = useState<boolean>(false);
  const [speechError, setSpeechError] = useState<string | null>(null);

  // Dropdown open state
  const [isDropdownOpen, setIsDropdownOpen] = useState<boolean>(false);

  // Load verified destinations
  useEffect(() => {
    let active = true;
    setLoading(true);
    api.getVerifiedDestinations(projectId)
      .then((data) => {
        if (active) {
          setDestinations(data.filter((d) => d.id !== excludeNodeId));
        }
      })
      .catch((err) => {
        console.error('Failed to load destinations:', err);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [projectId, excludeNodeId]);

  const selectedDestination = destinations.find((d) => d.id === selectedDestinationId) || null;

  // Start voice recognition
  const handleToggleVoiceInput = () => {
    if (isListening) {
      voiceRecognizer.stopListening();
      setIsListening(false);
      return;
    }

    setSpeechError(null);
    setRecognizedTranscript(null);
    setMatchingState(null);

    if (!voiceRecognizer.isSupported()) {
      const msg = 'Microphone speech recognition is not supported on this browser. Please type to search.';
      setSpeechError(msg);
      announce(msg);
      return;
    }

    playFeedbackTone('click');
    announce('Listening for destination. Please speak a room name or number.');
    setIsListening(true);

    voiceRecognizer.startListening({
      onResult: (transcript, isFinal) => {
        setRecognizedTranscript(transcript);
        setQuery(transcript);
        if (isFinal) {
          setIsListening(false);
          handleRunDestinationMatch(transcript);
        }
      },
      onError: (err) => {
        setIsListening(false);
        setSpeechError(err);
        announce(`Voice recognition message: ${err}`);
      },
      onEnd: () => {
        setIsListening(false);
      },
    });
  };

  // Perform backend fuzzy / phonetic matching on spoken transcript
  const handleRunDestinationMatch = async (spokenText: string) => {
    setIsMatching(true);
    try {
      const match = await api.matchSpokenDestination(projectId, spokenText);
      setMatchingState(match);

      if (match.exact_match) {
        // High confidence single match: prompt confirmation
        playFeedbackTone('success');
        announce(`Recognized destination: ${match.exact_match.label}. Please confirm.`);
      } else if (match.is_ambiguous) {
        playFeedbackTone('click');
        announce(match.clarification_prompt || 'Found multiple matching destinations. Please choose.');
      } else {
        announce(match.clarification_prompt || 'No matching verified destination found.');
      }
    } catch (err: unknown) {
      console.error(err);
    } finally {
      setIsMatching(false);
    }
  };

  // Confirm destination selection
  const handleChooseDestination = (dest: DestinationItem) => {
    onSelectDestination(dest);
    setQuery('');
    setRecognizedTranscript(null);
    setMatchingState(null);
    setIsDropdownOpen(false);
    playFeedbackTone('success');
    announce(`Selected destination: ${dest.label} on ${dest.level_name}.`);
  };

  // Filtered destinations for text input
  const filteredDestinations = destinations.filter((d) => {
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return (
      d.label.toLowerCase().includes(q) ||
      (d.room_number && d.room_number.toLowerCase().includes(q)) ||
      d.node_type.toLowerCase().includes(q) ||
      d.spoken_aliases.some((a) => a.includes(q))
    );
  });

  return (
    <div className="space-y-2 relative">
      <div className="flex items-center justify-between">
        <label className="block text-xs font-semibold text-zinc-800">
          {label}
        </label>
        {selectedDestination && (
          <span className="text-[11px] text-emerald-800 flex items-center gap-1 font-medium">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            <span>Verified Waypoint</span>
          </span>
        )}
      </div>

      {/* Input Group: Text Field + Voice Mic Button */}
      <div className="relative flex items-center">
        <div className="absolute left-3 text-zinc-400 pointer-events-none">
          <Search className="w-4 h-4" />
        </div>

        <input
          type="text"
          value={query || (selectedDestination && !isDropdownOpen ? selectedDestination.label : '')}
          onChange={(e) => {
            setQuery(e.target.value);
            setIsDropdownOpen(true);
            setMatchingState(null);
          }}
          onFocus={() => setIsDropdownOpen(true)}
          placeholder={placeholder}
          className={`w-full pl-9 pr-24 py-2.5 text-xs sm:text-sm bg-white border rounded-xl shadow-sm transition-all focus:ring-2 focus:ring-zinc-900 focus:outline-none ${
            isListening ? 'border-zinc-500 ring-2 ring-zinc-400 bg-zinc-50/20' : 'border-zinc-300'
          }`}
          aria-label={label}
        />

        {/* Clear Button */}
        {query && (
          <button
            onClick={() => {
              setQuery('');
              setMatchingState(null);
            }}
            className="absolute right-12 p-1 text-zinc-400 hover:text-zinc-700"
            title="Clear text"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}

        {/* Microphone Button */}
        <button
          onClick={handleToggleVoiceInput}
          disabled={loading}
          type="button"
          className={`absolute right-1.5 px-2.5 py-1.5 rounded-lg flex items-center gap-1.5 text-xs font-semibold transition-all shadow-sm ${
            isListening
              ? 'bg-zinc-900 text-white animate-pulse'
              : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-50 hover:text-zinc-950 border border-zinc-200'
          }`}
          title={isListening ? 'Listening... click to stop' : 'Speak destination with voice'}
          aria-pressed={isListening}
        >
          {isListening ? (
            <>
              <Mic className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Listening</span>
            </>
          ) : (
            <>
              <Mic className="w-3.5 h-3.5 text-zinc-800" />
              <span className="hidden sm:inline">Voice</span>
            </>
          )}
        </button>
      </div>

      {/* Voice Recognition State Banner */}
      {isListening && (
        <div
          role="status"
          aria-live="polite"
          className="p-3 bg-zinc-50 border border-zinc-200 rounded-xl text-xs text-zinc-950 flex items-center justify-between animate-fadeIn"
        >
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-zinc-900 animate-ping shrink-0" />
            <span>Listening... Speak room name, room number, or facility (e.g. &ldquo;Audiology&rdquo;, &ldquo;Room 204&rdquo;, &ldquo;Restroom&rdquo;)</span>
          </div>
          <button
            onClick={() => setIsListening(false)}
            className="text-[11px] underline text-zinc-950 hover:text-zinc-950 ml-2"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Speech Matching Resolution Modal / Card */}
      {matchingState && (
        <div className="p-4 bg-white border-2 border-zinc-300 rounded-xl shadow-md space-y-3">
          <div className="flex items-start justify-between">
            <div>
              <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-900">
                Spoken Input Recognized
              </span>
              <p className="text-sm font-bold text-zinc-900">
                &ldquo;{matchingState.spoken_query}&rdquo;
              </p>
            </div>
            <button
              onClick={() => setMatchingState(null)}
              className="p-1 text-zinc-400 hover:text-zinc-700"
              title="Close match dialog"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Exact Match Found */}
          {matchingState.exact_match && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-emerald-950 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  Exact Verified Location Found
                </span>
                <span className="font-mono text-emerald-800">
                  {matchingState.exact_match.level_name}
                </span>
              </div>
              <p className="text-sm font-bold text-zinc-900">
                {matchingState.exact_match.label}
                {matchingState.exact_match.room_number && (
                  <span className="ml-1 text-xs text-zinc-600 font-mono">
                    (#{matchingState.exact_match.room_number})
                  </span>
                )}
              </p>
              <div className="pt-1 flex items-center justify-end gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setMatchingState(null)}
                  className="text-xs"
                >
                  Different Destination
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => handleChooseDestination(matchingState.exact_match!)}
                  icon={<ArrowRight className="w-3.5 h-3.5" />}
                  className="text-xs"
                >
                  Confirm Destination
                </Button>
              </div>
            </div>
          )}

          {/* Ambiguous Candidates Found (e.g. Restroom North vs Restroom South) */}
          {matchingState.is_ambiguous && (
            <div className="space-y-2">
              <div className="p-2.5 bg-zinc-50 border border-zinc-200 rounded-lg text-xs text-zinc-950 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-zinc-800 shrink-0" />
                <span>{matchingState.clarification_prompt}</span>
              </div>
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {matchingState.candidates.map((cand) => (
                  <button
                    key={cand.id}
                    onClick={() => handleChooseDestination(cand)}
                    className="w-full text-left p-2.5 rounded-lg border border-zinc-200 hover:border-zinc-400 hover:bg-zinc-50 transition-colors flex items-center justify-between group"
                  >
                    <div>
                      <div className="text-xs font-bold text-zinc-900">
                        {cand.label}
                        {cand.room_number && (
                          <span className="ml-1 text-[11px] text-zinc-500 font-mono">
                            #{cand.room_number}
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-zinc-500">
                        {cand.level_name} &bull; {cand.node_type}
                      </div>
                    </div>
                    <ArrowRight className="w-4 h-4 text-zinc-400 group-hover:text-zinc-800 transition-colors" />
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* No Candidate Matches */}
          {!matchingState.exact_match && !matchingState.is_ambiguous && (
            <div className="p-3 bg-zinc-50 border border-zinc-200 rounded-lg text-xs text-zinc-600 space-y-2">
              <p>{matchingState.clarification_prompt}</p>
              <Button
                variant="outline"
                size="sm"
                onClick={handleToggleVoiceInput}
                icon={<RotateCcw className="w-3.5 h-3.5" />}
                className="text-xs"
              >
                Try Speaking Again
              </Button>
            </div>
          )}
        </div>
      )}

      {speechError && (
        <div
          role="alert"
          className="p-2.5 bg-red-50 border border-red-200 text-red-900 text-xs rounded-lg flex items-center gap-2"
        >
          <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
          <span>{speechError}</span>
        </div>
      )}

      {/* Standard Searchable Dropdown List (Non-voice alternative) */}
      {isDropdownOpen && !matchingState && (
        <div className="absolute top-full left-0 right-0 z-20 mt-1 bg-white border border-zinc-300 rounded-xl shadow-lg max-h-60 overflow-y-auto p-1.5 space-y-1">
          <div className="flex items-center justify-between px-2 py-1 text-[10px] font-mono uppercase tracking-wider text-zinc-500 border-b border-zinc-100">
            <span>Verified Destinations ({filteredDestinations.length})</span>
            <button
              onClick={() => setIsDropdownOpen(false)}
              className="text-zinc-400 hover:text-zinc-700"
            >
              Close
            </button>
          </div>

          {filteredDestinations.length === 0 ? (
            <div className="p-3 text-center text-xs text-zinc-400">
              No matching verified destinations found.
            </div>
          ) : (
            filteredDestinations.map((d) => (
              <button
                key={d.id}
                onClick={() => handleChooseDestination(d)}
                className={`w-full text-left p-2 rounded-lg text-xs flex items-center justify-between transition-colors ${
                  selectedDestinationId === d.id
                    ? 'bg-zinc-50 text-zinc-950 font-semibold border border-zinc-200'
                    : 'hover:bg-zinc-50 text-zinc-800'
                }`}
              >
                <div className="min-w-0 pr-2">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate">{d.label}</span>
                    {d.room_number && (
                      <span className="text-[10px] font-mono px-1 bg-zinc-100 text-zinc-600 rounded">
                        #{d.room_number}
                      </span>
                    )}
                  </div>
                  <div className="text-[10px] text-zinc-500 capitalize">
                    {d.level_name} &bull; {d.node_type}
                  </div>
                </div>

                <div className="shrink-0 flex items-center gap-1">
                  {d.is_accessible && (
                    <span title="Step-Free Accessible">
                      <Accessibility className="w-3.5 h-3.5 text-emerald-600" />
                    </span>
                  )}
                  {selectedDestinationId === d.id && (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  )}
                </div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
};
