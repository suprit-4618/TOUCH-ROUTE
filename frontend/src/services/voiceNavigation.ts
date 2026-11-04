/**
 * Voice Navigation Service for TouchRoute.
 * 
 * Provides an accessible abstraction layer over Web Speech Synthesis
 * (text-to-speech guidance) and Web Speech Recognition (voice destination queries).
 * Provides screen-reader announcements and browser speech synthesis.
 */

export interface SpeechSynthesisOptions {
  rate?: number;     // 0.7 to 1.3 (default 0.95 for clear comprehension)
  pitch?: number;    // 0.8 to 1.2 (default 1.0)
  volume?: number;   // 0.0 to 1.0 (default 1.0)
  onStart?: () => void;
  onEnd?: () => void;
  onError?: (err: unknown) => void;
}

export interface SpeechRecognitionCallbacks {
  onResult: (transcript: string, isFinal: boolean) => void;
  onError: (errorMsg: string) => void;
  onEnd: () => void;
}

class VoiceSynthesizerService {
  private utterance: SpeechSynthesisUtterance | null = null;
  private currentText: string | null = null;
  private isSpeakingState: boolean = false;
  private isPausedState: boolean = false;

  public isSupported(): boolean {
    return typeof window !== 'undefined' && 'speechSynthesis' in window;
  }

  public speak(text: string, options: SpeechSynthesisOptions = {}) {
    if (!this.isSupported()) {
      console.warn('SpeechSynthesis is not supported on this browser.');
      options.onError?.('SpeechSynthesis not supported');
      return;
    }

    this.cancel();

    this.currentText = text;
    this.utterance = new SpeechSynthesisUtterance(text);
    this.utterance.rate = options.rate ?? 0.95;
    this.utterance.pitch = options.pitch ?? 1.0;
    this.utterance.volume = options.volume ?? 1.0;

    // Pick best available clear voice if supported
    const voices = window.speechSynthesis.getVoices();
    if (voices.length > 0) {
      const preferred = voices.find(
        (v) => v.lang.startsWith('en') && (v.name.includes('Natural') || v.name.includes('Google') || v.name.includes('Siri'))
      ) || voices.find((v) => v.lang.startsWith('en'));
      if (preferred) {
        this.utterance.voice = preferred;
      }
    }

    this.utterance.onstart = () => {
      this.isSpeakingState = true;
      this.isPausedState = false;
      options.onStart?.();
    };

    this.utterance.onend = () => {
      this.isSpeakingState = false;
      this.isPausedState = false;
      options.onEnd?.();
    };

    this.utterance.onerror = (e) => {
      this.isSpeakingState = false;
      this.isPausedState = false;
      options.onError?.(e);
    };

    window.speechSynthesis.speak(this.utterance);
  }

  public pause() {
    if (this.isSupported() && window.speechSynthesis.speaking) {
      window.speechSynthesis.pause();
      this.isPausedState = true;
    }
  }

  public resume() {
    if (this.isSupported() && this.isPausedState) {
      window.speechSynthesis.resume();
      this.isPausedState = false;
    }
  }

  public cancel() {
    if (this.isSupported()) {
      window.speechSynthesis.cancel();
      this.isSpeakingState = false;
      this.isPausedState = false;
    }
  }

  public repeat(options: SpeechSynthesisOptions = {}) {
    if (this.currentText) {
      this.speak(this.currentText, options);
    }
  }

  public isSpeaking(): boolean {
    return this.isSpeakingState;
  }

  public isPaused(): boolean {
    return this.isPausedState;
  }
}

// Window interface augmentation for browser SpeechRecognition
interface IWindowSpeech extends Window {
  SpeechRecognition?: any;
  webkitSpeechRecognition?: any;
}

class VoiceRecognizerService {
  private recognition: any = null;
  private listening: boolean = false;

  public isSupported(): boolean {
    if (typeof window === 'undefined') return false;
    const win = window as IWindowSpeech;
    return !!(win.SpeechRecognition || win.webkitSpeechRecognition);
  }

  public startListening(callbacks: SpeechRecognitionCallbacks) {
    if (!this.isSupported()) {
      callbacks.onError('Voice speech recognition is not supported on this browser. Please use keyboard text search.');
      return;
    }

    this.stopListening();

    try {
      const win = window as IWindowSpeech;
      const SpeechRecognitionConstructor = win.SpeechRecognition || win.webkitSpeechRecognition;
      this.recognition = new SpeechRecognitionConstructor();
      this.recognition.lang = 'en-US';
      this.recognition.continuous = false;
      this.recognition.interimResults = true;

      this.recognition.onstart = () => {
        this.listening = true;
      };

      this.recognition.onresult = (event: any) => {
        let transcript = '';
        let isFinal = false;

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const res = event.results[i];
          transcript += res[0].transcript;
          if (res.isFinal) {
            isFinal = true;
          }
        }

        callbacks.onResult(transcript.trim(), isFinal);
      };

      this.recognition.onerror = (event: any) => {
        this.listening = false;
        let errMsg = 'Voice recognition error occurred.';
        if (event.error === 'not-allowed') {
          errMsg = 'Microphone permission was denied. Please allow microphone access or use keyboard entry.';
        } else if (event.error === 'no-speech') {
          errMsg = 'No speech detected. Please press the microphone button and try again.';
        }
        callbacks.onError(errMsg);
      };

      this.recognition.onend = () => {
        this.listening = false;
        callbacks.onEnd();
      };

      this.recognition.start();
    } catch (err: unknown) {
      this.listening = false;
      const msg = err instanceof Error ? err.message : 'Failed to initialize speech recognition';
      callbacks.onError(msg);
    }
  }

  public stopListening() {
    if (this.recognition && this.listening) {
      try {
        this.recognition.stop();
      } catch {
        // Ignore duplicate stop calls
      }
      this.listening = false;
    }
  }

  public isListening(): boolean {
    return this.listening;
  }
}

export const voiceSynthesizer = new VoiceSynthesizerService();
export const voiceRecognizer = new VoiceRecognizerService();

// Re-export centralized VoiceService
export { voiceService, VoiceService } from './voice/VoiceService';
export type { SpeechSource, VoicePlaybackCallbacks } from './voice/VoiceService';

