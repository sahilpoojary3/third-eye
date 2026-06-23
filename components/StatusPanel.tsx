"use client";

import type { Guidance } from "@/lib/types";

const styleMap = {
  clear: {
    bg: "bg-clear",
    ring: "ring-clearBright",
    label: "Clear",
    aria: "Path clear",
  },
  caution: {
    bg: "bg-caution",
    ring: "ring-cautionBright",
    label: "Caution",
    aria: "Caution",
  },
  hazard: {
    bg: "bg-hazard",
    ring: "ring-hazardBright",
    label: "Hazard",
    aria: "Hazard",
  },
} as const;

export function StatusPanel({ guidance }: { guidance: Guidance | null }) {
  const level = guidance?.level ?? "clear";
  const s = styleMap[level];
  return (
    <section
      aria-label="Current guidance"
      className={`rounded-2xl ${s.bg} text-white p-5 ring-4 ${s.ring} ring-opacity-40`}
    >
      <div className="flex items-baseline justify-between mb-2">
        <span className="text-xs uppercase tracking-widest opacity-90 font-bold">
          {s.label}
        </span>
        <span className="text-xs opacity-80">{guidance ? "live" : "—"}</span>
      </div>
      <p className="text-2xl leading-snug font-semibold" aria-label={s.aria}>
        {guidance?.speak ?? "Waiting for first reading…"}
      </p>
      {guidance?.details && (
        <p className="mt-2 text-sm opacity-90">{guidance.details}</p>
      )}
    </section>
  );
}
