import React from 'react';
import { Network, Volume2, Box, Cpu, FileCheck2, ShieldCheck } from 'lucide-react';
import { Card } from '../../components/ui/Card';

export const CoreCapabilitiesSection: React.FC = () => {
  const capabilities = [
    {
      icon: <Network className="w-5 h-5 text-zinc-900" />,
      title: 'Graph-Based Pathfinding',
      description:
        'Calculates shortest indoor routes using Dijkstra and A* algorithms over verified coordinates, computing real distances and turn angles.',
    },
    {
      icon: <Volume2 className="w-5 h-5 text-zinc-900" />,
      title: 'Spoken Wayfinding Instructions',
      description:
        'Spoken turn-by-turn guidance with landmark cues ("Turn right at Central Reception", "Your destination is directly ahead").',
    },
    {
      icon: <Box className="w-5 h-5 text-zinc-900" />,
      title: 'Physical Tactile 3D Maps',
      description:
        'Generates 3D-printable STL files with raised walls, corridor pathways, and Braille labels for tactile exploration.',
    },
    {
      icon: <Cpu className="w-5 h-5 text-zinc-900" />,
      title: 'AI Floor Plan Interpretation',
      description:
        'Analyzes architectural drawings to detect rooms, doors, and walkways, with dynamic speech synthesis for visitor directions.',
    },
    {
      icon: <FileCheck2 className="w-5 h-5 text-zinc-900" />,
      title: 'Human Review & Verification',
      description:
        'Every detected room, corridor junction, and door can be inspected and adjusted by building staff before publishing.',
    },
    {
      icon: <ShieldCheck className="w-5 h-5 text-zinc-900" />,
      title: 'Keyboard & Screen-Reader Accessible',
      description:
        'Built with high-contrast surfaces, full keyboard navigation, ARIA screen-reader support, and auditory feedback.',
    },
  ];

  return (
    <section className="py-20 bg-white border-b border-zinc-200">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="max-w-3xl mb-14">
          <span className="text-xs font-semibold uppercase tracking-wider text-zinc-800 bg-zinc-100 px-2.5 py-1 rounded border border-zinc-200">
            Features
          </span>
          <h2 className="text-3xl sm:text-4xl font-bold text-zinc-950 tracking-tight mt-3">
            What TouchRoute Does
          </h2>
          <p className="text-zinc-600 text-sm sm:text-base mt-2 leading-relaxed">
            Practical tools to make indoor buildings accessible through spoken directions and physical tactile models.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {capabilities.map((c) => (
            <Card key={c.title} className="p-6 bg-white border border-zinc-200/90 rounded-xl hover:border-zinc-400 transition-colors shadow-2xs">
              <div className="w-9 h-9 rounded-lg bg-zinc-100 flex items-center justify-center border border-zinc-200 mb-4">
                {c.icon}
              </div>
              <h3 className="text-base font-semibold text-zinc-950 mb-2">
                {c.title}
              </h3>
              <p className="text-xs text-zinc-600 leading-relaxed">
                {c.description}
              </p>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
};
