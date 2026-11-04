import React, { useState, useEffect } from 'react';
import {
  X,
  CheckCircle2,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  Save,
  Link,
  DoorOpen,
  MapPin,
  Compass,
  Accessibility,
  ArrowRight,
  Layers,
  Search,
} from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { SpatialEdge, SpatialNode, SpatialNodeUpdate } from '../../types';
import { useAccessibility } from '../../context/AccessibilityContext';

interface NodeInspectorProps {
  selectedNode: SpatialNode | null;
  nodes: SpatialNode[];
  edges: SpatialEdge[];
  onClose: () => void;
  onUpdateNode: (nodeId: string, updates: SpatialNodeUpdate) => Promise<void>;
  onDeleteNode: (nodeId: string) => Promise<void>;
  onDeleteEdge: (edgeId: string) => Promise<void>;
  onSelectNode: (node: SpatialNode) => void;
}

const NODE_TYPES: { value: string; label: string; icon: string }[] = [
  { value: 'room', label: 'Room / Office', icon: '🏢' },
  { value: 'corridor', label: 'Corridor / Hallway', icon: '🚶' },
  { value: 'door', label: 'Door / Passage', icon: '🚪' },
  { value: 'entrance', label: 'Main Entrance', icon: '🏛️' },
  { value: 'exit', label: 'Exit', icon: '🚪' },
  { value: 'emergency_exit', label: 'Emergency Exit', icon: '🚨' },
  { value: 'stairs', label: 'Stairwell', icon: '🪜' },
  { value: 'elevator', label: 'Elevator', icon: '🛗' },
  { value: 'restroom', label: 'Restroom', icon: '🚻' },
  { value: 'reception', label: 'Reception / Help Desk', icon: '💁' },
  { value: 'hazard', label: 'Hazard / Construction', icon: '⚠️' },
];

