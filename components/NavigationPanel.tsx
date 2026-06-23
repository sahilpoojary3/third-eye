"use client";

import { useEffect, useRef, useState } from "react";
import type { RouteResult } from "@/lib/types";

type Mode = "camera" | "maps";

// SpeechRecognition types: not in lib.dom.d.ts.
type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  onresult: ((e: { results: { 0: { 0: { transcript: string } } } }) => void) | null;
  onerror: ((e: unknown) => void) | null;
  onend: (() => void) | null;
};

function getSpeechRecognition(): { new (): SpeechRecognitionLike } | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: { new (): SpeechRecognitionLike };
    webkitSpeechRecognition?: { new (): SpeechRecognitionLike };
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

type TransitMode = "walk" | "bus";

export function NavigationPanel({
  mode,
  onModeChange,
  route,
  currentManeuver,
  onRoute,
  onClearRoute,
  destinationLabel,
  transitMode,
  onTransitModeChange,
}: {
  mode: Mode;
  onModeChange: (m: Mode) => void;
  route: RouteResult | null;
  currentManeuver: string | undefined;
  onRoute: (destination: string, transitMode: TransitMode) => Promise<void>;
  onClearRoute: () => void;
  destinationLabel: string | null;
  transitMode: TransitMode;
  onTransitModeChange: (m: TransitMode) => void;
}) {
  const [destination, setDestination] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const recRef = useRef<SpeechRecognitionLike | null>(null);

  useEffect(() => {
    return () => recRef.current?.stop();
  }, []);

  const startVoice = () => {
    const Ctor = getSpeechRecognition();
    if (!Ctor) {
      setError("Voice input not supported in this browser.");
      return;
    }
    const rec = new Ctor();
    rec.lang = "en-US";
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.onresult = (e) => setDestination(e.results[0][0].transcript);
    rec.onerror = () => setListening(false);
    rec.onend = () => setListening(false);
    recRef.current = rec;
    setListening(true);
    rec.start();
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!destination.trim()) return;
    setLoading(true);
    setError(null);
    try {
      await onRoute(destination.trim(), transitMode);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not get directions.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section
      aria-label="Navigation"
      className="rounded-2xl bg-neutral-900 border border-neutral-800 p-4 space-y-4"
    >
      <div role="radiogroup" aria-label="Navigation mode" className="grid grid-cols-2 gap-2">
        <button
          role="radio"
          aria-checked={mode === "camera"}
          onClick={() => onModeChange("camera")}
          className={`min-h-tap rounded-lg px-3 py-2 font-bold ${
            mode === "camera" ? "bg-white text-black" : "bg-neutral-800 text-white"
          }`}
        >
          Camera steer
        </button>
        <button
          role="radio"
          aria-checked={mode === "maps"}
          onClick={() => onModeChange("maps")}
          className={`min-h-tap rounded-lg px-3 py-2 font-bold ${
            mode === "maps" ? "bg-white text-black" : "bg-neutral-800 text-white"
          }`}
        >
          Maps route
        </button>
      </div>

      {mode === "maps" && !route && (
        <form onSubmit={submit} className="space-y-2" aria-label="Set destination">
          <div
            role="radiogroup"
            aria-label="Travel mode"
            className="grid grid-cols-2 gap-2"
          >
            <button
              type="button"
              role="radio"
              aria-checked={transitMode === "walk"}
              onClick={() => onTransitModeChange("walk")}
              className={`min-h-tap rounded-lg px-3 py-2 font-bold text-sm ${
                transitMode === "walk" ? "bg-white text-black" : "bg-neutral-800 text-white"
              }`}
            >
              🚶 Walking
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={transitMode === "bus"}
              onClick={() => onTransitModeChange("bus")}
              className={`min-h-tap rounded-lg px-3 py-2 font-bold text-sm ${
                transitMode === "bus" ? "bg-white text-black" : "bg-neutral-800 text-white"
              }`}
            >
              🚌 Bus
            </button>
          </div>
          <label htmlFor="dest" className="block text-sm font-semibold">
            Destination
          </label>
          <div className="flex gap-2">
            <input
              id="dest"
              type="text"
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
              placeholder="e.g. 555 Main St, Brooklyn"
              className="flex-1 min-h-tap rounded-lg bg-black border border-neutral-700 px-3 py-2 text-white"
              autoComplete="off"
            />
            <button
              type="button"
              onClick={startVoice}
              aria-pressed={listening}
              aria-label="Speak destination"
              className="min-h-tap min-w-tap rounded-lg bg-neutral-800 text-white px-3 font-bold"
            >
              {listening ? "Listening…" : "🎤"}
            </button>
          </div>
          <button
            type="submit"
            disabled={loading || !destination.trim()}
            className="min-h-tap w-full rounded-lg bg-yellow-300 text-black px-3 py-3 font-bold disabled:opacity-50"
          >
            {loading ? "Getting route…" : "Start navigation"}
          </button>
          {error && (
            <p role="alert" className="text-sm text-hazardBright">
              {error}
            </p>
          )}
        </form>
      )}

      {mode === "maps" && route && (
        <div className="space-y-2 text-sm">
          <p className="font-semibold">
            Heading to: <span className="font-normal">{destinationLabel}</span>
          </p>
          <p>
            {Math.round(route.totalDistanceMeters)} m ·{" "}
            {Math.round(route.totalDurationSeconds / 60)} min
          </p>
          <p className="text-base">
            <span className="font-semibold">Next: </span>
            {currentManeuver ?? "Arrived."}
          </p>
          <button
            onClick={onClearRoute}
            className="min-h-tap w-full rounded-lg bg-neutral-800 text-white px-3 py-2 font-bold border border-neutral-700"
          >
            End navigation
          </button>
        </div>
      )}

      {mode === "camera" && (
        <p className="text-sm text-neutral-300">
          The vision model is your navigator. It will speak directions inferred
          from the path ahead. No GPS used.
        </p>
      )}
    </section>
  );
}
