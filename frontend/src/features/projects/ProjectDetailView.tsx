import React, { useEffect, useState } from 'react';
import {
  ArrowLeft,
  MapPin,
  CheckCircle2,
  AlertCircle,
  Navigation,
  Printer,
  Layers,
  Loader2,
  FileText,
  Upload,
  QrCode,
  Download,
  Plus,
} from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { RouteCalculatorModal } from '../dashboard/RouteCalculatorModal';
import { TactilePreviewModal } from '../dashboard/TactilePreviewModal';
import { FloorPlanStudio } from '../floorplans/FloorPlanStudio';
import { SpatialMapEditor } from '../spatial-editor/SpatialMapEditor';
import { NavigationSessionView } from '../navigation/NavigationSessionView';
import { TactilePreviewViewer } from '../tactile/TactilePreviewViewer';
import { MarkerManagementModal } from './MarkerManagementModal';
import { api } from '../../services/api';
import { ProjectDetail } from '../../types';
import { useAccessibility } from '../../context/AccessibilityContext';

interface ProjectDetailViewProps {
  projectId: string;
  onBack: () => void;
}

type TabType = 'floorplans' | 'review' | 'tactile' | 'markers';

export const ProjectDetailView: React.FC<ProjectDetailViewProps> = ({
  projectId,
  onBack,
}) => {
  const { announce } = useAccessibility();
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>('floorplans');

  // Subview states
  const [isRouteOpen, setIsRouteOpen] = useState(false);
  const [isTactileOpen, setIsTactileOpen] = useState(false);
  const [isStudioOpen, setIsStudioOpen] = useState(false);
  const [isSpatialEditorOpen, setIsSpatialEditorOpen] = useState(false);
  const [editorInitialPlanId, setEditorInitialPlanId] = useState<string | undefined>(undefined);
  const [isNavSessionOpen, setIsNavSessionOpen] = useState<boolean>(false);
  const [selectedDestinationId, setSelectedDestinationId] = useState<string | undefined>(undefined);
  const [isTactileViewerOpen, setIsTactileViewerOpen] = useState<boolean>(false);
  const [tactileInitialPlanId, setTactileInitialPlanId] = useState<string | undefined>(undefined);
  const [isMarkerModalOpen, setIsMarkerModalOpen] = useState<boolean>(false);

  useEffect(() => {
    setLoading(true);
    api.getProjectDetail(projectId)
      .then((data) => {
        setProject(data);
        announce(`Managing building: ${data.name}`);
      })
      .catch((err) => {
        console.error('Error fetching project detail:', err);
        setError('Failed to load building details.');
      })
      .finally(() => setLoading(false));
  }, [projectId]);

  if (loading) {
    return (
      <div className="py-24 flex flex-col items-center justify-center text-zinc-500 gap-3">
        <Loader2 className="w-7 h-7 animate-spin text-zinc-400" />
        <span className="text-sm">Loading building details...</span>
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="max-w-4xl mx-auto py-16 px-4">
        <Button variant="outline" size="sm" onClick={onBack} icon={<ArrowLeft className="w-4 h-4" />}>
          Back to Buildings
        </Button>
        <div className="mt-6 p-6 bg-red-50 border border-red-200 rounded-xl text-red-900 text-sm">
          {error || 'Building not found.'}
        </div>
      </div>
    );
  }

  if (isNavSessionOpen) {
    return (
      <NavigationSessionView
        projectId={projectId}
        initialDestinationId={selectedDestinationId}
        onBack={() => {
          setIsNavSessionOpen(false);
          setLoading(true);
          api.getProjectDetail(projectId).then(setProject).finally(() => setLoading(false));
        }}
      />
    );
  }

  if (isTactileViewerOpen) {
    return (
      <TactilePreviewViewer
        projectId={projectId}
        initialFloorPlanId={tactileInitialPlanId}
        onBack={() => {
          setIsTactileViewerOpen(false);
          setLoading(true);
          api.getProjectDetail(projectId).then(setProject).finally(() => setLoading(false));
        }}
      />
    );
  }

  if (isSpatialEditorOpen) {
    return (
      <SpatialMapEditor
        projectId={projectId}
        initialFloorPlanId={editorInitialPlanId}
        onBack={() => {
          setIsSpatialEditorOpen(false);
          setLoading(true);
          api.getProjectDetail(projectId)
            .then(setProject)
            .finally(() => setLoading(false));
        }}
      />
    );
  }

  if (isStudioOpen) {
    return (
      <FloorPlanStudio
        projectId={projectId}
        onBack={() => {
          setIsStudioOpen(false);
          setLoading(true);
          api.getProjectDetail(projectId)
            .then(setProject)
            .finally(() => setLoading(false));
        }}
      />
    );
  }

  const isVerified = project.status === 'verified';

  return (
    <div className="py-8 bg-zinc-50 min-h-screen">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
        
        {/* Top Navigation & Quick Actions */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={onBack}
            icon={<ArrowLeft className="w-3.5 h-3.5 text-zinc-600" />}
          >
            Back to Buildings
          </Button>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setSelectedDestinationId(undefined);
                setIsNavSessionOpen(true);
              }}
              icon={<Navigation className="w-3.5 h-3.5 text-zinc-700" />}
            >
              Preview Route
            </Button>
            <Button
              variant="accent"
              size="sm"
              onClick={() => setIsStudioOpen(true)}
              icon={<Upload className="w-3.5 h-3.5 text-white" />}
            >
              Upload Blueprint
            </Button>
          </div>
        </div>

        {/* Building Header Card */}
        <Card className="p-6 bg-white border border-zinc-200 rounded-xl shadow-xs">
          <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                {isVerified ? (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-zinc-900 border border-emerald-200">
                    <span className="w-1.5 h-1.5 rounded-full bg-white" />
                    Verified
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-zinc-100 text-zinc-700 border border-zinc-200">
                    <span className="w-1.5 h-1.5 rounded-full bg-zinc-400" />
                    In Review
                  </span>
                )}
                <span className="text-xs text-zinc-400">&bull;</span>
                <span className="text-xs text-zinc-500">ID: {project.id}</span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-bold text-zinc-900 tracking-tight">
                {project.name}
              </h1>
              <p className="text-xs text-zinc-500 flex items-center gap-1 mt-0.5">
                <MapPin className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                <strong className="text-zinc-700 font-medium">{project.building_name}</strong>
                {project.address && <span>&bull; {project.address}</span>}
              </p>
            </div>

            <div className="flex items-center gap-4 bg-zinc-50 p-3.5 rounded-xl border border-zinc-200 text-xs">
              <div>
                <span className="text-zinc-500 block text-[11px]">Floor Plans</span>
                <strong className="text-zinc-900 font-semibold text-sm">{project.floor_plans.length}</strong>
              </div>
              <div className="h-6 w-px bg-zinc-200" />
              <div>
                <span className="text-zinc-500 block text-[11px]">Verified Rooms</span>
                <strong className="text-zinc-900 font-semibold text-sm">
                  {project.verified_nodes_count} / {project.spatial_nodes_count}
                </strong>
              </div>
              <div className="h-6 w-px bg-zinc-200" />
              <div>
                <span className="text-zinc-500 block text-[11px]">Routing</span>
                <strong className="text-zinc-900 font-semibold text-sm">Step-Free</strong>
              </div>
            </div>
          </div>

          {project.description && (
            <p className="mt-4 pt-4 border-t border-zinc-100 text-xs text-zinc-600 leading-relaxed">
              {project.description}
            </p>
          )}
        </Card>

        {/* Tab Navigation */}
        <div className="border-b border-zinc-200">
          <nav className="flex space-x-6">
            <button
              onClick={() => setActiveTab('floorplans')}
              className={`pb-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
                activeTab === 'floorplans'
                  ? 'border-zinc-900 text-zinc-900 font-semibold'
                  : 'border-transparent text-zinc-500 hover:text-zinc-700'
              }`}
            >
              <Layers className="w-4 h-4" />
              <span>Floor Plans</span>
              <span className="px-2 py-0.5 text-xs rounded-full bg-zinc-100 text-zinc-600">
                {project.floor_plans.length}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('review')}
              className={`pb-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
                activeTab === 'review'
                  ? 'border-zinc-900 text-zinc-900 font-semibold'
                  : 'border-transparent text-zinc-500 hover:text-zinc-700'
              }`}
            >
              <Layers className="w-4 h-4" />
              <span>Review &amp; Edit</span>
              <span className="px-2 py-0.5 text-xs rounded-full bg-zinc-100 text-zinc-600">
                {project.spatial_nodes.length}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('tactile')}
              className={`pb-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
                activeTab === 'tactile'
                  ? 'border-zinc-900 text-zinc-900 font-semibold'
                  : 'border-transparent text-zinc-500 hover:text-zinc-700'
              }`}
            >
              <Printer className="w-4 h-4" />
              <span>Tactile Maps</span>
            </button>

            <button
              onClick={() => setActiveTab('markers')}
              className={`pb-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
                activeTab === 'markers'
                  ? 'border-zinc-900 text-zinc-900 font-semibold'
                  : 'border-transparent text-zinc-500 hover:text-zinc-700'
              }`}
            >
              <QrCode className="w-4 h-4" />
              <span>Access Markers</span>
            </button>
          </nav>
        </div>

        {/* TAB 1: FLOOR PLANS */}
        {activeTab === 'floorplans' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-zinc-900">Architectural Floor Plans</h2>
                <p className="text-xs text-zinc-500">
                  Blueprints calibrated with real-world metric scale for accurate pathfinding.
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsStudioOpen(true)}
                icon={<Upload className="w-3.5 h-3.5" />}
              >
                Upload Blueprint
              </Button>
            </div>

            {project.floor_plans.length === 0 ? (
              <Card className="p-8 text-center bg-white border border-zinc-200 rounded-xl space-y-3">
                <Layers className="w-8 h-8 text-zinc-400 mx-auto" />
                <p className="text-xs text-zinc-600">No blueprints uploaded for this building yet.</p>
                <Button variant="accent" size="sm" onClick={() => setIsStudioOpen(true)}>
                  Upload Blueprint
                </Button>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {project.floor_plans.map((fp) => (
                  <Card key={fp.id} className="p-4 bg-white border border-zinc-200 rounded-xl flex flex-col justify-between hover:border-zinc-400 transition-colors">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-zinc-900 truncate max-w-[200px]">{fp.name}</span>
                        <span className="text-[11px] font-mono text-zinc-500">Level {fp.level_number || 1}</span>
                      </div>
                      <p className="text-[11px] text-zinc-400 font-mono truncate">
                        {fp.original_filename} &bull; {(fp.file_size / 1024).toFixed(0)} KB
                      </p>
                      <div className="text-[11px] text-zinc-600 space-y-0.5 pt-1">
                        <div>Dimensions: <strong className="font-mono text-zinc-800">{fp.width || '—'} &times; {fp.height || '—'} px</strong></div>
                        <div>Scale: <strong className="font-mono text-zinc-800">{fp.scale_meters_per_pixel ? `1px = ${fp.scale_meters_per_pixel.toFixed(4)}m` : 'Uncalibrated'}</strong></div>
                      </div>
                    </div>
                    <div className="pt-3 border-t border-zinc-100 flex items-center justify-end gap-2 mt-3 flex-wrap">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setIsStudioOpen(true)}
                        className="text-xs text-zinc-600"
                      >
                        Calibrate
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setTactileInitialPlanId(fp.id);
                          setIsTactileViewerOpen(true);
                        }}
                        icon={<Printer className="w-3.5 h-3.5 text-zinc-600" />}
                        className="text-xs"
                      >
                        Tactile Map
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          setEditorInitialPlanId(fp.id);
                          setIsSpatialEditorOpen(true);
                        }}
                        icon={<Layers className="w-3.5 h-3.5 text-zinc-700" />}
                        className="text-xs"
                      >
                        Edit Graph
                      </Button>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 2: REVIEW & EDIT */}
        {activeTab === 'review' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-zinc-900">
                  Spatial Nodes &amp; Waypoints
                </h2>
                <p className="text-xs text-zinc-500">
                  Rooms, corridors, and navigation points verified for step-free indoor routing.
                </p>
              </div>
              <Button
                variant="accent"
                size="sm"
                onClick={() => {
                  setEditorInitialPlanId(undefined);
                  setIsSpatialEditorOpen(true);
                }}
                icon={<Layers className="w-3.5 h-3.5 text-white" />}
              >
                Open Spatial Editor
              </Button>
            </div>

            <div className="bg-white rounded-xl border border-zinc-200 overflow-hidden shadow-xs">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-zinc-50 text-zinc-600 uppercase font-semibold text-[11px] border-b border-zinc-200">
                    <tr>
                      <th className="py-3 px-4">Room / Landmark</th>
                      <th className="py-3 px-4">Type</th>
                      <th className="py-3 px-4">Room No.</th>
                      <th className="py-3 px-4">Accessibility</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4">Notes</th>
                      <th className="py-3 px-4 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100 text-zinc-700">
                    {project.spatial_nodes.map((node) => (
                      <tr key={node.id} className="hover:bg-zinc-50 transition-colors">
                        <td className="py-3 px-4 font-semibold text-zinc-900">
                          {node.label}
                        </td>
                        <td className="py-3 px-4 font-mono uppercase text-zinc-500 text-[11px]">
                          {node.node_type}
                        </td>
                        <td className="py-3 px-4 font-mono text-zinc-600">
                          {node.room_number || '—'}
                        </td>
                        <td className="py-3 px-4">
                          {node.is_accessible ? (
                            <span className="inline-flex items-center gap-1 text-zinc-900 font-medium">
                              <CheckCircle2 className="w-3.5 h-3.5 text-zinc-900" /> Step-Free
                            </span>
                          ) : (
                            <span className="text-zinc-700 font-medium">Restricted</span>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          {node.is_user_verified ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-50 text-zinc-900 border border-emerald-200">
                              Verified
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-zinc-100 text-zinc-600 border border-zinc-200">
                              Unverified
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-zinc-500 max-w-xs truncate">
                          {node.notes || '—'}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setSelectedDestinationId(node.id);
                              setIsNavSessionOpen(true);
                            }}
                            icon={<Navigation className="w-3 h-3 text-zinc-600" />}
                            className="text-xs"
                          >
                            Guide
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: TACTILE MAPS */}
        {activeTab === 'tactile' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-zinc-900">Tactile Maps &amp; 3D Fabrication</h2>
                <p className="text-xs text-zinc-500">
                  Generate physical maps with raised wall ridges, pathway textures, and Grade 1 Braille labels.
                </p>
              </div>
              <Button
                variant="accent"
                size="sm"
                onClick={() => {
                  setTactileInitialPlanId(undefined);
                  setIsTactileViewerOpen(true);
                }}
                icon={<Printer className="w-3.5 h-3.5 text-white" />}
              >
                Open 3D Relief Studio
              </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card className="p-5 bg-white border border-zinc-200 rounded-xl space-y-3">
                <div className="w-8 h-8 rounded-lg bg-zinc-100 flex items-center justify-center text-zinc-700">
                  <Printer className="w-4 h-4" />
                </div>
                <h3 className="font-semibold text-zinc-900 text-sm">3D Printable Model (STL)</h3>
                <p className="text-xs text-zinc-500 leading-relaxed">
                  Watertight STL mesh ready for standard FDM/SLA 3D printers with raised tactile walls and Braille.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsTactileOpen(true)}
                  icon={<Download className="w-3.5 h-3.5 text-zinc-600" />}
                  className="w-full text-xs"
                >
                  Download STL
                </Button>
              </Card>

              <Card className="p-5 bg-white border border-zinc-200 rounded-xl space-y-3">
                <div className="w-8 h-8 rounded-lg bg-zinc-100 flex items-center justify-center text-zinc-700">
                  <FileText className="w-4 h-4" />
                </div>
                <h3 className="font-semibold text-zinc-900 text-sm">Printable Vector Map (SVG)</h3>
                <p className="text-xs text-zinc-500 leading-relaxed">
                  High-contrast black-and-white vector layout designed for microcapsule swell paper (PIAF fusers).
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsTactileOpen(true)}
                  icon={<Download className="w-3.5 h-3.5 text-zinc-600" />}
                  className="w-full text-xs"
                >
                  Download SVG
                </Button>
              </Card>

              <Card className="p-5 bg-white border border-zinc-200 rounded-xl space-y-3">
                <div className="w-8 h-8 rounded-lg bg-zinc-100 flex items-center justify-center text-zinc-700">
                  <Layers className="w-4 h-4" />
                </div>
                <h3 className="font-semibold text-zinc-900 text-sm">Interactive 3D Studio</h3>
                <p className="text-xs text-zinc-500 leading-relaxed">
                  Full 3D rotation, customizable layer extrusion, scale calibration, and fabrication presets.
                </p>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setIsTactileViewerOpen(true)}
                  icon={<Layers className="w-3.5 h-3.5 text-zinc-700" />}
                  className="w-full text-xs"
                >
                  Launch Studio
                </Button>
              </Card>
            </div>
          </div>
        )}

        {/* TAB 4: ACCESS MARKERS */}
        {activeTab === 'markers' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-zinc-900">Access Markers (NFC &amp; QR)</h2>
                <p className="text-xs text-zinc-500">
                  Physical checkpoints mounted at entrances, intersections, and elevator banks for positioning.
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsMarkerModalOpen(true)}
                icon={<QrCode className="w-3.5 h-3.5 text-zinc-600" />}
              >
                Manage Markers
              </Button>
            </div>

            <Card className="p-6 bg-white border border-zinc-200 rounded-xl text-center space-y-3">
              <QrCode className="w-8 h-8 text-zinc-400 mx-auto" />
              <h3 className="text-sm font-semibold text-zinc-800">Physical Placard Checkpoints</h3>
              <p className="text-xs text-zinc-500 max-w-md mx-auto">
                Visitors can tap their phone on an NFC tag or scan a QR code at entrance stations to verify their starting location or correct drift.
              </p>
              <Button
                variant="accent"
                size="sm"
                onClick={() => setIsMarkerModalOpen(true)}
              >
                Open Marker Manager &amp; Print Placards
              </Button>
            </Card>
          </div>
        )}

      </div>

      <RouteCalculatorModal
        isOpen={isRouteOpen}
        onClose={() => setIsRouteOpen(false)}
        project={project}
      />

      <TactilePreviewModal
        isOpen={isTactileOpen}
        onClose={() => setIsTactileOpen(false)}
        project={project}
      />

      <MarkerManagementModal
        isOpen={isMarkerModalOpen}
        onClose={() => setIsMarkerModalOpen(false)}
        project={project}
      />
    </div>
  );
};
