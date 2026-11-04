import React, { useEffect, useState, useCallback } from 'react';
import {
  ArrowLeft,
  Sparkles,
  Layers,
  Undo2,
  Redo2,
  ShieldCheck,
  AlertCircle,
  Plus,
  RefreshCw,
  Building,
  CheckCircle2,
} from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { EditorCanvas, EditorTool } from './EditorCanvas';
import { NodeInspector } from './NodeInspector';
import { BatchVerificationBar } from './BatchVerificationBar';
import { AIExtractionModal } from './AIExtractionModal';
import { api } from '../../services/api';
import {
  BoundingBox,
  FloorPlanSummary,
  ProjectDetail,
  SpatialEdge,
  SpatialEdgeCreate,
  SpatialNode,
  SpatialNodeCreate,
  SpatialNodeUpdate,
} from '../../types';
import { useAccessibility } from '../../context/AccessibilityContext';

interface SpatialMapEditorProps {
  projectId: string;
  onBack: () => void;
  initialFloorPlanId?: string;
}

interface HistoryState {
  nodes: SpatialNode[];
  edges: SpatialEdge[];
}

export const SpatialMapEditor: React.FC<SpatialMapEditorProps> = ({
  projectId,
  onBack,
  initialFloorPlanId,
}) => {
  const { announce, playFeedbackTone } = useAccessibility();

  // Project and Floor Plans
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [activeFloorPlanId, setActiveFloorPlanId] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Spatial Elements
  const [nodes, setNodes] = useState<SpatialNode[]>([]);
  const [edges, setEdges] = useState<SpatialEdge[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  // Active Tool
  const [currentTool, setCurrentTool] = useState<EditorTool>('select');

  // AI Extraction Modal
  const [showAIModal, setShowAIModal] = useState<boolean>(false);

  // Undo / Redo history
  const [history, setHistory] = useState<HistoryState[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);

  // Load project details and spatial nodes
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const proj = await api.getProjectDetail(projectId);
      setProject(proj);

      const targetPlanId =
        initialFloorPlanId || (proj.floor_plans.length > 0 ? proj.floor_plans[0].id : null);
      setActiveFloorPlanId(targetPlanId);

      if (targetPlanId) {
        const [nodeList, edgeList] = await Promise.all([
          api.getSpatialNodes(projectId, targetPlanId),
          api.getSpatialEdges(projectId),
        ]);
        setNodes(nodeList);
        setEdges(edgeList);
        setHistory([{ nodes: nodeList, edges: edgeList }]);
        setHistoryIndex(0);
      }
    } catch (err: unknown) {
      console.error('Failed to load spatial editor data:', err);
      setError('Unable to load building spatial representation.');
    } finally {
      setLoading(false);
    }
  }, [projectId, initialFloorPlanId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Push state to undo stack
  const pushHistory = (newNodes: SpatialNode[], newEdges: SpatialEdge[]) => {
    const nextHistory = history.slice(0, historyIndex + 1);
    nextHistory.push({ nodes: newNodes, edges: newEdges });
    // Keep max 20 undo states
    if (nextHistory.length > 20) nextHistory.shift();
    setHistory(nextHistory);
    setHistoryIndex(nextHistory.length - 1);
  };

  const handleUndo = () => {
    if (historyIndex > 0) {
      const prevState = history[historyIndex - 1];
      setNodes(prevState.nodes);
      setEdges(prevState.edges);
      setHistoryIndex(historyIndex - 1);
      playFeedbackTone('click');
      announce('Undo previous action.');
    }
  };

  const handleRedo = () => {
    if (historyIndex < history.length - 1) {
      const nextState = history[historyIndex + 1];
      setNodes(nextState.nodes);
      setEdges(nextState.edges);
      setHistoryIndex(historyIndex + 1);
      playFeedbackTone('click');
      announce('Redo action.');
    }
  };

  // Keyboard shortcut listener for undo/redo
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        if (e.shiftKey) {
          handleRedo();
        } else {
          handleUndo();
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
        handleRedo();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [historyIndex, history]);

  // Switch floor plan tab
  const handleSelectFloorPlan = async (fpId: string) => {
    setActiveFloorPlanId(fpId);
    setSelectedNodeId(null);
    try {
      const [nodeList, edgeList] = await Promise.all([
        api.getSpatialNodes(projectId, fpId),
        api.getSpatialEdges(projectId),
      ]);
      setNodes(nodeList);
      setEdges(edgeList);
      setHistory([{ nodes: nodeList, edges: edgeList }]);
      setHistoryIndex(0);
      playFeedbackTone('click');
    } catch (err) {
      console.error('Failed to switch floor plan:', err);
    }
  };

  const activeFloorPlan = project?.floor_plans.find((fp) => fp.id === activeFloorPlanId) || null;

  // Move Node
  const handleMoveNode = async (nodeId: string, newX: number, newY: number) => {
    const updated = nodes.map((n) => (n.id === nodeId ? { ...n, x: newX, y: newY } : n));
    setNodes(updated);
    // Debounced or direct API update
    try {
      await api.updateSpatialNode(nodeId, { x: newX, y: newY });
    } catch (err) {
      console.error('Failed to sync node move:', err);
    }
  };

  // Resize Bounding Box
  const handleResizeNodeBox = async (nodeId: string, newBox: BoundingBox) => {
    const updated = nodes.map((n) => (n.id === nodeId ? { ...n, bounding_box: newBox } : n));
    setNodes(updated);
    pushHistory(updated, edges);
    try {
      await api.updateSpatialNode(nodeId, { bounding_box: newBox });
    } catch (err) {
      console.error('Failed to sync box resize:', err);
    }
  };

  // Add new node by clicking canvas
  const handleAddNodeAt = async (x: number, y: number) => {
    if (!activeFloorPlan) return;
    const count = nodes.length + 1;
    const newNodeData: SpatialNodeCreate = {
      project_id: projectId,
      floor_plan_id: activeFloorPlan.id,
      level_number: activeFloorPlan.level_number || 1,
      level_name: activeFloorPlan.level_name || 'Ground Floor',
      label: `Space ${count}`,
      node_type: 'room',
      x,
      y,
      bounding_box: {
        min_x: x - 40,
        min_y: y - 30,
        max_x: x + 40,
        max_y: y + 30,
      },
      detection_source: 'manual_annotation',
      is_geometry_validated: true,
      is_user_verified: true, // Manual additions are human-verified by default
      confidence: 1.0,
      is_accessible: true,
    };

    try {
      const created = await api.createSpatialNode(newNodeData);
      const nextNodes = [...nodes, created];
      setNodes(nextNodes);
      pushHistory(nextNodes, edges);
      setSelectedNodeId(created.id);
      playFeedbackTone('success');
      announce(`Added new space at coordinate ${x}, ${y}.`);
    } catch (err) {
      console.error('Failed to create node:', err);
    }
  };

  // Connect two nodes
  const handleConnectNodes = async (sourceId: string, targetId: string) => {
    const source = nodes.find((n) => n.id === sourceId);
    const target = nodes.find((n) => n.id === targetId);
    if (!source || !target || !activeFloorPlan) return;

    // Check if edge already exists
    const exists = edges.some(
      (e) =>
        (e.source_node_id === sourceId && e.target_node_id === targetId) ||
        (e.source_node_id === targetId && e.target_node_id === sourceId)
    );
    if (exists) {
      announce('These two spaces are already connected.');
      return;
    }

    const dx = target.x - source.x;
    const dy = target.y - source.y;
    const scale = activeFloorPlan.scale_meters_per_pixel || 0.05;
    const dist = Math.sqrt(dx * dx + dy * dy) * scale;

    const newEdgeData: SpatialEdgeCreate = {
      project_id: projectId,
      floor_plan_id: activeFloorPlan.id,
      source_node_id: sourceId,
      target_node_id: targetId,
      connection_type: 'door',
      distance_meters: Math.round(dist * 10) / 10,
      is_accessible: source.is_accessible && target.is_accessible,
      is_bidirectional: true,
      level_number: activeFloorPlan.level_number || 1,
      is_inter_floor: false,
      confidence: 1.0,
      detection_source: 'manual_annotation',
      is_user_verified: true,
    };

    try {
      const created = await api.createSpatialEdge(newEdgeData);
      const nextEdges = [...edges, created];
      setEdges(nextEdges);
      pushHistory(nodes, nextEdges);
      playFeedbackTone('success');
      announce(`Connected ${source.label} to ${target.label}.`);
    } catch (err) {
      console.error('Failed to create edge:', err);
    }
  };

  // Update node in inspector
  const handleUpdateNode = async (nodeId: string, updates: SpatialNodeUpdate) => {
    try {
      const updatedNode = await api.updateSpatialNode(nodeId, updates);
      const nextNodes = nodes.map((n) => (n.id === nodeId ? updatedNode : n));
      setNodes(nextNodes);
      pushHistory(nextNodes, edges);
    } catch (err) {
      console.error('Failed to update node:', err);
      throw err;
    }
  };

  // Delete node
  const handleDeleteNode = async (nodeId: string) => {
    try {
      await api.deleteSpatialNode(nodeId);
      const nextNodes = nodes.filter((n) => n.id !== nodeId);
      const nextEdges = edges.filter(
        (e) => e.source_node_id !== nodeId && e.target_node_id !== nodeId
      );
      setNodes(nextNodes);
      setEdges(nextEdges);
      pushHistory(nextNodes, nextEdges);
      setSelectedNodeId(null);
    } catch (err) {
      console.error('Failed to delete node:', err);
      throw err;
    }
  };

  // Delete edge
  const handleDeleteEdge = async (edgeId: string) => {
    try {
      await api.deleteSpatialEdge(edgeId);
      const nextEdges = edges.filter((e) => e.id !== edgeId);
      setEdges(nextEdges);
      pushHistory(nodes, nextEdges);
    } catch (err) {
      console.error('Failed to delete edge:', err);
    }
  };

  // Batch verify geometry-validated elements
  const handleVerifyGeometryValidated = async () => {
    if (!activeFloorPlan) return;
    try {
      await api.batchVerify({
        project_id: projectId,
        floor_plan_id: activeFloorPlan.id,
        verify_all_geometry_validated: true,
        verify_associated_edges: true,
      });
      // Refresh nodes
      const [freshNodes, freshEdges] = await Promise.all([
        api.getSpatialNodes(projectId, activeFloorPlan.id),
        api.getSpatialEdges(projectId),
      ]);
      setNodes(freshNodes);
      setEdges(freshEdges);
      pushHistory(freshNodes, freshEdges);
    } catch (err) {
      console.error('Failed to batch verify:', err);
    }
  };

  // Batch verify all
  const handleVerifyAll = async () => {
    if (!activeFloorPlan) return;
    try {
      const allIds = nodes.map((n) => n.id);
      await api.batchVerify({
        project_id: projectId,
        floor_plan_id: activeFloorPlan.id,
        node_ids: allIds,
        verify_associated_edges: true,
      });
      const [freshNodes, freshEdges] = await Promise.all([
        api.getSpatialNodes(projectId, activeFloorPlan.id),
        api.getSpatialEdges(projectId),
      ]);
      setNodes(freshNodes);
      setEdges(freshEdges);
      pushHistory(freshNodes, freshEdges);
    } catch (err) {
      console.error('Failed to verify all:', err);
    }
  };

  const selectedNode = nodes.find((n) => n.id === selectedNodeId) || null;
  const verifiedCount = nodes.filter((n) => n.is_user_verified).length;
  const geoCount = nodes.filter((n) => n.is_geometry_validated && !n.is_user_verified).length;

  if (loading) {
    return (
      <div className="py-24 text-center text-zinc-500 space-y-3">
        <div className="w-8 h-8 rounded-full border-2 border-zinc-800 border-t-transparent animate-spin mx-auto" />
        <p className="text-sm font-medium">Loading spatial intelligence canvas...</p>
      </div>
    );
  }

  return (
    <div className="py-6 bg-zinc-50 min-h-screen">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
        
        {/* Top Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-zinc-200">
          <div>
            <Button
              variant="ghost"
              size="sm"
              onClick={onBack}
              icon={<ArrowLeft className="w-4 h-4 text-zinc-700" />}
              className="-ml-2 mb-1.5 text-zinc-600"
            >
              Back to Building Overview
            </Button>
            <h1 className="text-2xl font-bold text-zinc-900 tracking-tight flex items-center gap-2">
              Interactive Spatial Map Editor
            </h1>
            <p className="text-xs text-zinc-600 mt-0.5 flex items-center gap-2">
              <span>Building: <strong className="text-zinc-900">{project?.building_name}</strong></span>
              <span>&bull;</span>
              <span>Floor Level: <strong className="text-zinc-900">{activeFloorPlan?.level_name || 'Ground Level'}</strong></span>
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Undo / Redo */}
            <div className="flex items-center bg-white border border-zinc-200 rounded-lg p-0.5">
              <button
                onClick={handleUndo}
                disabled={historyIndex <= 0}
                className="p-1.5 text-zinc-600 hover:text-zinc-900 disabled:opacity-30 disabled:cursor-not-allowed rounded"
                title="Undo (Ctrl+Z)"
                aria-label="Undo"
              >
                <Undo2 className="w-4 h-4" />
              </button>
              <button
                onClick={handleRedo}
                disabled={historyIndex >= history.length - 1}
                className="p-1.5 text-zinc-600 hover:text-zinc-900 disabled:opacity-30 disabled:cursor-not-allowed rounded"
                title="Redo (Ctrl+Y)"
                aria-label="Redo"
              >
                <Redo2 className="w-4 h-4" />
              </button>
            </div>

            {/* Run AI Analysis Button */}
            {activeFloorPlan && (
              <Button
                variant="accent"
                size="md"
                onClick={() => setShowAIModal(true)}
                icon={<Sparkles className="w-4 h-4 text-white" />}
              >
                Run AI Spatial Analysis
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

        {/* Multi-Floor Selector Bar */}
        {project && project.floor_plans.length > 0 && (
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            <span className="text-xs font-semibold text-zinc-700 mr-1 flex items-center gap-1.5 shrink-0">
              <Building className="w-3.5 h-3.5 text-zinc-500" />
              Floor Levels:
            </span>
            {project.floor_plans.map((fp) => (
              <button
                key={fp.id}
                onClick={() => handleSelectFloorPlan(fp.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors flex items-center gap-1.5 shrink-0 ${
                  activeFloorPlanId === fp.id
                    ? 'bg-zinc-900 text-zinc-50 border-zinc-900 shadow-sm'
                    : 'bg-white text-zinc-700 border-zinc-200 hover:bg-zinc-100'
                }`}
              >
                <span>{fp.name}</span>
                <span className="text-[10px] opacity-70">
                  (Level {fp.level_number || 1})
                </span>
              </button>
            ))}
          </div>
        )}

        {/* Verification Status & Batch Verification */}
        {activeFloorPlan && nodes.length > 0 && (
          <BatchVerificationBar
            totalNodes={nodes.length}
            verifiedNodes={verifiedCount}
            geometryValidatedNodes={geoCount}
            onVerifyGeometryValidated={handleVerifyGeometryValidated}
            onVerifyAll={handleVerifyAll}
          />
        )}

        {/* Safety Warning Banner */}
        <div className="p-3 bg-zinc-100 border border-zinc-200 rounded-xl flex items-center justify-between text-xs text-zinc-700">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-700 shrink-0" />
            <span>
              <strong>Accessibility Routing Standard:</strong> Blind and visually impaired navigation routes strictly rely on human-confirmed geometry. Unverified AI suggestions are excluded from production wayfinding by default.
            </span>
          </div>
        </div>

        {/* Workspace Canvas & Inspector Layout */}
        {activeFloorPlan ? (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Canvas (8 cols on desktop) */}
            <div className="lg:col-span-8">
              <EditorCanvas
                floorPlan={activeFloorPlan}
                nodes={nodes}
                edges={edges}
                selectedNodeId={selectedNodeId}
                onSelectNode={(node) => setSelectedNodeId(node ? node.id : null)}
                onMoveNode={handleMoveNode}
                onResizeNodeBox={handleResizeNodeBox}
                onAddNodeAt={handleAddNodeAt}
                onConnectNodes={handleConnectNodes}
                currentTool={currentTool}
                setCurrentTool={setCurrentTool}
              />
            </div>

            {/* Node Inspector Drawer (4 cols on desktop) */}
            <div className="lg:col-span-4">
              <NodeInspector
                selectedNode={selectedNode}
                nodes={nodes}
                edges={edges}
                onClose={() => setSelectedNodeId(null)}
                onUpdateNode={handleUpdateNode}
                onDeleteNode={handleDeleteNode}
                onDeleteEdge={handleDeleteEdge}
                onSelectNode={(node) => setSelectedNodeId(node.id)}
              />
            </div>
          </div>
        ) : (
          <div className="py-16 text-center bg-white rounded-xl border border-dashed border-zinc-300 p-8 space-y-3">
            <Layers className="w-10 h-10 text-zinc-400 mx-auto" />
            <h3 className="text-base font-semibold text-zinc-800">
              No floor plan blueprints available
            </h3>
            <p className="text-xs text-zinc-500 max-w-sm mx-auto">
              Please upload an architectural blueprint before opening the spatial map editor.
            </p>
            <Button variant="accent" size="md" onClick={onBack}>
              Return to Project Studio
            </Button>
          </div>
        )}

        {/* AI Extraction Modal */}
        {activeFloorPlan && (
          <AIExtractionModal
            isOpen={showAIModal}
            onClose={() => setShowAIModal(false)}
            floorplanId={activeFloorPlan.id}
            floorplanName={activeFloorPlan.name}
            buildingName={project?.building_name || 'Building'}
            onExtractionSuccess={(res) => {
              // Refresh nodes and edges directly from response
              setNodes(res.nodes);
              setEdges(res.edges);
              pushHistory(res.nodes, res.edges);
            }}
          />
        )}

      </div>
    </div>
  );
};

