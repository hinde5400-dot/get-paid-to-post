// Instagram bio via Apify (Turn's order, 2026-11-13, FINAL).
//
// Instagram blocks Vercel's datacenter IPs outright — the direct
// page fetch returns a shell with no bio and web_profile_info
// answers 429, no matter how many times it retries. So Instagram
// verification NO LONGER fetches from Vercel at all. It runs the
// Apify Instagram Profile Scraper actor
// (apify/instagram-profile-scraper), which reads the public
// profile from a residential-style IP and returns the biography
// as structured data. Free plan: $5 of platform usage every
// month, no credit card — about 1,000 profile scrapes a month at
// ~$0.005 each, which covers this site's launch. When the $5 is
// spent, Apify blocks new runs until the next monthly cycle (no
// charge ever appears).
//
// The actor runs ASYNCHRONOUSLY — a run takes 30–90 seconds for
// one profile, so it can never be awaited inside a Vercel
// function (10-second limit). The flow is: start the run, save
// the run id on the verified_profiles row, return { pending },
// and let the card poll every 10 seconds until the run finishes.
// TikTok / YouTube are untouched — they still verify from Vercel
// directly, which works for them.

const APIFY_API_BASE = "https://api.apify.com/v2";
/** Apify's own Instagram Profile Scraper actor. */
const INSTAGRAM_SCRAPER_ACTOR = "apify~instagram-profile-scraper";

export type ApifyRun = {
  runId: string;
  datasetId: string;
  status: string;
};

function apifyToken(): string | null {
  return process.env.APIFY_API_TOKEN ?? null;
}

async function apifyFetch(
  path: string,
  init?: RequestInit
): Promise<unknown> {
  const token = apifyToken();
  if (!token) throw new Error("APIFY_API_TOKEN is not set.");
  const res = await fetch(`${APIFY_API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Apify API error (${res.status}): ${body.slice(0, 200)}`);
  }
  return (await res.json()) as unknown;
}

/**
 * Start one profile scrape for a username. Returns the run id and
 * its dataset id. Never throws — callers treat an error as
 * "try again later", never as a failed verification.
 */
export async function startApifyProfileRun(
  username: string
): Promise<ApifyRun | { error: string }> {
  try {
    const data = (await apifyFetch(
      `/acts/${INSTAGRAM_SCRAPER_ACTOR}/runs`,
      {
        method: "POST",
        body: JSON.stringify({
          usernames: [username],
          resultsType: "details",
          resultsLimit: 1,
        }),
      }
    )) as { data?: { id?: string; defaultDatasetId?: string; status?: string } };
    const runId = data?.data?.id;
    const datasetId = data?.data?.defaultDatasetId;
    if (!runId || !datasetId) {
      console.warn("Apify start run returned no run id:", JSON.stringify(data).slice(0, 300));
      return { error: "Apify did not start a run." };
    }
    return { runId, datasetId, status: data.data?.status ?? "READY" };
  } catch (err) {
    console.warn("Apify start run failed:", err);
    return { error: err instanceof Error ? err.message : "Apify start failed." };
  }
}

/** Current status of a run (READY / RUNNING / SUCCEEDED / FAILED /
 *  TIMED-OUT / ABORTED), plus its dataset id. Never throws. */
export async function getApifyRun(
  runId: string
): Promise<ApifyRun | { error: string }> {
  try {
    const data = (await apifyFetch(`/actor-runs/${encodeURIComponent(runId)}`)) as {
      data?: { id?: string; defaultDatasetId?: string; status?: string };
    };
    const id = data?.data?.id;
    const datasetId = data?.data?.defaultDatasetId;
    if (!id || !datasetId) {
      return { error: "Apify run not found." };
    }
    return { runId: id, datasetId, status: data.data?.status ?? "UNKNOWN" };
  } catch (err) {
    console.warn("Apify get run failed:", err);
    return { error: err instanceof Error ? err.message : "Apify status check failed." };
  }
}

/** Dataset items for a finished run. Never throws. */
export async function getApifyDatasetItems(
  datasetId: string
): Promise<unknown[] | { error: string }> {
  try {
    const data = await apifyFetch(
      `/datasets/${encodeURIComponent(datasetId)}/items`
    );
    if (!Array.isArray(data)) {
      return { error: "Apify dataset was empty." };
    }
    return data as unknown[];
  } catch (err) {
    console.warn("Apify dataset fetch failed:", err);
    return { error: err instanceof Error ? err.message : "Apify dataset fetch failed." };
  }
}

/**
 * Pull the biography out of one dataset item. The actor's shape
 * has varied across versions — top-level `biography` / `bio`, or
 * nested under `profile` — so every known shape is tried.
 */
export function apifyItemBio(item: unknown): string | null {
  if (item === null || typeof item !== "object") return null;
  const rec = item as Record<string, unknown>;
  const candidates = [
    rec.biography,
    rec.bio,
    (rec.profile as Record<string, unknown> | undefined)?.biography,
    (rec.profile as Record<string, unknown> | undefined)?.bio,
  ];
  for (const c of candidates) {
    if (typeof c === "string") return c;
  }
  return null;
}

/** Username of one dataset item, for matching it to the row. */
export function apifyItemUsername(item: unknown): string | null {
  if (item === null || typeof item !== "object") return null;
  const rec = item as Record<string, unknown>;
  const candidates = [
    rec.username,
    (rec.profile as Record<string, unknown> | undefined)?.username,
  ];
  for (const c of candidates) {
    if (typeof c === "string" && c) return c.toLowerCase();
  }
  return null;
}
