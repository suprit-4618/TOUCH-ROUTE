import React, { createContext, useContext, useEffect, useState } from 'react';

type FontScale = 'sm' | 'md' | 'lg' | 'xl';

interface AccessibilityContextType {
  highContrast: boolean;
  setHighContrast: (val: boolean) => void;
  fontScale: FontScale;
  setFontScale: (scale: FontScale) => void;
  soundEnabled: boolean;
  setSoundEnabled: (val: boolean) => void;
  reducedMotion: boolean;
  setReducedMotion: (val: boolean) => void;
  liveMessage: string;
  announce: (message: string) => void;
  playFeedbackTone: (type?: 'success' | 'click' | 'step' | 'error' | 'warning') => void;
}

const AccessibilityContext = createContext<AccessibilityContextType | undefined>(undefined);

export const AccessibilityProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [highContrast, setHighContrast] = useState<boolean>(() => {
    return localStorage.getItem('touchroute_contrast') === 'high';
  });

  const [fontScale, setFontScale] = useState<FontScale>(() => {
    return (localStorage.getItem('touchroute_font_scale') as FontScale) || 'md';
  });

  const [soundEnabled, setSoundEnabled] = useState<boolean>(() => {
    return localStorage.getItem('touchroute_sound') !== 'false';
  });

  const [reducedMotion, setReducedMotion] = useState<boolean>(() => {
    return (
      localStorage.getItem('touchroute_motion') === 'reduced' ||
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ||
      false
    );
  });

  const [liveMessage, setLiveMessage] = useState<string>('');

  useEffect(() => {
    localStorage.setItem('touchroute_contrast', highContrast ? 'high' : 'normal');
    if (highContrast) {
      document.documentElement.classList.add('high-contrast');
    } else {
      document.documentElement.classList.remove('high-contrast');
    }
  }, [highContrast]);

  useEffect(() => {
    localStorage.setItem('touchroute_font_scale', fontScale);
    document.documentElement.classList.remove('font-scale-sm', 'font-scale-md', 'font-scale-lg', 'font-scale-xl');
    document.documentElement.classList.add(`font-scale-${fontScale}`);
  }, [fontScale]);

  useEffect(() => {
    localStorage.setItem('touchroute_sound', String(soundEnabled));
  }, [soundEnabled]);

  useEffect(() => {
    localStorage.setItem('touchroute_motion', reducedMotion ? 'reduced' : 'normal');
  }, [reducedMotion]);

  const announce = (message: string) => {
    setLiveMessage(message);
    if (soundEnabled) {
      playFeedbackTone('step');
    }
  };

  const playFeedbackTone = (type: 'success' | 'click' | 'step' | 'error' | 'warning' = 'click') => {
    if (!soundEnabled || typeof window === 'undefined') return;
    try {
      const audioCtx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain);
      gain.connect(audioCtx.destination);

      if (type === 'success') {
        osc.frequency.setValueAtTime(587.33, audioCtx.currentTime); // D5
        osc.frequency.setValueAtTime(880, audioCtx.currentTime + 0.1); // A5
        gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.35);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.35);
      } else if (type === 'step') {
        osc.frequency.setValueAtTime(440, audioCtx.currentTime); // A4
        gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.15);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.15);
      } else if (type === 'error' || type === 'warning') {
        osc.frequency.setValueAtTime(220, audioCtx.currentTime); // A3
        osc.frequency.setValueAtTime(164.81, audioCtx.currentTime + 0.1); // E3
        gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.3);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.3);
      } else {
        osc.frequency.setValueAtTime(329.63, audioCtx.currentTime); // E4
        gain.gain.setValueAtTime(0.08, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.08);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.08);
      }
    } catch {
      // Audio context might be restricted before first gesture
    }
  };

  return (
    <AccessibilityContext.Provider
      value={{
        highContrast,
        setHighContrast,
        fontScale,
        setFontScale,
        soundEnabled,
        setSoundEnabled,
        reducedMotion,
        setReducedMotion,
        liveMessage,
        announce,
        playFeedbackTone,
      }}
    >
      {/* Screen reader live announcer */}
      <div
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
        id="a11y-live-announcer"
      >
        {liveMessage}
      </div>
      {children}
    </AccessibilityContext.Provider>
  );
};

export const useAccessibility = () => {
  const context = useContext(AccessibilityContext);
  if (!context) {
    throw new Error('useAccessibility must be used within an AccessibilityProvider');
  }
  return context;
};

