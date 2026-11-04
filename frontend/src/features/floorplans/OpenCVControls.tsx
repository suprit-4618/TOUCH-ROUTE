import React, { useState } from 'react';
import { Sliders, Sparkles, CheckCircle2, RefreshCw, Cpu, Layers, Info } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { FloorPlanSummary, PreprocessResponse } from '../../types';
import { api } from '../../services/api';
import { useAccessibility } from '../../context/AccessibilityContext';

interface OpenCVControlsProps {
  floorPlan: FloorPlanSummary;
  onPreprocessed: (result: PreprocessResponse) => void;
}

export const OpenCVControls: React.FC<OpenCVControlsProps> = ({
  floorPlan,
  onPreprocessed,
}) => {
  const { announce, playFeedbackTone } = useAccessibility();

  const [enhanceContrast, setEnhanceContrast] = useState<boolean>(true);
  const [denoise, setDenoise] = useState<boolean>(true);
  const [sharpenEdges, setSharpenEdges] = useState<boolean>(true);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [lastResult, setLastResult] = useState<PreprocessResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handlePreprocess = async () => {
    setIsProcessing(true);
    setError(null);
    try {
      const res = await api.preprocessFloorPlan(floorPlan.id, {
        enhance_contrast: enhanceContrast,
        denoise,
        sharpen_edges: sharpenEdges,
      });
      setLastResult(res);
      playFeedbackTone('success');
      announce(`OpenCV image preprocessing completed. Contrast metric: ${res.contrast_metric}`);
      onPreprocessed(res);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Preprocessing failed.';
      setError(msg);
      announce(`OpenCV error: ${msg}`);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="bg-white rounded-xl border border-zinc-200 p-6 space-y-5">
      <div className="flex items-center justify-between pb-3 border-b border-zinc-200 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-zinc-100 flex items-center justify-center text-zinc-800 border border-zinc-200">
            <Cpu className="w-4 h-4 text-zinc-800" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-zinc-900 tracking-tight">
              Floor Plan Image Preprocessing
            </h3>
            <p className="text-xs text-zinc-500">
              Image cleanup to enhance wall detection and room label recognition.
            </p>
          </div>
        </div>

        <Badge
          variant={
            floorPlan.analysis_status === 'processed' || floorPlan.processed_file_path
              ? 'success'
              : 'neutral'
          }
        >
          {floorPlan.analysis_status === 'processed' || floorPlan.processed_file_path
            ? 'Processed'
            : 'Raw Upload'}
        </Badge>
      </div>

      {error && (
        <div
          role="alert"
          className="p-3 bg-red-50 border border-red-200 text-red-900 text-xs rounded-lg font-medium"
        >
          {error}
        </div>
      )}

      {/* Preprocessing Toggles */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <label className="p-3 rounded-lg border border-zinc-200 bg-zinc-50/70 hover:bg-zinc-50 flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={enhanceContrast}
            onChange={(e) => setEnhanceContrast(e.target.checked)}
            className="w-4 h-4 rounded text-zinc-800 border-zinc-300 focus:ring-zinc-900 mt-0.5"
          />
          <div>
            <span className="block text-xs font-semibold text-zinc-900">
              CLAHE Contrast
            </span>
            <span className="text-[11px] text-zinc-500 leading-tight block mt-0.5">
              Adaptive histogram equalization for faded blueprint ink.
            </span>
          </div>
        </label>

        <label className="p-3 rounded-lg border border-zinc-200 bg-zinc-50/70 hover:bg-zinc-50 flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={denoise}
            onChange={(e) => setDenoise(e.target.checked)}
            className="w-4 h-4 rounded text-zinc-800 border-zinc-300 focus:ring-zinc-900 mt-0.5"
          />
          <div>
            <span className="block text-xs font-semibold text-zinc-900">
              Edge-Preserving Denoise
            </span>
            <span className="text-[11px] text-zinc-500 leading-tight block mt-0.5">
              Bilateral filter removes scan grain while preserving walls.
            </span>
          </div>
        </label>

        <label className="p-3 rounded-lg border border-zinc-200 bg-zinc-50/70 hover:bg-zinc-50 flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={sharpenEdges}
            onChange={(e) => setSharpenEdges(e.target.checked)}
            className="w-4 h-4 rounded text-zinc-800 border-zinc-300 focus:ring-zinc-900 mt-0.5"
          />
          <div>
            <span className="block text-xs font-semibold text-zinc-900">
              Wall Line Sharpening
            </span>
            <span className="text-[11px] text-zinc-500 leading-tight block mt-0.5">
              Unsharp masking sharpens structural partition boundaries.
            </span>
          </div>
        </label>
      </div>

      {/* Trigger Button & Execution Summary */}
      <div className="flex items-center justify-between flex-wrap gap-3 pt-2">
        <div className="text-xs text-zinc-500 flex items-center gap-1.5">
          <Info className="w-3.5 h-3.5 text-zinc-400" />
          <span>Produces a web-optimized normalized PNG for spatial graph extraction.</span>
        </div>

        <Button
          variant="primary"
          size="md"
          onClick={handlePreprocess}
          disabled={isProcessing}
          icon={
            <RefreshCw
              className={`w-4 h-4 text-zinc-400 ${isProcessing ? 'animate-spin' : ''}`}
            />
          }
        >
          {isProcessing ? 'Running OpenCV Pipeline...' : 'Run Image Enhancement'}
        </Button>
      </div>

      {/* Applied Steps Report */}
      {lastResult && (
        <div className="mt-4 p-4 rounded-xl bg-zinc-50 border border-zinc-200 space-y-2 text-xs">
          <div className="flex items-center justify-between text-zinc-700 font-semibold">
            <span className="flex items-center gap-1.5 text-emerald-800">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              OpenCV Enhancement Succeeded
            </span>
            <span className="font-mono text-zinc-600">
              Contrast Ratio: {lastResult.contrast_metric}
            </span>
          </div>
          <ul className="list-disc list-inside space-y-1 text-zinc-600 pl-1">
            {lastResult.preprocessing_steps.map((s, idx) => (
              <li key={idx}>{s}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

