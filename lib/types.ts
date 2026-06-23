export type GuidanceLevel = "clear" | "caution" | "hazard";

export interface Guidance {
  level: GuidanceLevel;
  speak: string;
  details: string;
}

export interface GuideRequest {
  imageBase64: string;
  nextManeuver?: string;
}

export interface LatLng {
  lat: number;
  lng: number;
}

export interface Maneuver {
  instruction: string;
  distanceMeters: number;
  endLocation: LatLng;
}

export interface RouteResult {
  maneuvers: Maneuver[];
  summary: string;
  totalDistanceMeters: number;
  totalDurationSeconds: number;
}
