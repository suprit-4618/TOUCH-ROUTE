import React from 'react';
import { ShieldCheck, EyeOff, Radio, Keyboard, AlertTriangle } from 'lucide-react';
import { Card } from '../../components/ui/Card';

export const AccessibilityPrinciplesSection: React.FC = () => {
  const principles = [
    {
      icon: <Radio className="w-5 h-5 text-zinc-900" />,
      title: 'Planned Routes vs Physical Positioning',
      description:
        'TouchRoute cleanly separates deterministic spatial routing from verified physical sensor readings. The application never fakes real-time motion tracking when physical marker confirmations are not present.',
    },
    {
      icon: <EyeOff className="w-5 h-5 text-zinc-900" />,
      title: 'Non-Visual First Wayfinding',
      description:
        'Visual floor plan views are secondary aids for sighted assistants or facility administrators. The primary user experience provides landmark cues, spoken directions, and tactile navigation sequences.',
    },
    {
      icon: <Keyboard className="w-5 h-5 text-zinc-900" />,
      title: 'Complete Keyboard & Screen-Reader Operability',
      description:
        'Every button, modal, form input, and route step has visible high-contrast focus rings, semantic ARIA live regions, and single-stroke keyboard shortcuts.',
    },
    {
      icon: <ShieldCheck className="w-5 h-5 text-zinc-900" />,
      title: 'WCAG 2.1 AAA Contrast & Typography',
      description:
        'High-contrast typography on clean neutral surfaces. Interactive touch targets adhere to a generous minimum envelope with clear visual feedback.',
    },
  ];

  return (
    <section id="accessibility" className="py-20 bg-white border-b border-zinc-200">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="max-w-3xl mb-14">
          <span className="text-xs font-semibold uppercase tracking-wider text-zinc-800 bg-zinc-100 px-2.5 py-1 rounded border border-zinc-200">
            Design Standards
          </span>
          <h2 className="text-3xl sm:text-4xl font-bold text-zinc-950 tracking-tight mt-3">
            Accessibility Is a Safety Requirement
          </h2>
          <p className="text-zinc-600 text-sm sm:text-base mt-2 leading-relaxed">
            In accessible wayfinding, inaccurate directions or superficial UI gimmicks cause physical hazards. We uphold strict standards of honesty and geometric precision.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {principles.map((p) => (
            <Card key={p.title} className="p-6 bg-white border border-zinc-200/90 rounded-xl hover:border-zinc-400 transition-colors shadow-2xs">
              <div className="w-9 h-9 rounded-lg bg-zinc-100 flex items-center justify-center border border-zinc-200 mb-4">
                {p.icon}
              </div>
              <h3 className="text-base font-semibold text-zinc-950 mb-2">
                {p.title}
              </h3>
              <p className="text-xs text-zinc-600 leading-relaxed">
                {p.description}
              </p>
            </Card>
          ))}
        </div>

        {/* Safety Callout Banner */}
        <div className="mt-10 p-5 rounded-xl bg-zinc-50 border border-zinc-200/90 flex items-start gap-4">
          <AlertTriangle className="w-5 h-5 text-zinc-900 shrink-0 mt-0.5" />
          <div className="text-xs text-zinc-700 leading-relaxed">
            <strong className="font-semibold block text-xs text-zinc-950 mb-0.5">
              Verification Assurance
            </strong>
            TouchRoute never silently accepts uncertain AI detections as ground truth. Every route requires human verification of building barriers, stairs, and doors before being deployed for independent blind navigation.
          </div>
        </div>
      </div>
    </section>
  );
};
