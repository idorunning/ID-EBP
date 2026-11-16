-- Haiku labelling pipeline: claim batches, save validated labels to staging, promote (blanks only, logged).
create table if not exists staging.label_vocab (kind text not null, value text not null, primary key (kind, value));
insert into staging.label_vocab (kind, value) select 'kind', v from unnest(array['report','journal-article','book-chapter','book','briefing','blog-post','evaluation','systematic-review','thesis','guidance','dataset','programme-profile','toolkit-entry','news','other','not-research']) v on conflict do nothing;
insert into staging.label_vocab (kind, value) select 'access', v from unnest(array['open','free-registration','paywalled','unknown']) v on conflict do nothing;
insert into staging.label_vocab (kind, value) select 'tag', v from unnest(array['Policing','Crime prevention','Problem-oriented policing','Hot spots policing','Community policing','Community safety','Mental health','Criminal Justice','Recidivism','Drugs','Alcohol','Violent crime','Violence Prevention','Knife crime','Gangs','Domestic abuse','Sexual offences','Child protection','Juvenile delinquency','Victims of crime','Law enforcement operations','Organized Crime','Cybercrime','Terrorism','Gender-based Violence','Corrections','Probation','Prisons','Courts','Schools','Child health and welfare','Investigation','Interviewing','Forensics','Police wellbeing','Use of force','Technology','Workforce','Leadership','Training','Legitimacy and trust','Stop and search','Roads policing','Public order','Fraud','Property crime','Restorative justice','Diversion','Missing persons','Hate crime']) v on conflict do nothing;

alter table public.research_records add column if not exists kind_std text;
alter table public.research_records add column if not exists access_std text;

create table if not exists staging.label_claims (record_id text primary key, agent text, claimed_at timestamptz not null default now());
create table if not exists staging.label_suggestions (
  record_id text primary key, kind_std text not null, access_std text not null, tags text[] not null default '{}',
  confidence numeric not null, needs_review boolean not null default false, model text, agent text,
  reviewed_by text, verifier_status text not null default 'unchecked', promoted boolean not null default false,
  created_at timestamptz not null default now());
alter table staging.label_claims enable row level security;
alter table staging.label_suggestions enable row level security;
alter table staging.label_vocab enable row level security;
revoke all on staging.label_claims, staging.label_suggestions, staging.label_vocab from public, anon, authenticated;

-- Claim up to n unlabelled records (claims expire after 2 hours so a crashed agent's batch is retried).
create or replace function staging.label_claim(p_agent text, p_n int default 50) returns jsonb language plpgsql as $$
declare res jsonb;
begin
  delete from staging.label_claims c where c.claimed_at < now() - interval '2 hours'
    and not exists (select 1 from staging.label_suggestions s where s.record_id = c.record_id);
  with pick as (
    select r.id from public.research_records r
    where not exists (select 1 from staging.label_suggestions s where s.record_id = r.id)
      and not exists (select 1 from staging.label_claims c where c.record_id = r.id)
    order by r.id limit least(p_n, 60) for update skip locked
  ), ins as (insert into staging.label_claims (record_id, agent) select id, p_agent from pick returning record_id)
  select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'title', r.title, 'source', r.source, 'publication', r.publication,
      'old_kind', r.kind, 'old_access', r.access, 'summary', left(r.summary, 400), 'url', r.url, 'existing_tags', r.tags)), '[]'::jsonb)
    into res from ins join public.research_records r on r.id = ins.record_id;
  return res;
end $$;

-- Save labels; anything off-vocabulary is dropped (tags) or rejected (kind/access).
create or replace function staging.label_save(p_agent text, p_model text, p_rows jsonb) returns jsonb language plpgsql as $$
declare ok int; bad int;
begin
  with x as (
    select * from jsonb_to_recordset(p_rows) as x(id text, kind text, access text, tags text[], confidence numeric)
  ), v as (
    select x.id, x.kind, x.access,
      coalesce((select array_agg(distinct t) from unnest(x.tags) t where exists (select 1 from staging.label_vocab where kind='tag' and value=t)), '{}') tags,
      least(greatest(coalesce(x.confidence,0),0),1) conf
    from x
    where exists (select 1 from public.research_records r where r.id = x.id)
      and exists (select 1 from staging.label_vocab where kind='kind' and value=x.kind)
      and exists (select 1 from staging.label_vocab where kind='access' and value=x.access)
  ), ins as (
    insert into staging.label_suggestions (record_id, kind_std, access_std, tags, confidence, needs_review, model, agent)
    select id, kind, access, tags[1:4], conf, (conf < 0.7 or cardinality(tags) = 0), p_model, p_agent from v
    on conflict (record_id) do nothing returning 1)
  select count(*) into ok from ins;
  bad := jsonb_array_length(p_rows) - ok;
  return jsonb_build_object('saved', ok, 'rejected', bad);
end $$;

-- Reviewer (Sonnet) overwrites a suggestion after checking it.
create or replace function staging.label_review(p_rows jsonb) returns int language plpgsql as $$
declare n int;
begin
  update staging.label_suggestions s set kind_std = x.kind, access_std = x.access,
    tags = coalesce((select array_agg(distinct t) from unnest(x.tags) t where exists (select 1 from staging.label_vocab where kind='tag' and value=t)), s.tags),
    needs_review = false, reviewed_by = 'sonnet', confidence = 0.9
  from jsonb_to_recordset(p_rows) as x(id text, kind text, access text, tags text[])
  where s.record_id = x.id and exists (select 1 from staging.label_vocab where kind='kind' and value=x.kind)
    and exists (select 1 from staging.label_vocab where kind='access' and value=x.access);
  get diagnostics n = row_count; return n;
end $$;

-- Promote passed labels: kind_std/access_std set; tags only where the record has none. Logged.
create or replace function staging.label_promote() returns jsonb language plpgsql as $$
declare n int;
begin
  insert into private.promotion_log (batch, table_name, row_id, field, old_value, new_value)
  select 'labels-' || to_char(now(),'YYYYMMDD'), 'research_records', r.id, 'labels',
         coalesce(r.kind_std,'') || '/' || coalesce(r.access_std,'') || '/' || array_to_string(r.tags,'|'),
         s.kind_std || '/' || s.access_std || '/' || array_to_string(s.tags,'|')
  from staging.label_suggestions s join public.research_records r on r.id = s.record_id
  where s.verifier_status = 'passed' and not s.needs_review and not s.promoted;
  update public.research_records r set kind_std = s.kind_std, access_std = s.access_std,
    tags = case when cardinality(r.tags) = 0 and cardinality(s.tags) > 0 then s.tags else r.tags end
  from staging.label_suggestions s
  where s.record_id = r.id and s.verifier_status = 'passed' and not s.needs_review and not s.promoted;
  get diagnostics n = row_count;
  update staging.label_suggestions set promoted = true where verifier_status = 'passed' and not needs_review and not promoted;
  return jsonb_build_object('promoted', n);
end $$;

revoke all on function staging.label_claim(text,int), staging.label_save(text,text,jsonb), staging.label_review(jsonb), staging.label_promote() from public, anon, authenticated;
