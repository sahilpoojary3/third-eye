# Third Eye

Mobile-first AI walking guide for blind and low-vision users. The camera sees the path ahead; Anthropic's Claude vision model describes the scene, warns about hazards, and gives spoken turn-by-turn directions. Designed as the **precursor to a Meta Ray-Ban glasses app** — the camera layer is abstracted behind a `CameraProvider` interface so the webcam can be swapped for the glasses' POV stream without touching the rest of the app.

> **Prototype. NOT a certified mobility aid.** Keep using your cane, guide dog, and orientation training. Never rely on this app for safety.

---

## Run it

```bash
cd third-eye
npm install
cp .env.local.example .env.local      # fill in keys
npm run dev
# open http://localhost:3000 on a phone (use HTTPS or localhost; iOS blocks getUserMedia otherwise)
```

### Required env (server-side only — never `NEXT_PUBLIC_`)

| Var | Why |
| --- | --- |
| `ANTHROPIC_API_KEY` | Vision calls (`claude-sonnet-4-6`) from `/api/guide`. |
| `GOOGLE_MAPS_API_KEY` | Directions API for Maps navigation mode. Enable the Directions API in Google Cloud. |

Both are read only inside Next.js API routes (`app/api/guide/route.ts`, `app/api/directions/route.ts`). The browser never sees them.

---

## How to use

1. Open on a phone. Tap **Start camera** and accept the permission prompt.
2. Tap **Describe what's ahead** for a single reading, or flip **Continuous: ON** to get a fresh reading every ~6 s.
3. For navigation, pick **Maps route**, type or speak a destination, tap **Start navigation**. The app will speak each maneuver and tell the vision model what's coming so guidance becomes route-aware ("Your turn right is ten meters ahead").
4. **Voice: OFF** silences spoken output but keeps the on-screen status panel (and the assistive-tech live region) updating. **Repeat last** replays the last spoken line.

---

## Architecture

```
app/
  api/
    guide/route.ts        Vision call (Anthropic). Returns {level, speak, details}.
    directions/route.ts   Google Directions wrapper. Returns parsed maneuvers.
  page.tsx                UI + guidance loop. Drives the abstractions.
lib/
  camera/
    CameraProvider.ts     interface: start/stop/getFrame()->base64 JPEG
    WebcamProvider.ts     getUserMedia + canvas frame capture
    MetaGlassesProvider.ts STUB — swap target for Meta Wearables SDK
  navigation/
    Navigator.ts          interface for the navigator
    CameraSteering.ts     navigator that reads the path from the image
    MapsNavigation.ts     navigator driven by GPS + Directions API
  speech.ts               Web Speech API wrapper (single-flighted)
components/                CameraView, StatusPanel, ControlBar, NavigationPanel,
                           SafetyBanner, AnnouncerLive (aria-live="assertive")
```

### The guidance contract

`POST /api/guide` takes:

```json
{ "imageBase64": "<jpeg bytes>", "nextManeuver": "Turn right onto Elm in 40m" }
```

…and the model is forced to return only:

```json
{ "level": "clear|caution|hazard", "speak": "<= 18 words", "details": "screen text" }
```

The route parses defensively (direct → peeled JSON → text fallback), so a misbehaving response degrades to a spoken `caution` rather than a crash.

### Severity → speech behavior

- **hazard** — `speech.cancel()` runs first, then the line is queued. Hazards interrupt stale "clear" lines mid-utterance.
- **caution / clear** — appended to the queue normally.

### Continuous mode

`page.tsx` ticks every `TICK_MS` (6 s) but uses an `inFlightRef` guard so a slow request never overlaps the next tick — the next tick is silently skipped instead.

---

## How to swap the webcam for Meta Ray-Ban glasses later

The entire camera layer is reached only through the `CameraProvider` interface. When Meta opens the **Wearables Device Access Toolkit** (or we wrap an internal build of it):

1. **Implement `lib/camera/MetaGlassesProvider.ts`.** The file already contains the stub with the exact methods you need. Wire them up:
   - `start()` — open the wearables session, request the on-glasses camera permission, subscribe to the live POV frame stream.
   - `getFrame()` — pull the latest frame, JPEG-encode, return as base64 (no `data:` prefix). Aim for a max edge of ~768 px to keep payload + latency low.
   - `stop()` — release the session and any device wake lock.
   - `getVideoElement()` — return `null`. The wearer cannot watch a preview, and the rest of the UI already handles a `null` video element gracefully.
2. **Add a provider switch in `app/page.tsx`.** Today:
   ```ts
   const cam = new WebcamProvider({ facingMode: "environment" });
   ```
   Change to something like:
   ```ts
   const cam = useGlasses
     ? new MetaGlassesProvider()
     : new WebcamProvider({ facingMode: "environment" });
   ```
   Gate `useGlasses` on a query param (`?provider=glasses`) or a settings toggle.
3. **That's it for the camera layer.** Nothing else in the app reads frames, encodes images, or talks to `getUserMedia` directly. The guidance loop, the `Navigator` abstractions, the status panel, and the speech bus are all source-agnostic.

A few things to think about when the swap happens:

- **No preview surface.** `CameraView` already renders an empty placeholder when `getVideoElement()` returns `null`. You may want to replace it with a high-contrast text card for sighted companions.
- **Speech routing.** On glasses, speech should come from the glasses' speaker, not the phone's. The `getSpeech()` bus is a single point you'd extend to dispatch to a wearables TTS endpoint.
- **Frame cadence.** Continuous mode is 6 s on a phone. On glasses with better thermals + always-on framing you may want 2–3 s, plus a motion-triggered burst (IMU spike → immediate capture).
- **Voice input for navigation.** Today's mic uses the phone's `webkitSpeechRecognition`. On glasses, route through their wake-word + ASR pipeline.

---

## Accessibility

- **Voice-first**. Every meaningful state change is spoken via `speechSynthesis` *and* announced via an `aria-live="assertive"` region for screen readers.
- **Large targets**. All buttons are ≥56 px tall, full-width where it matters.
- **High contrast**. Status colors meet WCAG AA on the dark background; severity is *also* conveyed in the text label, never color alone.
- **Keyboard**. Every control is a real `<button>` / `<input>` with a visible focus ring (`outline: 4px solid #facc15`).
- **Reduced motion**. `prefers-reduced-motion: reduce` collapses animations to 0 ms.
- **No localStorage**. Per spec — all state is in-memory and disappears on refresh.

## Errors

- Camera permission denied → spoken: *"Camera permission denied. Open settings and allow camera, then try again."*
- Vision API failure → spoken: *"Vision unavailable. Slow down. Use your cane."* — phrased as a directive, not an apology.
- GPS denied during Maps navigation → spoken: *"Location unavailable. Maps navigation needs GPS."*
