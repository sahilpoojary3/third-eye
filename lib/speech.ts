// Tiny wrapper over the Web Speech API. We single-flight utterances so a
// fast-arriving HAZARD interrupts a stale "clear" line in progress.
class SpeechBus {
  private synth: SpeechSynthesis | null = null;
  private enabled = true;
  private lastSpoken = "";

  constructor() {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      this.synth = window.speechSynthesis;
    }
  }

  setEnabled(on: boolean) {
    this.enabled = on;
    if (!on) this.synth?.cancel();
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  speak(text: string, opts: { priority?: "normal" | "urgent" } = {}): void {
    if (!this.synth || !this.enabled) return;
    const clean = text.trim();
    if (!clean) return;
    this.lastSpoken = clean;
    if (opts.priority === "urgent") {
      this.synth.cancel();
    }
    const u = new SpeechSynthesisUtterance(clean);
    u.rate = 1.05;
    u.pitch = 1;
    u.volume = 1;
    u.lang = "en-US";
    this.synth.speak(u);
  }

  repeatLast(): void {
    if (this.lastSpoken) this.speak(this.lastSpoken, { priority: "urgent" });
  }

  cancel() {
    this.synth?.cancel();
  }
}

let _bus: SpeechBus | null = null;
export function getSpeech(): SpeechBus {
  if (!_bus) _bus = new SpeechBus();
  return _bus;
}
