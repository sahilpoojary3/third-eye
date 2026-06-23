"use client";

const baseBtn =
  "min-h-tap min-w-tap rounded-xl px-4 py-3 font-bold text-base flex items-center justify-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed";

export function ControlBar({
  cameraOn,
  continuous,
  voiceOn,
  busy,
  onToggleCamera,
  onDescribeNow,
  onToggleContinuous,
  onToggleVoice,
  onRepeat,
}: {
  cameraOn: boolean;
  continuous: boolean;
  voiceOn: boolean;
  busy: boolean;
  onToggleCamera: () => void;
  onDescribeNow: () => void;
  onToggleContinuous: () => void;
  onToggleVoice: () => void;
  onRepeat: () => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-3" role="group" aria-label="Guidance controls">
      <button
        type="button"
        onClick={onToggleCamera}
        aria-pressed={cameraOn}
        className={`${baseBtn} col-span-2 ${
          cameraOn ? "bg-neutral-800 text-white" : "bg-white text-black"
        }`}
      >
        {cameraOn ? "Stop camera" : "Start camera"}
      </button>

      <button
        type="button"
        onClick={onDescribeNow}
        disabled={!cameraOn || busy}
        aria-label="Describe what is ahead"
        className={`${baseBtn} col-span-2 bg-yellow-300 text-black text-xl py-5`}
      >
        {busy ? "Looking…" : "Describe what's ahead"}
      </button>

      <button
        type="button"
        onClick={onToggleContinuous}
        aria-pressed={continuous}
        disabled={!cameraOn}
        className={`${baseBtn} ${
          continuous ? "bg-clear text-white" : "bg-neutral-800 text-white"
        }`}
      >
        {continuous ? "Continuous: ON" : "Continuous: OFF"}
      </button>

      <button
        type="button"
        onClick={onToggleVoice}
        aria-pressed={voiceOn}
        className={`${baseBtn} ${
          voiceOn ? "bg-neutral-800 text-white" : "bg-hazard text-white"
        }`}
      >
        {voiceOn ? "Voice: ON" : "Voice: OFF"}
      </button>

      <button
        type="button"
        onClick={onRepeat}
        disabled={!voiceOn}
        className={`${baseBtn} col-span-2 bg-neutral-800 text-white border border-neutral-700`}
      >
        Repeat last
      </button>
    </div>
  );
}
