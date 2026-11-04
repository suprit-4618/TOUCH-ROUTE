import React from 'react';
import { MapPin, Navigation, Printer, Layers, ChevronRight, CheckCircle2 } from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Project } from '../../types';

interface ProjectCardProps {
  project: Project;
  onInspect: (project: Project) => void;
  onNavigateRoute: (project: Project) => void;
  onTactilePreview: (project: Project) => void;
}

export const ProjectCard: React.FC<ProjectCardProps> = ({
  project,
  onInspect,
  onNavigateRoute,
  onTactilePreview,
}) => {
  const isVerified = project.status === 'verified';

  return (
    <Card className="p-5 flex flex-col justify-between hover:border-zinc-400/80 transition-colors bg-white border border-zinc-200/80 rounded-xl shadow-2xs">
      <div className="space-y-3">
        {/* Header: Status and Date */}
        <div className="flex items-center justify-between gap-2">
          {isVerified ? (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-zinc-900 text-white">
              <span className="w-1.5 h-1.5 rounded-full bg-white" />
              Verified
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-zinc-100 text-zinc-700 border border-zinc-200">
              <span className="w-1.5 h-1.5 rounded-full bg-zinc-400" />
              In Review
            </span>
          )}
          <span className="text-xs text-zinc-400">
            {new Date(project.created_at).toLocaleDateString(undefined, {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            })}
          </span>
        </div>

        {/* Building Title & Address */}
        <div>
          <h3 className="text-base font-semibold text-zinc-950 tracking-tight leading-snug">
            {project.name}
          </h3>
          <p className="text-xs text-zinc-500 flex items-center gap-1 mt-1">
            <MapPin className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
            <span className="text-zinc-700 font-medium">{project.building_name}</span>
            {project.address && <span>&bull; {project.address}</span>}
          </p>
        </div>

        {/* Description */}
        {project.description && (
          <p className="text-xs text-zinc-600 line-clamp-2 leading-relaxed">
            {project.description}
          </p>
        )}

        {/* Clean summary row */}
        <div className="flex items-center gap-4 py-2 border-t border-zinc-100 text-xs text-zinc-600">
          <div>
            <span className="font-semibold text-zinc-900">{project.floor_plans_count || 1}</span>{' '}
            Floor Plan{(project.floor_plans_count || 1) > 1 ? 's' : ''}
          </div>
          <span className="text-zinc-300">&bull;</span>
          <div>
            <span className="font-semibold text-zinc-900">{project.verified_nodes_count}</span>{' '}
            Verified Room{project.verified_nodes_count === 1 ? '' : 's'}
          </div>
        </div>
      </div>

      {/* Primary and secondary actions */}
      <div className="pt-4 flex items-center justify-between gap-2 border-t border-zinc-100 mt-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => onInspect(project)}
          icon={<Layers className="w-3.5 h-3.5 text-zinc-600" />}
          className="text-xs font-medium"
        >
          Manage Building
        </Button>

        <div className="flex items-center gap-1.5">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onTactilePreview(project)}
            icon={<Printer className="w-3.5 h-3.5 text-zinc-600" />}
            title="Tactile Map"
            className="text-xs text-zinc-600 hover:text-zinc-900"
          >
            Tactile
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onNavigateRoute(project)}
            icon={<Navigation className="w-3.5 h-3.5 text-zinc-700" />}
            title="Preview Route"
            className="text-xs text-zinc-600 hover:text-zinc-900"
          >
            Route
          </Button>
        </div>
      </div>
    </Card>
  );
};
