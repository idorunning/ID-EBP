// ID-EBP staging import route. Token-protected; writes only via staging.import_crossref (holding area).
import postgres from "npm:postgres@3.4.4";

const sql = postgres(Deno.env.get("SUPABASE_DB_URL")!, { max: 1, prepare: false });

async function sha256(t: string): Promise<string> {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(t));
  return Array.from(new Uint8Array(b)).map((x) => x.toString(16).padStart(2, "0")).join("");
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method !== "POST") return json(405, { error: "POST only" });
  const auth = req.headers.get("x-import-token") ?? "";
  if (auth.length < 30) return json(401, { error: "unauthorised" });
  const len = Number(req.headers.get("content-length") ?? "0");
  if (len > 400_000) return json(413, { error: "too large" });
  let body: { rows?: unknown };
  try { body = await req.json(); } catch { return json(400, { error: "bad json" }); }
  if (!Array.isArray(body.rows) || body.rows.length === 0 || body.rows.length > 500) return json(400, { error: "rows: 1-500" });
  try {
    const h = await sha256(auth);
    const [r] = await sql`select staging.import_crossref(${h}, ${sql.json(body.rows as any)}) as n`;
    return json(200, { inserted: r.n });
  } catch (e) {
    const m = String((e as Error).message ?? e);
    return json(m.includes("invalid token") ? 401 : 400, { error: m.includes("invalid token") ? "unauthorised" : "rejected" });
  }
});
