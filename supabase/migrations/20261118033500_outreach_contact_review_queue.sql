-- ID-EBP source and research-owner outreach review queue.
-- NO AUTOMATIC EMAIL DISPATCH. Outbound messages require a separately verified
-- sender and published-address/PECR checks; never re-use sign-in mail.
create table if not exists private.outreach_targets (
 id bigint generated always as identity primary key,
 target_kind text not null check (target_kind in ('source','research')),
 target_ref text not null,
 target_name text not null,
 target_url text not null,
 status text not null default 'needs_contact' check (status in ('needs_contact','contact_found','closed')),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique (target_kind,target_ref)
);
create table if not exists private.outreach_contact_candidates (
 id bigint generated always as identity primary key,
 target_id bigint not null references private.outreach_targets(id) on delete restrict,
 email text not null check (email = lower(btrim(email)) and position('@' in email)>1 and length(email)<=320),
 recipient_name text,
 contact_kind text not null default 'unknown' check (contact_kind in ('organisation','role','personal','unknown')),
 evidence_url text not null,
 provenance text not null default 'source_maintenance',
 discovered_at timestamptz not null default now(),
 verified_at timestamptz,
 approved_at timestamptz,
 approval_basis text,
 review_status text not null default 'needs_review' check (review_status in ('needs_review','approved','rejected')),
 unique(target_id,email),
 constraint outreach_approval_guard check (
   review_status <> 'approved' or
   (verified_at is not null and approved_at is not null and
    nullif(btrim(coalesce(approval_basis,'')),'') is not null and
    contact_kind in ('organisation','role'))
 )
);
create table if not exists private.outreach_suppression (
 email text primary key check (email=lower(btrim(email))),
 reason text not null default 'opt_out',
 recorded_at timestamptz not null default now()
);
create table if not exists private.outreach_delivery_log (
 id bigint generated always as identity primary key,
 email text not null,
 campaign_key text not null default 'listing-introduction',
 target_id bigint references private.outreach_targets(id) on delete restrict,
 state text not null check (state in ('queued','sending','accepted','sent','uncertain','failed','cancelled')),
 provider_message_id text,
 attempted_at timestamptz not null default now(),
 sent_at timestamptz,
 notes text,
 constraint outreach_delivery_email_normalised check (email=lower(btrim(email)))
);
-- One initial invitation per mailbox, even if associated with multiple papers.
create unique index if not exists outreach_initial_one_per_email
 on private.outreach_delivery_log(email) where campaign_key='listing-introduction';
create index if not exists outreach_contacts_review_status_idx
 on private.outreach_contact_candidates(review_status,contact_kind,discovered_at);
create index if not exists outreach_targets_status_kind_idx
 on private.outreach_targets(status,target_kind);

alter table private.outreach_targets enable row level security;
alter table private.outreach_contact_candidates enable row level security;
alter table private.outreach_suppression enable row level security;
alter table private.outreach_delivery_log enable row level security;
revoke all on private.outreach_targets,private.outreach_contact_candidates,
 private.outreach_suppression,private.outreach_delivery_log from anon,authenticated;

create or replace function private.refresh_outreach_queue()
returns jsonb language plpgsql set search_path=pg_catalog,private,public
as $$
declare n_sources integer; n_research integer; n_contacts integer;
begin
 insert into private.outreach_targets(target_kind,target_ref,target_name,target_url)
 select 'source',s.id::text,s.name,'https://www.id-ebp.org/source/'||s.slug
 from public.sources s where s.status='published'
 on conflict (target_kind,target_ref) do update
 set target_name=excluded.target_name,target_url=excluded.target_url,updated_at=now();
 get diagnostics n_sources=row_count;

 insert into private.outreach_targets(target_kind,target_ref,target_name,target_url)
 select 'research',r.id,r.title,
  coalesce(nullif(btrim(r.url),''),'https://www.id-ebp.org')
 from public.research_records r
 on conflict (target_kind,target_ref) do update
 set target_name=excluded.target_name,target_url=excluded.target_url,updated_at=now();
 get diagnostics n_research=row_count;

 -- Collect public mailto suggestions ONLY as unverified private candidates.
 -- Never turn a discovered address into ownership proof or an outbound email.
 insert into private.outreach_contact_candidates
 (target_id,email,evidence_url,provenance,review_status)
 select distinct t.id,lower(btrim(mail.value)),
   s.website_url,'maintenance_mailto','needs_review'
 from private.source_maintenance sm
 join public.sources s on s.id=sm.source_id and s.status='published'
 join private.outreach_targets t on t.target_kind='source' and t.target_ref=s.id::text
 cross join lateral jsonb_array_elements_text(
  case when jsonb_typeof(sm.result#>'{suggestions,publicEmails}')='array'
   then sm.result#>'{suggestions,publicEmails}' else '[]'::jsonb end
 ) mail(value)
 where lower(btrim(mail.value)) ~ '^[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}$'
   and lower(btrim(mail.value)) not in
    ('hello@thinkingaboutpolicing.org','contact@id-ebp.org')
 on conflict(target_id,email) do nothing;
 get diagnostics n_contacts=row_count;

 update private.outreach_targets t set status='contact_found',updated_at=now()
 where t.status='needs_contact'
   and exists(select 1 from private.outreach_contact_candidates c where c.target_id=t.id);

 return jsonb_build_object('source_rows_refreshed',n_sources,
   'research_rows_refreshed',n_research,'new_contact_candidates',n_contacts);
end $$;
revoke all on function private.refresh_outreach_queue() from public,anon,authenticated;

-- The selection view is private and does not send any mail.
create or replace view private.outreach_eligible with (security_invoker=true) as
select c.id as candidate_id,t.id as target_id,t.target_kind,t.target_ref,
 t.target_name,t.target_url,c.email,c.recipient_name,c.evidence_url
from private.outreach_contact_candidates c
join private.outreach_targets t on t.id=c.target_id and t.status<>'closed'
where c.review_status='approved' and c.contact_kind in ('organisation','role')
 and c.verified_at is not null and c.approved_at is not null
 and not exists(select 1 from private.outreach_suppression s where s.email=c.email)
 and not exists(select 1 from private.outreach_delivery_log d
   where d.email=c.email and d.campaign_key='listing-introduction'
     and d.state in ('queued','sending','accepted','sent','uncertain'))
 and (t.target_kind='research' or exists(
    select 1 from public.sources s where s.id::text=t.target_ref and s.status='published'));
revoke all on private.outreach_eligible from public,anon,authenticated;

-- Queue discovery is idempotent. This cron never sends email.
select cron.schedule('outreach-target-refresh-daily','40 3 * * *',
 $$select private.refresh_outreach_queue()$$);
