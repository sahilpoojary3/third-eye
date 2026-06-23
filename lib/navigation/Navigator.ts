import type { Guidance } from "../types";

// A Navigator decides "which way should the user go next?" Two implementations:
//   - CameraSteering: derives direction from the vision model's reading of
//     the path ahead. No GPS, no map. Works indoors.
//   - MapsNavigation: classic GPS + Directions API turn-by-turn.
// Both feed an upcoming-maneuver hint to the guidance loop so the vision
// prompt can be route-aware.
export interface Navigator {
  readonly id: "camera" | "maps";
  // Optional human-readable upcoming maneuver, e.g. "Turn right onto Elm St in 40 m".
  // Returned undefined when the navigator has no opinion yet.
  nextManeuver(): string | undefined;
  // Called after each guidance result so navigators that depend on the camera
  // (CameraSteering) can update their internal heading.
  onGuidance?(g: Guidance): void;
  // Maps mode only — tick periodically with current GPS to advance the route.
  onPosition?(lat: number, lng: number): void;
  // Spoken summary of the current maneuver (Maps) or the AI heading hint (Camera).
  speak(): string | undefined;
  start(): Promise<void>;
  stop(): Promise<void>;
}