export const NodeInspector: React.FC<NodeInspectorProps> = ({
  selectedNode,
  nodes,
  edges,
  onClose,
  onUpdateNode,
  onDeleteNode,
  onDeleteEdge,
  onSelectNode,
}) => {
  const { announce, playFeedbackTone } = useAccessibility();

  // Local editing states
  const [label, setLabel] = useState<string>('');
  const [roomNumber, setRoomNumber] = useState<string>('');
  const [nodeType, setNodeType] = useState<string>('room');
  const [x, setX] = useState<number>(0);
  const [y, setY] = useState<number>(0);
  const [isAccessible, setIsAccessible] = useState<boolean>(true);
  const [notes, setNotes] = useState<string>('');
  const [saving, setSaving] = useState<boolean>(false);
  const [searchFilter, setSearchFilter] = useState<string>('');

  useEffect(() => {
    if (selectedNode) {
      setLabel(selectedNode.label);
      setRoomNumber(selectedNode.room_number || '');
      setNodeType(selectedNode.node_type);
      setX(Math.round(selectedNode.x));
      setY(Math.round(selectedNode.y));
      setIsAccessible(selectedNode.is_accessible);
      setNotes(selectedNode.notes || '');
    }
  }, [selectedNode]);

  const handleSave = async () => {
    if (!selectedNode) return;
    setSaving(true);
    try {
      const updates: SpatialNodeUpdate = {
        label: label.trim() || 'Unnamed Space',
        room_number: roomNumber.trim() || undefined,
        node_type: nodeType,
        x,
        y,
        is_accessible: isAccessible,
        notes: notes.trim() || undefined,
      };
      await onUpdateNode(selectedNode.id, updates);
      playFeedbackTone('success');
      announce(`Node ${updates.label} updated.`);
    } finally {
      setSaving(false);
    }
  };

  const handleToggleVerification = async () => {
    if (!selectedNode) return;
    setSaving(true);
    try {
      const nextVerified = !selectedNode.is_user_verified;
      await onUpdateNode(selectedNode.id, {
        is_user_verified: nextVerified,
        detection_source: nextVerified ? 'manual_annotation' : selectedNode.detection_source,
      });
      playFeedbackTone('success');
      announce(
        nextVerified
          ? `Node ${selectedNode.label} marked as human verified.`
          : `Node ${selectedNode.label} unverified.`
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedNode) return;
    if (!window.confirm(`Delete spatial element "${selectedNode.label}"?`)) return;
    try {
      await onDeleteNode(selectedNode.id);
      playFeedbackTone('click');
      announce('Spatial element deleted.');
      onClose();
    } catch (err) {
      console.error(err);
    }
  };

  // Connected edges for the selected node
  const connectedEdges = selectedNode
    ? edges.filter(
        (e) => e.source_node_id === selectedNode.id || e.target_node_id === selectedNode.id
      )
    : [];

  // Filtered nodes when no node is selected
  const filteredNodes = nodes.filter(
    (n) =>
      n.label.toLowerCase().includes(searchFilter.toLowerCase()) ||
      (n.room_number && n.room_number.toLowerCase().includes(searchFilter.toLowerCase())) ||
      n.node_type.toLowerCase().includes(searchFilter.toLowerCase())
  );

  if (!selectedNode) {
    return (
      <div className="bg-white border border-zinc-200 rounded-xl p-4 flex flex-col h-full space-y-4">
        <div>
          <h2 className="text-sm font-bold text-zinc-900 tracking-tight flex items-center justify-between">
            <span>Spatial Entities ({nodes.length})</span>
            <span className="text-[11px] text-zinc-500 font-normal">
              {nodes.filter((n) => n.is_user_verified).length} Verified
            </span>
          </h2>
          <p className="text-[11px] text-zinc-500 mt-0.5">
            Select an element on the canvas to inspect, rename, reposition, or verify.
          </p>
        </div>

        {/* Quick Search */}
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-2.5 top-2.5" />
          <input
            type="text"
            placeholder="Filter spaces by name or room..."
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-xs border border-zinc-200 rounded-lg focus:ring-2 focus:ring-zinc-900 focus:outline-none"
          />
        </div>

        {/* Node List */}
        <div className="flex-1 overflow-y-auto space-y-1.5 max-h-[460px] pr-1">
          {filteredNodes.length === 0 ? (
            <div className="p-4 text-center text-xs text-zinc-400">
              No matching spatial entities found.
            </div>
          ) : (
            filteredNodes.map((n) => (
              <button
                key={n.id}
                onClick={() => onSelectNode(n)}
                className="w-full text-left p-2.5 rounded-lg border border-zinc-100 hover:border-zinc-300 hover:bg-zinc-50 transition-colors flex items-center justify-between group"
              >
                <div className="min-w-0 pr-2">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-semibold text-zinc-900 truncate">
                      {n.label}
                    </span>
                    {n.room_number && (
                      <span className="text-[10px] font-mono px-1 py-0.2 bg-zinc-100 text-zinc-600 rounded">
                        #{n.room_number}
                      </span>
                    )}
                  </div>
                  <div className="text-[10px] text-zinc-500 capitalize flex items-center gap-1">
                    <span>{n.node_type}</span>
                    <span>&bull;</span>
                    <span>({Math.round(n.x)}, {Math.round(n.y)})</span>
                  </div>
                </div>

                <div className="shrink-0 flex items-center gap-1.5">
                  {n.is_user_verified ? (
                    <span title="Human Verified" className="text-emerald-600">
                      <ShieldCheck className="w-3.5 h-3.5" />
                    </span>
                  ) : n.is_geometry_validated ? (
                    <span title="Geometry Validated" className="text-blue-600">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                    </span>
                  ) : (
                    <span title="AI Suggestion (Unverified)" className="text-zinc-700">
                      <ShieldAlert className="w-3.5 h-3.5" />
                    </span>
                  )}
                  <ArrowRight className="w-3.5 h-3.5 text-zinc-300 group-hover:text-zinc-700 transition-colors" />
                </div>
              </button>
            ))
          )}
        </div>
      </div>
    );
  }

  // Selected Node Inspector
  return (
    <div className="bg-white border border-zinc-200 rounded-xl p-4 flex flex-col h-full space-y-4">
      {/* Top Header */}
      <div className="flex items-center justify-between pb-3 border-b border-zinc-200">
        <div>
          <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-400">
            Selected Entity
          </span>
          <h2 className="text-sm font-bold text-zinc-900 truncate max-w-[200px]">
            {selectedNode.label}
          </h2>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded-lg hover:bg-zinc-100 text-zinc-400 hover:text-zinc-700"
          aria-label="Close Inspector"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Verification State Banner */}
      <div
        className={`p-3 rounded-lg border text-xs flex items-center justify-between ${
          selectedNode.is_user_verified
            ? 'bg-emerald-50 border-emerald-200 text-emerald-950'
            : selectedNode.is_geometry_validated
            ? 'bg-blue-50 border-blue-200 text-blue-950'
            : 'bg-zinc-50 border-zinc-200 text-zinc-950'
        }`}
      >
        <div className="flex items-center gap-2">
          {selectedNode.is_user_verified ? (
            <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
          ) : (
            <ShieldAlert className="w-4 h-4 text-zinc-800 shrink-0" />
          )}
          <div>
            <div className="font-semibold">
              {selectedNode.is_user_verified
                ? 'Human Verified'
                : selectedNode.is_geometry_validated
                ? 'Geometry Validated'
                : 'AI Suggestion (Unverified)'}
            </div>
            <div className="text-[10px] opacity-80">
              Confidence: {(selectedNode.confidence * 100).toFixed(0)}% &bull; Source: {selectedNode.detection_source}
            </div>
          </div>
        </div>

        <Button
          variant={selectedNode.is_user_verified ? 'ghost' : 'outline'}
          size="sm"
          onClick={handleToggleVerification}
          disabled={saving}
          className="text-xs shrink-0"
        >
          {selectedNode.is_user_verified ? 'Unverify' : 'Verify'}
        </Button>
      </div>

      {/* Form Fields */}
      <div className="space-y-3 flex-1 overflow-y-auto pr-1">
        <div>
          <label htmlFor="node-label" className="block text-xs font-semibold text-zinc-700 mb-1">
            Label / Name
          </label>
          <input
            id="node-label"
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            className="w-full px-2.5 py-1.5 text-xs border border-zinc-300 rounded-lg focus:ring-2 focus:ring-zinc-900 focus:outline-none"
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label htmlFor="node-room" className="block text-xs font-semibold text-zinc-700 mb-1">
              Room #
            </label>
            <input
              id="node-room"
              type="text"
              placeholder="e.g. 104"
              value={roomNumber}
              onChange={(e) => setRoomNumber(e.target.value)}
              className="w-full px-2.5 py-1.5 text-xs border border-zinc-300 rounded-lg focus:ring-2 focus:ring-zinc-900 focus:outline-none"
            />
          </div>

          <div>
            <label htmlFor="node-type" className="block text-xs font-semibold text-zinc-700 mb-1">
              Classification
            </label>
            <select
              id="node-type"
              value={nodeType}
              onChange={(e) => setNodeType(e.target.value)}
              className="w-full px-2.5 py-1.5 text-xs border border-zinc-300 rounded-lg focus:ring-2 focus:ring-zinc-900 focus:outline-none bg-white"
            >
              {NODE_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.icon} {t.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label htmlFor="node-x" className="block text-xs font-semibold text-zinc-700 mb-1">
              Center X (px)
            </label>
            <input
              id="node-x"
              type="number"
              value={x}
              onChange={(e) => setX(parseInt(e.target.value) || 0)}
              className="w-full px-2.5 py-1.5 text-xs border border-zinc-300 rounded-lg font-mono focus:ring-2 focus:ring-zinc-900 focus:outline-none"
            />
          </div>
          <div>
            <label htmlFor="node-y" className="block text-xs font-semibold text-zinc-700 mb-1">
              Center Y (px)
            </label>
            <input
              id="node-y"
              type="number"
              value={y}
              onChange={(e) => setY(parseInt(e.target.value) || 0)}
              className="w-full px-2.5 py-1.5 text-xs border border-zinc-300 rounded-lg font-mono focus:ring-2 focus:ring-zinc-900 focus:outline-none"
            />
          </div>
        </div>

        {selectedNode.bounding_box && (
          <div className="p-2.5 bg-zinc-50 rounded-lg border border-zinc-200 text-[11px] text-zinc-600 space-y-1">
            <span className="font-semibold text-zinc-800">Bounding Box (Original Space):</span>
            <div className="font-mono text-zinc-700">
              {Math.round(selectedNode.bounding_box.min_x)} &times; {Math.round(selectedNode.bounding_box.min_y)} to{' '}
              {Math.round(selectedNode.bounding_box.max_x)} &times; {Math.round(selectedNode.bounding_box.max_y)}
            </div>
            <div className="text-[10px] text-zinc-500">
              Width: {Math.round(selectedNode.bounding_box.max_x - selectedNode.bounding_box.min_x)}px &bull;
              Height: {Math.round(selectedNode.bounding_box.max_y - selectedNode.bounding_box.min_y)}px
            </div>
          </div>
        )}

        {/* Step-Free Accessible */}
        <label className="flex items-center gap-2 cursor-pointer pt-1 select-none">
          <input
            type="checkbox"
            checked={isAccessible}
            onChange={(e) => setIsAccessible(e.target.checked)}
            className="w-4 h-4 text-zinc-800 rounded border-zinc-300 focus:ring-zinc-900"
          />
          <span className="text-xs font-semibold text-zinc-700 flex items-center gap-1.5">
            <Accessibility className="w-3.5 h-3.5 text-zinc-500" />
            Step-Free Accessible Waypoint
          </span>
        </label>

        {/* Notes */}
        <div>
          <label htmlFor="node-notes" className="block text-xs font-semibold text-zinc-700 mb-1">
            Accessibility Notes
          </label>
          <input
            id="node-notes"
            type="text"
            placeholder="e.g. Braille plaque on right side of door"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full px-2.5 py-1.5 text-xs border border-zinc-300 rounded-lg focus:ring-2 focus:ring-zinc-900 focus:outline-none"
          />
        </div>

        {/* Connected Edges */}
        <div className="pt-2 border-t border-zinc-200">
          <span className="text-xs font-semibold text-zinc-800 flex items-center gap-1.5 mb-2">
            <Link className="w-3.5 h-3.5 text-zinc-500" />
            Connected Paths ({connectedEdges.length})
          </span>

          {connectedEdges.length === 0 ? (
            <p className="text-[11px] text-zinc-400">
              No connections. Use the Connect Tool to link this element to corridors or doors.
            </p>
          ) : (
            <div className="space-y-1.5">
              {connectedEdges.map((e) => {
                const targetId = e.source_node_id === selectedNode.id ? e.target_node_id : e.source_node_id;
                const targetNode = nodes.find((n) => n.id === targetId);
                return (
                  <div
                    key={e.id}
                    className="p-2 rounded-lg bg-zinc-50 border border-zinc-200 flex items-center justify-between text-[11px]"
                  >
                    <div className="truncate mr-2">
                      <span className="font-semibold text-zinc-800">
                        {targetNode ? targetNode.label : 'Adjacent Space'}
                      </span>
                      <div className="text-[10px] text-zinc-500 capitalize">
                        {e.connection_type} &bull; {e.distance_meters.toFixed(1)}m
                        {e.is_user_verified ? ' &bull; Verified' : ' &bull; Unverified'}
                      </div>
                    </div>
                    <button
                      onClick={() => onDeleteEdge(e.id)}
                      className="p-1 text-zinc-400 hover:text-red-600 transition-colors"
                      title="Remove Connection"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Action Footer */}
      <div className="pt-3 border-t border-zinc-200 flex items-center justify-between gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={handleDelete}
          icon={<Trash2 className="w-3.5 h-3.5 text-red-600" />}
          className="text-red-700 hover:bg-red-50 text-xs"
        >
          Delete
        </Button>

        <Button
          variant="primary"
          size="sm"
          onClick={handleSave}
          disabled={saving}
          icon={<Save className="w-3.5 h-3.5" />}
          className="text-xs"
        >
          {saving ? 'Saving...' : 'Save Changes'}
        </Button>
      </div>
    </div>
  );
};

