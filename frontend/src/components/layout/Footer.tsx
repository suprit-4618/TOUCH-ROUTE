import React from 'react';
import { Compass } from 'lucide-react';

export const Footer: React.FC = () => {
  return (
    <footer className="bg-zinc-950 text-zinc-400 border-t border-zinc-800 pt-16 pb-12 mt-20">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-10 pb-12 border-b border-zinc-850 border-zinc-800/80">
          {/* Column 1: Brand & Purpose */}
          <div className="md:col-span-2 space-y-4">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-zinc-900 text-zinc-100 flex items-center justify-center border border-zinc-800">
                <Compass className="w-4 h-4 stroke-[2]" />
              </div>
              <span className="font-semibold text-base text-zinc-100 tracking-tight">
                TouchRoute
              </span>
            </div>
            <p className="text-sm text-zinc-400 max-w-md leading-relaxed">
              TouchRoute turns building floor plans into accessible navigation with spoken directions and 3D tactile maps.
            </p>
          </div>

          {/* Column 2: Capabilities */}
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-300 mb-3">
              Capabilities
            </h4>
            <ul className="space-y-2 text-xs text-zinc-400">
              <li>Architectural Floor Plan Parsing</li>
              <li>Shortest-Path Graph Routing</li>
              <li>Turn-by-Turn Spoken Guidance</li>
              <li>3D Physical Tactile Maps (STL)</li>
              <li>Tactile Braille Signage</li>
              <li>Topology Verification Tools</li>
            </ul>
          </div>

          {/* Column 3: Approach */}
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-300 mb-3">
              Navigation Design
            </h4>
            <p className="text-xs text-zinc-400 leading-relaxed">
              Indoor routes are calculated from verified floor plan geometry and step-free transitions.
            </p>
            <p className="text-[11px] text-zinc-500 mt-3 font-mono">
              Version 1.0.0
            </p>
          </div>
        </div>

        <div className="pt-8 flex flex-col sm:flex-row items-center justify-between text-xs text-zinc-500 gap-4">
          <p>&copy; {new Date().getFullYear()} TouchRoute.</p>
          <div className="flex items-center gap-6">
            <span>Tactile 3D Models</span>
            <span>Spoken Guidance</span>
            <span>Keyboard Accessible</span>
          </div>
        </div>
      </div>
    </footer>
  );
};
