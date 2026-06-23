import type { CameraProvider } from "./CameraProvider";

export class WebcamProvider implements CameraProvider {
  readonly id = "webcam";
  private stream: MediaStream | null = null;
  private video: HTMLVideoElement | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private running = false;

  constructor(private readonly options: { facingMode?: "environment" | "user" } = {}) {}

  async start(): Promise<void> {
    if (this.running) return;
    const facingMode = this.options.facingMode ?? "environment";
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: facingMode },
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
      audio: false,
    });
    this.stream = stream;
    const video = document.createElement("video");
    video.setAttribute("playsinline", "true");
    video.muted = true;
    video.srcObject = stream;
    await video.play();
    this.video = video;
    this.canvas = document.createElement("canvas");
    this.running = true;
  }

  async stop(): Promise<void> {
    this.running = false;
    if (this.video) {
      this.video.pause();
      this.video.srcObject = null;
      this.video = null;
    }
    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
    }
    this.canvas = null;
  }

  isRunning(): boolean {
    return this.running;
  }

  getVideoElement(): HTMLVideoElement | null {
    return this.video;
  }

  async getFrame(): Promise<string> {
    if (!this.video || !this.canvas) throw new Error("Camera not started");
    const v = this.video;
    const w = v.videoWidth || 1280;
    const h = v.videoHeight || 720;
    // Downscale for cheaper transport + faster vision inference.
    const maxEdge = 768;
    const scale = Math.min(1, maxEdge / Math.max(w, h));
    const cw = Math.round(w * scale);
    const ch = Math.round(h * scale);
    this.canvas.width = cw;
    this.canvas.height = ch;
    const ctx = this.canvas.getContext("2d");
    if (!ctx) throw new Error("2d context unavailable");
    ctx.drawImage(v, 0, 0, cw, ch);
    const dataUrl = this.canvas.toDataURL("image/jpeg", 0.78);
    return dataUrl.replace(/^data:image\/jpeg;base64,/, "");
  }
}
