// Voice command engine. Continuously listens, matches user speech against
// a small intent grammar, and fires callbacks. Designed for blind users:
// every recognized command is acknowledged out loud, every error is too.
//
// Browser support note: SpeechRecognition is well-supported on desktop and
// Android Chrome. iOS Safari is partial — recognition stops after each
// utterance and must be restarted, which the loop below handles.

type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> & { length: number } }) => void) | null;
  onerror: ((e: { error?: string }) => void) | null;
  onend: (() => void) | null;
};

function getSR(): { new (): SpeechRecognitionLike } | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: { new (): SpeechRecognitionLike };
    webkitSpeechRecognition?: { new (): SpeechRecognitionLike };
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export type VoiceIntent =
  | { kind: "describe" }
  | { kind: "startCamera" }
  | { kind: "stopCamera" }
  | { kind: "continuousOn" }
  | { kind: "continuousOff" }
  | { kind: "voiceOn" }
  | { kind: "voiceOff" }
  | { kind: "repeat" }
  | { kind: "navigate"; destination: string; transitMode: "walk" | "bus" }
  | { kind: "stopNavigation" }
  | { kind: "cameraMode" }
  | { kind: "mapsMode" }
  | { kind: "help" };

const NAV_RE =
  /\b(?:navigate|nav|go|take me|directions?|route)\s+(?:to|toward|towards)\s+(.+?)(?:\s+(?:by|via|using)\s+(bus|walking|walk|foot))?$/i;

export function parseIntent(text: string): VoiceIntent | null {
  const t = text.toLowerCase().trim().replace(/[.,!?]+$/, "");
  if (!t) return null;
  if (/\b(describe|what(?:'s| is)? ahead|what do you see|look|read the scene)\b/.test(t))
    return { kind: "describe" };
  if (/\bstop (camera|video|recording)\b/.test(t)) return { kind: "stopCamera" };
  if (/\bstart (camera|video|recording)\b/.test(t)) return { kind: "startCamera" };
  if (/\bturn off camera\b/.test(t)) return { kind: "stopCamera" };
  if (/\bturn on camera\b/.test(t)) return { kind: "startCamera" };
  if (/\bcontinuous (mode )?on\b|\bauto on\b|\bstart continuous\b/.test(t))
    return { kind: "continuousOn" };
  if (/\bcontinuous (mode )?off\b|\bauto off\b|\bstop continuous\b/.test(t))
    return { kind: "continuousOff" };
  if (/\b(mute|voice off|quiet|silence)\b/.test(t)) return { kind: "voiceOff" };
  if (/\b(unmute|voice on|speak|talk)\b/.test(t)) return { kind: "voiceOn" };
  if (/\b(repeat|say again|again)\b/.test(t)) return { kind: "repeat" };
  if (/\bstop (navigation|nav|route|directions?)\b|\bcancel (nav|route|navigation)\b/.test(t))
    return { kind: "stopNavigation" };
  if (/\b(camera (steer|mode)|use camera)\b/.test(t)) return { kind: "cameraMode" };
  if (/\b(maps? (mode|route)|use maps?)\b/.test(t)) return { kind: "mapsMode" };
  if (/\b(help|what can (i|you) (say|do)|commands?)\b/.test(t)) return { kind: "help" };
  const m = t.match(NAV_RE);
  if (m) {
    const destination = m[1].trim();
    const modeWord = m[2]?.toLowerCase();
    const transitMode: "walk" | "bus" =
      modeWord === "bus" ? "bus" : "walk";
    if (destination) return { kind: "navigate", destination, transitMode };
  }
  return null;
}

export interface VoiceCommanderOptions {
  onIntent: (i: VoiceIntent) => void;
  onError?: (msg: string) => void;
  onUnrecognized?: (heard: string) => void;
  onListeningChange?: (listening: boolean) => void;
}

export class VoiceCommander {
  private rec: SpeechRecognitionLike | null = null;
  private want = false;
  private restartTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly opts: VoiceCommanderOptions) {}

  isSupported(): boolean {
    return !!getSR();
  }

  start(): void {
    const Ctor = getSR();
    if (!Ctor) {
      this.opts.onError?.("Voice commands are not supported in this browser.");
      return;
    }
    this.want = true;
    this.spawn(Ctor);
  }

  stop(): void {
    this.want = false;
    if (this.restartTimer) clearTimeout(this.restartTimer);
    this.restartTimer = null;
    try {
      this.rec?.stop();
    } catch {
      /* noop */
    }
    this.rec = null;
    this.opts.onListeningChange?.(false);
  }

  private spawn(Ctor: { new (): SpeechRecognitionLike }) {
    const rec = new Ctor();
    rec.continuous = true;
    rec.interimResults = false;
    rec.lang = "en-US";
    rec.onresult = (e) => {
      // Take the most recent final result.
      const last = e.results[e.results.length - 1];
      if (!last) return;
      const text = last[0]?.transcript ?? "";
      if (!text.trim()) return;
      const intent = parseIntent(text);
      if (intent) this.opts.onIntent(intent);
      else this.opts.onUnrecognized?.(text.trim());
    };
    rec.onerror = (e) => {
      const code = e.error ?? "unknown";
      if (code === "not-allowed" || code === "service-not-allowed") {
        this.opts.onError?.(
          "Microphone permission denied. Allow microphone access in your browser settings."
        );
        this.want = false;
      } else if (code === "no-speech" || code === "audio-capture" || code === "aborted") {
        // Benign — the restart loop will reopen.
      } else {
        this.opts.onError?.(`Voice input error: ${code}.`);
      }
    };
    rec.onend = () => {
      this.opts.onListeningChange?.(false);
      if (this.want) {
        // iOS Safari ends after each phrase; restart promptly.
        this.restartTimer = setTimeout(() => {
          if (this.want) this.spawn(Ctor);
        }, 250);
      }
    };
    try {
      rec.start();
      this.rec = rec;
      this.opts.onListeningChange?.(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "could not start mic";
      this.opts.onError?.(`Voice input failed: ${msg}`);
    }
  }
}
