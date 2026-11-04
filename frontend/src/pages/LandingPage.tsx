import React from 'react';
import { HeroSection } from '../features/landing/HeroSection';
import { HowItWorksSection } from '../features/landing/HowItWorksSection';
import { CoreCapabilitiesSection } from '../features/landing/CoreCapabilitiesSection';
import { TactileExplanationSection } from '../features/landing/TactileExplanationSection';
import { AccessibilityPrinciplesSection } from '../features/landing/AccessibilityPrinciplesSection';
import { CallToActionSection } from '../features/landing/CallToActionSection';

interface LandingPageProps {
  onOpenWorkspace: () => void;
  onExploreDemo: () => void;
  onOpenCreateModal: () => void;
  onOpenTactileModal: () => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({
  onOpenWorkspace,
  onExploreDemo,
  onOpenCreateModal,
  onOpenTactileModal,
}) => {
  return (
    <div className="bg-zinc-50">
      <HeroSection
        onOpenWorkspace={onOpenWorkspace}
        onExploreDemo={onExploreDemo}
      />
      <HowItWorksSection />
      <CoreCapabilitiesSection />
      <TactileExplanationSection onOpenTactileModal={onOpenTactileModal} />
      <AccessibilityPrinciplesSection />
      <CallToActionSection
        onOpenWorkspace={onOpenWorkspace}
        onOpenCreateModal={onOpenCreateModal}
      />
    </div>
  );
};

