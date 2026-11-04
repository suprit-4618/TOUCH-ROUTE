import React from 'react';
import { Layers, Plus } from 'lucide-react';
import { Button } from '../../components/ui/Button';

interface CTAProps {
  onOpenWorkspace: () => void;
  onOpenCreateModal: () => void;
}

export const CallToActionSection: React.FC<CTAProps> = ({
  onOpenWorkspace,
  onOpenCreateModal,
}) => {
  return (
    <section className="py-20 bg-zinc-50 border-b border-zinc-200">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 text-center space-y-5">
        <h2 className="text-3xl sm:text-4xl font-bold text-zinc-950 tracking-tight">
          Make indoor spaces accessible today.
        </h2>
        <p className="text-zinc-600 text-sm sm:text-base max-w-xl mx-auto leading-relaxed">
          Upload an architectural floor plan, verify spatial entities, and generate accessible voice routes or physical 3D tactile maps.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
          <Button
            variant="primary"
            size="md"
            onClick={onOpenWorkspace}
            icon={<Layers className="w-4 h-4 text-white" />}
          >
            Launch Navigation
          </Button>
          <Button
            variant="outline"
            size="md"
            onClick={onOpenCreateModal}
            icon={<Plus className="w-4 h-4 text-zinc-700" />}
          >
            Add Building
          </Button>
        </div>
      </div>
    </section>
  );
};
