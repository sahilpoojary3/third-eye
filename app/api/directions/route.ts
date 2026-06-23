import { NextResponse } from "next/server";
import type { RouteResult } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Free walking-directions stack — no API key required.
//   Geocoding: Nominatim (https://nominatim.openstreetmap.org). 1 req/sec
//     soft limit, must send a real User-Agent identifying the app.
//   Routing:   OSRM public demo (https://router.project-osrm.org). Rate-limited,
//     no SLA. Fine for a prototype; swap to a self-hosted OSRM or Mapbox
//     when this goes near a real user.
//
// If GOOGLE_MAPS_API_KEY is set in the env, we honor it and use Google Directions
// instead — see the branch at the bottom.

const UA = "Third-Eye-Prototype/0.1 (educational; non-commercial)";

type TransitMode = "walk" | "bus";

interface DirectionsRequest {
  origin: { lat: number; lng: number } | string;
  destination: string;
  mode?: TransitMode;
}

interface NominatimHit {
  lat: string;
  lon: string;
  display_name: string;
}

interface OsrmStep {
  distance: number;
  name: string;
  maneuver: {
    location: [number, number]; // [lng, lat]
    type: string;
    modifier?: string;
    bearing_after?: number;
  };
}

function osrmInstruction(step: OsrmStep): string {
  const t = step.maneuver.type;
  const m = step.maneuver.modifier;
  const name = step.name?.trim() || "the road";
  switch (t) {
    case "depart":
      return `Head ${m ?? "forward"} on ${name}`;
    case "turn":
      return `Turn ${m ?? "ahead"} onto ${name}`;
    case "new name":
      return `Continue onto ${name}`;
    case "merge":
      return `Merge ${m ?? "ahead"} onto ${name}`;
    case "on ramp":
      return `Take the ramp ${m ?? ""} onto ${name}`.trim();
    case "off ramp":
      return `Take the exit ${m ?? ""} toward ${name}`.trim();
    case "fork":
      return `Keep ${m ?? "ahead"} at the fork onto ${name}`;
    case "end of road":
      return `At the end of the road, turn ${m ?? "ahead"} onto ${name}`;
    case "continue":
      return `Continue ${m ?? "straight"} on ${name}`;
    case "roundabout":
    case "rotary":
      return `Enter the roundabout, take exit onto ${name}`;
    case "exit roundabout":
    case "exit rotary":
      return `Exit the roundabout onto ${name}`;
    case "arrive":
      return `Arrive at your destination`;
    default:
      return `Continue on ${name}`;
  }
}

function haversineMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const la1 = (a.lat * Math.PI) / 180;
  const la2 = (b.lat * Math.PI) / 180;
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLng / 2) ** 2 * Math.cos(la1) * Math.cos(la2);
  return 2 * R * Math.asin(Math.sqrt(x));
}

async function findNearestBusStop(origin: { lat: number; lng: number }): Promise<{
  name: string;
  location: { lat: number; lng: number };
  distanceMeters: number;
} | null> {
  // 600m radius Overpass query for OSM bus stops (highway=bus_stop or
  // public_transport=platform/stop_position with bus=yes).
  const radius = 600;
  const q = `[out:json][timeout:8];(
    node(around:${radius},${origin.lat},${origin.lng})[highway=bus_stop];
    node(around:${radius},${origin.lat},${origin.lng})[public_transport=platform][bus=yes];
    node(around:${radius},${origin.lat},${origin.lng})[public_transport=stop_position][bus=yes];
  );out body;`;
  const r = await fetch("https://overpass-api.de/api/interpreter", {
    method: "POST",
    headers: { "User-Agent": UA, "Content-Type": "text/plain" },
    body: q,
    cache: "no-store",
  });
  if (!r.ok) throw new Error(`Overpass ${r.status}`);
  const json = (await r.json()) as {
    elements: Array<{ lat: number; lon: number; tags?: { name?: string; ref?: string } }>;
  };
  if (!json.elements.length) return null;
  let best: {
    name: string;
    location: { lat: number; lng: number };
    distanceMeters: number;
  } | null = null;
  for (const el of json.elements) {
    const loc = { lat: el.lat, lng: el.lon };
    const d = haversineMeters(origin, loc);
    const name = el.tags?.name ?? el.tags?.ref ?? "an unnamed bus stop";
    if (!best || d < best.distanceMeters) {
      best = { name, location: loc, distanceMeters: d };
    }
  }
  return best;
}

async function geocode(query: string): Promise<{ lat: number; lng: number; label: string }> {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", query);
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", "1");
  const r = await fetch(url.toString(), {
    headers: { "User-Agent": UA, "Accept-Language": "en" },
    cache: "no-store",
  });
  if (!r.ok) throw new Error(`Geocoder error ${r.status}`);
  const hits = (await r.json()) as NominatimHit[];
  if (!hits.length) throw new Error("Destination not found");
  return {
    lat: parseFloat(hits[0].lat),
    lng: parseFloat(hits[0].lon),
    label: hits[0].display_name,
  };
}

