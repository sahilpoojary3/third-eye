import type { Navigator } from "./Navigator";
import type { LatLng, Maneuver, RouteResult } from "../types";

function haversineMeters(a: LatLng, b: LatLng): number {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.sqrt(x));
}

export class MapsNavigation implements Navigator {
  readonly id = "maps" as const;
  private route: RouteResult | null = null;
  private idx = 0;
  private lastSpoken = "";

  constructor(private readonly destination: string) {}

  setRoute(route: RouteResult) {
    this.route = route;
    this.idx = 0;
  }

  async start(): Promise<void> {}
  async stop(): Promise<void> {
    this.route = null;
    this.idx = 0;
  }

  private current(): Maneuver | undefined {
    return this.route?.maneuvers[this.idx];
  }

  onPosition(lat: number, lng: number): void {
    const m = this.current();
    if (!m) return;
    const d = haversineMeters({ lat, lng }, m.endLocation);
    // Advance to the next maneuver once we're inside a 12 m bubble of its endpoint.
    if (d < 12 && this.idx < (this.route?.maneuvers.length ?? 0) - 1) {
      this.idx += 1;
    }
  }

  nextManeuver(): string | undefined {
    return this.current()?.instruction;
  }

  speak(): string | undefined {
    const m = this.current();
    if (!m) return undefined;
    const line = `${m.instruction}. ${Math.round(m.distanceMeters)} meters.`;
    if (line === this.lastSpoken) return undefined;
    this.lastSpoken = line;
    return line;
  }

  get destinationText(): string {
    return this.destination;
  }
}
