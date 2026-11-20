// Retry policy for publisher-page checks in the hourly enrichment worker.
// A failed fetch is not evidence that a publication is missing: transient failures are retried on a
// widening schedule, and a host that keeps failing inside one invocation is skipped for that chunk.

export const PUBLISHER_MAX_ATTEMPTS = 6;
// Delay before the next attempt, indexed by the number of attempts already made (after this failure).
const SCHEDULE_MS = [30 * 60_000, 3 * 3600_000, 12 * 3600_000, 24 * 3600_000, 72 * 3600_000];

export type FailureKind = "timeout" | "network" | "server" | "permanent";

export function classifyFailure(error: unknown): { kind: FailureKind; detail: string } {
  const name = error instanceof Error ? error.name : "";
  const message = error instanceof Error ? error.message : String(error ?? "");
  if (name === "TimeoutError" || name === "AbortError" || /timed? ?out|timeout/i.test(message)) {
    return { kind: "timeout", detail: "timeout" };
  }
  const http = message.match(/Publisher HTTP (\d{3})/);
  if (http) return { kind: "server", detail: "HTTP " + http[1] };
  if (/Invalid or non-public URL|Unsafe or invalid redirect|Too many redirects/.test(message)) {
    return { kind: "permanent", detail: message.slice(0, 80) };
  }
  return { kind: "network", detail: "connection error" };
}

export function hostOf(url: string) {
  try { return new URL(url).hostname.toLowerCase().replace(/^www\./, ""); } catch { return ""; }
}

export function publisherFailure(attemptsSoFar: number, error: unknown, url: string, jitter = Math.random()) {
  const { kind, detail } = classifyFailure(error);
  const host = hostOf(url) || "unknown host";
  const made = Math.max(0, attemptsSoFar) + 1;
  if (kind === "permanent") {
    return { status: "error", note: `Publisher link unusable: ${detail} (${host})` };
  }
  if (made >= PUBLISHER_MAX_ATTEMPTS) {
    return { status: "error", note: `Publisher unreachable after ${made} attempts: ${detail} (${host})` };
  }
  const base = SCHEDULE_MS[Math.min(made - 1, SCHEDULE_MS.length - 1)];
  return {
    status: "pending",
    note: `Publisher fetch failed: ${detail} (${host}); retry ${made + 1} of ${PUBLISHER_MAX_ATTEMPTS} scheduled`,
    retry: new Date(Date.now() + base * (1 + 0.25 * jitter)),
  };
}

// Stops one invocation repeatedly hitting a host that is failing. Records it skips stay pending and
// are not counted as attempted, so a later chunk or hourly run picks them up.
export class HostBreaker {
  #failures = new Map<string, number>();
  limit: number;
  constructor(limit = 2) { this.limit = limit; }
  fail(url: string) {
    const host = hostOf(url);
    this.#failures.set(host, (this.#failures.get(host) ?? 0) + 1);
  }
  succeed(url: string) { this.#failures.delete(hostOf(url)); }
  isOpen(url: string) { return (this.#failures.get(hostOf(url)) ?? 0) >= this.limit; }
}

// OpenAlex indexes scholarly works. Spend the limited hourly title searches on those first.
export const NON_SCHOLARLY_KINDS = ["blog-post", "news", "commentary", "newsletter", "programme-profile",
  "not-research", "information-webpage", "publication-resource-page", "nonpaper-resource", "other"];
