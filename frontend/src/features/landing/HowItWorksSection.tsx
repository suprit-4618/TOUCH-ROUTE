import React from 'react';
import { Upload, Eye, CheckCircle2, Printer } from 'lucide-react';
import { Card } from '../../components/ui/Card';

export const HowItWorksSection: React.FC = () => {
  const steps = [
    {
      step: '01',
      title: 'Architectural Blueprint Ingestion',
      description:
        'Upload standard architectural drawings in PNG, JPG, or PDF. TouchRoute validates file dimensions, security bounds, and resolution.',
      icon: <Upload className="w-4 h-4 text-zinc-900" />,
      detail: 'Supports multi-floor blueprints and emergency egress plans.',
    },
    {
      step: '02',
      title: 'Spatial Topology Extraction',
      description:
        'Detect room boundaries, corridor networks, doors, stairs, elevators, and room numbers into structured coordinates.',
      icon: <Eye className="w-4 h-4 text-zinc-900" />,
      detail: 'Converts floor plans into structured waypoints and connections.',
    },
    {
      step: '03',
      title: 'Verification & Review',
      description:
        'Building managers inspect detected elements, adjust labels, and confirm accessible transitions.',
      icon: <CheckCircle2 className="w-4 h-4 text-zinc-900" />,
      detail: 'Review and confirm routes before publishing.',
    },
    {
      step: '04',
      title: 'Voice & Physical Tactile Export',
      description:
        'Visitors navigate using conversational voice guidance, or export 3D-printable tactile maps with Braille labels.',
      icon: <Printer className="w-4 h-4 text-zinc-900" />,
      detail: 'Produces ready-to-slice STL meshes and vector SVG files.',
    },
  ];

  return (
    <section id="how-it-works" className="py-20 bg-zinc-50 border-b border-zinc-200">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="max-w-3xl mb-14">
          <span className="text-xs font-semibold uppercase tracking-wider text-zinc-800 bg-zinc-100 px-2.5 py-1 rounded border border-zinc-200">
            Workflow
          </span>
          <h2 className="text-3xl sm:text-4xl font-bold text-zinc-950 tracking-tight mt-3">
            How TouchRoute Works
          </h2>
          <p className="text-zinc-600 text-sm sm:text-base mt-2 leading-relaxed">
            From architectural floor plans to spoken directions and 3D tactile maps in four steps.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
          {steps.map((s) => (
            <Card key={s.step} className="p-6 flex flex-col justify-between bg-white border border-zinc-200/90 rounded-xl hover:border-zinc-400 transition-colors shadow-2xs">
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div className="w-9 h-9 rounded-lg bg-zinc-100 flex items-center justify-center border border-zinc-200">
                    {s.icon}
                  </div>
                  <span className="font-mono text-xs font-bold text-zinc-400">
                    {s.step}
                  </span>
                </div>
                <h3 className="text-base font-semibold text-zinc-950 mb-2">
                  {s.title}
                </h3>
                <p className="text-xs text-zinc-600 leading-relaxed">
                  {s.description}
                </p>
              </div>

              <div className="mt-6 pt-4 border-t border-zinc-100 text-[11px] font-normal text-zinc-500">
                {s.detail}
              </div>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
};
