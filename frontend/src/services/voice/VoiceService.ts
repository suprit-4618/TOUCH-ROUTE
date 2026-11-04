/**
 * TouchRoute Centralized Voice Service.
 * 
 * Manages visitor-facing voice navigation, supporting:
 * 1. High-fidelity pre-rendered Google Gemini Studio WAV audio assets (Neutral Indian English Female).
 * 2. Live dynamic speech synthesis via Google Gemini TTS (`POST /api/v1/voice/synthesize`).
 * 3. Graceful browser SpeechSynthesis fallback (en-IN female or native browser speech).
 * 4. Priority interruption (e.g., immediate safety warnings halting lower-priority speech).
 * 5. Complete overlap prevention, mute control, instruction replay, and screen-reader synchronization.
 */

export type SpeechSource = 'live_gemini_tts' | 'browser_tts';

export interface VoicePlaybackCallbacks {
  onStart?: (source: SpeechSource, transcript: string) => void;
  onEnd?: () => void;
  onError?: (err: unknown) => void;
}

export type PlaybackPriority = 'normal' | 'high';

interface LastSpokenItem {
  type: 'dynamic';
  text?: string;
  callbacks?: VoicePlaybackCallbacks;
}

export class VoiceService {
  private static instance: VoiceService | null = null;

  private currentAudio: HTMLAudioElement | null = null;
  private currentUtterance: SpeechSynthesisUtterance | null = null;
  private isMutedState: boolean = false;
  private isSpeakingState: boolean = false;
  private activeSource: SpeechSource | null = null;
  private currentTranscript: string = '';
  private lastSpoken: LastSpokenItem | null = null;
  private blobUrls: string[] = [];

  private constructor() {
    // Private constructor for singleton
  }

  public static getInstance(): VoiceService {
    if (!VoiceService.instance) {
      VoiceService.instance = new VoiceService();
    }
    return VoiceService.instance;
  }

