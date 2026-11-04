import React, { useState, useEffect } from 'react';
import {
  Printer,
  Building,
  ArrowRight,
  BookOpen,
  Loader2,
} from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { TactilePreviewViewer } from './TactilePreviewViewer';
import { api } from '../../services/api';
import { Project } from '../../types';
import { useAccessibility } from '../../context/AccessibilityContext';

interface TactileExperienceViewProps {
  onBackToVisitor: () => void;
  onOpenAdmin: () => void;
  initialProjectId?: string;
}

export const TactileExperienceView: React.FC<TactileExperienceViewProps> = ({
  onBackToVisitor,
  onOpenAdmin,
  initialProjectId,
}) => {
  const { announce } = useAccessibility();
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>(initialProjectId || '');
  const [loading, setLoading] = useState<boolean>(true);
  const [activeTab, setActiveTab] = useState<'viewer' | 'standards'>('viewer');

  useEffect(() => {
    api.getProjects(false).then((list) => {
      setProjects(list);
      if (!selectedProjectId && list.length > 0) {
        setSelectedProjectId(list[0].id);
      }
      setLoading(false);
    });
  }, [selectedProjectId]);

  const selectedProject = projects.find((p) => p.id === selectedProjectId);

  if (loading) {
    return (
      <div className="py-24 bg-zinc-50 flex flex-col items-center justify-center p-6 text-center space-y-3">
        <Loader2 className="w-7 h-7 text-zinc-400 animate-spin" />
        <p className="text-sm text-zinc-600">Loading tactile maps...</p>
      </div>
    );
  }

  if (projects.length === 0) {
    return (
      <div className="py-16 bg-zinc-50 min-h-screen text-zinc-900">
        <div className="max-w-xl mx-auto px-4 text-center space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-zinc-100 border border-zinc-200 text-zinc-400 flex items-center justify-center mx-auto">
            <Printer className="w-7 h-7 stroke-[1.5] text-zinc-400" />
          </div>
          <h1 className="text-xl font-bold text-zinc-950">No Tactile Maps Available</h1>
          <p className="text-xs text-zinc-500 leading-relaxed">
            No buildings or floor plans have been uploaded yet. Create a building and upload an architectural floor plan to generate tactile maps and physical wayfinding assets.
          </p>
          <div className="pt-2 flex justify-center gap-3">
            <Button variant="primary" size="sm" onClick={onOpenAdmin}>
              Add Building
            </Button>
            <Button variant="outline" size="sm" onClick={onBackToVisitor}>
              Return to Visitor Mode
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="py-8 bg-zinc-50 min-h-screen text-zinc-900">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 space-y-6">
        
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-zinc-200">
          <div>
            <h1 className="text-2xl font-bold text-zinc-950 tracking-tight">
              Tactile Maps
            </h1>
            <p className="text-sm text-zinc-600 mt-1">
              Generate and download physical tactile maps for non-visual indoor wayfinding.
            </p>
          </div>

          {/* Building Selector */}
          <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-lg border border-zinc-200 shadow-2xs self-start sm:self-auto">
            <Building className="w-4 h-4 text-zinc-400 shrink-0" />
            <label htmlFor="tactile-building-select" className="text-xs font-medium text-zinc-500 sr-only">
              Building:
            </label>
            <select
              id="tactile-building-select"
              value={selectedProjectId}
              onChange={(e) => setSelectedProjectId(e.target.value)}
              className="bg-transparent text-xs font-medium text-zinc-900 focus:outline-none cursor-pointer"
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="border-b border-zinc-200">
          <nav className="flex space-x-6">
            <button
              onClick={() => {
                setActiveTab('viewer');
                announce('Switched to Tactile Viewer & Downloads');
              }}
              className={`pb-3 text-sm transition-colors flex items-center gap-2 ${
                activeTab === 'viewer'
                  ? 'border-b-2 border-zinc-950 text-zinc-950 font-semibold'
                  : 'text-zinc-500 hover:text-zinc-900 font-medium'
              }`}
            >
              <Printer className="w-4 h-4" />
              <span>Viewer &amp; Downloads</span>
            </button>

            <button
              onClick={() => {
                setActiveTab('standards');
                announce('Switched to Physical Accessibility Standards');
              }}
              className={`pb-3 text-sm transition-colors flex items-center gap-2 ${
                activeTab === 'standards'
                  ? 'border-b-2 border-zinc-950 text-zinc-950 font-semibold'
                  : 'text-zinc-500 hover:text-zinc-900 font-medium'
              }`}
            >
              <BookOpen className="w-4 h-4" />
              <span>Physical Standards</span>
            </button>
          </nav>
        </div>

        {/* TAB 1: Viewer & Downloads */}
        {activeTab === 'viewer' && selectedProjectId && (
          <TactilePreviewViewer
            projectId={selectedProjectId}
            onBack={onBackToVisitor}
          />
        )}

        {/* TAB 2: Physical Accessibility Standards */}
        {activeTab === 'standards' && (
          <div className="space-y-6">
            <Card className="p-6 sm:p-8 space-y-6 bg-white border border-zinc-200/90 rounded-xl shadow-2xs">
              <div className="space-y-1.5 border-b border-zinc-100 pb-4">
                <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">
                  Universal Non-Visual Access
                </span>
                <h2 className="text-xl font-bold text-zinc-950 tracking-tight">
                  Physical Wayfinding Standards
                </h2>
                <p className="text-xs text-zinc-600 leading-relaxed max-w-3xl">
                  TouchRoute tactile maps are designed to be explored by touch alone without requiring a smartphone.
                  Installed at building entrances and corridor intersections, they conform to ISO 21542 and ADA Standard 703.
                </p>
              </div>

              {/* Physical Feature Differentiation Table */}
              <div className="space-y-3">
                <h3 className="text-xs font-semibold text-zinc-950 uppercase tracking-wider">
                  Tactile Geometry &amp; Relief Differentiation
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border border-zinc-200 rounded-lg overflow-hidden">
                    <thead className="bg-zinc-50 text-zinc-700 font-semibold uppercase tracking-wider text-[10px] border-b border-zinc-200">
                      <tr>
                        <th className="p-3">Feature</th>
                        <th className="p-3">Relief Height</th>
                        <th className="p-3">Physical Profile</th>
                        <th className="p-3">Tactile Meaning</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100 text-zinc-700">
                      <tr>
                        <td className="p-3 font-medium text-zinc-950">Orientation Notch</td>
                        <td className="p-3 font-mono">Cut-out notch</td>
                        <td className="p-3">Chamfered top-left corner</td>
                        <td className="p-3 text-zinc-600">Establishes top-of-map orientation immediately upon touching the plate.</td>
                      </tr>
                      <tr>
                        <td className="p-3 font-medium text-zinc-950">Architectural Walls</td>
                        <td className="p-3 font-mono">2.5 mm raised</td>
                        <td className="p-3">Solid continuous ridges</td>
                        <td className="p-3 text-zinc-600">Defines building boundaries, partition walls, and room enclosures.</td>
                      </tr>
                      <tr>
                        <td className="p-3 font-medium text-zinc-950">Navigable Pathways</td>
                        <td className="p-3 font-mono">1.2 mm raised</td>
                        <td className="p-3">Dashed corridor lines</td>
                        <td className="p-3 text-zinc-600">Communicates step-free, obstruction-free corridor pathways.</td>
                      </tr>
                      <tr>
                        <td className="p-3 font-medium text-zinc-950">Elevators &amp; Stairs</td>
                        <td className="p-3 font-mono">2.0 mm raised</td>
                        <td className="p-3">Embossed box with diagonal cross</td>
                        <td className="p-3 text-zinc-600">Vertical transitions to upper or lower building levels.</td>
                      </tr>
                      <tr>
                        <td className="p-3 font-medium text-zinc-950">Braille Labels</td>
                        <td className="p-3 font-mono">0.8 mm dot height</td>
                        <td className="p-3">UEB Grade 1 Braille cells</td>
                        <td className="p-3 text-zinc-600">Identifies department names, room numbers, and floor numbers.</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Station Installation Ergonomics */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
                <div className="p-4 bg-zinc-50 border border-zinc-200/90 rounded-xl space-y-1.5">
                  <span className="text-[11px] font-semibold uppercase text-zinc-500">Installation Height</span>
                  <p className="text-xs text-zinc-600 leading-relaxed">
                    Mounted at entrances and elevator lobbies at 90cm to 100cm height, inclined at 30 degrees for comfortable touch reading.
                  </p>
                </div>

                <div className="p-4 bg-zinc-50 border border-zinc-200/90 rounded-xl space-y-1.5">
                  <span className="text-[11px] font-semibold uppercase text-zinc-500">Tactile Ground Paving</span>
                  <p className="text-xs text-zinc-600 leading-relaxed">
                    Directional ground paving leads directly from the main street entrance door to the tactile map station.
                  </p>
                </div>

                <div className="p-4 bg-zinc-50 border border-zinc-200/90 rounded-xl space-y-1.5">
                  <span className="text-[11px] font-semibold uppercase text-zinc-500">Acoustic Beacon</span>
                  <p className="text-xs text-zinc-600 leading-relaxed">
                    A gentle acoustic chime sounds periodically from the station, providing an auditory cue for spatial orientation.
                  </p>
                </div>
              </div>

              {/* Bottom CTA to View 3D Studio */}
              <div className="pt-2 flex justify-end">
                <Button variant="primary" size="sm" onClick={() => setActiveTab('viewer')} icon={<ArrowRight className="w-3.5 h-3.5" />}>
                  Open Tactile Viewer &amp; Downloads
                </Button>
              </div>
            </Card>
          </div>
        )}

      </div>
    </div>
  );
};
