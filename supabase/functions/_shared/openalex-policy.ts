export const SEARCH_CREDITS = 10;
// Reserve capacity for the existing discovery jobs on the same key.
export const RESERVED_CREDITS = 1000;
export const MAX_SEARCHES_PER_HOUR = 35;

export function searchAllowance(remaining: number) {
  if (!Number.isFinite(remaining)) return 0;
  return Math.max(0, Math.min(MAX_SEARCHES_PER_HOUR,
    Math.floor((remaining - RESERVED_CREDITS) / SEARCH_CREDITS)));
}

export function retryAfterMs(value: string | null, now: number) {
  if (!value) return 0;
  if (/^\d+$/.test(value.trim())) return Number(value) * 1000;
  return Math.max(0, Date.parse(value) - now || 0);
}

export function retryDelayMs(attempt: number, retryAfter: number, jitter = Math.random()) {
  const exponential = Math.min(60 * 60_000, 30_000 * 2 ** Math.min(8, Math.max(0, attempt - 1)));
  return Math.max(retryAfter, exponential * (1 + 0.25 * jitter));
}

export const OPENALEX_ADVISORY_LOCK = 68130919;

// All billable OpenAlex callers in this project use the same database lock.
export async function coordinatedOpenAlexFetch(db: any, url: string, userAgent: string, timeout: number) {
  return db.begin(async (tx: any) => {
    await tx`select pg_advisory_xact_lock(${OPENALEX_ADVISORY_LOCK})`;
    const [gate] = await tx`select retry_after, last_error from private.enrichment_provider_state
      where provider='openalex' and retry_after>now() and last_error is distinct from
      'OpenAlex daily budget reserved or exhausted'`;
    if (gate) {
      return new Response(null, { status: 429,
        headers: { "Retry-After": String(Math.max(1, Math.ceil((new Date(gate.retry_after).getTime() - Date.now()) / 1000))) } });
    }
    const response = await fetch(url, { signal: AbortSignal.timeout(timeout), headers: { "User-Agent": userAgent } });
    const body = await response.text();
    if (response.status === 429) {
      let reason = "";
      try { reason = JSON.parse(body)?.reason || ""; } catch { /* The status and headers still apply. */ }
      const now = Date.now();
      const reportedReset = Number(response.headers.get("X-RateLimit-Reset") || 0) * 1000;
      const nextMidnight = Math.ceil((now + 1) / 86400000) * 86400000;
      const reset = reason === "daily_budget" ? (reportedReset || nextMidnight - now) : 0;
      const retry = Math.max(reset, retryAfterMs(response.headers.get("Retry-After"), now));
      await tx`update private.enrichment_provider_state
        set retry_after=${new Date(now + retryDelayMs(1, retry))},
          consecutive_failures=consecutive_failures+1,
          last_error='OpenAlex HTTP 429',updated_at=now() where provider='openalex'`;
    }
    return new Response(body || null, { status: response.status, headers: response.headers });
  });
}
