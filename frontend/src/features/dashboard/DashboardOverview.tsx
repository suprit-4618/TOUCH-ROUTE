import React, { useEffect, useState } from 'react';
import {
  Plus,
  Search,
  Layers,
  RefreshCw,
  Loader2,
} from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { ProjectCard } from './ProjectCard';
import { CreateProjectModal } from './CreateProjectModal';
import { RouteCalculatorModal } from './RouteCalculatorModal';
import { TactilePreviewModal } from './TactilePreviewModal';
import { api } from '../../services/api';
import { Project } from '../../types';
import { useAccessibility } from '../../context/AccessibilityContext';

interface DashboardOverviewProps {
  onOpenUpload?: (project: Project) => void;
  onInspectProject?: (project: Project) => void;
}

export const DashboardOverview: React.FC<DashboardOverviewProps> = ({
  onOpenUpload,
  onInspectProject,
}) => {
  const { announce } = useAccessibility();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [filterMode, setFilterMode] = useState<'all' | 'verified' | 'review'>('all');

  // Modals state
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [selectedRouteProject, setSelectedRouteProject] = useState<Project | null>(null);
  const [selectedTactileProject, setSelectedTactileProject] = useState<Project | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const projList = await api.getProjects(false);
      setProjects(projList);
      announce(`${projList.length} buildings loaded.`);
    } catch (err) {
      console.error('Failed to load buildings:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleProjectCreated = (newProject: Project) => {
    setProjects((prev) => [newProject, ...prev]);
  };

  const filteredProjects = projects.filter((p) => {
    const matchesSearch =
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.building_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (p.address && p.address.toLowerCase().includes(searchQuery.toLowerCase()));

    if (!matchesSearch) return false;
    if (filterMode === 'verified') return p.status === 'verified';
    if (filterMode === 'review') return p.status !== 'verified';
    return true;
  });

  return (
    <div className="py-8 bg-zinc-50 min-h-screen">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 space-y-6">
        
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-zinc-200">
          <div>
            <h1 className="text-2xl font-bold text-zinc-950 tracking-tight">
              Buildings
            </h1>
            <p className="text-sm text-zinc-600 mt-1">
              Manage facilities, architectural floor plans, verified pathways, and tactile maps.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={loadData}
              title="Refresh building list"
              icon={<RefreshCw className={`w-3.5 h-3.5 text-zinc-600 ${loading ? 'animate-spin' : ''}`} />}
            >
              Refresh
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => setIsCreateOpen(true)}
              icon={<Plus className="w-4 h-4 text-white" />}
            >
              Add Building
            </Button>
          </div>
        </div>

        {/* Filter & Search Bar */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search buildings by name or address..."
              className="w-full pl-10 pr-4 py-2 bg-white border border-zinc-200/90 rounded-lg text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:border-zinc-900 shadow-2xs"
            />
          </div>

          <div className="flex items-center gap-1 self-start sm:self-auto bg-zinc-100 p-1 rounded-lg border border-zinc-200/80">
            <button
              onClick={() => setFilterMode('all')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                filterMode === 'all'
                  ? 'bg-white text-zinc-950 shadow-2xs'
                  : 'text-zinc-600 hover:text-zinc-950'
              }`}
            >
              All ({projects.length})
            </button>
            <button
              onClick={() => setFilterMode('verified')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                filterMode === 'verified'
                  ? 'bg-white text-zinc-950 shadow-2xs'
                  : 'text-zinc-600 hover:text-zinc-950'
              }`}
            >
              Verified
            </button>
            <button
              onClick={() => setFilterMode('review')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                filterMode === 'review'
                  ? 'bg-white text-zinc-950 shadow-2xs'
                  : 'text-zinc-600 hover:text-zinc-950'
              }`}
            >
              In Review
            </button>
          </div>
        </div>

        {/* Buildings Grid */}
        {loading ? (
          <div className="py-20 flex flex-col items-center justify-center text-zinc-500 gap-3">
            <Loader2 className="w-6 h-6 animate-spin text-zinc-400" />
            <span className="text-sm">Loading buildings...</span>
          </div>
        ) : filteredProjects.length === 0 ? (
          <div className="py-16 text-center bg-white rounded-xl border border-zinc-200/80 p-8 space-y-3 shadow-2xs">
            <div className="w-12 h-12 rounded-xl bg-zinc-100 text-zinc-400 flex items-center justify-center mx-auto border border-zinc-200">
              <Layers className="w-6 h-6" />
            </div>
            <h3 className="text-base font-semibold text-zinc-900">
              No buildings found
            </h3>
            <p className="text-xs text-zinc-500 max-w-sm mx-auto">
              Add a building to upload architectural floor plans, or clear your search query.
            </p>
            <div className="pt-2 flex items-center justify-center gap-2">
              {searchQuery ? (
                <Button variant="outline" size="sm" onClick={() => setSearchQuery('')}>
                  Clear Filter
                </Button>
              ) : (
                <Button variant="primary" size="sm" onClick={() => setIsCreateOpen(true)} icon={<Plus className="w-4 h-4 text-white" />}>
                  Add Building
                </Button>
              )}
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {filteredProjects.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                onInspect={(p) => {
                  if (onInspectProject) {
                    onInspectProject(p);
                  } else {
                    setSelectedRouteProject(p);
                  }
                }}
                onNavigateRoute={(p) => setSelectedRouteProject(p)}
                onTactilePreview={(p) => setSelectedTactileProject(p)}
              />
            ))}
          </div>
        )}

      </div>

      {/* Modals */}
      <CreateProjectModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        onProjectCreated={handleProjectCreated}
      />

      <RouteCalculatorModal
        isOpen={!!selectedRouteProject}
        onClose={() => setSelectedRouteProject(null)}
        project={selectedRouteProject}
      />

      <TactilePreviewModal
        isOpen={!!selectedTactileProject}
        onClose={() => setSelectedTactileProject(null)}
        project={selectedTactileProject}
      />
    </div>
  );
};
