import React from 'react';
import { ChevronRight } from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';

interface TactileSectionProps {
  onOpenTactileModal?: () => void;
}

export const TactileExplanationSection: React.FC<TactileSectionProps> = ({
  onOpenTactileModal,
}) => {
  return (
    <section id="tactile-mapping" className="py-20 bg-zinc-50 border-b border-zinc-200">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
          
          {/* Left Column: Technical explanation */}
          <div className="lg:col-span-7 space-y-6">
            <span className="text-xs font-semibold uppercase tracking-wider text-zinc-800 bg-zinc-100 px-2.5 py-1 rounded border border-zinc-200">
              Tactile Maps
            </span>

            <h2 className="text-3xl sm:text-4xl font-bold text-zinc-950 tracking-tight">
              3D Tactile Maps for Physical Exploration
            </h2>

            <p className="text-zinc-600 text-sm sm:text-base leading-relaxed">
              Tactile maps translate floor plan geometry into 3D relief surfaces with distinct elevation levels, allowing users to build a mental spatial layout with their fingertips before navigating.
            </p>

            {/* Dimensional and Relief standards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
              <div className="p-4 rounded-xl bg-white border border-zinc-200/90 shadow-2xs">
                <span className="text-xs font-mono font-semibold text-zinc-950 block mb-1">
                  WALL RELIEF (2.5 MM)
                </span>
                <p className="text-xs text-zinc-600 leading-relaxed">
                  Perimeter walls and partition boundaries are extruded 2.5mm above the baseplate for unambiguous finger identification.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-white border border-zinc-200/90 shadow-2xs">
                <span className="text-xs font-mono font-semibold text-zinc-950 block mb-1">
                  CORRIDOR PATHWAY (1.2 MM)
                </span>
                <p className="text-xs text-zinc-600 leading-relaxed">
                  Raised dashed lines guide finger tracing along accessible pathways without losing spatial orientation.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-white border border-zinc-200/90 shadow-2xs">
                <span className="text-xs font-mono font-semibold text-zinc-950 block mb-1">
                  BRAILLE LABELS
                </span>
                <p className="text-xs text-zinc-600 leading-relaxed">
                  Braille dot grid (0.8mm dot height, 2.5mm spacing) for tactile reading of room names and landmarks.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-white border border-zinc-200/90 shadow-2xs">
                <span className="text-xs font-mono font-semibold text-zinc-950 block mb-1">
                  3D PRINTABLE STL
                </span>
                <p className="text-xs text-zinc-600 leading-relaxed">
                  Watertight manifold mesh generation ready for standard FDM and resin 3D printers.
                </p>
              </div>
            </div>

            {onOpenTactileModal && (
              <div className="pt-2">
                <Button
                  variant="outline"
                  size="md"
                  onClick={onOpenTactileModal}
                  icon={<ChevronRight className="w-4 h-4 text-zinc-600" />}
                >
                  Open Tactile Preview
                </Button>
              </div>
            )}
          </div>

          {/* Right Column: Tactile Elevation Diagram */}
          <div className="lg:col-span-5">
            <Card className="p-6 bg-zinc-950 border border-zinc-800 text-zinc-200 rounded-2xl shadow-xs space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-zinc-850 border-zinc-800">
                <span className="text-xs font-semibold uppercase tracking-wider text-zinc-300">
                  Cross-Section Relief Profile
                </span>
                <span className="text-[11px] text-zinc-400 font-mono">
                  3D Extrusion
                </span>
              </div>

              {/* Cross-section visual */}
              <div className="p-4 bg-zinc-900 rounded-xl border border-zinc-800 space-y-4">
                <div className="space-y-1.5">
                  <div className="flex justify-between text-[11px] text-zinc-400">
                    <span>Wall Boundary (Raised Ridge)</span>
                    <span className="font-mono text-zinc-300">+2.5 mm</span>
                  </div>
                  <div className="h-4 bg-zinc-800 rounded flex items-center px-2">
                    <div className="h-2 w-3/4 bg-zinc-500 rounded-xs" />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="flex justify-between text-[11px] text-zinc-400">
                    <span>Tactile Pathway (Dashed Ridge)</span>
                    <span className="font-mono text-zinc-300">+1.2 mm</span>
                  </div>
                  <div className="h-4 bg-zinc-800 rounded flex items-center px-2">
                    <div className="h-1.5 w-1/2 bg-zinc-500 rounded-xs" />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="flex justify-between text-[11px] text-zinc-400">
                    <span>Braille Dot Grid</span>
                    <span className="font-mono text-zinc-300">+0.8 mm</span>
                  </div>
                  <div className="h-4 bg-zinc-800 rounded flex items-center px-2 gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-zinc-300 inline-block" />
                    <span className="w-2 h-2 rounded-full bg-zinc-300 inline-block" />
                    <span className="w-2 h-2 rounded-full bg-zinc-300 inline-block" />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="flex justify-between text-[11px] text-zinc-400">
                    <span>Baseplate Substrate</span>
                    <span className="font-mono text-zinc-300">2.5 mm</span>
                  </div>
                  <div className="h-5 bg-zinc-950 rounded flex items-center px-2 border border-zinc-800">
                    <div className="h-2 w-full bg-zinc-700 rounded-xs" />
                  </div>
                </div>
              </div>

              <div className="pt-2 text-[11px] text-zinc-400">
                Calibrated tactile relief permits white-cane travellers and fingertip exploration to discern physical thresholds effortlessly.
              </div>
            </Card>
          </div>

        </div>
      </div>
    </section>
  );
};
