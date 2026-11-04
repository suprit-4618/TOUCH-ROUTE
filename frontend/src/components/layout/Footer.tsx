import React from 'react';
import { Compass, ShieldCheck, Layers } from 'lucide-react';

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
              TouchRoute transforms building floor plans into accessible navigation experiences through deterministic spatial topology, dynamic voice guidance, and 3D tactile maps.
            </p>
            <div className="flex items-center gap-2 pt-1">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-zinc-900 text-zinc-300 text-xs border border-zinc-800 font-medium">
                <ShieldCheck className="w-3.5 h-3.5 text-zinc-300" />
                WCAG 2.1 AAA Aligned
              </span>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-zinc-900 text-zinc-300 text-xs border border-zinc-800 font-medium">
                <Layers className="w-3.5 h-3.5 text-zinc-300" />
                Non-Visual First
              </span>
            </div>
          </div>

          {/* Column 2: Capabilities */}
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-300 mb-3">
              Capabilities
            </h4>
            <ul className="space-y-2 text-xs text-zinc-400">
              <li>Architectural Floor Plan Parsing</li>
              <li>Deterministic Dijkstra &amp; A* Routing</li>
              <li>Spoken Landmark Direction</li>
              <li>3D Physical Tactile Maps (STL)</li>
              <li>Standardized Braille Signage</li>
              <li>Verification Workflows</li>
            </ul>
          </div>

          {/* Column 3: Standards */}
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-300 mb-3">
              Standards &amp; Integrity
            </h4>
            <p className="text-xs text-zinc-400 leading-relaxed">
              Indoor routes are calculated strictly from verified architectural geometry. Planned routes are decoupled from physical sensor confirmations.
            </p>
            <p className="text-[11px] text-zinc-500 mt-3 font-mono">
              Version 1.0.0 &bull; Modular Speech Architecture
            </p>
          </div>
        </div>

        <div className="pt-8 flex flex-col sm:flex-row items-center justify-between text-xs text-zinc-500 gap-4">
          <p>&copy; {new Date().getFullYear()} TouchRoute Navigation Platform.</p>
          <div className="flex items-center gap-6">
            <span>ISO 21542 Tactile Standards</span>
            <span>ADA Title III Aligned</span>
            <span>Keyboard Accessible</span>
          </div>
        </div>
      </div>
    </footer>
  );
};
