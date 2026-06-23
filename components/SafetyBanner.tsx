export function SafetyBanner() {
  return (
    <div
      role="note"
      aria-label="Safety notice"
      className="bg-yellow-300 text-black px-3 py-2 text-sm font-semibold leading-snug border-b-4 border-yellow-500"
    >
      Prototype only — NOT a certified mobility aid. Keep using your cane,
      guide dog, and orientation training. Never rely on this app for safety.
    </div>
  );
}
