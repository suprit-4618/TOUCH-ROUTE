import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Printer,
  Download,
  Box,
  Eye,
  Rotate3d,
  Layers,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  FileText,
  Sliders,
  Sparkles,
  Loader2,
  Building,
  HelpCircle,
  Info,
} from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import {
  FloorPlanSummary,
  ProjectDetail,
  SpatialEdge,
  SpatialNode,
  TactileJobCreate,
  TactileJobResponse,
} from '../../types';
import { api } from '../../services/api';
import { useAccessibility } from '../../context/AccessibilityContext';

interface TactilePreviewViewerProps {
  projectId: string;
  onBack: () => void;
  initialFloorPlanId?: string;
}

export const TactilePreviewViewer: React.FC<TactilePreviewViewerProps> = ({
  projectId,
  onBack,
  initialFloorPlanId,
}) => {
  const { announce, playFeedbackTone } = useAccessibility();

  // Project & Data
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [activeFloorPlanId, setActiveFloorPlanId] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Nodes & Edges
  const [nodes, setNodes] = useState<SpatialNode[]>([]);
  const [edges, setEdges] = useState<SpatialEdge[]>([]);

  // Preview Mode
  const [viewMode, setViewMode] = useState<'3D' | '2D'>('3D');

  // Physical Parameters
  const [baseWidth, setBaseWidth] = useState<number>(180);
  const [baseDepth, setBaseDepth] = useState<number>(180);
  const [baseThickness, setBaseThickness] = useState<number>(2.5);
  const [wallHeight, setWallHeight] = useState<number>(2.5);
  const [brailleEnabled, setBrailleEnabled] = useState<boolean>(true);

  // Layer Toggles
  const [layerBase, setLayerBase] = useState<boolean>(true);
  const [layerWalls, setLayerWalls] = useState<boolean>(true);
  const [layerSymbols, setLayerSymbols] = useState<boolean>(true);
  const [layerBraille, setLayerBraille] = useState<boolean>(true);

  // 3D Orbit Controls State
  const [azimuth, setAzimuth] = useState<number>(45);
  const [elevation, setElevation] = useState<number>(35);
  const [zoom3D, setZoom3D] = useState<number>(1.0);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [lastMousePos, setLastMousePos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // Tactile Generation Job
  const [generating, setGenerating] = useState<boolean>(false);
  const [downloadingFormat, setDownloadingFormat] = useState<'stl' | 'svg' | 'pdf' | null>(null);
  const [jobResponse, setJobResponse] = useState<TactileJobResponse | null>(null);
  const [previewSvg, setPreviewSvg] = useState<string | null>(null);

  const canvas3DRef = useRef<HTMLCanvasElement>(null);

  // Load project details and spatial nodes
  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const proj = await api.getProjectDetail(projectId);
      setProject(proj);

      const targetPlanId =
        initialFloorPlanId || (proj.floor_plans.length > 0 ? proj.floor_plans[0].id : null);
      setActiveFloorPlanId(targetPlanId);

      const [nodeList, edgeList] = await Promise.all([
        api.getSpatialNodes(projectId, targetPlanId || undefined),
        api.getSpatialEdges(projectId),
      ]);

      setNodes(nodeList);
      setEdges(edgeList);

      // Fetch preliminary preview SVG
      try {
        const svg = await api.getProjectTactilePreviewSvg(projectId, targetPlanId || undefined);
        setPreviewSvg(svg);
      } catch (e) {
        console.warn('Could not load preliminary SVG preview:', e);
      }
    } catch (err: unknown) {
      console.error('Failed to load tactile viewer data:', err);
      setError('Unable to load building spatial representation for tactile generation.');
    } finally {
      setLoading(false);
    }
  }, [projectId, initialFloorPlanId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const activeFloorPlan = project?.floor_plans.find((fp) => fp.id === activeFloorPlanId) || null;
  const verifiedNodes = nodes.filter((n) => n.is_user_verified);
  const verifiedEdges = edges.filter((e) => e.is_user_verified);

  // Generate 3D tactile geometry
  const handleGenerateJob = async (): Promise<TactileJobResponse | null> => {
    if (verifiedNodes.length === 0) {
      setError('Cannot fabricate tactile model: No verified rooms exist on this floor.');
      return null;
    }

    setGenerating(true);
    setError(null);
    playFeedbackTone('click');
    announce('Calculating 3D tactile map geometry and slicing specifications.');

    try {
      const payload: TactileJobCreate = {
        project_id: projectId,
        floor_plan_id: activeFloorPlanId || undefined,
        output_format: 'all',
        braille_enabled: brailleEnabled,
        base_width_mm: baseWidth,
        base_depth_mm: baseDepth,
        base_thickness_mm: baseThickness,
        wall_height_mm: wallHeight,
      };

      const res = await api.generateTactileMap(payload);
      setJobResponse(res);
      playFeedbackTone('success');
      announce(`Tactile 3D model generated: ${res.triangle_count} mesh triangles, scale ${res.scale_label}.`);

      // Refresh preview SVG from completed job
      try {
        const svg = await api.getTactilePreviewSvg(res.id);
        setPreviewSvg(svg);
      } catch (e) {
        console.warn('Could not load generated SVG preview:', e);
      }

      return res;
    } catch (err: unknown) {
      console.error('Tactile generation failed:', err);
      const msg = err instanceof Error ? err.message : 'Tactile map generation failed.';
      setError(msg);
      playFeedbackTone('error');
      announce(`Tactile generation error: ${msg}`);
      return null;
    } finally {
      setGenerating(false);
    }
  };

  // Direct download helper: generates if needed, then downloads immediately
  const handleDirectDownload = async (fmt: 'stl' | 'svg' | 'pdf') => {
    setDownloadingFormat(fmt);
    try {
      let currentJob = jobResponse;
      if (!currentJob) {
        currentJob = await handleGenerateJob();
      }

      if (currentJob && currentJob.download_urls?.[fmt]) {
        const link = document.createElement('a');
        link.href = currentJob.download_urls[fmt];
        link.download = `${project?.building_name.toLowerCase().replace(/\s+/g, '_') || 'tactile_map'}.${fmt}`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        announce(`Downloading tactile ${fmt.toUpperCase()} file.`);
      } else if (currentJob) {
        const downloadUrl = api.getTactileDownloadUrl(currentJob.id, fmt);
        window.open(downloadUrl, '_blank');
      }
    } catch (err) {
      console.error('Direct download failed:', err);
      setError(`Failed to download ${fmt.toUpperCase()} file.`);
    } finally {
      setDownloadingFormat(null);
    }
  };

  // 3D Canvas Rendering (Isometric / Orthographic Relief Shading)
  useEffect(() => {
    if (viewMode !== '3D') return;
    const canvas = canvas3DRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set resolution
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * window.devicePixelRatio;
    canvas.height = rect.height * window.devicePixelRatio;
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

    const w = rect.width;
    const h = rect.height;

    ctx.clearRect(0, 0, w, h);

    // Clean neutral background
    ctx.fillStyle = '#1c1917';
    ctx.fillRect(0, 0, w, h);

    // Coordinate projection math
    const azRad = (azimuth * Math.PI) / 180;
    const elRad = (elevation * Math.PI) / 180;
    const cosAz = Math.cos(azRad);
    const sinAz = Math.sin(azRad);
    const cosEl = Math.cos(elRad);
    const sinEl = Math.sin(elRad);

    const scale = (Math.min(w, h) / 220) * zoom3D;
    const originX = w / 2;
    const originY = h / 2 + 30;

    // Project 3D point (X, Y, Z in mm, centered at 0,0,0) to 2D canvas
    const project3D = (x: number, y: number, z: number): [number, number] => {
      const cx = x - baseWidth / 2;
      const cy = y - baseDepth / 2;
      const cz = z;

      const rx = cx * cosAz - cy * sinAz;
      const ry = cx * sinAz + cy * cosAz;
      const rz = cz;

      const px = rx;
      const py = ry * sinEl - rz * cosEl;

      return [originX + px * scale, originY - py * scale];
    };

    // Helper: Draw 3D Box with directional relief lighting
    const draw3DBox = (
      x: number,
      y: number,
      z: number,
      bw: number,
      bd: number,
      bh: number,
      topColor: string,
      sideColor: string,
      frontColor: string
    ) => {
      const p1 = project3D(x, y, z);
      const p2 = project3D(x + bw, y, z);
      const p3 = project3D(x + bw, y + bd, z);
      const p4 = project3D(x, y + bd, z);

      const p5 = project3D(x, y, z + bh);
      const p6 = project3D(x + bw, y, z + bh);
      const p7 = project3D(x + bw, y + bd, z + bh);
      const p8 = project3D(x, y + bd, z + bh);

      // Bottom / Front / Side / Top Faces
      // Front face
      ctx.fillStyle = frontColor;
      ctx.beginPath();
      ctx.moveTo(p1[0], p1[1]);
      ctx.lineTo(p2[0], p2[1]);
      ctx.lineTo(p6[0], p6[1]);
      ctx.lineTo(p5[0], p5[1]);
      ctx.closePath();
      ctx.fill();

      // Right Side face
      ctx.fillStyle = sideColor;
      ctx.beginPath();
      ctx.moveTo(p2[0], p2[1]);
      ctx.lineTo(p3[0], p3[1]);
      ctx.lineTo(p7[0], p7[1]);
      ctx.lineTo(p6[0], p6[1]);
      ctx.closePath();
      ctx.fill();

      // Top face
      ctx.fillStyle = topColor;
      ctx.beginPath();
      ctx.moveTo(p5[0], p5[1]);
      ctx.lineTo(p6[0], p6[1]);
      ctx.lineTo(p7[0], p7[1]);
      ctx.lineTo(p8[0], p8[1]);
      ctx.closePath();
      ctx.fill();
    };

    // 1. Draw Substrate Baseplate
    if (layerBase) {
      draw3DBox(
        0,
        0,
        0,
        baseWidth,
        baseDepth,
        baseThickness,
        '#292524',
        '#1c1917',
        '#221f1d'
      );

      // Orientation notch on top-left (ISO 21542 tactile standard)
      ctx.fillStyle = '#44403c';
      const notchP1 = project3D(0, 0, baseThickness);
      const notchP2 = project3D(15, 0, baseThickness);
      const notchP3 = project3D(0, 15, baseThickness);
      ctx.beginPath();
      ctx.moveTo(notchP1[0], notchP1[1]);
      ctx.lineTo(notchP2[0], notchP2[1]);
      ctx.lineTo(notchP3[0], notchP3[1]);
      ctx.closePath();
      ctx.fill();
    }

    // 2. Draw Walls and Partition Ridges
    if (layerWalls) {
      const margin = 12;
      const wallThick = 3.5;
      const wInner = baseWidth - margin * 2;
      const dInner = baseDepth - margin * 2;
      const zBase = baseThickness;

      // Outer Perimeter Enclosure
      draw3DBox(margin, margin, zBase, wInner, wallThick, wallHeight, '#78716c', '#57534e', '#44403c');
      draw3DBox(margin, margin + dInner - wallThick, zBase, wInner, wallThick, wallHeight, '#78716c', '#57534e', '#44403c');
      draw3DBox(margin, margin, zBase, wallThick, dInner, wallHeight, '#78716c', '#57534e', '#44403c');
      draw3DBox(margin + wInner - wallThick, margin, zBase, wallThick, dInner, wallHeight, '#78716c', '#57534e', '#44403c');

      // Internal Corridors & Cross Partition
      draw3DBox(margin + wInner * 0.45, margin, zBase, wallThick, dInner * 0.65, wallHeight, '#a8a29e', '#78716c', '#57534e');
      draw3DBox(margin, margin + dInner * 0.5, zBase, wInner * 0.45, wallThick, wallHeight, '#a8a29e', '#78716c', '#57534e');
    }

    // 3. Draw Tactile Symbols for Verified Nodes
    if (layerSymbols && verifiedNodes.length > 0) {
      const zBase = baseThickness;
      const symbolHeight = wallHeight + 0.6;

      verifiedNodes.forEach((node, idx) => {
        const u = 0.2 + 0.6 * ((idx % 3) / 2);
        const v = 0.2 + 0.6 * (Math.floor(idx / 3) / 2);

        const nx = baseWidth * u;
        const ny = baseDepth * v;

        // Color coding by type
        let topC = '#d97706';
        let sideC = '#b45309';
        let frontC = '#92400e';

        if (node.node_type === 'entrance') {
          topC = '#f59e0b';
          sideC = '#d97706';
          frontC = '#b45309';
        } else if (node.node_type === 'restroom') {
          topC = '#0284c7';
          sideC = '#0369a1';
          frontC = '#075985';
        } else if (node.node_type === 'elevator' || node.node_type === 'stairs') {
          topC = '#9333ea';
          sideC = '#7e22ce';
          frontC = '#6b21a8';
        } else {
          topC = '#10b981';
          sideC = '#059669';
          frontC = '#047857';
        }

        draw3DBox(nx - 4, ny - 4, zBase, 8, 8, symbolHeight, topC, sideC, frontC);

        // 4. Draw Braille Dots if enabled
        if (layerBraille && brailleEnabled) {
          const brailleZ = zBase + 0.8;
          const [bx, by] = project3D(nx - 4, ny + 7, brailleZ);
          ctx.fillStyle = '#f5f5f4';
          ctx.beginPath();
          ctx.arc(bx, by, 1.8 * zoom3D, 0, Math.PI * 2);
          ctx.fill();

          const [bx2, by2] = project3D(nx + 1, ny + 7, brailleZ);
          ctx.beginPath();
          ctx.arc(bx2, by2, 1.8 * zoom3D, 0, Math.PI * 2);
          ctx.fill();
        }
      });
    }
  }, [
    viewMode,
    azimuth,
    elevation,
    zoom3D,
    baseWidth,
    baseDepth,
    baseThickness,
    wallHeight,
    layerBase,
    layerWalls,
    layerSymbols,
    layerBraille,
    brailleEnabled,
    verifiedNodes,
  ]);

  // Mouse Orbit Handlers
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    setIsDragging(true);
    setLastMousePos({ x: e.clientX, y: e.clientY });
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDragging) return;
    const dx = e.clientX - lastMousePos.x;
    const dy = e.clientY - lastMousePos.y;

    setAzimuth((az) => (az + dx * 0.7) % 360);
    setElevation((el) => Math.max(15, Math.min(85, el + dy * 0.5)));
    setLastMousePos({ x: e.clientX, y: e.clientY });
  };

  const handleMouseUp = () => setIsDragging(false);

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.1 : 0.9;
    setZoom3D((z) => Math.max(0.4, Math.min(2.5, z * factor)));
  };

  if (loading) {
    return (
      <div className="py-24 text-center text-zinc-500 space-y-3">
        <Loader2 className="w-7 h-7 animate-spin text-zinc-400 mx-auto" />
        <p className="text-sm font-medium">Loading tactile 3D relief data...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      
      {/* Visualizer & Downloads Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* Left: Interactive Canvas / SVG (8 cols) */}
        <div className="lg:col-span-8 space-y-4">
          <div className="relative bg-zinc-900 rounded-xl overflow-hidden border border-zinc-800 h-[520px] shadow-sm flex flex-col justify-between">
            
            {/* Top Toolbar */}
            <div className="absolute top-3 left-3 right-3 z-10 flex items-center justify-between pointer-events-none gap-2">
              
              {/* 3D vs 2D Toggle */}
              <div className="bg-zinc-900/90 border border-zinc-700 rounded-lg p-0.5 flex items-center gap-1 shadow-sm pointer-events-auto">
                <button
                  onClick={() => setViewMode('3D')}
                  className={`px-2.5 py-1 rounded text-xs font-medium flex items-center gap-1.5 transition-colors ${
                    viewMode === '3D' ? 'bg-zinc-950 text-white' : 'text-zinc-300 hover:text-white'
                  }`}
                >
                  <Rotate3d className="w-3.5 h-3.5" />
                  <span>3D Relief</span>
                </button>
                <button
                  onClick={() => setViewMode('2D')}
                  className={`px-2.5 py-1 rounded text-xs font-medium flex items-center gap-1.5 transition-colors ${
                    viewMode === '2D' ? 'bg-zinc-950 text-white' : 'text-zinc-300 hover:text-white'
                  }`}
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>2D Vector</span>
                </button>
              </div>

              {/* Layer Visibility (3D mode) */}
              {viewMode === '3D' && (
                <div className="bg-zinc-900/90 border border-zinc-700 rounded-lg p-0.5 flex items-center gap-1 text-[11px] shadow-sm pointer-events-auto">
                  <button
                    onClick={() => setLayerBase(!layerBase)}
                    className={`px-2 py-0.5 rounded ${layerBase ? 'bg-zinc-800 text-zinc-200' : 'text-zinc-500'}`}
                  >
                    Base
                  </button>
                  <button
                    onClick={() => setLayerWalls(!layerWalls)}
                    className={`px-2 py-0.5 rounded ${layerWalls ? 'bg-zinc-800 text-zinc-200' : 'text-zinc-500'}`}
                  >
                    Walls
                  </button>
                  <button
                    onClick={() => setLayerSymbols(!layerSymbols)}
                    className={`px-2 py-0.5 rounded ${layerSymbols ? 'bg-zinc-800 text-zinc-200' : 'text-zinc-500'}`}
                  >
                    Symbols
                  </button>
                  <button
                    onClick={() => setLayerBraille(!layerBraille)}
                    className={`px-2 py-0.5 rounded ${layerBraille ? 'bg-zinc-800 text-zinc-200' : 'text-zinc-500'}`}
                  >
                    Braille
                  </button>
                </div>
              )}

              {/* Orbit Controls (3D mode) */}
              {viewMode === '3D' && (
                <div className="bg-zinc-900/90 border border-zinc-700 rounded-lg p-1 flex items-center gap-1 shadow-sm pointer-events-auto">
                  <button
                    onClick={() => setZoom3D((z) => Math.min(2.5, z * 1.15))}
                    className="p-1 text-zinc-300 hover:text-white rounded hover:bg-zinc-800"
                    title="Zoom In"
                  >
                    <ZoomIn className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => setZoom3D((z) => Math.max(0.4, z * 0.85))}
                    className="p-1 text-zinc-300 hover:text-white rounded hover:bg-zinc-800"
                    title="Zoom Out"
                  >
                    <ZoomOut className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => {
                      setAzimuth(45);
                      setElevation(35);
                      setZoom3D(1.0);
                    }}
                    className="p-1 text-zinc-300 hover:text-white rounded hover:bg-zinc-800"
                    title="Reset View"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>

            {/* Viewport: 3D Canvas or 2D Vector SVG */}
            {viewMode === '3D' ? (
              <div className="w-full h-full relative cursor-grab active:cursor-grabbing">
                <canvas
                  ref={canvas3DRef}
                  onMouseDown={handleMouseDown}
                  onMouseMove={handleMouseMove}
                  onMouseUp={handleMouseUp}
                  onWheel={handleWheel}
                  className="w-full h-full"
                />
                <div className="absolute bottom-2 left-3 text-[11px] font-mono text-zinc-400 bg-zinc-900/80 px-2 py-0.5 rounded border border-zinc-800 pointer-events-none">
                  Click and drag to rotate &bull; Scroll to zoom
                </div>
              </div>
            ) : (
              <div className="w-full h-full p-8 flex items-center justify-center overflow-auto bg-zinc-950">
                {previewSvg ? (
                  <div
                    className="max-w-full max-h-full shadow-lg rounded-lg overflow-hidden bg-white p-3"
                    dangerouslySetInnerHTML={{ __html: previewSvg }}
                  />
                ) : (
                  <div className="text-zinc-500 text-xs">Loading SVG vector layout...</div>
                )}
              </div>
            )}

            {/* Bottom Specs Bar */}
            <div className="bg-zinc-950/90 border-t border-zinc-800 px-4 py-2 flex items-center justify-between text-[11px] font-mono text-zinc-400">
              <span>Plate: {baseWidth} &times; {baseDepth} mm</span>
              <span>Relief Height: {wallHeight} mm</span>
              <span>Braille: {brailleEnabled ? 'UEB Grade 1' : 'None'}</span>
            </div>
          </div>

          {/* Floor level selector if building has multiple floors */}
          {project && project.floor_plans.length > 1 && (
            <div className="flex items-center gap-2 overflow-x-auto pb-1">
              <span className="text-xs font-medium text-zinc-600 mr-1 flex items-center gap-1.5 shrink-0">
                <Building className="w-3.5 h-3.5 text-zinc-400" />
                Floor Level:
              </span>
              {project.floor_plans.map((fp) => (
                <button
                  key={fp.id}
                  onClick={() => {
                    setActiveFloorPlanId(fp.id);
                    playFeedbackTone('click');
                    api.getSpatialNodes(projectId, fp.id).then(setNodes);
                    api.getProjectTactilePreviewSvg(projectId, fp.id).then(setPreviewSvg);
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors flex items-center gap-1.5 shrink-0 ${
                    activeFloorPlanId === fp.id
                      ? 'bg-zinc-900 text-white border-zinc-900'
                      : 'bg-white text-zinc-700 border-zinc-200 hover:bg-zinc-100'
                  }`}
                >
                  <span>{fp.name}</span>
                </button>
              ))}
            </div>
          )}

          {/* Tactile Symbol Reference Key */}
          <div className="bg-white border border-zinc-200 rounded-xl p-4 shadow-xs text-xs space-y-2">
            <span className="font-semibold text-zinc-800 uppercase tracking-wider text-[11px] block">
              Tactile Sensation Key
            </span>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-zinc-600">
              <div className="flex items-center gap-2">
                <span className="w-3.5 h-3.5 rounded-full bg-zinc-900 inline-block shrink-0" />
                <span>Entrance (Ring)</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-3.5 h-3.5 bg-zinc-600 inline-block shrink-0 rounded-xs" />
                <span>Restroom (Square)</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-3.5 h-3.5 bg-zinc-800 inline-block shrink-0 rounded-xs" />
                <span>Elevator / Stairs</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-3.5 h-3.5 rounded-full bg-zinc-950 inline-block shrink-0" />
                <span>Room Waypoint</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right: Direct Downloads & Fabrication Options (4 cols) */}
        <div className="lg:col-span-4 space-y-4">
          
          {/* Primary Action Card: Downloads */}
          <Card className="p-5 space-y-4 bg-white border border-zinc-200 rounded-xl shadow-xs">
            <div className="flex items-center justify-between border-b border-zinc-100 pb-2">
              <h3 className="text-sm font-bold text-zinc-900 tracking-tight flex items-center gap-1.5">
                <Download className="w-4 h-4 text-zinc-700" />
                <span>Download Tactile Map</span>
              </h3>
              <span className="text-[11px] text-zinc-400">Ready to export</span>
            </div>

            <p className="text-xs text-zinc-600 leading-relaxed">
              Export fabrication-ready files with raised boundaries, navigable pathways, and Braille labels.
            </p>

            {/* Direct Download Buttons */}
            <div className="space-y-2.5 pt-1">
              {/* STL Download Button */}
              <button
                onClick={() => handleDirectDownload('stl')}
                disabled={generating || downloadingFormat === 'stl'}
                className="w-full py-2.5 px-3 bg-zinc-900 hover:bg-zinc-800 disabled:bg-zinc-400 text-white rounded-xl text-xs font-medium flex items-center justify-between transition-colors shadow-xs"
              >
                <div className="flex items-center gap-2">
                  {downloadingFormat === 'stl' ? (
                    <Loader2 className="w-4 h-4 animate-spin text-white" />
                  ) : (
                    <Box className="w-4 h-4 text-white" />
                  )}
                  <span>3D Model (STL)</span>
                </div>
                <span className="text-[10px] text-zinc-300">For 3D Printers</span>
              </button>

              {/* SVG Download Button */}
              <button
                onClick={() => handleDirectDownload('svg')}
                disabled={generating || downloadingFormat === 'svg'}
                className="w-full py-2 px-3 bg-white hover:bg-zinc-50 border border-zinc-300 disabled:opacity-50 text-zinc-800 rounded-xl text-xs font-medium flex items-center justify-between transition-colors"
              >
                <div className="flex items-center gap-2">
                  {downloadingFormat === 'svg' ? (
                    <Loader2 className="w-4 h-4 animate-spin text-zinc-600" />
                  ) : (
                    <Download className="w-3.5 h-3.5 text-zinc-600" />
                  )}
                  <span>Printable Vector (SVG)</span>
                </div>
                <span className="text-[10px] text-zinc-500">For Swell Paper</span>
              </button>

              {/* PDF Download Button */}
              <button
                onClick={() => handleDirectDownload('pdf')}
                disabled={generating || downloadingFormat === 'pdf'}
                className="w-full py-2 px-3 bg-white hover:bg-zinc-50 border border-zinc-300 disabled:opacity-50 text-zinc-800 rounded-xl text-xs font-medium flex items-center justify-between transition-colors"
              >
                <div className="flex items-center gap-2">
                  {downloadingFormat === 'pdf' ? (
                    <Loader2 className="w-4 h-4 animate-spin text-zinc-600" />
                  ) : (
                    <FileText className="w-3.5 h-3.5 text-zinc-600" />
                  )}
                  <span>Reference Guide (PDF)</span>
                </div>
                <span className="text-[10px] text-zinc-500">Visual Layout</span>
              </button>
            </div>
          </Card>

          {/* Physical Parameters Card */}
          <Card className="p-5 space-y-4 bg-white border border-zinc-200 rounded-xl shadow-xs">
            <div className="flex items-center justify-between border-b border-zinc-100 pb-2">
              <h3 className="text-sm font-bold text-zinc-900 tracking-tight flex items-center gap-1.5">
                <Sliders className="w-4 h-4 text-zinc-700" />
                <span>Physical Dimensions</span>
              </h3>
              <span className="text-[11px] font-mono text-zinc-400">ISO 21542</span>
            </div>

            {/* Build Envelope Selection */}
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-zinc-700">
                Plate Dimensions
              </label>
              <div className="grid grid-cols-3 gap-1.5">
                {[150, 180, 200].map((sz) => (
                  <button
                    key={sz}
                    onClick={() => {
                      setBaseWidth(sz);
                      setBaseDepth(sz);
                    }}
                    className={`py-1.5 px-2 text-xs font-medium rounded-lg border transition-colors ${
                      baseWidth === sz
                        ? 'bg-zinc-50 border-zinc-300 text-zinc-950'
                        : 'bg-white border-zinc-200 text-zinc-700 hover:bg-zinc-50'
                    }`}
                  >
                    {sz}&times;{sz} mm
                  </button>
                ))}
              </div>
            </div>

            {/* Wall Height Slider */}
            <div>
              <label className="block text-xs font-medium text-zinc-700 mb-1 flex items-center justify-between">
                <span>Wall Relief Height:</span>
                <span className="font-mono text-zinc-900 font-semibold">{wallHeight.toFixed(1)} mm</span>
              </label>
              <input
                type="range"
                min="1.5"
                max="4.0"
                step="0.5"
                value={wallHeight}
                onChange={(e) => setWallHeight(parseFloat(e.target.value))}
                className="w-full accent-zinc-900 cursor-pointer"
              />
              <span className="text-[11px] text-zinc-400">
                Recommended 2.5mm for distinct tactile discernment.
              </span>
            </div>

            {/* Braille Toggle */}
            <label className="flex items-center gap-2 cursor-pointer pt-1 select-none">
              <input
                type="checkbox"
                checked={brailleEnabled}
                onChange={(e) => setBrailleEnabled(e.target.checked)}
                className="w-4 h-4 text-zinc-900 rounded border-zinc-300 focus:ring-zinc-900"
              />
              <span className="text-xs font-medium text-zinc-800">
                Emboss Braille Labels (UEB Grade 1)
              </span>
            </label>
          </Card>

        </div>
      </div>

      {/* Fabrication Methods Reference Section */}
      <div className="pt-4 space-y-3">
        <h3 className="text-base font-semibold text-zinc-900">
          Physical Fabrication Methods
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="p-4 bg-white border border-zinc-200 rounded-xl space-y-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-zinc-900">
              1. Swell Paper (PIAF)
            </span>
            <p className="text-xs text-zinc-600 leading-relaxed">
              Print the exported SVG or PDF onto microcapsule paper with standard black carbon ink. Run the sheet through a thermal fuser (PIAF machine); black ink absorbs heat and rises into crisp tactile ridges.
            </p>
          </Card>

          <Card className="p-4 bg-white border border-zinc-200 rounded-xl space-y-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-zinc-800">
              2. 3D Printing (FDM / SLA)
            </span>
            <p className="text-xs text-zinc-600 leading-relaxed">
              Slice the watertight STL mesh with 0.15mm-0.20mm layer height and 100% infill for walls. Print with standard PLA or PETG for durable, permanent entrance map stations.
            </p>
          </Card>

          <Card className="p-4 bg-white border border-zinc-200 rounded-xl space-y-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-zinc-800">
              3. Thermoforming
            </span>
            <p className="text-xs text-zinc-600 leading-relaxed">
              Use a 3D-printed plate as a positive master mold. Place durable plastic sheeting (such as Braillon) over the mold and apply vacuum suction with heat to mass-produce lightweight tactile copies.
            </p>
          </Card>
        </div>
      </div>

    </div>
  );
};
