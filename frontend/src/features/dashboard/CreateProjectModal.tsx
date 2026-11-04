import React, { useState } from 'react';
import { PlusCircle, Loader2 } from 'lucide-react';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { api } from '../../services/api';
import { Project } from '../../types';
import { useAccessibility } from '../../context/AccessibilityContext';

interface CreateProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onProjectCreated: (project: Project) => void;
}

export const CreateProjectModal: React.FC<CreateProjectModalProps> = ({
  isOpen,
  onClose,
  onProjectCreated,
}) => {
  const { announce, playFeedbackTone } = useAccessibility();
  const [name, setName] = useState('');
  const [buildingName, setBuildingName] = useState('');
  const [address, setAddress] = useState('');
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !buildingName.trim()) {
      setError('Project name and Building name are required.');
      announce('Form error: Project name and Building name are required.');
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      const created = await api.createProject({
        name: name.trim(),
        building_name: buildingName.trim(),
        address: address.trim() || undefined,
        description: description.trim() || undefined,
        is_demo: false,
      });
      playFeedbackTone('success');
      announce(`Project "${created.name}" created successfully.`);
      onProjectCreated(created);
      onClose();
      // Reset form
      setName('');
      setBuildingName('');
      setAddress('');
      setDescription('');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to create project.';
      setError(msg);
      announce(`Failed to create project: ${msg}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Create New Navigation Project"
      description="Initialize a new building workspace for floor plan ingestion, spatial verification, and tactile mapping."
      maxWidth="md"
    >
      <form onSubmit={handleSubmit} className="space-y-4 text-zinc-800 text-sm">
        {error && (
          <div
            role="alert"
            className="p-3 bg-red-50 border border-red-200 text-red-800 text-xs rounded-lg font-medium"
          >
            {error}
          </div>
        )}

        <div>
          <label htmlFor="proj-name" className="block text-xs font-semibold text-zinc-900 mb-1">
            Project Name <span className="text-zinc-500">*</span>
          </label>
          <input
            id="proj-name"
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. County Courthouse - Ground Floor"
            className="w-full px-3 py-2 bg-zinc-50 border border-zinc-300 rounded-lg text-sm text-zinc-900 focus:bg-white focus:border-zinc-900 focus:outline-none"
          />
        </div>

        <div>
          <label htmlFor="proj-building" className="block text-xs font-semibold text-zinc-900 mb-1">
            Building Name <span className="text-zinc-500">*</span>
          </label>
          <input
            id="proj-building"
            type="text"
            required
            value={buildingName}
            onChange={(e) => setBuildingName(e.target.value)}
            placeholder="e.g. Municipal Justice Complex"
            className="w-full px-3 py-2 bg-zinc-50 border border-zinc-300 rounded-lg text-sm text-zinc-900 focus:bg-white focus:border-zinc-900 focus:outline-none"
          />
        </div>

        <div>
          <label htmlFor="proj-address" className="block text-xs font-semibold text-zinc-900 mb-1">
            Physical Address (Optional)
          </label>
          <input
            id="proj-address"
            type="text"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="e.g. 250 Civic Center Plaza, East Wing"
            className="w-full px-3 py-2 bg-zinc-50 border border-zinc-300 rounded-lg text-sm text-zinc-900 focus:bg-white focus:border-zinc-900 focus:outline-none"
          />
        </div>

        <div>
          <label htmlFor="proj-desc" className="block text-xs font-semibold text-zinc-900 mb-1">
            Description &amp; Accessibility Notes (Optional)
          </label>
          <textarea
            id="proj-desc"
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Specify known accessibility features such as automatic doors, tactile floor pavers, or auditory elevators..."
            className="w-full px-3 py-2 bg-zinc-50 border border-zinc-300 rounded-lg text-sm text-zinc-900 focus:bg-white focus:border-zinc-900 focus:outline-none resize-none"
          />
        </div>

        <div className="flex items-center justify-end gap-3 pt-4 border-t border-zinc-200">
          <Button type="button" variant="outline" size="md" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            size="md"
            disabled={isSubmitting}
            icon={isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <PlusCircle className="w-4 h-4 text-white" />}
          >
            {isSubmitting ? 'Creating Project...' : 'Create Project'}
          </Button>
        </div>
      </form>
    </Modal>
  );
};

