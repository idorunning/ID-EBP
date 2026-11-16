-- Token-protected import of Crossref matches into staging only. Additive.
create table if not exists staging.import_tokens (
  token_sha256 text primary key,
  label text not null,
  created_at timestamptz not null default now(),
  revoked boolean not null default false
);
alter table staging.import_tokens enable row level security;
revoke all on staging.import_tokens from public, anon, authenticated;
insert into staging.import_tokens (token_sha256, label)
values ('29fdb34d0a697d10b477bd668328cbb341058cc13521c603c6ea34cfd4ae8110', 'Claude workspace Crossref importer, 10 Nov 2026')
on conflict do nothing;

create or replace function staging.import_crossref(p_token_sha256 text, p_rows jsonb) returns int
language plpgsql as $$
declare n int;
begin
  if not exists (select 1 from staging.import_tokens where token_sha256 = p_token_sha256 and not revoked) then
    raise exception 'invalid token';
  end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 500 then
    raise exception 'rows must be an array of at most 500';
  end if;
  insert into staging.candidate_records (run_id, existing_record_id, source_slug, title, url, canonical_url, doi, year, authors, publication, kind, access, evidence_url, match_score, match_note, completeness)
  select 3, r.id, r.source_slug, r.title, r.url, lower(r.url), lower(x.d), x.y, left(nullif(trim(both ', ' from x.a),''), 600), left(replace(x.p,'&amp;','&'), 300),
         case when x.k in ('journal-article','book-chapter','book','report','thesis') then x.k else 'other' end,
         case when x.o then 'open' else 'unknown' end, 'https://doi.org/' || lower(x.d), x.s, 'crossref title match (import route)', 0.88
  from jsonb_to_recordset(p_rows) as x(i text, d text, y int, a text, p text, k text, o boolean, s numeric)
  join public.research_records r on r.id = x.i
  where x.d ~ '^10\.\d{4,9}/\S+$' and x.s >= 0.9 and (x.y is null or x.y between 1900 and 2100)
  on conflict do nothing;
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function staging.import_crossref(text, jsonb) from public, anon, authenticated;
