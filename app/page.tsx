"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SafetyBanner } from "@/components/SafetyBanner";
import { AnnouncerLive } from "@/components/AnnouncerLive";
import { CameraView } from "@/components/CameraView";
import { StatusPanel } from "@/components/StatusPanel";
import { ControlBar } from "@/components/ControlBar";
import { NavigationPanel } from "@/components/NavigationPanel";
import { WebcamProvider } from "@/lib/camera/WebcamProvider";
import { MetaGlassesProvider } from "@/lib/camera/MetaGlassesProvider";
import type { CameraProvider } from "@/lib/camera/CameraProvider";
import { CameraSteering } from "@/lib/navigation/CameraSteering";
import { MapsNavigation } from "@/lib/navigation/MapsNavigation";
import type { Navigator as NavAbstraction } from "@/lib/navigation/Navigator";
import { getSpeech } from "@/lib/speech";
import { VoiceCommander, type VoiceIntent } from "@/lib/voiceCommands";
import type { Guidance, RouteResult } from "@/lib/types";

type TransitMode = "walk" | "bus";

const TICK_MS = 6000;

type NavMode = "camera" | "maps";

export default function Page() {
  // ----- Camera -----
  const cameraRef = useRef<CameraProvider | null>(null);
  const [cameraOn, setCameraOn] = useState(false);
  const [videoEl, setVideoEl] = useState<HTMLVideoElement | null>(null);

  // ----- Navigation -----
  const [navMode, setNavMode] = useState<NavMode>("camera");
  const cameraSteerRef = useRef<CameraSteering>(new CameraSteering());
  const mapsNavRef = useRef<MapsNavigation | null>(null);
  const [route, setRoute] = useState<RouteResult | null>(null);
  const [destinationLabel, setDestinationLabel] = useState<string | null>(null);
  const [currentManeuver, setCurrentManeuver] = useState<string | undefined>(undefined);

  // ----- Guidance loop -----
  const [guidance, setGuidance] = useState<Guidance | null>(null);
  const [continuous, setContinuous] = useState(false);
  const [busy, setBusy] = useState(false);
  const inFlightRef = useRef(false);
  const [voiceOn, setVoiceOn] = useState(true);
  const [announceMsg, setAnnounceMsg] = useState("");

  // ----- Voice command listener -----
  const voiceCmdRef = useRef<VoiceCommander | null>(null);
  const [voiceCmdsOn, setVoiceCmdsOn] = useState(false);
  const [voiceCmdsListening, setVoiceCmdsListening] = useState(false);

  // ----- Transit mode (walk / bus) -----
  const [transitMode, setTransitMode] = useState<TransitMode>("walk");

  // ----- Errors surfaced into the live region + spoken bus -----
  const speakError = useCallback((spoken: string, screen: string) => {
    setGuidance({ level: "caution", speak: spoken, details: screen });
    setAnnounceMsg(spoken);
    getSpeech().speak(spoken, { priority: "urgent" });
  }, []);

  // -------- Camera control --------
  const startCamera = useCallback(async () => {
    if (cameraRef.current?.isRunning()) return;
    // Feature flag: ?provider=glasses swaps to the Meta Wearables stub.
    // The stub throws on start() today; it's wired so the swap is one line
    // when the Meta Wearables Device Access Toolkit ships.
    const useGlasses =
      typeof window !== "undefined" &&
      new URLSearchParams(window.location.search).get("provider") === "glasses";
    const cam: CameraProvider = useGlasses
      ? new MetaGlassesProvider()
      : new WebcamProvider({ facingMode: "environment" });
    try {
      await cam.start();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "camera failed";
      if (/Permission|denied|NotAllowed/i.test(msg)) {
        speakError(
          "Camera permission denied. Open settings and allow camera, then try again.",
          msg
        );
      } else {
        speakError("Camera unavailable. Check your device and try again.", msg);
      }
      return;
    }
    cameraRef.current = cam;
    setVideoEl(cam.getVideoElement());
    setCameraOn(true);
    setAnnounceMsg("Camera started.");
    getSpeech().speak("Camera started.");
  }, [speakError]);

  const stopCamera = useCallback(async () => {
    const cam = cameraRef.current;
    cameraRef.current = null;
    setVideoEl(null);
    setCameraOn(false);
    setContinuous(false);
    if (cam) await cam.stop();
    setAnnounceMsg("Camera stopped.");
    getSpeech().speak("Camera stopped.");
  }, []);

  useEffect(() => {
    return () => {
      cameraRef.current?.stop();
    };
  }, []);

  // -------- Active navigator (camera-steer or maps) --------
  const navigatorRef = useMemo<NavAbstraction>(() => {
    return navMode === "maps" && mapsNavRef.current
      ? mapsNavRef.current
      : cameraSteerRef.current;
  }, [navMode, route]); // eslint-disable-line react-hooks/exhaustive-deps

  // -------- GPS tick for Maps mode --------
  useEffect(() => {
    if (navMode !== "maps" || !route || !mapsNavRef.current) return;
    if (typeof navigator === "undefined" || !navigator.geolocation) return;
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        mapsNavRef.current?.onPosition(pos.coords.latitude, pos.coords.longitude);
        setCurrentManeuver(mapsNavRef.current?.nextManeuver());
        const line = mapsNavRef.current?.speak();
        if (line) {
          setAnnounceMsg(line);
          getSpeech().speak(line);
        }
      },
      () => {
        speakError(
          "Location unavailable. Maps navigation needs GPS.",
          "geolocation error"
        );
      },
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 10_000 }
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, [navMode, route, speakError]);

  // -------- Single capture + guide call --------
  const captureAndGuide = useCallback(async () => {
    const cam = cameraRef.current;
    if (!cam || !cam.isRunning()) return;
    if (inFlightRef.current) return; // skip if a prior request is still in flight
    inFlightRef.current = true;
    setBusy(true);
    try {
      const imageBase64 = await cam.getFrame();
      const nextManeuver = navigatorRef.nextManeuver();
      const res = await fetch("/api/guide", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ imageBase64, nextManeuver }),
      });
      const g = (await res.json()) as Guidance;
      setGuidance(g);
      cameraSteerRef.current.onGuidance(g);
      setAnnounceMsg(g.speak);
      getSpeech().speak(g.speak, {
        priority: g.level === "hazard" ? "urgent" : "normal",
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "guide failed";
      speakError("Vision unavailable. Slow down. Use your cane.", msg);
    } finally {
      inFlightRef.current = false;
      setBusy(false);
    }
  }, [navigatorRef, speakError]);

  // -------- Continuous loop --------
  useEffect(() => {
    if (!continuous || !cameraOn) return;
    let cancelled = false;
    const tick = async () => {
      if (cancelled) return;
      await captureAndGuide();
    };
    tick(); // first reading immediately
    const id = setInterval(tick, TICK_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [continuous, cameraOn, captureAndGuide]);

  // -------- Voice toggle --------
  useEffect(() => {
    getSpeech().setEnabled(voiceOn);
  }, [voiceOn]);

  // -------- Maps: fetch route --------
  const handleRoute = useCallback(
    async (destination: string, mode: TransitMode = transitMode) => {
      const getPos = () =>
        new Promise<{ lat: number; lng: number }>((resolve, reject) => {
          if (!navigator.geolocation) {
            reject(new Error("Geolocation unsupported."));
            return;
          }
          navigator.geolocation.getCurrentPosition(
            (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
            (e) => reject(e),
            { enableHighAccuracy: true, timeout: 10_000 }
          );
        });
      const origin = await getPos();
      const res = await fetch("/api/directions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ origin, destination, mode }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `Directions failed (${res.status}).`);
      }
      const r = (await res.json()) as RouteResult;
      const nav = new MapsNavigation(destination);
      nav.setRoute(r);
      mapsNavRef.current = nav;
      setRoute(r);
      setDestinationLabel(destination);
      setCurrentManeuver(nav.nextManeuver());
      const modeLabel = mode === "bus" ? "Bus and walking" : "Walking";
      const opener = `${modeLabel} route ready. ${r.maneuvers.length} steps. ${Math.round(
        r.totalDistanceMeters
      )} meters total. First: ${nav.nextManeuver() ?? "proceed."}`;
      setAnnounceMsg(opener);
      getSpeech().speak(opener, { priority: "urgent" });
    },
    [transitMode]
  );

  // -------- Voice command intent handler --------
  const handleIntent = useCallback(
    (intent: VoiceIntent) => {
      const ack = (line: string) => {
        setAnnounceMsg(line);
        getSpeech().speak(line, { priority: "urgent" });
      };
      switch (intent.kind) {
        case "describe":
          ack("Looking.");
          captureAndGuide();
          break;
        case "startCamera":
          startCamera();
          break;
        case "stopCamera":
          stopCamera();
          break;
        case "continuousOn":
          if (!cameraOn) {
            ack("Start the camera first.");
          } else {
            setContinuous(true);
            ack("Continuous mode on.");
          }
          break;
        case "continuousOff":
          setContinuous(false);
          ack("Continuous mode off.");
          break;
        case "voiceOn":
          setVoiceOn(true);
          getSpeech().setEnabled(true);
          ack("Voice on.");
          break;
        case "voiceOff":
          ack("Voice off.");
          setVoiceOn(false);
          break;
        case "repeat":
          getSpeech().repeatLast();
          break;
        case "cameraMode":
          setNavMode("camera");
          ack("Camera steering mode.");
          break;
        case "mapsMode":
          setNavMode("maps");
          ack("Maps mode. Say navigate to a place.");
          break;
        case "stopNavigation":
          mapsNavRef.current = null;
          setRoute(null);
          setDestinationLabel(null);
          setCurrentManeuver(undefined);
          ack("Navigation ended.");
          break;
        case "navigate": {
          setNavMode("maps");
          setTransitMode(intent.transitMode);
          ack(
            `Getting ${intent.transitMode === "bus" ? "bus" : "walking"} route to ${intent.destination}.`
          );
          handleRoute(intent.destination, intent.transitMode).catch((err) => {
            const msg = err instanceof Error ? err.message : "route failed";
            speakError("Could not get directions. " + msg, msg);
          });
          break;
        }
        case "help":
          ack(
            "Commands: describe, start camera, continuous on, navigate to a place, navigate by bus, stop, repeat, voice off."
          );
          break;
      }
    },
    [cameraOn, captureAndGuide, handleRoute, speakError, startCamera, stopCamera]
  );

  // -------- Voice command lifecycle --------
  useEffect(() => {
    if (!voiceCmdsOn) {
      voiceCmdRef.current?.stop();
      voiceCmdRef.current = null;
      return;
    }
    const vc = new VoiceCommander({
      onIntent: handleIntent,
      onError: (msg) => speakError(msg, msg),
      onUnrecognized: (heard) => {
        // Stay quiet on garbage to avoid feedback loops, but log to screen.
        setGuidance((g) => g ?? { level: "caution", speak: "", details: `Heard: "${heard}"` });
      },
      onListeningChange: setVoiceCmdsListening,
    });
    if (!vc.isSupported()) {
      speakError(
        "Voice commands are not supported in this browser. Try Chrome on Android.",
        "no SpeechRecognition"
      );
      setVoiceCmdsOn(false);
      return;
    }
    voiceCmdRef.current = vc;
    vc.start();
    getSpeech().speak("Voice commands on. Say help for a list.");
    return () => vc.stop();
  }, [voiceCmdsOn, handleIntent, speakError]);

  const clearRoute = useCallback(() => {
    mapsNavRef.current = null;
    setRoute(null);
    setDestinationLabel(null);
    setCurrentManeuver(undefined);
    setAnnounceMsg("Navigation ended.");
    getSpeech().speak("Navigation ended.");
  }, []);

  // -------- Render --------
  return (
    <main className="min-h-screen bg-black text-white">
      <SafetyBanner />
      <AnnouncerLive message={announceMsg} />

      <div className="max-w-md mx-auto p-4 space-y-4">
        <header className="flex items-baseline justify-between">
          <h1 className="text-2xl font-extrabold tracking-tight">Third Eye</h1>
          <span className="text-xs text-neutral-400">AI walking guide</span>
        </header>

        <CameraView
          videoEl={videoEl}
          label={
            cameraOn
              ? "Live camera feed pointed ahead"
              : "Camera is off"
          }
        />

        <StatusPanel guidance={guidance} />

        <button
          type="button"
          onClick={() => setVoiceCmdsOn((v) => !v)}
          aria-pressed={voiceCmdsOn}
          aria-label={
            voiceCmdsOn
              ? voiceCmdsListening
                ? "Voice commands listening. Tap to stop."
                : "Voice commands on, mic idle. Tap to stop."
              : "Voice commands off. Tap to start hands-free mode."
          }
          className={`w-full min-h-tap rounded-2xl px-4 py-5 font-extrabold text-xl flex items-center justify-center gap-3 ${
            voiceCmdsOn
              ? voiceCmdsListening
                ? "bg-clear text-white ring-4 ring-clearBright animate-pulse"
                : "bg-clear text-white"
              : "bg-white text-black"
          }`}
        >
          {voiceCmdsOn ? (voiceCmdsListening ? "🎤 Listening — speak a command" : "🎤 Voice mode ON") : "🎤 Turn on voice mode"}
        </button>

        <ControlBar
          cameraOn={cameraOn}
          continuous={continuous}
          voiceOn={voiceOn}
          busy={busy}
          onToggleCamera={() => (cameraOn ? stopCamera() : startCamera())}
          onDescribeNow={captureAndGuide}
          onToggleContinuous={() => setContinuous((v) => !v)}
          onToggleVoice={() => setVoiceOn((v) => !v)}
          onRepeat={() => getSpeech().repeatLast()}
        />

        <NavigationPanel
          mode={navMode}
          onModeChange={(m) => {
            setNavMode(m);
            if (m === "camera") clearRoute();
          }}
          route={route}
          currentManeuver={currentManeuver}
          onRoute={handleRoute}
          onClearRoute={clearRoute}
          destinationLabel={destinationLabel}
          transitMode={transitMode}
          onTransitModeChange={setTransitMode}
        />

        <p className="text-xs text-neutral-500 leading-relaxed pt-2">
          Continuous mode samples about every {Math.round(TICK_MS / 1000)} seconds.
          Hazard alerts interrupt other speech. Use the &ldquo;Repeat last&rdquo;
          button if you missed a line.
        </p>
      </div>
    </main>
  );
}
