// ID-EBP backup export. READ-ONLY. Copies every table in public, private and staging (plus auth
// users/identities) to the idebp-backup Worker, which compresses, encrypts and stores it in R2.
// Auth: header x-backup-token whose SHA-256 must match vault secret backup_export_token_sha256.
//
// v2 (20 November 2026): the single streamed export outgrew the Edge Function CPU limit and was being
// cut off before its footer (backups failed from 17 November). The Worker now asks for the table list
// and then pages through each table by primary key, so no single request does more than one page.
//   POST {"op":"tables"}                                  -> {tables:[{table,columns,key}]}
//   POST {"op":"rows","table":T,"after":[...]|null,"limit":N} -> JSON Lines of {"kind":"row",...}, then
//                                                          {"kind":"page","next":[...]|null,"n":k}
// Each page is consistent on its own; pages are not one snapshot. Master tables are small enough
// to be read in a handful of pages within seconds.
import postgres from "npm:postgres@3.4.4";

const sql = postgres(Deno.env.get("SUPABASE_DB_URL")!, { prepare: false, max: 1 });
const SKIP = new Set(["public.research_search_documents", "private.research_index_jobs", "staging.label_claims",
  "staging.label_suggestions_haiku_20261116"]);
const ident = (s: string) => `"${s.replace(/"/g, '""')}"`;

async function sha256(s: string) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function tables() {
  const rows = await sql`
    select n.nspname as schema, c.relname as name,
      (select coalesce(json_agg(json_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod)) order by a.attnum),'[]')
         from pg_attribute a where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped and a.attgenerated='') as columns,
      (select json_agg(a.attname order by array_position(i.indkey::int2[], a.attnum))
         from pg_index i join pg_attribute a on a.attrelid=i.indrelid and a.attnum=any(i.indkey)
         where i.indrelid=c.oid and i.indisprimary) as key
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where c.relkind='r' and ((n.nspname in ('public','private','staging') and c.relname not like 'snapshot\\_%')
       or (n.nspname='auth' and c.relname in ('users','identities')))
    order by 1,2`;
  return rows.map((t: any) => {
    const fq = `${t.schema}.${t.name}`;
    const columns = t.columns.filter((c: any) => !(fq === "public.research_records" && c.name === "search_vector"));
    return { table: fq, schema: t.schema, name: t.name, columns, key: t.key ?? null };
  }).filter((t: any) => !SKIP.has(t.table));
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });
  const token = req.headers.get("x-backup-token") ?? "";
  if (token.length < 32 || token.length > 256) return new Response("forbidden", { status: 403 });
  const [row] = await sql`select decrypted_secret from vault.decrypted_secrets where name = 'backup_export_token_sha256'`;
  if (!row || (await sha256(token)) !== row.decrypted_secret) return new Response("forbidden", { status: 403 });
  const body = await req.json().catch(() => ({}));

  if (body?.op === "tables") {
    const list = await tables();
    return Response.json({ tables: list.map(({ table, columns, key }) => ({ table, columns, key })) });
  }
  if (body?.op === "rows") {
    const t = (await tables()).find((x) => x.table === body.table);
    if (!t) return new Response("unknown table", { status: 400 });
    const limit = Math.min(5000, Math.max(100, Number(body.limit) || 2000));
    const cols = t.columns.map((c: any) => "t." + ident(c.name)).join(",");
    // Page by primary key (as text, C collation, so the order is total and stable), else by ctid.
    const keyCols: string[] = t.key ?? [];
    const keyExpr = keyCols.length ? keyCols.map((k) => `t.${ident(k)}::text collate "C"`).join(",") : `t.ctid`;
    const after = Array.isArray(body.after) ? body.after.map(String) : null;
    if (after && keyCols.length && after.length !== keyCols.length) return new Response("bad cursor", { status: 400 });
    const where = !after ? "" : keyCols.length
      ? `where (${keyExpr}) > (${after.map((_: string, i: number) => `$${i + 1}::text collate "C"`).join(",")})`
      : `where t.ctid > $1::tid`;
    const cursorCols = keyCols.length ? keyCols.map((k) => `t.${ident(k)}::text`).join(",") : "t.ctid::text";
    const query = `select json_build_array(${cursorCols})::text as c,
        (select row_to_json(s) from (select ${cols}) s)::text as r
      from ${ident(t.schema)}.${ident(t.name)} t ${where} order by ${keyExpr} limit ${limit}`;
    const rows = await sql.unsafe(query, after ?? []);
    const lines = rows.map((x: any) => `{"kind":"row","t":${JSON.stringify(t.table)},"r":${x.r}}`);
    const next = rows.length === limit ? JSON.parse(rows[rows.length - 1].c) : null;
    lines.push(JSON.stringify({ kind: "page", table: t.table, n: rows.length, next }));
    return new Response(lines.join("\n") + "\n", { headers: { "Content-Type": "application/x-ndjson", "Cache-Control": "no-store" } });
  }
  return new Response("op must be tables or rows", { status: 400 });
});
