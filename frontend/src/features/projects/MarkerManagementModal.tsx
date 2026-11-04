import React, { useState, useEffect } from 'react';
import {
  QrCode,
  X,
  Plus,
  Trash2,
  CheckCircle2,
  AlertCircle,
  MapPin,
  Printer,
  ShieldCheck,
} from 'lucide-react';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { api } from '../../services/api';
import { LocationMarker, ProjectDetail, SpatialNode } from '../../types';

interface MarkerManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
  project: ProjectDetail;
  onMarkersUpdated?: () => void;
}

export const MarkerManagementModal: React.FC<MarkerManagementModalProps> = ({
  isOpen,
  onClose,
  project,
  onMarkersUpdated,
}) => {
  const [markers, setMarkers] = useState<LocationMarker[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [showCreateForm, setShowCreateForm] = useState<boolean>(false);
  const [selectedPlacard, setSelectedPlacard] = useState<LocationMarker | null>(null);

  // Form fields
  const [selectedNodeId, setSelectedNodeId] = useState<string>('');
  const [markerCode, setMarkerCode] = useState<string>('');
  const [markerType, setMarkerType] = useState<'nfc' | 'qr' | 'dual'>('dual');
  const [locationDesc, setLocationDesc] = useState<string>('');
  const [tactileDesc, setTactileDesc] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  const loadMarkers = async () => {
    setLoading(true);
    try {
      const data = await api.getProjectMarkers(project.id);
      setMarkers(data);
    } catch (err) {
      console.error('Failed to load markers:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadMarkers();
    }
  }, [isOpen, project.id]);

  const verifiedNodes = project.spatial_nodes.filter((n) => n.is_user_verified);

  const handleCreateMarker = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const node = project.spatial_nodes.find((n) => n.id === selectedNodeId);
    if (!node) {
      setError('Please select a verified node.');
      return;
    }
    if (!markerCode.trim()) {
      setError('Marker code is required.');
      return;
    }
    if (!locationDesc.trim()) {
      setError('Location description is required.');
      return;
    }

    try {
      await api.createMarker({
        project_id: project.id,
        spatial_node_id: node.id,
        floor_plan_id: node.floor_plan_id,
        marker_code: markerCode.trim().toUpperCase(),
        marker_type: markerType,
        level_number: node.level_number || 1,
        level_name: node.level_name || 'Ground Floor',
        location_description: locationDesc.trim(),
        tactile_identifier: tactileDesc.trim() || undefined,
        is_active: true,
      });

      setShowCreateForm(false);
      setSelectedNodeId('');
      setMarkerCode('');
      setLocationDesc('');
      setTactileDesc('');
      await loadMarkers();
      onMarkersUpdated?.();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to create marker.';
      setError(msg);
    }
  };

  const handleDelete = async (markerId: string) => {
    try {
      await api.deleteMarker(markerId);
      await loadMarkers();
      onMarkersUpdated?.();
    } catch (err) {
      console.error('Failed to delete marker:', err);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="NFC &amp; QR Location Access Markers"
      description={`Manage physical touchpoints installed at doorways and landmarks for ${project.name}.`}
      maxWidth="xl"
    >
      <div className="space-y-6">
        {/* Concept Banner */}
        <div className="p-3.5 bg-zinc-50 border border-zinc-200 rounded-xl text-xs text-zinc-950 flex items-start gap-2.5">
          <QrCode className="w-5 h-5 text-zinc-700 shrink-0 mt-0.5" />
          <div className="leading-relaxed">
            <strong className="text-zinc-950 block mb-0.5">Physical Access System Principle:</strong>
            Scanning an NFC tag or QR code establishes the visitor&apos;s verified starting position at that access point.
            Markers must be installed at standardized heights (140cm above finished floor) with tactile Braille identification.
          </div>
        </div>

        {/* Action Header */}
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-zinc-700">
            Registered Markers ({markers.length})
          </span>
          <Button
            variant="accent"
            size="sm"
            onClick={() => setShowCreateForm(!showCreateForm)}
            icon={<Plus className="w-4 h-4 text-white" />}
          >
            {showCreateForm ? 'Cancel' : 'New Marker'}
          </Button>
        </div>

        {/* New Marker Form */}
        {showCreateForm && (
          <form onSubmit={handleCreateMarker} className="p-4 bg-zinc-50 border border-zinc-200 rounded-xl space-y-4">
            <h4 className="font-bold text-sm text-zinc-900">Install New Location Marker</h4>

            {error && (
              <div className="p-2.5 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg">
                {error}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block font-semibold text-zinc-800 mb-1">
                  Verified Landmark Space *
                </label>
                <select
                  value={selectedNodeId}
                  onChange={(e) => {
                    setSelectedNodeId(e.target.value);
                    const n = verifiedNodes.find((vn) => vn.id === e.target.value);
                    if (n && !locationDesc) {
                      setLocationDesc(`${n.label} (${n.level_name || 'Ground Floor'})`);
                    }
                  }}
                  className="w-full px-3 py-2 bg-white border border-zinc-300 rounded-lg"
                  required
                >
                  <option value="">Select verified space...</option>
                  {verifiedNodes.map((n) => (
                    <option key={n.id} value={n.id}>
                      {n.label} &bull; {n.level_name || `Floor ${n.level_number}`} {n.room_number ? `(#${n.room_number})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-semibold text-zinc-800 mb-1">
                  Marker Code (e.g. TR-HOSP-G-ENT) *
                </label>
                <input
                  type="text"
                  value={markerCode}
                  onChange={(e) => setMarkerCode(e.target.value.toUpperCase())}
                  placeholder="TR-FACILITY-LEVEL-CODE"
                  className="w-full px-3 py-2 bg-white border border-zinc-300 rounded-lg font-mono"
                  required
                />
              </div>

              <div>
                <label className="block font-semibold text-zinc-800 mb-1">
                  Spoken Location Description *
                </label>
                <input
                  type="text"
                  value={locationDesc}
                  onChange={(e) => setLocationDesc(e.target.value)}
                  placeholder="e.g. Main Hospital Entrance, Ground Level"
                  className="w-full px-3 py-2 bg-white border border-zinc-300 rounded-lg"
                  required
                />
              </div>

              <div>
                <label className="block font-semibold text-zinc-800 mb-1">
                  Tactile Identification &amp; Height Notes
                </label>
                <input
                  type="text"
                  value={tactileDesc}
                  onChange={(e) => setTactileDesc(e.target.value)}
                  placeholder="e.g. Braille plaque at 140cm height on right door post"
                  className="w-full px-3 py-2 bg-white border border-zinc-300 rounded-lg"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" size="sm" type="button" onClick={() => setShowCreateForm(false)}>
                Cancel
              </Button>
              <Button variant="primary" size="sm" type="submit">
                Register Marker
              </Button>
            </div>
          </form>
        )}

        {/* Marker List */}
        <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
          {markers.length === 0 ? (
            <div className="p-8 text-center text-xs text-zinc-500">
              No markers registered yet. Create one above to establish verified NFC/QR access points.
            </div>
          ) : (
            markers.map((m) => (
              <div
                key={m.id}
                className="p-3.5 bg-white border border-zinc-200 rounded-xl flex items-center justify-between text-xs gap-3 shadow-2xs hover:border-zinc-400 transition-colors"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-zinc-900 bg-zinc-100 px-2 py-0.5 rounded text-[11px] border border-zinc-200">
                      {m.marker_code}
                    </span>
                    <Badge variant="success">
                      <ShieldCheck className="w-3 h-3 mr-1" />
                      {m.level_name}
                    </Badge>
                  </div>
                  <p className="font-semibold text-zinc-900 text-sm">{m.location_description}</p>
                  {m.tactile_identifier && (
                    <p className="text-[11px] text-zinc-500 italic">
                      Tactile: {m.tactile_identifier}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setSelectedPlacard(m)}
                    className="p-1.5 text-zinc-600 hover:text-zinc-900 bg-zinc-50 hover:bg-zinc-100 rounded-lg border border-zinc-200"
                    title="View Printable Placard"
                  >
                    <Printer className="w-4 h-4 text-zinc-700" />
                  </button>
                  <button
                    onClick={() => handleDelete(m.id)}
                    className="p-1.5 text-red-600 hover:text-red-800 bg-red-50 hover:bg-red-100 rounded-lg"
                    title="Delete Marker"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Printable Placard Preview Modal */}
        {selectedPlacard && (
          <div className="fixed inset-0 bg-zinc-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
            <div className="bg-white w-full max-w-sm rounded-2xl p-6 space-y-4 shadow-xl text-center">
              <div className="flex items-center justify-between border-b pb-2">
                <span className="text-xs font-bold text-zinc-500 uppercase tracking-wider">
                  Printable Marker Placard
                </span>
                <button onClick={() => setSelectedPlacard(null)}>
                  <X className="w-4 h-4 text-zinc-500" />
                </button>
              </div>

              {/* Placard Card Simulation */}
              <div className="p-6 bg-zinc-900 text-zinc-50 rounded-2xl border-4 border-zinc-500 space-y-4 text-center">
                <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-300 block">
                  TOUCHROUTE INDOOR ACCESS POINT
                </span>
                <div className="w-28 h-28 mx-auto bg-white rounded-xl p-2 flex items-center justify-center">
                  <QrCode className="w-24 h-24 text-zinc-900" />
                </div>
                <div className="space-y-1">
                  <span className="text-xl font-mono font-extrabold text-amber-300">
                    {selectedPlacard.marker_code}
                  </span>
                  <h4 className="font-bold text-sm text-zinc-100">
                    {selectedPlacard.location_description}
                  </h4>
                  <p className="text-[10px] text-zinc-400">
                    {selectedPlacard.level_name} &bull; Tap NFC or Scan with Camera
                  </p>
                </div>
                <div className="text-[9px] bg-zinc-800 p-2 rounded text-zinc-300 font-mono">
                  {selectedPlacard.tactile_identifier || 'Mount at 140cm height on right door frame'}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" size="sm" onClick={() => setSelectedPlacard(null)}>
                  Close
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => {
                    window.print();
                  }}
                  icon={<Printer className="w-4 h-4" />}
                >
                  Print Placard
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
};

