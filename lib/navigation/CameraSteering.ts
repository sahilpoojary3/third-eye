import type { Navigator } from "./Navigator";
import type { Guidance } from "../types";

// CameraSteering uses the vision model as the navigator. We surface the
// `details` field of the last guidance result as the upcoming-maneuver hint
// so the next call is contextual ("keep bearing right around the planter").
export class CameraSteering implements Navigator {
  readonly id = "camera" as const;
  private last: Guidance | null = null;

  async start(): Promise<void> {}
  async stop(): Promise<void> {
    this.last = null;
  }

  onGuidance(g: Guidance): void {
    this.last = g;
  }

  nextManeuver(): string | undefined {
    if (!this.last) return undefined;
    // Feed back the last spoken line as soft "you were heading this way" context.
    return `Continuing on foot. Last reading: ${this.last.speak}`;
  }

  speak(): string | undefined {
    return this.last?.speak;
  }
}
