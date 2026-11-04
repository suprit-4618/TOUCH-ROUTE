import React, { useEffect, useRef, useState } from 'react';
import {
  ZoomIn,
  ZoomOut,
  Maximize2,
  RotateCcw,
  Ruler,
  Check,
  X,
  Layers,
  Sparkles,
  HelpCircle,
  AlertCircle,
  Eye,
} from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { FloorPlanSummary, ScaleCalibrationResponse } from '../../types';
import { api } from '../../services/api';
import { useAccessibility } from '../../context/AccessibilityContext';

interface FloorPlanCanvasProps {
  floorPlan: FloorPlanSummary;
  onScaleCalibrated?: (result: ScaleCalibrationResponse) => void;
}

export const FloorPlanCanvas: React.FC<FloorPlanCanvasProps> = ({
  floorPlan,
  onScaleCalibrated,
}) => {
  const { announce, playFeedbackTone } = useAccessibility();
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // View state
  const [zoom, setZoom] = useState<number>(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState<boolean>(false);
  const [startPan, setStartPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [viewMode, setViewMode] = useState<'raw' | 'processed'>('processed');
  const [cursorPos, setCursorPos] = useState<{ x: number; y: number } | null>(null);

  // Image references
  const [imageLoaded, setImageLoaded] = useState<boolean>(false);
  const imageObjRef = useRef<HTMLImageElement | null>(null);

  // Scale calibration tool state
  const [isCalibrating, setIsCalibrating] = useState<boolean>(false);
  const [calibPoint1, setCalibPoint1] = useState<{ x: number; y: number } | null>(null);
  const [calibPoint2, setCalibPoint2] = useState<{ x: number; y: number } | null>(null);
  const [knownDistance, setKnownDistance] = useState<string>('5.0');
  const [savingScale, setSavingScale] = useState<boolean>(false);
  const [scaleMsg, setScaleMsg] = useState<string | null>(null);

  // Determine active image URL
  const activeImageUrl =
    viewMode === 'processed' && floorPlan.processed_file_path
      ? api.getFloorPlanProcessedUrl(floorPlan.id)
      : api.getFloorPlanRawUrl(floorPlan.id);

  // Load image whenever activeImageUrl changes
  useEffect(() => {
    setImageLoaded(false);
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = activeImageUrl;
    img.onload = () => {
      imageObjRef.current = img;
      setImageLoaded(true);
      // Center and fit initial view
      if (containerRef.current) {
        const cw = containerRef.current.clientWidth;
        const ch = containerRef.current.clientHeight;
        const scaleX = (cw * 0.9) / img.width;
        const scaleY = (ch * 0.9) / img.height;
        const initialZoom = Math.min(scaleX, scaleY, 1.0);
        setZoom(initialZoom);
        setPan({
          x: (cw - img.width * initialZoom) / 2,
          y: (ch - img.height * initialZoom) / 2,
        });
      }
    };
    img.onerror = () => {
      // If processed image not yet generated, fall back to raw
      if (viewMode === 'processed') {
        setViewMode('raw');
      }
    };
  }, [floorPlan.id, viewMode, floorPlan.processed_file_path]);

  // Render Canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !imageLoaded || !imageObjRef.current) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Resize canvas to match container client dimensions
    if (containerRef.current) {
      canvas.width = containerRef.current.clientWidth;
      canvas.height = containerRef.current.clientHeight;
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw background blueprint grid
    ctx.fillStyle = '#1c1917';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    ctx.translate(pan.x, pan.y);
    ctx.scale(zoom, zoom);

    const img = imageObjRef.current;
    ctx.drawImage(img, 0, 0);

    // Draw Calibration Line & Points if measuring
    if (calibPoint1) {
      ctx.beginPath();
      ctx.arc(calibPoint1.x, calibPoint1.y, 6 / zoom, 0, Math.PI * 2);
      ctx.fillStyle = '#f59e0b';
      ctx.fill();
      ctx.lineWidth = 2 / zoom;
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();

      if (calibPoint2) {
        ctx.beginPath();
        ctx.arc(calibPoint2.x, calibPoint2.y, 6 / zoom, 0, Math.PI * 2);
        ctx.fillStyle = '#f59e0b';
        ctx.fill();
        ctx.stroke();

        // Measurement line
        ctx.beginPath();
        ctx.moveTo(calibPoint1.x, calibPoint1.y);
        ctx.lineTo(calibPoint2.x, calibPoint2.y);
        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth = 3 / zoom;
        ctx.setLineDash([6 / zoom, 4 / zoom]);
        ctx.stroke();
        ctx.setLineDash([]);

        // Distance text
        const midX = (calibPoint1.x + calibPoint2.x) / 2;
        const midY = (calibPoint1.y + calibPoint2.y) / 2;
        const dx = calibPoint2.x - calibPoint1.x;
        const dy = calibPoint2.y - calibPoint1.y;
        const pxDist = Math.sqrt(dx * dx + dy * dy);

        ctx.font = `bold ${Math.max(14 / zoom, 12)}px monospace`;
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.fillText(`${pxDist.toFixed(1)} px (${knownDistance}m)`, midX, midY - 10 / zoom);
      }
    }

    ctx.restore();
  }, [zoom, pan, imageLoaded, calibPoint1, calibPoint2, knownDistance]);

  // Pan & Zoom Event Handlers
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (isCalibrating) {
      // Pick calibration points in image coordinates
      if (!imageObjRef.current) return;
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      const clientX = e.clientX - rect.left;
      const clientY = e.clientY - rect.top;

      const imgX = (clientX - pan.x) / zoom;
      const imgY = (clientY - pan.y) / zoom;

      if (!calibPoint1 || (calibPoint1 && calibPoint2)) {
        setCalibPoint1({ x: imgX, y: imgY });
        setCalibPoint2(null);
        announce(`Point 1 selected at X: ${Math.round(imgX)}, Y: ${Math.round(imgY)}. Click point 2.`);
      } else {
        setCalibPoint2({ x: imgX, y: imgY });
        announce(`Point 2 selected at X: ${Math.round(imgX)}, Y: ${Math.round(imgY)}. Distance ruler active.`);
      }
      return;
    }

    setIsPanning(true);
    setStartPan({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (rect) {
      const clientX = e.clientX - rect.left;
      const clientY = e.clientY - rect.top;
      const imgX = Math.round((clientX - pan.x) / zoom);
      const imgY = Math.round((clientY - pan.y) / zoom);
      setCursorPos({ x: imgX, y: imgY });
    }

    if (!isPanning || isCalibrating) return;
    setPan({
      x: e.clientX - startPan.x,
      y: e.clientY - startPan.y,
    });
  };

  const handleMouseUp = () => {
    setIsPanning(false);
  };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const zoomFactor = e.deltaY < 0 ? 1.15 : 0.85;
    const newZoom = Math.min(Math.max(zoom * zoomFactor, 0.1), 10.0);

    const rect = canvasRef.current?.getBoundingClientRect();
    if (rect) {
      const clientX = e.clientX - rect.left;
      const clientY = e.clientY - rect.top;
      setPan({
        x: clientX - (clientX - pan.x) * (newZoom / zoom),
        y: clientY - (clientY - pan.y) * (newZoom / zoom),
      });
    }
    setZoom(newZoom);
  };

  const handleZoomIn = () => {
    setZoom((prev) => Math.min(prev * 1.25, 10));
  };

  const handleZoomOut = () => {
    setZoom((prev) => Math.max(prev * 0.8, 0.1));
  };

  const handleResetZoom = () => {
    if (!imageObjRef.current || !containerRef.current) return;
    const cw = containerRef.current.clientWidth;
    const ch = containerRef.current.clientHeight;
    const img = imageObjRef.current;
    const scaleX = (cw * 0.9) / img.width;
    const scaleY = (ch * 0.9) / img.height;
    const initialZoom = Math.min(scaleX, scaleY, 1.0);
    setZoom(initialZoom);
    setPan({
      x: (cw - img.width * initialZoom) / 2,
      y: (ch - img.height * initialZoom) / 2,
    });
    announce('Canvas zoom and pan reset to fit view.');
  };

  // Keyboard pan / zoom support
  const handleKeyDown = (e: React.KeyboardEvent) => {
    const STEP = 30;
    if (e.key === 'ArrowUp') setPan((p) => ({ ...p, y: p.y + STEP }));
    if (e.key === 'ArrowDown') setPan((p) => ({ ...p, y: p.y - STEP }));
    if (e.key === 'ArrowLeft') setPan((p) => ({ ...p, x: p.x + STEP }));
    if (e.key === 'ArrowRight') setPan((p) => ({ ...p, x: p.x - STEP }));
    if (e.key === '+' || e.key === '=') handleZoomIn();
    if (e.key === '-' || e.key === '_') handleZoomOut();
    if (e.key === '0') handleResetZoom();
  };

  const handleSaveScale = async () => {
    if (!calibPoint1 || !calibPoint2) return;
    const meters = parseFloat(knownDistance);
    if (isNaN(meters) || meters <= 0) {
      setScaleMsg('Please enter a valid positive distance in meters.');
      return;
    }

    setSavingScale(true);
    setScaleMsg(null);
    try {
      const res = await api.calibrateScale(floorPlan.id, {
        point1: calibPoint1,
        point2: calibPoint2,
        known_distance_meters: meters,
      });
      playFeedbackTone('success');
      setScaleMsg(res.message);
      announce(res.message);
      setIsCalibrating(false);
      setCalibPoint1(null);
      setCalibPoint2(null);
      if (onScaleCalibrated) onScaleCalibrated(res);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Calibration failed.';
      setScaleMsg(`Error: ${msg}`);
      announce(`Calibration error: ${msg}`);
    } finally {
      setSavingScale(false);
    }
  };

  return (
    <div className="bg-white rounded-xl border border-zinc-200 overflow-hidden shadow-sm flex flex-col">
      {/* Canvas Top Bar */}
      <div className="px-5 py-3.5 bg-zinc-100 border-b border-zinc-200 flex flex-wrap items-center justify-between gap-3">
        {/* Left: View toggle & metadata */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center p-1 bg-zinc-200/80 rounded-lg text-xs font-medium">
            <button
              onClick={() => setViewMode('processed')}
              className={`px-2.5 py-1 rounded-md transition-colors ${
                viewMode === 'processed'
                  ? 'bg-zinc-900 text-zinc-50 font-semibold'
                  : 'text-zinc-700 hover:text-zinc-900'
              }`}
            >
              OpenCV Enhanced
            </button>
            <button
              onClick={() => setViewMode('raw')}
              className={`px-2.5 py-1 rounded-md transition-colors ${
                viewMode === 'raw'
                  ? 'bg-zinc-900 text-zinc-50 font-semibold'
                  : 'text-zinc-700 hover:text-zinc-900'
              }`}
            >
              Original Blueprint
            </button>
          </div>

          <div className="flex items-center gap-2 text-xs font-mono text-zinc-600">
            <span>
              {floorPlan.width || 0} &times; {floorPlan.height || 0} px
            </span>
            <span>&bull;</span>
            <span>
              Scale:{' '}
              <strong className="text-zinc-900">
                1px = {(floorPlan.scale_meters_per_pixel || 0.05).toFixed(4)}m
              </strong>
            </span>
            {floorPlan.is_scale_calibrated && (
              <Badge variant="success">Calibrated</Badge>
            )}
          </div>
        </div>

        {/* Right: Scale calibration tool & Zoom controls */}
        <div className="flex items-center gap-2">
          <Button
            variant={isCalibrating ? 'accent' : 'outline'}
            size="sm"
            onClick={() => {
              setIsCalibrating(!isCalibrating);
              setCalibPoint1(null);
              setCalibPoint2(null);
              setScaleMsg(null);
              announce(
                isCalibrating
                  ? 'Exited scale calibration mode.'
                  : 'Scale calibration active. Click two points on the floor plan.'
              );
            }}
            icon={<Ruler className="w-3.5 h-3.5" />}
          >
            {isCalibrating ? 'Cancel Calibration' : 'Calibrate Scale'}
          </Button>

          <div className="h-5 w-px bg-zinc-300 mx-1"></div>

          <button
            onClick={handleZoomIn}
            aria-label="Zoom in"
            title="Zoom In (+)"
            className="p-1.5 rounded-lg text-zinc-700 hover:bg-zinc-200 transition-colors"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          <button
            onClick={handleZoomOut}
            aria-label="Zoom out"
            title="Zoom Out (-)"
            className="p-1.5 rounded-lg text-zinc-700 hover:bg-zinc-200 transition-colors"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <button
            onClick={handleResetZoom}
            aria-label="Reset zoom and fit view"
            title="Fit to Canvas (0)"
            className="p-1.5 rounded-lg text-zinc-700 hover:bg-zinc-200 transition-colors"
          >
            <Maximize2 className="w-4 h-4" />
          </button>

          <span className="text-xs font-mono text-zinc-500 min-w-[45px] text-right">
            {(zoom * 100).toFixed(0)}%
          </span>
        </div>
      </div>

      {/* Calibration Banner if Active */}
      {isCalibrating && (
        <div className="px-5 py-3 bg-zinc-50 border-b border-zinc-200 flex flex-wrap items-center justify-between gap-3 text-xs text-zinc-950">
          <div className="flex items-center gap-2">
            <Ruler className="w-4 h-4 text-zinc-800 shrink-0" />
            <span>
              {!calibPoint1
                ? 'Step 1: Click the first point of a known measurement (e.g. wall or door opening).'
                : !calibPoint2
                ? 'Step 2: Click the second reference point across the distance.'
                : 'Measurement points defined! Enter real-world meters below.'}
            </span>
          </div>

          {calibPoint1 && calibPoint2 && (
            <div className="flex items-center gap-2">
              <label htmlFor="known-meters" className="font-semibold text-zinc-900">
                Known Distance:
              </label>
              <input
                id="known-meters"
                type="number"
                step="0.1"
                min="0.1"
                value={knownDistance}
                onChange={(e) => setKnownDistance(e.target.value)}
                className="w-20 px-2 py-1 bg-white border border-zinc-300 rounded text-xs font-mono text-zinc-900"
              />
              <span className="font-medium">m</span>
              <Button
                variant="accent"
                size="sm"
                onClick={handleSaveScale}
                disabled={savingScale}
              >
                {savingScale ? 'Saving...' : 'Apply Scale'}
              </Button>
            </div>
          )}
        </div>
      )}

      {scaleMsg && (
        <div className="px-5 py-2 bg-emerald-50 border-b border-emerald-200 text-xs text-emerald-800 font-medium">
          {scaleMsg}
        </div>
      )}

      {/* Interactive Canvas Viewport */}
      <div
        ref={containerRef}
        tabIndex={0}
        onKeyDown={handleKeyDown}
        className="relative w-full h-[520px] bg-zinc-950 overflow-hidden cursor-grab active:cursor-grabbing focus:outline-none focus:ring-2 focus:ring-zinc-900"
      >
        <canvas
          ref={canvasRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onWheel={handleWheel}
          className="w-full h-full block"
        />

        {/* Live coordinate overlay */}
        <div className="absolute bottom-3 left-3 bg-zinc-900/80 backdrop-blur-sm text-zinc-300 text-[11px] font-mono px-2.5 py-1 rounded border border-zinc-700 select-none pointer-events-none">
          {cursorPos ? `X: ${cursorPos.x}px  Y: ${cursorPos.y}px` : 'Hover to view coordinates'}
        </div>

        {/* Pan instruction overlay */}
        <div className="absolute bottom-3 right-3 bg-zinc-900/80 backdrop-blur-sm text-zinc-400 text-[10px] px-2.5 py-1 rounded border border-zinc-700 select-none pointer-events-none hidden sm:block">
          Click &amp; drag to pan &bull; Scroll to zoom &bull; Arrow keys navigate
        </div>
      </div>
    </div>
  );
};

