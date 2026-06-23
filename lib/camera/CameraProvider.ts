// Abstraction over any image source feeding the vision model.
// Today: WebcamProvider (getUserMedia). Tomorrow: MetaGlassesProvider
// (Meta Wearables Device Access Toolkit). The rest of the app talks
// only to this interface.
export interface CameraProvider {
  readonly id: string;
  start(): Promise<void>;
  stop(): Promise<void>;
  isRunning(): boolean;
  // Returns a base64-encoded JPEG (no data: prefix) of the current frame.
  getFrame(): Promise<string>;
  // Optional video element to mirror locally — null for headless sources
  // like glasses where the wearer cannot watch a preview.
  getVideoElement(): HTMLVideoElement | null;
}
