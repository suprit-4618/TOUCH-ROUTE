import React, { useEffect, useState } from 'react';
import { AccessibilityProvider } from './context/AccessibilityContext';
import { SkipLink } from './components/ui/SkipLink';
import { Navbar, ProductExperienceView } from './components/layout/Navbar';
import { Footer } from './components/layout/Footer';
import { TouchRouteAccess } from './features/visitor/TouchRouteAccess';
import { LandingPage } from './pages/LandingPage';
import { DashboardOverview } from './features/dashboard/DashboardOverview';
import { ProjectDetailView } from './features/projects/ProjectDetailView';
import { TactileExperienceView } from './features/tactile/TactileExperienceView';
import { CreateProjectModal } from './features/dashboard/CreateProjectModal';
import { TactilePreviewModal } from './features/dashboard/TactilePreviewModal';
import { Project } from './types';

export const App: React.FC = () => {
  // Read initial query params
  const [currentView, setCurrentView] = useState<ProductExperienceView>(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const mode = params.get('mode');
      if (mode === 'admin') return 'admin';
      if (mode === 'tactile') return 'tactile';
      if (mode === 'landing') return 'landing';
      if (mode === 'visitor') return 'visitor';
    }
    // Default to TouchRoute Access (Primary Visitor Application)
    return 'visitor';
  });

  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [sampleTactileProject, setSampleTactileProject] = useState<Project | null>(null);

  const markerParam = typeof window !== 'undefined'
    ? new URLSearchParams(window.location.search).get('marker') || undefined
    : undefined;

  const handleNavigate = (view: 'visitor' | 'admin' | 'tactile' | 'landing') => {
    setCurrentView(view);
    if (view === 'admin') {
      setSelectedProjectId(null);
    }
    // Sync URL mode without reload
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.set('mode', view);
      window.history.pushState({}, '', url.toString());
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleInspectProject = (project: Project) => {
    setSelectedProjectId(project.id);
    setCurrentView('project-detail');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleOpenSampleTactile = () => {
    handleNavigate('tactile');
  };

  return (
    <AccessibilityProvider>
      <div className="min-h-screen flex flex-col bg-zinc-50 text-zinc-900">
        <SkipLink />

        <Navbar
          currentView={currentView}
          onNavigate={handleNavigate}
          onOpenCreateModal={() => setIsCreateModalOpen(true)}
        />

        <main id="main-content" className="flex-1 focus:outline-none" tabIndex={-1}>
          {/* 1. TouchRoute Access — Primary Mobile-First Voice-First Visitor Application */}
          {currentView === 'visitor' && (
            <TouchRouteAccess
              onOpenAdmin={() => handleNavigate('admin')}
              onOpenTactile={() => handleNavigate('tactile')}
              initialMarkerCode={markerParam}
            />
          )}

          {/* 2. TouchRoute Admin — Hospital Building Management & Spatial Verification */}
          {currentView === 'admin' && (
            <DashboardOverview
              onInspectProject={handleInspectProject}
            />
          )}

          {/* 2b. Project Detail (Admin Subview) */}
          {currentView === 'project-detail' && selectedProjectId && (
            <ProjectDetailView
              projectId={selectedProjectId}
              onBack={() => handleNavigate('admin')}
            />
          )}

          {/* 3. TouchRoute Tactile — Physical 3D Relief Studio & No-Smartphone Experience */}
          {currentView === 'tactile' && (
            <TactileExperienceView
              onBackToVisitor={() => handleNavigate('visitor')}
              onOpenAdmin={() => handleNavigate('admin')}
              initialProjectId={selectedProjectId || undefined}
            />
          )}

          {/* Overview / Landing Page */}
          {currentView === 'landing' && (
            <LandingPage
              onOpenWorkspace={() => handleNavigate('visitor')}
              onExploreDemo={() => handleNavigate('admin')}
              onOpenCreateModal={() => setIsCreateModalOpen(true)}
              onOpenTactileModal={handleOpenSampleTactile}
            />
          )}
        </main>

        <Footer />

        <CreateProjectModal
          isOpen={isCreateModalOpen}
          onClose={() => setIsCreateModalOpen(false)}
          onProjectCreated={(newProject) => {
            handleInspectProject(newProject);
          }}
        />

        <TactilePreviewModal
          isOpen={!!sampleTactileProject}
          onClose={() => setSampleTactileProject(null)}
          project={sampleTactileProject}
        />
      </div>
    </AccessibilityProvider>
  );
};

export default App;
