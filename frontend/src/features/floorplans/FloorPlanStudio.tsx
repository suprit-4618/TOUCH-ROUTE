import React, { useEffect, useState } from 'react';
import {
  ArrowLeft,
  Upload,
  Layers,
  Sparkles,
  Ruler,
  CheckCircle2,
  Trash2,
  AlertCircle,
  PlusCircle,
  Eye,
  FileText,
} from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { FloorPlanUploader } from './FloorPlanUploader';
import { FloorPlanCanvas } from './FloorPlanCanvas';
import { OpenCVControls } from './OpenCVControls';
import { SpatialMapEditor } from '../spatial-editor/SpatialMapEditor';
import { api } from '../../services/api';
import {
  FloorPlanSummary,
  FloorPlanUploadResponse,
  PreprocessResponse,
  ProjectDetail,
  ScaleCalibrationResponse,
} from '../../types';
import { useAccessibility } from '../../context/AccessibilityContext';

interface FloorPlanStudioProps {
  projectId: string;
  onBack: () => void;
}

export const FloorPlanStudio: React.FC<FloorPlanStudioProps> = ({
  projectId,
  onBack,
}) => {
  const { announce, playFeedbackTone } = useAccessibility();
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [activePlanId, setActivePlanId] = useState<string | null>(null);
  const [showUploader, setShowUploader] = useState<boolean>(false);
  const [editorMode, setEditorMode] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const loadProject = async () => {
    setLoading(true);
    try {
      const data = await api.getProjectDetail(projectId);
      setProject(data);
      if (data.floor_plans && data.floor_plans.length > 0) {
        if (!activePlanId || !data.floor_plans.some((f) => f.id === activePlanId)) {
          setActivePlanId(data.floor_plans[0].id);
        }
      } else {
        setShowUploader(true);
      }
    } catch (err) {
      console.error('Failed to load project:', err);
      setError('Unable to load building floor plans.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProject();
  }, [projectId]);

  const activeFloorPlan = project?.floor_plans.find((fp) => fp.id === activePlanId) || null;

  const handleUploadSuccess = (newPlan: FloorPlanUploadResponse) => {
    setShowUploader(false);
    loadProject();
  };

  const handlePreprocessed = (res: PreprocessResponse) => {
    if (project) {
      setProject({
        ...project,
        floor_plans: project.floor_plans.map((fp) =>
          fp.id === res.floorplan_id
            ? {
                ...fp,
                analysis_status: 'processed',
                processed_file_path: res.processed_image_url,
                width: res.processed_dimensions.width,
                height: res.processed_dimensions.height,
              }
            : fp
        ),
      });
    }
  };

  const handleScaleCalibrated = (res: ScaleCalibrationResponse) => {
    if (project) {
      setProject({
        ...project,
        floor_plans: project.floor_plans.map((fp) =>
          fp.id === res.floorplan_id
            ? {
                ...fp,
                is_scale_calibrated: true,
                scale_meters_per_pixel: res.scale_meters_per_pixel,
              }
            : fp
        ),
      });
    }
  };

  const handleDeleteFloorPlan = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this floor plan blueprint?')) return;
    try {
      await api.deleteFloorPlan(id);
      playFeedbackTone('click');
      announce('Floor plan blueprint removed.');
      loadProject();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Deletion failed.';
      setError(msg);
    }
  };

  if (loading) {
    return (
      <div className="py-24 text-center text-zinc-500 space-y-3">
        <div className="w-8 h-8 rounded-full border-2 border-zinc-800 border-t-transparent animate-spin mx-auto"></div>
        <p className="text-sm">Loading floor plan processing workspace...</p>
      </div>
    );
  }

  if (editorMode) {
    return (
      <SpatialMapEditor
        projectId={projectId}
        initialFloorPlanId={activePlanId || undefined}
        onBack={() => {
          setEditorMode(false);
          loadProject();
        }}
      />
    );
  }

  return (
    <div className="py-8 bg-zinc-50 min-h-screen">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
        
        {/* Top Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-zinc-200">
          <div>
            <Button
              variant="ghost"
              size="sm"
              onClick={onBack}
              icon={<ArrowLeft className="w-4 h-4 text-zinc-700" />}
              className="-ml-2 mb-2 text-zinc-600"
            >
              Back to Project Overview
            </Button>
            <h1 className="text-2xl font-bold text-zinc-900 tracking-tight flex items-center gap-2">
              Floor Plan Studio &amp; Vision Processing
            </h1>
            <p className="text-xs text-zinc-600 mt-0.5">
              Building: <strong className="text-zinc-900">{project?.building_name}</strong> &bull; {project?.name}
            </p>
          </div>

          <div className="flex items-center gap-3">
            {activeFloorPlan && (
              <Button
                variant="primary"
                size="md"
                onClick={() => setEditorMode(true)}
                icon={<Sparkles className="w-4 h-4 text-zinc-400" />}
              >
                Open Spatial Map Editor
              </Button>
            )}
            {!showUploader && (
              <Button
                variant="outline"
                size="md"
                onClick={() => setShowUploader(true)}
                icon={<Upload className="w-4 h-4 text-zinc-700" />}
              >
                Upload Blueprint
              </Button>
            )}
          </div>
        </div>

        {error && (
          <div
            role="alert"
            className="p-3.5 bg-red-50 border border-red-200 text-red-900 text-xs rounded-lg font-medium flex items-center gap-2"
          >
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Uploader View if Toggled or No Plans Exist */}
        {showUploader && (
          <FloorPlanUploader
            projectId={projectId}
            onUploadSuccess={handleUploadSuccess}
            onCancel={project && project.floor_plans.length > 0 ? () => setShowUploader(false) : undefined}
          />
        )}

        {/* Floor Plan Selection Tabs if Multiple */}
        {project && project.floor_plans.length > 1 && (
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            <span className="text-xs font-semibold text-zinc-700 mr-2 shrink-0">
              Select Blueprint:
            </span>
            {project.floor_plans.map((fp) => (
              <button
                key={fp.id}
                onClick={() => setActivePlanId(fp.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors shrink-0 ${
                  activePlanId === fp.id
                    ? 'bg-zinc-900 text-zinc-50 border-zinc-900'
                    : 'bg-white text-zinc-700 border-zinc-200 hover:bg-zinc-100'
                }`}
              >
                {fp.name}
              </button>
            ))}
          </div>
        )}

        {/* Active Floor Plan Canvas & Controls */}
        {activeFloorPlan ? (
          <div className="space-y-6">
            <FloorPlanCanvas
              floorPlan={activeFloorPlan}
              onScaleCalibrated={handleScaleCalibrated}
            />

            <OpenCVControls
              floorPlan={activeFloorPlan}
              onPreprocessed={handlePreprocessed}
            />

            <div className="flex justify-end pt-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleDeleteFloorPlan(activeFloorPlan.id)}
                icon={<Trash2 className="w-4 h-4 text-red-600" />}
                className="text-red-700 hover:bg-red-50 text-xs"
              >
                Delete Floor Plan
              </Button>
            </div>
          </div>
        ) : (
          !showUploader && (
            <div className="py-16 text-center bg-white rounded-xl border border-dashed border-zinc-300 p-8 space-y-3">
              <Upload className="w-10 h-10 text-zinc-400 mx-auto" />
              <h3 className="text-base font-semibold text-zinc-800">
                No floor plans uploaded for this building yet
              </h3>
              <p className="text-xs text-zinc-500 max-w-sm mx-auto">
                Upload a blueprint in PNG, JPG, or PDF format to begin spatial understanding.
              </p>
              <Button
                variant="accent"
                size="md"
                onClick={() => setShowUploader(true)}
                icon={<Upload className="w-4 h-4 text-white" />}
              >
                Upload First Blueprint
              </Button>
            </div>
          )
        )}

      </div>
    </div>
  );
};