  /**
   * Immediately stops any playing audio element and cancels browser speech synthesis.
   */
  public stop(): void {
    if (this.currentAudio) {
      try {
        this.currentAudio.pause();
        this.currentAudio.currentTime = 0;
        this.currentAudio.src = '';
      } catch (err) {
        console.warn('Error stopping HTML audio:', err);
      }
      this.currentAudio = null;
    }

    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
      } catch (err) {
        console.warn('Error cancelling speech synthesis:', err);
      }
      this.currentUtterance = null;
    }

    this.isSpeakingState = false;
    this.activeSource = null;
  }

  /**
   * Sets mute state. If muting, stops any currently playing audio.
   */
  public setMuted(muted: boolean): void {
    this.isMutedState = muted;
    if (muted) {
      this.stop();
    }
  }

  public isMuted(): boolean {
    return this.isMutedState;
  }

  public isSpeaking(): boolean {
    return this.isSpeakingState;
  }

  public getActiveSource(): SpeechSource | null {
    return this.activeSource;
  }

  public getCurrentTranscript(): string {
    return this.currentTranscript;
  }

  /**
   * Speaks dynamic text in natural voice using Google AI Studio Gemini TTS.
   */
  public async speak(
    text: string,
    priority: PlaybackPriority = 'normal',
    callbacks?: VoicePlaybackCallbacks
  ): Promise<void> {
    return this.speakDynamic(text, priority, callbacks);
  }

  /**
   * Speaks dynamic text (e.g. arbitrary room names, distances, step numbers).
   * Attempts live Google Gemini TTS (`POST /api/v1/voice/synthesize`).
   * If live synthesis is unavailable or quota is exceeded, gracefully falls back to browser TTS.
   */
  public async speakDynamic(
    text: string,
    priority: PlaybackPriority = 'normal',
    callbacks?: VoicePlaybackCallbacks
  ): Promise<void> {
    const cleanText = text.trim();
    if (!cleanText) return;

    this.stop();

    this.currentTranscript = cleanText;
    this.lastSpoken = { type: 'dynamic', text: cleanText, callbacks };

    if (this.isMutedState) {
      callbacks?.onStart?.('live_gemini_tts', cleanText);
      callbacks?.onEnd?.();
      return;
    }

    // Attempt Live Google Gemini TTS Synthesis
    let ttsSuccess = false;
    try {
      const backendUrl = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');
      const synthesizeUrl = backendUrl ? `${backendUrl}/api/v1/voice/synthesize` : '/api/v1/voice/synthesize';
      const response = await fetch(synthesizeUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: cleanText, voice_name: 'Kore' }),
      });

      if (response.ok) {
        const audioBlob = await response.blob();
        const blobUrl = URL.createObjectURL(audioBlob);
        this.blobUrls.push(blobUrl);

        const audio = new Audio(blobUrl);
        this.currentAudio = audio;
        this.isSpeakingState = true;
        this.activeSource = 'live_gemini_tts';

        audio.onplay = () => {
          callbacks?.onStart?.('live_gemini_tts', cleanText);
        };

        audio.onended = () => {
          this.isSpeakingState = false;
          this.activeSource = null;
          this.currentAudio = null;
          URL.revokeObjectURL(blobUrl);
          callbacks?.onEnd?.();
        };

        audio.onerror = () => {
          URL.revokeObjectURL(blobUrl);
          this.fallbackBrowserTTS(cleanText, callbacks);
        };

        await audio.play();
        ttsSuccess = true;
      } else {
        console.warn(`Live Gemini TTS returned status ${response.status}. Falling back to browser TTS.`);
      }
    } catch (fetchErr) {
      console.warn('Live Gemini TTS request failed. Falling back to browser TTS:', fetchErr);
    }

    if (!ttsSuccess) {
      this.fallbackBrowserTTS(cleanText, callbacks);
    }
  }

  /**
   * Local browser SpeechSynthesis fallback with clear female articulation.
   */
  private fallbackBrowserTTS(text: string, callbacks?: VoicePlaybackCallbacks): void {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      console.warn('SpeechSynthesis is unavailable in this environment.');
      callbacks?.onError?.('SpeechSynthesis unavailable');
      return;
    }

    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      this.currentUtterance = utterance;
      utterance.rate = 0.95;
      utterance.pitch = 1.0;

      // Select natural English voice, prioritizing Indian English female or Google/Natural voices
      const voices = window.speechSynthesis.getVoices();
      if (voices.length > 0) {
        const preferred =
          voices.find((v) => (v.lang === 'en-IN' || v.lang.startsWith('en-IN')) && (v.name.toLowerCase().includes('female') || v.name.toLowerCase().includes('google') || v.name.toLowerCase().includes('natural'))) ||
          voices.find((v) => v.lang === 'en-IN') ||
          voices.find((v) => v.lang.startsWith('en') && (v.name.toLowerCase().includes('female') || v.name.toLowerCase().includes('zira') || v.name.toLowerCase().includes('samantha'))) ||
          voices.find((v) => v.lang.startsWith('en'));
        if (preferred) {
          utterance.voice = preferred;
        }
      }

      this.isSpeakingState = true;
      this.activeSource = 'browser_tts';

      utterance.onstart = () => {
        callbacks?.onStart?.('browser_tts', text);
      };

      utterance.onend = () => {
        this.isSpeakingState = false;
        this.activeSource = null;
        this.currentUtterance = null;
        callbacks?.onEnd?.();
      };

      utterance.onerror = (e) => {
        this.isSpeakingState = false;
        this.activeSource = null;
        this.currentUtterance = null;
        callbacks?.onError?.(e);
      };

      window.speechSynthesis.speak(utterance);
    } catch (synthErr) {
      console.error('Browser TTS execution failed:', synthErr);
      callbacks?.onError?.(synthErr);
    }
  }

  /**
   * Replays the last spoken instruction or turn.
   */
  public repeat(): void {
    if (!this.lastSpoken) return;

    if (this.lastSpoken.text) {
      this.speakDynamic(this.lastSpoken.text, 'normal', this.lastSpoken.callbacks);
    }
  }

  /**
   * Cleanup method to release any object URLs.
   */
  public destroy(): void {
    this.stop();
    for (const url of this.blobUrls) {
      try {
        URL.revokeObjectURL(url);
      } catch (e) {
        // Ignore
      }
    }
    this.blobUrls = [];
  }
}

export const voiceService = VoiceService.getInstance();

