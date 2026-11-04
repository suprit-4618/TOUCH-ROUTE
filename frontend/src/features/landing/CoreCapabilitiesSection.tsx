import React from 'react';
import { Network, Volume2, Box, Cpu, FileCheck2, ShieldCheck } from 'lucide-react';
import { Card } from '../../components/ui/Card';

export const CoreCapabilitiesSection: React.FC = () => {
  const capabilities = [
    {
      icon: <Network className="w-5 h-5 text-zinc-900" />,
      title: 'Deterministic Graph Routing',
      description:
        'Indoor route calculation is powered by Dijkstra and A* graph algorithms over validated spatial coordinates. Directions reflect exact distances and angular geometry rather than LLM text estimations.',
    },
    {
      icon: <Volume2 className="w-5 h-5 text-zinc-900" />,
      title: 'Spoken Wayfinding Instructions',
      description:
        'Natural spoken turn-by-turn guidance with tactile landmark cues ("Turn right at Central Reception", "Your destination is directly ahead").',
    },
    {
      icon: <Box className="w-5 h-5 text-zinc-900" />,
      title: 'Physical Tactile 3D Relief Maps',
      description:
        'Generates 3D-printable STL files conforming to ADA and ISO tactile height specifications. Features raised walls, corridor lines, orientation notches, and Braille identifiers.',
    },
    {
      icon: <Cpu className="w-5 h-5 text-zinc-900" />,
      title: 'Modular Speech & Vision Architecture',
      description:
        'Decoupled backend adapter pattern with Google Gemini integration for dynamic live text-to-speech synthesis and floor plan comprehension.',
    },
    {
      icon: <FileCheck2 className="w-5 h-5 text-zinc-900" />,
      title: 'Verification In-The-Loop',
      description:
        'Every detected room, corridor junction, and door can be inspected and adjusted by facility managers before routes are published to visitors.',
    },
    {
      icon: <ShieldCheck className="w-5 h-5 text-zinc-900" />,
      title: 'WCAG 2.1 AAA Accessibility',
      description:
        'Screen-reader tested, keyboard navigable, acoustic feedback tones, scalable typography, and strict separation between planned routes and live tracking.',
    },
  ];

  return (
    <section className="py-20 bg-white border-b border-zinc-200">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="max-w-3xl mb-14">
          <span className="text-xs font-semibold uppercase tracking-wider text-zinc-800 bg-zinc-100 px-2.5 py-1 rounded border border-zinc-200">
            System Architecture
          </span>
          <h2 className="text-3xl sm:text-4xl font-bold text-zinc-950 tracking-tight mt-3">
            Engineered for Precision and Safety
          </h2>
          <p className="text-zinc-600 text-sm sm:text-base mt-2 leading-relaxed">
            Every feature is designed with the realities of blindness and low-vision wayfinding in mind.
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
