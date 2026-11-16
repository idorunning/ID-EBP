// ID-EBP backup export. READ-ONLY. Streams a snapshot-consistent JSON Lines copy of
// every table in public, private and staging (plus auth users/identities) to the
// idebp-backup Worker, which compresses, encrypts and stores it in R2.
// Auth: header x-backup-token whose SHA-256 must match vault secret backup_export_token_sha256.
import postgres from "npm:postgres@3.4.4";

const sql = postgres(Deno.env.get("SUPABASE_DB_URL")!, { prepare: false, max: 1 });
const SKIP = new Set(["public.research_search_documents", "private.research_index_jobs", "staging.label_claims", "staging.label_suggestions_haiku_20261116"]);

async function sha256(s: string) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });
  const token = req.headers.get("x-backup-token") ?? "";
  if (token.length < 32 || token.length > 256) return new Response("forbidden", { status: 403 });
  const [row] = await sql`select decrypted_secret from vault.decrypted_secrets where name = 'backup_export_token_sha256'`;
  if (!row || (await sha256(token)) !== row.decrypted_secret) return new Response("forbidden", { status: 403 });

  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const line = (o: unknown) => controller.enqueue(enc.encode(JSON.stringify(o) + "\n"));
      try {
        await sql.begin("isolation level repeatable read read only", async (tx) => {
          const tables = await tx`
            select n.nspname as schema, c.relname as name from pg_class c join pg_namespace n on n.oid = c.relnamespace
            where c.relkind = 'r' and ((n.nspname in ('public','private','staging') and c.relname not like 'snapshot\_%')
               or (n.nspname = 'auth' and c.relname in ('users','identities')))
            order by 1, 2`;
          const counts: Record<string, number> = {};
          line({ kind: "header", format: "idebp-backup-v1", created_at: new Date().toISOString(), project: "hvwmystbqlocjixvwgfl" });
          for (const t of tables) {
            const fq = `${t.schema}.${t.name}`;
            if (SKIP.has(fq)) continue;
            const cols = await tx`select column_name, data_type from information_schema.columns where table_schema = ${t.schema} and table_name = ${t.name} and is_generated = 'NEVER' order by ordinal_position`;
            const keep = cols.filter((c: any) => !(fq === "public.research_records" && c.column_name === "search_vector"));
            line({ kind: "table", table: fq, columns: keep.map((c: any) => ({ name: c.column_name, type: c.data_type })) });
            const list = keep.map((c: any) => `"${c.column_name.replace(/"/g, '""')}"`).join(",");
            let n = 0;
            const cursor = tx.unsafe(`select row_to_json(x) as r from (select ${list} from "${t.schema}"."${t.name}") x`).cursor(500);
            for await (const rows of cursor) { for (const r of rows) { line({ kind: "row", t: fq, r: r.r }); n++; } }
            counts[fq] = n;
          }
          line({ kind: "footer", counts, finished_at: new Date().toISOString() });
        });
        controller.close();
      } catch (e) {
        line({ kind: "error", message: String(e).slice(0, 300) });
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson", "Cache-Control": "no-store" } });
});
