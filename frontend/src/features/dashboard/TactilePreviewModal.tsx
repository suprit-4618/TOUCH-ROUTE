import React, { useEffect, useState } from 'react';
import { Printer, Download, Eye, CheckCircle2, Box, Layers, AlertCircle, Loader2 } from 'lucide-react';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { api } from '../../services/api';
import { Project, TactileJobResponse } from '../../types';
import { useAccessibility } from '../../context/AccessibilityContext';

interface TactilePreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  project: Project | null;
}

export const TactilePreviewModal: React.FC<TactilePreviewModalProps> = ({
  isOpen,
  onClose,
  project,
}) => {
  const { announce, playFeedbackTone } = useAccessibility();
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [job, setJob] = useState<TactileJobResponse | null>(null);
  const [svgContent, setSvgContent] = useState<string | null>(null);
  const [format, setFormat] = useState<string>('stl');
  const [brailleEnabled, setBrailleEnabled] = useState<boolean>(true);

  useEffect(() => {
    if (isOpen && project) {
      setLoading(true);
      setError(null);
      setSvgContent(null);
      api.generateTactileMap({
        project_id: project.id,
        output_format: format,
        braille_enabled: brailleEnabled,
      })
        .then(async (res) => {
          setJob(res);
          announce(`Tactile relief model generated for ${project.name}`);
          try {
            const svg = await api.getTactilePreviewSvg(res.id);
            setSvgContent(svg);
          } catch (e) {
            console.warn('Could not load preview SVG:', e);
          }
        })
        .catch((err) => {
          console.error('Tactile job error:', err);
          setError('Failed to compute tactile relief geometry.');
        })
        .finally(() => setLoading(false));
    }
  }, [isOpen, project, format, brailleEnabled]);

  const handleDownload = () => {
    playFeedbackTone('success');
    announce(`Downloading tactile printable package in ${format.toUpperCase()} format.`);
    if (job && job.download_urls && job.download_urls[format as 'stl' | 'svg' | 'pdf']) {
      const a = document.createElement('a');
      a.href = job.download_urls[format as 'stl' | 'svg' | 'pdf'];
      a.download = `${project?.name.replace(/\s+/g, '_') || 'tactile_map'}.${format}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      return;
    }
    if (job) {
      const downloadUrl = api.getTactileDownloadUrl(job.id, format as 'stl' | 'svg' | 'pdf');
      window.open(downloadUrl, '_blank');
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Tactile Map 3D Relief: ${project?.name || ''}`}
      description="Pre-fabrication relief model designed in accordance with ISO 21542 and ADA tactile signage guidelines."
      maxWidth="lg"
    >
      <div className="space-y-6 text-zinc-800 text-sm">
        {loading ? (
          <div className="py-12 flex flex-col items-center justify-center text-zinc-500 gap-2">
            <Loader2 className="w-6 h-6 animate-spin text-zinc-700" />
            <span>Calculating tactile relief extrusion...</span>
          </div>
        ) : error ? (
          <div
            role="alert"
            className="p-3 bg-red-50 border border-red-200 text-red-800 text-xs rounded-lg font-medium flex items-center gap-2"
          >
            <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
            <span>{error}</span>
          </div>
        ) : (
          <>
            {/* Visual 2D Tactile High-Contrast Preview */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-zinc-600">
                <span className="font-semibold uppercase tracking-wider text-zinc-700">
                  2D Tactile Elevation Preview
                </span>
                <span className="font-mono text-zinc-500">
                  Build Plate: 195mm &times; 195mm
                </span>
              </div>

              <div className="p-4 bg-zinc-900 rounded-xl border border-zinc-800 flex items-center justify-center min-h-[260px] overflow-hidden">
                {svgContent ? (
                  <div
                    className="w-full max-w-md max-h-[280px] flex items-center justify-center bg-white rounded-lg p-2 overflow-hidden shadow-inner"
                    dangerouslySetInnerHTML={{ __html: svgContent }}
                  />
                ) : project ? (
                  <div className="w-full max-w-md aspect-[3/2] rounded border-2 border-zinc-700 bg-zinc-950 p-4 relative flex flex-col justify-between">
                    <div className="flex items-center justify-between border-b border-zinc-800 pb-2 text-[11px] text-zinc-300">
                      <span>Tactile High-Relief Layout</span>
                      <span className="font-mono">North &uarr;</span>
                    </div>

                    {/* Nodes visual map */}
                    <div className="grid grid-cols-3 gap-3 my-auto py-3">
                      <div className="p-2 rounded bg-zinc-900/40 border-2 border-zinc-500 text-center text-zinc-200">
                        <span className="text-[10px] text-zinc-300 block font-mono">ENTRANCE</span>
                        <span className="text-xs font-bold">Main Portico</span>
                      </div>
                      <div className="p-2 rounded bg-zinc-800 border-2 border-dashed border-zinc-500 text-center text-zinc-300">
                        <span className="text-[10px] text-zinc-400 block font-mono">CORRIDOR</span>
                        <span className="text-xs">Recessed Path</span>
                      </div>
                      <div className="p-2 rounded bg-sky-950/40 border-2 border-sky-400 text-center text-zinc-200">
                        <span className="text-[10px] text-sky-400 block font-mono">TARGET</span>
                        <span className="text-xs font-bold">Service Suite</span>
                      </div>
                    </div>

                    <div className="pt-2 border-t border-zinc-800 flex justify-between text-[10px] text-zinc-400">
                      <span>Wall Relief: +4.0mm</span>
                      <span>Path Channel: +1.5mm</span>
                      <span>Braille Dots: +0.6mm</span>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>

            {/* Print Parameters & Specs */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div className="p-3 bg-zinc-50 rounded-lg border border-zinc-200">
                <span className="text-zinc-500 block text-[10px] uppercase font-mono">Thickness</span>
                <strong className="text-zinc-900 text-sm">2.0 mm Base</strong>
              </div>
              <div className="p-3 bg-zinc-50 rounded-lg border border-zinc-200">
                <span className="text-zinc-500 block text-[10px] uppercase font-mono">Relief Walls</span>
                <strong className="text-zinc-900 text-sm">4.0 mm Extrusion</strong>
              </div>
              <div className="p-3 bg-zinc-50 rounded-lg border border-zinc-200">
                <span className="text-zinc-500 block text-[10px] uppercase font-mono">Print Time</span>
                <strong className="text-zinc-900 text-sm">{job ? `~${job.estimated_print_time_minutes} min` : '~35 min'}</strong>
              </div>
              <div className="p-3 bg-zinc-50 rounded-lg border border-zinc-200">
                <span className="text-zinc-500 block text-[10px] uppercase font-mono">Guideline Alignment</span>
                <strong className="text-zinc-900 text-sm">ADA 703 &bull; ISO 21542</strong>
              </div>
            </div>

            {/* Configuration */}
            <div className="flex items-center justify-between flex-wrap gap-4 pt-3 border-t border-zinc-200">
              <div className="flex items-center gap-4">
                <div>
                  <label htmlFor="tactile-fmt" className="block text-[11px] font-semibold text-zinc-700 mb-1">
                    Export Format
                  </label>
                  <select
                    id="tactile-fmt"
                    value={format}
                    onChange={(e) => setFormat(e.target.value)}
                    className="px-2.5 py-1.5 bg-white border border-zinc-300 rounded text-xs text-zinc-900 focus:outline-none"
                  >
                    <option value="stl">STL (3D Mesh Model)</option>
                    <option value="svg">SVG (Swell Paper Profile)</option>
                  </select>
                </div>

                <div className="pt-4">
                  <label className="flex items-center gap-2 text-xs text-zinc-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={brailleEnabled}
                      onChange={(e) => setBrailleEnabled(e.target.checked)}
                      className="w-4 h-4 rounded text-zinc-700 border-zinc-300 focus:ring-zinc-900"
                    />
                    <span>Include Marburg Braille Legend</span>
                  </label>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button variant="outline" size="md" onClick={onClose}>
                  Close
                </Button>
                <Button
                  variant="primary"
                  size="md"
                  onClick={handleDownload}
                  icon={<Download className="w-4 h-4 text-zinc-300" />}
                >
                  Download {format.toUpperCase()} Package
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
};