async function osrmRoute(
  origin: { lat: number; lng: number },
  dest: { lat: number; lng: number },
  profile: "foot" | "bike" = "foot"
): Promise<RouteResult> {
  const coords = `${origin.lng},${origin.lat};${dest.lng},${dest.lat}`;
  const url = new URL(`https://router.project-osrm.org/route/v1/${profile}/${coords}`);
  url.searchParams.set("overview", "false");
  url.searchParams.set("steps", "true");
  url.searchParams.set("alternatives", "false");
  const r = await fetch(url.toString(), {
    headers: { "User-Agent": UA },
    cache: "no-store",
  });
  if (!r.ok) throw new Error(`Router error ${r.status}`);
  const json = (await r.json()) as {
    code: string;
    routes?: Array<{
      distance: number;
      duration: number;
      legs: Array<{ steps: OsrmStep[] }>;
    }>;
  };
  if (json.code !== "Ok" || !json.routes?.length) {
    throw new Error(`Router: ${json.code}`);
  }
  const route = json.routes[0];
  const steps = route.legs[0]?.steps ?? [];
  const maneuvers = steps.map((s) => ({
    instruction: osrmInstruction(s),
    distanceMeters: s.distance,
    endLocation: { lat: s.maneuver.location[1], lng: s.maneuver.location[0] },
  }));
  return {
    maneuvers,
    summary: "Walking route via OSM",
    totalDistanceMeters: route.distance,
    totalDurationSeconds: route.duration,
  };
}

// ----- Google fallback, used only when GOOGLE_MAPS_API_KEY is set -----
async function googleDirections(
  origin: string,
  destination: string,
  key: string
): Promise<RouteResult> {
  const url = new URL("https://maps.googleapis.com/maps/api/directions/json");
  url.searchParams.set("origin", origin);
  url.searchParams.set("destination", destination);
  url.searchParams.set("mode", "walking");
  url.searchParams.set("key", key);
  const r = await fetch(url.toString(), { cache: "no-store" });
  const json = await r.json();
  if (json.status !== "OK" || !json.routes?.length) {
    throw new Error(json.error_message || json.status || "no route");
  }
  const route = json.routes[0];
  const leg = route.legs[0];
  const stripHtml = (s: string) => s.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
  const maneuvers = (leg.steps ?? []).map((s: {
    html_instructions: string;
    distance: { value: number };
    end_location: { lat: number; lng: number };
  }) => ({
    instruction: stripHtml(s.html_instructions),
    distanceMeters: s.distance.value,
    endLocation: { lat: s.end_location.lat, lng: s.end_location.lng },
  }));
  return {
    maneuvers,
    summary: route.summary ?? "",
    totalDistanceMeters: leg.distance.value,
    totalDurationSeconds: leg.duration.value,
  };
}

export async function POST(req: Request) {
  let body: DirectionsRequest;
  try {
    body = (await req.json()) as DirectionsRequest;
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  if (!body.destination) {
    return NextResponse.json({ error: "destination required" }, { status: 400 });
  }

  const googleKey = process.env.GOOGLE_MAPS_API_KEY;

  try {
    // Google branch — used only if the user opts in by setting GOOGLE_MAPS_API_KEY.
    if (googleKey) {
      const originStr =
        typeof body.origin === "string" ? body.origin : `${body.origin.lat},${body.origin.lng}`;
      const result = await googleDirections(originStr, body.destination, googleKey);
      return NextResponse.json(result);
    }

    // Default free path: Nominatim → OSRM.
    if (typeof body.origin === "string") {
      return NextResponse.json(
        { error: "OSRM mode needs origin as {lat,lng}" },
        { status: 400 }
      );
    }
    const dest = await geocode(body.destination);
    const result = await osrmRoute(body.origin, dest, "foot");

    // Bus mode: free public-transit routing is not available globally
    // without an API key. The honest behavior is: walk to the nearest
    // bus stop, take a bus, and walk from the destination stop. We
    // surface that as a spoken-friendly nudge prepended to the route.
    if (body.mode === "bus") {
      const stop = await findNearestBusStop(body.origin).catch(() => null);
      if (stop) {
        result.summary = `Walk to ${stop.name}, then take a bus toward your destination`;
        result.maneuvers = [
          {
            instruction: `Walk to the nearest bus stop, ${stop.name}, about ${Math.round(
              stop.distanceMeters
            )} meters`,
            distanceMeters: stop.distanceMeters,
            endLocation: stop.location,
          },
          {
            instruction:
              "Board a bus heading toward your destination. Free transit routing is unavailable, so please confirm the route with the driver or a transit app.",
            distanceMeters: 0,
            endLocation: stop.location,
          },
          ...result.maneuvers,
        ];
      } else {
        result.summary = `No nearby bus stop found. Walking route to ${dest.label}.`;
      }
    }
    return NextResponse.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "directions failed";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
