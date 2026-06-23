import type { CameraProvider } from "./CameraProvider";

// =============================================================================
// MetaGlassesProvider — STUB.
//
// This is the seat reserved for the Meta Wearables Device Access Toolkit.
// When Meta opens that SDK to third parties (or we wrap an internal build of
// it), this class is the ONLY file in the app that needs to change. Everything
// downstream — the guidance loop, the navigator, the UI — already talks to the
// CameraProvider interface and knows nothing about where frames come from.
//
// Expected wiring when the SDK lands:
//   1. `start()` — initiate the wearables session, request camera permission
//      on the glasses, subscribe to the live POV frame stream.
//   2. `getFrame()` — pull the latest frame from the stream, encode JPEG,
//      return base64. (Glasses are headless: there is no <video> to mirror.)
//   3. `stop()` — release the session and the wake lock on the device.
//
// Until the SDK is available, every method throws. Construct this provider
// only behind a feature flag, e.g. `?provider=glasses`, so the default flow
// stays on WebcamProvider.
// =============================================================================
export class MetaGlassesProvider implements CameraProvider {
  readonly id = "meta-glasses";

  async start(): Promise<void> {
    throw new Error(
      "MetaGlassesProvider not implemented — pending Meta Wearables Device Access Toolkit."
    );
  }

  async stop(): Promise<void> {
    // no-op until implemented
  }

  isRunning(): boolean {
    return false;
  }

  async getFrame(): Promise<string> {
    throw new Error("MetaGlassesProvider.getFrame() not implemented.");
  }

  getVideoElement(): HTMLVideoElement | null {
    // Glasses have no local preview surface — wearer can't watch a screen.
    return null;
  }
}
