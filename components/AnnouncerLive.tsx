"use client";

// Renders an aria-live="assertive" region. Whatever text we drop in here
// will be announced by screen readers immediately, replacing any prior text.
// This is independent of speechSynthesis — VoiceOver / TalkBack / NVDA users
// rely on this region directly.
export function AnnouncerLive({ message }: { message: string }) {
  return (
    <div
      role="status"
      aria-live="assertive"
      aria-atomic="true"
      className="sr-only"
    >
      {message}
    </div>
  );
}
