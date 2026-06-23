"use client";

import { useEffect, useRef } from "react";

export function CameraView({
  videoEl,
  label,
}: {
  videoEl: HTMLVideoElement | null;
  label: string;
}) {
  const mountRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount || !videoEl) return;
    // Style the camera-owned <video> for full-bleed preview.
    videoEl.className = "w-full h-full object-cover";
    videoEl.setAttribute("aria-hidden", "true");
    mount.appendChild(videoEl);
    return () => {
      if (mount.contains(videoEl)) mount.removeChild(videoEl);
    };
  }, [videoEl]);

  return (
    <div
      ref={mountRef}
      role="img"
      aria-label={label}
      className="relative w-full aspect-[3/4] sm:aspect-video bg-neutral-900 overflow-hidden rounded-xl border border-neutral-800"
    >
      {!videoEl && (
        <div className="absolute inset-0 grid place-items-center text-neutral-400 text-sm px-4 text-center">
          Camera off. Press &ldquo;Start camera&rdquo; below.
        </div>
      )}
    </div>
  );
}
