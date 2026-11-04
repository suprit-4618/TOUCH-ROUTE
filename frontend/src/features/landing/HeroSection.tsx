import React from 'react';
import { ArrowRight, Compass, Shield, Printer, Layers, MapPin, Volume2 } from 'lucide-react';
import { Button } from '../../components/ui/Button';

interface HeroSectionProps {
  onOpenWorkspace: () => void;
  onExploreDemo: () => void;
}

export const HeroSection: React.FC<HeroSectionProps> = ({
  onOpenWorkspace,
  onExploreDemo,
}) => {
  return (
    <section className="relative overflow-hidden pt-12 pb-20 md:pt-20 md:pb-28 border-b border-zinc-200 bg-white">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-10 items-center">
          
          {/* Left Column: Heading, Description & CTAs */}
          <div className="lg:col-span-7 space-y-6">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-zinc-100 text-zinc-900 border border-zinc-200 text-xs font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-zinc-900" />
              Indoor Navigation &amp; Tactile Wayfinding
            </div>

            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-zinc-950 tracking-tight leading-[1.12]">
              Navigate spaces with greater independence.
            </h1>

            <p className="text-base sm:text-lg text-zinc-600 leading-relaxed font-normal max-w-2xl">
              TouchRoute transforms architectural floor plans into verified indoor navigation experiences through deterministic spatial topology, dynamic voice guidance, and 3D physical tactile maps.
            </p>

            {/* Problem context */}
            <div className="p-4 rounded-xl bg-zinc-50 border border-zinc-200/90 text-zinc-700 text-xs sm:text-sm leading-relaxed max-w-2xl space-y-1">
              <p className="font-semibold text-zinc-950">
                The Indoor Wayfinding Challenge
              </p>
              <p className="text-zinc-600">
                Blind and visually impaired individuals encounter barriers inside unfamiliar buildings. TouchRoute turns architectural blueprints into verified non-visual routes and physical tactile maps.
              </p>
            </div>

            {/* Action buttons */}
            <div className="flex flex-wrap items-center gap-3 pt-1">
              <Button
                variant="primary"
                size="md"
                onClick={onOpenWorkspace}
                icon={<ArrowRight className="w-4 h-4 text-white" />}
              >
                Open Navigation
              </Button>
              <Button
                variant="outline"
                size="md"
                onClick={onExploreDemo}
                icon={<Layers className="w-4 h-4 text-zinc-600" />}
              >
                Manage Buildings
              </Button>
            </div>

            {/* Verification assurance badge */}
            <div className="flex items-center gap-6 pt-3 text-xs text-zinc-500 font-medium">
              <span className="flex items-center gap-1.5">
                <Shield className="w-4 h-4 text-zinc-700" />
                Deterministic Graph Safety
              </span>
              <span className="flex items-center gap-1.5">
                <Printer className="w-4 h-4 text-zinc-700" />
                ISO 21542 Tactile Standards
              </span>
            </div>
          </div>

          {/* Right Column: Architectural Elevation Preview Card */}
          <div className="lg:col-span-5">
            <div className="bg-white rounded-2xl p-6 shadow-xs border border-zinc-200 space-y-5">
              <div className="flex items-center justify-between pb-3 border-b border-zinc-100">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-zinc-900" />
                  <span className="text-xs font-semibold uppercase tracking-wider text-zinc-950">
                    Spatial Architecture
                  </span>
                </div>
                <span className="text-[11px] font-mono text-zinc-400">
                  Floor 1 Layout
                </span>
              </div>

              {/* Minimalist Vector Blueprint Representation */}
              <div className="p-4 rounded-xl bg-zinc-50 border border-zinc-200/80 space-y-3">
                <div className="flex items-center justify-between text-xs text-zinc-500 pb-1 border-b border-zinc-200/60 font-mono text-[11px]">
                  <span>ROUTE SEGMENT #1</span>
                  <span>14.5 METRES</span>
                </div>

                <div className="space-y-2 py-2">
                  <div className="flex items-center gap-3 p-2.5 bg-white rounded-lg border border-zinc-200 text-xs">
                    <div className="w-6 h-6 rounded-md bg-zinc-900 text-white flex items-center justify-center shrink-0">
                      <MapPin className="w-3.5 h-3.5" />
                    </div>
                    <div>
                      <span className="font-semibold text-zinc-950 block">Main Entrance</span>
                      <span className="text-[11px] text-zinc-500">Departure waypoint</span>
                    </div>
                  </div>

                  <div className="h-6 ml-3 pl-3 border-l-2 border-dashed border-zinc-300 flex items-center">
                    <span className="text-[10px] font-mono text-zinc-400">Corridor Walkway &bull; Step-Free</span>
                  </div>

                  <div className="flex items-center gap-3 p-2.5 bg-white rounded-lg border border-zinc-200 text-xs">
                    <div className="w-6 h-6 rounded-md bg-zinc-100 text-zinc-800 flex items-center justify-center shrink-0 border border-zinc-200">
                      <Volume2 className="w-3.5 h-3.5" />
                    </div>
                    <div>
                      <span className="font-semibold text-zinc-950 block">Central Reception</span>
                      <span className="text-[11px] text-zinc-500">Auditory waypoint</span>
                    </div>
                  </div>
                </div>

                <div className="p-3 bg-zinc-900 text-white rounded-lg text-xs space-y-1">
                  <span className="text-[10px] uppercase font-mono tracking-wider text-zinc-400 block">Spoken Prompt</span>
                  <p className="text-xs font-normal text-zinc-100 leading-snug">
                    "Walk straight ahead along the main corridor for fourteen metres. Keep to your left."
                  </p>
                </div>
              </div>

              {/* Physical Map Indicator */}
              <div className="flex items-center justify-between pt-1 text-xs text-zinc-500">
                <span className="flex items-center gap-1.5 font-medium text-zinc-700">
                  <Printer className="w-3.5 h-3.5 text-zinc-600" />
                  Tactile Relief &bull; UEB Braille
                </span>
                <span className="font-mono text-[11px]">STL / SVG / PDF</span>
              </div>
            </div>
          </div>

        </div>
      </div>
    </section>
  );
};
