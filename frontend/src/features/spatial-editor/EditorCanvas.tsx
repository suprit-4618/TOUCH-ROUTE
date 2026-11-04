import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  ZoomIn,
  ZoomOut,
  Maximize2,
  RotateCcw,
  MousePointer,
  PlusCircle,
  Network,
  Move,
  Eye,
  EyeOff,
  Filter,
} from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { BoundingBox, FloorPlanSummary, SpatialEdge, SpatialNode } from '../../types';
import { api } from '../../services/api';

export type EditorTool = 'select' | 'add_node' | 'connect' | 'pan';

interface EditorCanvasProps {
  floorPlan: FloorPlanSummary;
  nodes: SpatialNode[];
  edges: SpatialEdge[];
  selectedNodeId: string | null;
  onSelectNode: (node: SpatialNode | null) => void;
  onMoveNode: (nodeId: string, newX: number, newY: number) => void;
  onResizeNodeBox: (nodeId: string, newBox: BoundingBox) => void;
  onAddNodeAt: (x: number, y: number) => void;
  onConnectNodes: (sourceId: string, targetId: string) => void;
  currentTool: EditorTool;
  setCurrentTool: (tool: EditorTool) => void;
}

export const EditorCanvas: React.FC<EditorCanvasProps> = ({
  floorPlan,
  nodes,
  edges,
  selectedNodeId,
  onSelectNode,
  onMoveNode,
  onResizeNodeBox,
  onAddNodeAt,
  onConnectNodes,
  currentTool,
  setCurrentTool,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Viewport transforms
  const [zoom, setZoom] = useState<number>(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState<boolean>(false);
  const [startPan, setStartPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // Interaction dragging states
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);
  const [connectingSourceId, setConnectingSourceId] = useState<string | null>(null);
  const [mouseCanvasPos, setMouseCanvasPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // Layer toggles
  const [showImage, setShowImage] = useState<boolean>(true);
  const [showBoxes, setShowBoxes] = useState<boolean>(true);
  const [showEdges, setShowEdges] = useState<boolean>(true);
  const [showLabels, setShowLabels] = useState<boolean>(true);
  const [unverifiedOnly, setUnverifiedOnly] = useState<boolean>(false);

  // Loaded Image
  const [imageLoaded, setImageLoaded] = useState<boolean>(false);
  const imageObjRef = useRef<HTMLImageElement | null>(null);

  // Determine active image URL
  const imageUrl = floorPlan.processed_file_path
    ? api.getFloorPlanProcessedUrl(floorPlan.id)
    : api.getFloorPlanRawUrl(floorPlan.id);

  // Load Blueprint Image
  useEffect(() => {
    setImageLoaded(false);
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = imageUrl;
    img.onload = () => {
      imageObjRef.current = img;
      setImageLoaded(true);

      // Fit blueprint to container
      if (containerRef.current) {
        const cw = containerRef.current.clientWidth;
        const ch = containerRef.current.clientHeight;
        const targetW = floorPlan.width || img.naturalWidth;
        const targetH = floorPlan.height || img.naturalHeight;
        const scaleX = (cw * 0.92) / targetW;
        const scaleY = (ch * 0.92) / targetH;
        const initZoom = Math.min(scaleX, scaleY, 1.0);
        setZoom(initZoom);
        setPan({
          x: (cw - targetW * initZoom) / 2,
          y: (ch - targetH * initZoom) / 2,
        });
      }
    };
    img.onerror = () => {
      // Fallback to raw if processed not available
      if (imageUrl.includes('processed-image')) {
        const rawImg = new Image();
        rawImg.crossOrigin = 'anonymous';
        rawImg.src = api.getFloorPlanRawUrl(floorPlan.id);
        rawImg.onload = () => {
          imageObjRef.current = rawImg;
          setImageLoaded(true);
        };
      }
    };
  }, [floorPlan.id, imageUrl]);

  // Coordinate conversion helpers
  const screenToBlueprintCoords = useCallback(
    (clientX: number, clientY: number) => {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return { x: 0, y: 0 };
      const sx = clientX - rect.left;
      const sy = clientY - rect.top;
      return {
        x: (sx - pan.x) / zoom,
        y: (sy - pan.y) / zoom,
      };
    },
    [pan, zoom]
  );

  // Hit test for nodes
  const findNodeAtCoords = useCallback(
    (bpX: number, bpY: number) => {
      // Prioritize center point hit test within radius
      const hitRadius = 14 / zoom;
      for (let i = nodes.length - 1; i >= 0; i--) {
        const node = nodes[i];
        const dx = node.x - bpX;
        const dy = node.y - bpY;
        if (Math.sqrt(dx * dx + dy * dy) <= hitRadius) {
          return node;
        }
      }

      // Check bounding box containment
      for (let i = nodes.length - 1; i >= 0; i--) {
        const node = nodes[i];
        if (node.bounding_box) {
          const { min_x, min_y, max_x, max_y } = node.bounding_box;
          if (bpX >= min_x && bpX <= max_x && bpY >= min_y && bpY <= max_y) {
            return node;
          }
        }
      }
      return null;
    },
    [nodes, zoom]
  );

  // Draw Canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (containerRef.current) {
      canvas.width = containerRef.current.clientWidth;
      canvas.height = containerRef.current.clientHeight;
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Warm charcoal architectural canvas background
    ctx.fillStyle = '#1c1917';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    ctx.translate(pan.x, pan.y);
    ctx.scale(zoom, zoom);

    // 1. Draw Blueprint Image (scaled to original dimensions)
    const targetW = floorPlan.width || imageObjRef.current?.naturalWidth || 1600;
    const targetH = floorPlan.height || imageObjRef.current?.naturalHeight || 1200;

    if (showImage && imageLoaded && imageObjRef.current) {
      ctx.drawImage(imageObjRef.current, 0, 0, targetW, targetH);
    } else {
      // Subtle architectural blueprint boundary
      ctx.strokeStyle = '#292524';
      ctx.lineWidth = 2 / zoom;
      ctx.strokeRect(0, 0, targetW, targetH);
    }

    // Filter nodes if unverified filter is active
    const visibleNodes = unverifiedOnly ? nodes.filter((n) => !n.is_user_verified) : nodes;
    const visibleNodeIds = new Set(visibleNodes.map((n) => n.id));

    // 2. Draw Topological Edges (Connections)
    if (showEdges) {
      edges.forEach((edge) => {
        const sourceNode = nodes.find((n) => n.id === edge.source_node_id);
        const targetNode = nodes.find((n) => n.id === edge.target_node_id);
        if (!sourceNode || !targetNode) return;
        if (unverifiedOnly && (!visibleNodeIds.has(sourceNode.id) && !visibleNodeIds.has(targetNode.id))) return;

        ctx.beginPath();
        ctx.moveTo(sourceNode.x, sourceNode.y);
        ctx.lineTo(targetNode.x, targetNode.y);

        if (edge.is_user_verified) {
          ctx.strokeStyle = '#059669'; // Emerald verified
          ctx.lineWidth = 2.5 / zoom;
          ctx.setLineDash([]);
        } else if (edge.is_geometry_validated) {
          ctx.strokeStyle = '#0284c7'; // Blue validated
          ctx.lineWidth = 2 / zoom;
          ctx.setLineDash([4 / zoom, 3 / zoom]);
        } else {
          ctx.strokeStyle = '#d97706'; // Amber unverified
          ctx.lineWidth = 2 / zoom;
          ctx.setLineDash([5 / zoom, 5 / zoom]);
        }
        ctx.stroke();
        ctx.setLineDash([]);
      });

      // Temporary connection line during 'connect' tool
      if (connectingSourceId) {
        const sourceNode = nodes.find((n) => n.id === connectingSourceId);
        if (sourceNode) {
          ctx.beginPath();
          ctx.moveTo(sourceNode.x, sourceNode.y);
          ctx.lineTo(mouseCanvasPos.x, mouseCanvasPos.y);
          ctx.strokeStyle = '#f59e0b';
          ctx.lineWidth = 2.5 / zoom;
          ctx.setLineDash([6 / zoom, 4 / zoom]);
          ctx.stroke();
          ctx.setLineDash([]);
        }
      }
    }

    // 3. Draw Room Bounding Boxes
    if (showBoxes) {
      visibleNodes.forEach((node) => {
        if (!node.bounding_box) return;
        const isSelected = node.id === selectedNodeId;
        const { min_x, min_y, max_x, max_y } = node.bounding_box;
        const w = max_x - min_x;
        const h = max_y - min_y;

        if (node.is_user_verified) {
          ctx.fillStyle = isSelected ? 'rgba(5, 150, 105, 0.28)' : 'rgba(5, 150, 105, 0.14)';
          ctx.strokeStyle = '#059669';
          ctx.lineWidth = (isSelected ? 3 : 1.5) / zoom;
          ctx.setLineDash([]);
        } else if (node.is_geometry_validated) {
          ctx.fillStyle = isSelected ? 'rgba(2, 132, 199, 0.25)' : 'rgba(2, 132, 199, 0.12)';
          ctx.strokeStyle = '#0284c7';
          ctx.lineWidth = (isSelected ? 2.5 : 1.5) / zoom;
          ctx.setLineDash([4 / zoom, 3 / zoom]);
        } else {
          ctx.fillStyle = isSelected ? 'rgba(217, 119, 6, 0.25)' : 'rgba(217, 119, 6, 0.10)';
          ctx.strokeStyle = '#d97706';
          ctx.lineWidth = (isSelected ? 2.5 : 1.5) / zoom;
          ctx.setLineDash([5 / zoom, 4 / zoom]);
        }

        ctx.fillRect(min_x, min_y, w, h);
        ctx.strokeRect(min_x, min_y, w, h);
        ctx.setLineDash([]);

        // Selected bounding box resize handles
        if (isSelected) {
          const handleSize = 6 / zoom;
          ctx.fillStyle = '#ffffff';
          ctx.strokeStyle = '#d97706';
          ctx.lineWidth = 2 / zoom;

          // 4 corners
          [[min_x, min_y], [max_x, min_y], [min_x, max_y], [max_x, max_y]].forEach(([hx, hy]) => {
            ctx.fillRect(hx - handleSize / 2, hy - handleSize / 2, handleSize, handleSize);
            ctx.strokeRect(hx - handleSize / 2, hy - handleSize / 2, handleSize, handleSize);
          });
        }
      });
    }

    // 4. Draw Center Nodes & Badges
    visibleNodes.forEach((node) => {
      const isSelected = node.id === selectedNodeId;
      const radius = (isSelected ? 9 : 7) / zoom;

      // Color coding per node type
      let fillColor = '#0284c7'; // default room blue
      if (node.node_type === 'entrance' || node.node_type === 'exit') fillColor = '#10b981';
      else if (node.node_type === 'stairs') fillColor = '#8b5cf6';
      else if (node.node_type === 'elevator') fillColor = '#06b6d4';
      else if (node.node_type === 'door') fillColor = '#f59e0b';
      else if (node.node_type === 'restroom') fillColor = '#6366f1';
      else if (node.node_type === 'hazard') fillColor = '#ef4444';

      ctx.beginPath();
      ctx.arc(node.x, node.y, radius, 0, Math.PI * 2);
      ctx.fillStyle = fillColor;
      ctx.fill();

      // Outer ring for verification state
      ctx.beginPath();
      ctx.arc(node.x, node.y, radius + (isSelected ? 4 : 2) / zoom, 0, Math.PI * 2);
      ctx.lineWidth = (isSelected ? 3 : 2) / zoom;
      ctx.strokeStyle = node.is_user_verified
        ? '#10b981'
        : node.is_geometry_validated
        ? '#38bdf8'
        : '#fbbf24';
      ctx.stroke();

      // Labels
      if (showLabels) {
        ctx.font = `bold ${Math.max(12 / zoom, 11)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';

        const labelText = node.room_number ? `${node.label} (#${node.room_number})` : node.label;
        const textY = node.y - (radius + 4 / zoom);

        // Text pill background
        const metrics = ctx.measureText(labelText);
        const textW = metrics.width;
        const padX = 4 / zoom;
        const padY = 2 / zoom;
        const boxH = Math.max(14 / zoom, 13);

        ctx.fillStyle = 'rgba(28, 25, 23, 0.85)';
        ctx.fillRect(
          node.x - textW / 2 - padX,
          textY - boxH + padY,
          textW + padX * 2,
          boxH
        );

        ctx.fillStyle = isSelected ? '#fbbf24' : '#fafaf9';
        ctx.fillText(labelText, node.x, textY);
      }
    });

    ctx.restore();
  }, [
    zoom,
    pan,
    imageLoaded,
    showImage,
    showBoxes,
    showEdges,
    showLabels,
    unverifiedOnly,
    nodes,
    edges,
    selectedNodeId,
    connectingSourceId,
    mouseCanvasPos,
    floorPlan,
  ]);

  // Mouse Handlers
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const coords = screenToBlueprintCoords(e.clientX, e.clientY);

    // Pan tool or middle click or Space
    if (currentTool === 'pan' || e.button === 1 || e.altKey) {
      setIsPanning(true);
      setStartPan({ x: e.clientX - pan.x, y: e.clientY - pan.y });
      return;
    }

    if (currentTool === 'add_node') {
      onAddNodeAt(Math.round(coords.x), Math.round(coords.y));
      setCurrentTool('select');
      return;
    }

    if (currentTool === 'connect') {
      const hitNode = findNodeAtCoords(coords.x, coords.y);
      if (!hitNode) {
        setConnectingSourceId(null);
        return;
      }
      if (!connectingSourceId) {
        setConnectingSourceId(hitNode.id);
      } else if (connectingSourceId !== hitNode.id) {
        onConnectNodes(connectingSourceId, hitNode.id);
        setConnectingSourceId(null);
      }
      return;
    }

    if (currentTool === 'select') {
      const hitNode = findNodeAtCoords(coords.x, coords.y);
      if (hitNode) {
        onSelectNode(hitNode);
        setDraggingNodeId(hitNode.id);
      } else {
        onSelectNode(null);
        // Drag canvas background if clicked empty space
        setIsPanning(true);
        setStartPan({ x: e.clientX - pan.x, y: e.clientY - pan.y });
      }
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const coords = screenToBlueprintCoords(e.clientX, e.clientY);
    setMouseCanvasPos(coords);

    if (isPanning) {
      setPan({
        x: e.clientX - startPan.x,
        y: e.clientY - startPan.y,
      });
      return;
    }

    if (draggingNodeId) {
      onMoveNode(draggingNodeId, Math.round(coords.x), Math.round(coords.y));
    }
  };

  const handleMouseUp = () => {
    setIsPanning(false);
    setDraggingNodeId(null);
  };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const zoomFactor = e.deltaY < 0 ? 1.15 : 0.87;
    const newZoom = Math.min(Math.max(zoom * zoomFactor, 0.15), 5.0);

    setPan({
      x: mouseX - (mouseX - pan.x) * (newZoom / zoom),
      y: mouseY - (mouseY - pan.y) * (newZoom / zoom),
    });
    setZoom(newZoom);
  };

  const handleResetZoom = () => {
    if (!containerRef.current) return;
    const cw = containerRef.current.clientWidth;
    const ch = containerRef.current.clientHeight;
    const targetW = floorPlan.width || 1600;
    const targetH = floorPlan.height || 1200;
    const initZoom = Math.min((cw * 0.92) / targetW, (ch * 0.92) / targetH, 1.0);
    setZoom(initZoom);
    setPan({
      x: (cw - targetW * initZoom) / 2,
      y: (ch - targetH * initZoom) / 2,
    });
  };

  return (
    <div className="relative bg-zinc-900 rounded-xl overflow-hidden border border-zinc-800 flex flex-col h-[650px]">
      {/* Top Floating Control Ribbon */}
      <div className="absolute top-3 left-3 right-3 z-10 flex items-center justify-between pointer-events-none gap-2 flex-wrap">
        {/* Tool Selector */}
        <div className="bg-zinc-900/90 backdrop-blur-sm border border-zinc-700 rounded-lg p-1 flex items-center gap-1 shadow-md pointer-events-auto">
          <button
            onClick={() => {
              setCurrentTool('select');
              setConnectingSourceId(null);
            }}
            className={`px-2.5 py-1.5 rounded text-xs font-medium flex items-center gap-1.5 transition-colors ${
              currentTool === 'select'
                ? 'bg-zinc-900 text-white'
                : 'text-zinc-300 hover:bg-zinc-800 hover:text-white'
            }`}
            title="Inspect, drag, and select spatial elements (S)"
          >
            <MousePointer className="w-3.5 h-3.5" />
            <span>Select</span>
          </button>

          <button
            onClick={() => {
              setCurrentTool('add_node');
              setConnectingSourceId(null);
            }}
            className={`px-2.5 py-1.5 rounded text-xs font-medium flex items-center gap-1.5 transition-colors ${
              currentTool === 'add_node'
                ? 'bg-zinc-900 text-white'
                : 'text-zinc-300 hover:bg-zinc-800 hover:text-white'
            }`}
            title="Click canvas to place a missing room or waypoint (A)"
          >
            <PlusCircle className="w-3.5 h-3.5" />
            <span>Add Space</span>
          </button>

          <button
            onClick={() => {
              setCurrentTool('connect');
              setConnectingSourceId(null);
            }}
            className={`px-2.5 py-1.5 rounded text-xs font-medium flex items-center gap-1.5 transition-colors ${
              currentTool === 'connect'
                ? 'bg-zinc-900 text-white'
                : 'text-zinc-300 hover:bg-zinc-800 hover:text-white'
            }`}
            title="Click two elements to link them via doorway or corridor (C)"
          >
            <Network className="w-3.5 h-3.5" />
            <span>Connect</span>
          </button>

          <button
            onClick={() => {
              setCurrentTool('pan');
              setConnectingSourceId(null);
            }}
            className={`px-2.5 py-1.5 rounded text-xs font-medium flex items-center gap-1.5 transition-colors ${
              currentTool === 'pan'
                ? 'bg-zinc-900 text-white'
                : 'text-zinc-300 hover:bg-zinc-800 hover:text-white'
            }`}
            title="Pan / Navigate Canvas (H)"
          >
            <Move className="w-3.5 h-3.5" />
            <span>Pan</span>
          </button>
        </div>

        {/* Layer Toggles */}
        <div className="bg-zinc-900/90 backdrop-blur-sm border border-zinc-700 rounded-lg p-1 flex items-center gap-1 text-xs shadow-md pointer-events-auto">
          <button
            onClick={() => setShowImage(!showImage)}
            className={`px-2 py-1 rounded text-[11px] font-medium transition-colors ${
              showImage ? 'text-zinc-200 bg-zinc-800' : 'text-zinc-500 hover:text-zinc-300'
            }`}
            title="Toggle Blueprint Image"
          >
            Blueprint
          </button>
          <button
            onClick={() => setShowBoxes(!showBoxes)}
            className={`px-2 py-1 rounded text-[11px] font-medium transition-colors ${
              showBoxes ? 'text-zinc-200 bg-zinc-800' : 'text-zinc-500 hover:text-zinc-300'
            }`}
            title="Toggle Room Bounding Boxes"
          >
            Boxes
          </button>
          <button
            onClick={() => setShowEdges(!showEdges)}
            className={`px-2 py-1 rounded text-[11px] font-medium transition-colors ${
              showEdges ? 'text-zinc-200 bg-zinc-800' : 'text-zinc-500 hover:text-zinc-300'
            }`}
            title="Toggle Topological Edge Graph"
          >
            Paths
          </button>
          <button
            onClick={() => setShowLabels(!showLabels)}
            className={`px-2 py-1 rounded text-[11px] font-medium transition-colors ${
              showLabels ? 'text-zinc-200 bg-zinc-800' : 'text-zinc-500 hover:text-zinc-300'
            }`}
            title="Toggle Room Labels"
          >
            Labels
          </button>
          <button
            onClick={() => setUnverifiedOnly(!unverifiedOnly)}
            className={`px-2 py-1 rounded text-[11px] font-medium transition-colors flex items-center gap-1 ${
              unverifiedOnly
                ? 'bg-black/80 text-amber-100 font-semibold'
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
            title="Filter: Highlight only unverified items needing inspection"
          >
            <Filter className="w-3 h-3" />
            <span>Unverified Only</span>
          </button>
        </div>

        {/* Zoom Controls */}
        <div className="bg-zinc-900/90 backdrop-blur-sm border border-zinc-700 rounded-lg p-1 flex items-center gap-1 shadow-md pointer-events-auto">
          <button
            onClick={() => setZoom((z) => Math.min(z * 1.25, 5.0))}
            className="p-1.5 text-zinc-300 hover:text-white rounded hover:bg-zinc-800"
            title="Zoom In (+)"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setZoom((z) => Math.max(z * 0.8, 0.15))}
            className="p-1.5 text-zinc-300 hover:text-white rounded hover:bg-zinc-800"
            title="Zoom Out (-)"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={handleResetZoom}
            className="p-1.5 text-zinc-300 hover:text-white rounded hover:bg-zinc-800"
            title="Fit to Screen (0)"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
          <span className="text-[10px] font-mono text-zinc-400 px-1.5">
            {Math.round(zoom * 100)}%
          </span>
        </div>
      </div>

      {/* Canvas Viewport */}
      <div ref={containerRef} className="flex-1 w-full h-full relative overflow-hidden">
        <canvas
          ref={canvasRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onWheel={handleWheel}
          className={`w-full h-full ${
            currentTool === 'pan' || isPanning
              ? 'cursor-grab active:cursor-grabbing'
              : currentTool === 'add_node'
              ? 'cursor-crosshair'
              : currentTool === 'connect'
              ? 'cursor-pointer'
              : 'cursor-default'
          }`}
        />

        {/* Bottom Legend & Coordinates Bar */}
        <div className="absolute bottom-2 left-3 right-3 flex items-center justify-between text-[11px] text-zinc-400 font-mono pointer-events-none">
          <div className="flex items-center gap-3 bg-zinc-900/80 px-2.5 py-1 rounded border border-zinc-800">
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full bg-zinc-900 inline-block" />
              <span>AI Suggested</span>
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full bg-sky-500 inline-block" />
              <span>Geo Validated</span>
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" />
              <span>Human Verified</span>
            </span>
          </div>

          <div className="bg-zinc-900/80 px-2.5 py-1 rounded border border-zinc-800">
            X: {Math.round(mouseCanvasPos.x)}px &bull; Y: {Math.round(mouseCanvasPos.y)}px
            {floorPlan.scale_meters_per_pixel && (
              <span className="text-zinc-300 ml-1.5">
                ({(mouseCanvasPos.x * floorPlan.scale_meters_per_pixel).toFixed(1)}m,{' '}
                {(mouseCanvasPos.y * floorPlan.scale_meters_per_pixel).toFixed(1)}m)
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

