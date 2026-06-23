import { NextResponse } from "next/server";
import type { Guidance, GuidanceLevel } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Vision provider strategy (default: zero-key, zero-cost):
//   1. If GEMINI_API_KEY is set, use Google Gemini (free tier with key).
//   2. Else if ANTHROPIC_API_KEY is set, use Claude (paid).
//   3. Else fall back to Pollinations.ai — a free, keyless proxy. Lower
//      quality and best-effort uptime; fine for a prototype, not for a
//      real mobility aid.
//
// All three return the same Guidance contract: {level, speak, details}.

const GEMINI_MODEL = "gemini-2.0-flash";
const ANTHROPIC_MODEL = "claude-sonnet-4-6";
const POLLINATIONS_MODEL = "openai";

const SYSTEM_PROMPT = `You are acting as the EYES for a blind or low-vision person who is walking. Your job is real-time mobility guidance from a single camera frame.

Non-negotiable rules:
- SAFETY FIRST. If there is any immediate physical danger ahead, that is what you speak. Nothing else.
- BE EXTREMELY CONCISE. The "speak" field is read aloud. Maximum 18 words. Plain English. No lists, no preamble, no apology.
- LEAD WITH THE HAZARD if there is one, then the direction. Otherwise lead with the open path and the direction.
- ALWAYS give a direction when relevant: "straight", "bear left", "bear right", "stop", "step down", "step up".
- DO NOT describe scenery, colors, or aesthetics. Only what affects walking.
- DO NOT say "I can see" / "I think" / "It looks like". Speak as a guide, not a narrator.
- If a route maneuver is provided, weave it into the direction (e.g. "Clear path. Your turn right is about ten meters ahead.").

Severity:
- "hazard": immediate danger within a few steps — steps, curbs, drop-offs, traffic, bicycles, head-height obstacles, holes, wet/icy surfaces, closing doors.
- "caution": worth knowing but not imminent — uneven surface ahead, narrow passage, person approaching, intersection coming up.
- "clear": open and safe path ahead.

Output ONLY a single JSON object, no prose, no code fence:
{"level":"clear|caution|hazard","speak":"<= 18 words spoken aloud","details":"one short sentence with extra context for the screen"}`;

interface RequestBody {
  imageBase64?: string;
  nextManeuver?: string;
}

function safeParseGuidance(text: string): Guidance {
  const tryParse = (s: string): Guidance | null => {
    try {
      const obj = JSON.parse(s);
      const lvl: GuidanceLevel =
        obj.level === "hazard" || obj.level === "caution" ? obj.level : "clear";
      const speak = typeof obj.speak === "string" ? obj.speak.trim() : "";
      const details = typeof obj.details === "string" ? obj.details.trim() : "";
      if (!speak) return null;
      return { level: lvl, speak, details };
    } catch {
      return null;
    }
  };
  const direct = tryParse(text);
  if (direct) return direct;
  const m = text.match(/\{[\s\S]*\}/);
  if (m) {
    const peeled = tryParse(m[0]);
    if (peeled) return peeled;
  }
  const speak = text.trim().slice(0, 140) || "Path unclear. Slow down and stop.";
  return { level: "caution", speak, details: "Vision model returned unstructured text." };
}

async function callGemini(
  apiKey: string,
  imageBase64: string,
  userText: string
): Promise<Guidance> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;
  const body = {
    systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
    contents: [
      {
        role: "user",
        parts: [
          { inline_data: { mime_type: "image/jpeg", data: imageBase64 } },
          { text: userText },
        ],
      },
    ],
    generationConfig: {
      maxOutputTokens: 220,
      temperature: 0.2,
      responseMimeType: "application/json",
      responseSchema: {
        type: "object",
        properties: {
          level: { type: "string", enum: ["clear", "caution", "hazard"] },
          speak: { type: "string" },
          details: { type: "string" },
        },
        required: ["level", "speak"],
      },
    },
  };
  const r = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!r.ok) {
    const t = await r.text().catch(() => "");
    throw new Error(`Gemini ${r.status}: ${t.slice(0, 300)}`);
  }
  const json = (await r.json()) as {
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string }> };
      finishReason?: string;
    }>;
    promptFeedback?: { blockReason?: string };
  };
  if (json.promptFeedback?.blockReason) {
    throw new Error(`Gemini blocked: ${json.promptFeedback.blockReason}`);
  }
  const text = json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  if (!text) throw new Error("Gemini returned no text");
  return safeParseGuidance(text);
}

async function callPollinations(
  imageBase64: string,
  userText: string
): Promise<Guidance> {
  // Pollinations.ai exposes an OpenAI-compatible chat-completion endpoint
  // with vision support and no auth. See https://pollinations.ai/
  const r = await fetch("https://text.pollinations.ai/openai", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model: POLLINATIONS_MODEL,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            { type: "text", text: userText },
            {
              type: "image_url",
              image_url: { url: `data:image/jpeg;base64,${imageBase64}` },
            },
          ],
        },
      ],
      max_tokens: 220,
      temperature: 0.2,
      response_format: { type: "json_object" },
    }),
    cache: "no-store",
  });
  if (!r.ok) {
    const t = await r.text().catch(() => "");
    throw new Error(`Pollinations ${r.status}: ${t.slice(0, 300)}`);
  }
  const json = (await r.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const text = json.choices?.[0]?.message?.content ?? "";
  if (!text) throw new Error("Pollinations returned no text");
  return safeParseGuidance(text);
}

async function callAnthropic(
  apiKey: string,
  imageBase64: string,
  userText: string
): Promise<Guidance> {
  const Anthropic = (await import("@anthropic-ai/sdk")).default;
  const client = new Anthropic({ apiKey });
  const resp = await client.messages.create({
    model: ANTHROPIC_MODEL,
    max_tokens: 220,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: "image/jpeg", data: imageBase64 },
          },
          { type: "text", text: userText },
        ],
      },
    ],
  });
  const text = resp.content
    .map((b) => (b.type === "text" ? b.text : ""))
    .join("\n");
  return safeParseGuidance(text);
}

export async function POST(req: Request) {
  const geminiKey = process.env.GEMINI_API_KEY;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  // No keys is fine — we fall back to Pollinations.

  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  const { imageBase64, nextManeuver } = body;
  if (!imageBase64 || typeof imageBase64 !== "string") {
    return NextResponse.json({ error: "imageBase64 required" }, { status: 400 });
  }

  const userText = nextManeuver
    ? `Upcoming route maneuver: ${nextManeuver}. Describe the walking situation now.`
    : `Describe the walking situation now.`;

  if (!geminiKey && !anthropicKey) {
    return NextResponse.json(
      {
        level: "caution",
        speak: "Vision service not configured. Stop and use your cane.",
        details:
          "Set GEMINI_API_KEY (free) on the server. Get one at aistudio.google.com/apikey.",
      } satisfies Guidance,
      { status: 500 }
    );
  }

  try {
    const guidance = geminiKey
      ? await callGemini(geminiKey, imageBase64, userText)
      : await callAnthropic(anthropicKey!, imageBase64, userText);
    return NextResponse.json(guidance);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "vision call failed";
    return NextResponse.json(
      {
        level: "caution",
        speak: "Vision unavailable. Slow down. Use your cane.",
        details: msg,
      } satisfies Guidance,
      { status: 502 }
    );
  }
}
