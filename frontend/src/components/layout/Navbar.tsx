import React from 'react';
import { Compass, Layers, Navigation, Printer, PlusCircle, Info } from 'lucide-react';
import { Button } from '../ui/Button';

export type ProductExperienceView = 'visitor' | 'admin' | 'tactile' | 'landing' | 'project-detail';

interface NavbarProps {
  currentView: ProductExperienceView;
  onNavigate: (view: 'visitor' | 'admin' | 'tactile' | 'landing') => void;
  onOpenCreateModal?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentView,
  onNavigate,
  onOpenCreateModal,
}) => {
  const isAdminActive = currentView === 'admin' || currentView === 'project-detail';

  const navItems = [
    { id: 'visitor' as const, label: 'Visitor', icon: <Navigation className="w-3.5 h-3.5" />, active: currentView === 'visitor' },
    { id: 'admin' as const, label: 'Buildings', icon: <Layers className="w-3.5 h-3.5" />, active: isAdminActive },
    { id: 'tactile' as const, label: 'Tactile Maps', icon: <Printer className="w-3.5 h-3.5" />, active: currentView === 'tactile' },
    { id: 'landing' as const, label: 'Overview', icon: <Info className="w-3.5 h-3.5" />, active: currentView === 'landing' },
  ];

  return (
    <>
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-xs border-b border-zinc-200/80">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-15 flex items-center justify-between gap-4">
          {/* Brand & Desktop Navigation */}
          <div className="flex items-center gap-6 min-w-0">
            <button
              onClick={() => onNavigate('visitor')}
              className="flex items-center gap-2.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 rounded-lg p-0.5"
              aria-label="TouchRoute Home"
            >
              <div className="w-7 h-7 rounded-md bg-zinc-950 flex items-center justify-center text-white shrink-0">
                <Compass className="w-4 h-4 stroke-[2.2]" />
              </div>
              <span className="font-semibold text-sm sm:text-base text-zinc-950 tracking-tight">
                TouchRoute
              </span>
            </button>

            <div className="hidden sm:block h-4 w-px bg-zinc-200" />

            {/* Desktop Navigation */}
            <nav aria-label="Main Navigation" className="hidden sm:flex items-center gap-1 text-xs font-medium">
              {navItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => onNavigate(item.id)}
                  className={`px-3 py-1.5 rounded-md transition-colors flex items-center gap-1.5 ${
                    item.active
                      ? 'text-zinc-950 font-semibold bg-zinc-100'
                      : 'text-zinc-600 hover:text-zinc-900 hover:bg-zinc-50'
                  }`}
                >
                  {item.icon}
                  <span>{item.label}</span>
                </button>
              ))}
            </nav>
          </div>

          {/* Right Action */}
          <div className="flex items-center gap-2">
            {isAdminActive && onOpenCreateModal && (
              <Button
                variant="primary"
                size="sm"
                onClick={onOpenCreateModal}
                icon={<PlusCircle className="w-3.5 h-3.5" />}
              >
                Add Building
              </Button>
            )}

            {currentView === 'landing' && (
              <Button
                variant="primary"
                size="sm"
                onClick={() => onNavigate('visitor')}
                icon={<Navigation className="w-3.5 h-3.5" />}
              >
                Open Navigator
              </Button>
            )}
          </div>
        </div>
      </header>

      {/* Mobile Aligned Bottom Bar */}
      <nav
        aria-label="Mobile Navigation"
        className="sm:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-xs border-t border-zinc-200 px-3 py-2 flex items-center justify-around"
      >
        {navItems.map((item) => (
          <button
            key={item.id}
            onClick={() => onNavigate(item.id)}
            className={`flex flex-col items-center gap-1 px-3 py-1 rounded-lg text-[11px] font-medium transition-colors ${
              item.active
                ? 'text-zinc-950 font-semibold bg-zinc-100'
                : 'text-zinc-500 hover:text-zinc-900'
            }`}
          >
            {item.icon}
            <span>{item.label}</span>
          </button>
        ))}
      </nav>
    </>
  );
};
