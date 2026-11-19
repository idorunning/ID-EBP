create table if not exists private.research_duplicate_review(
 duplicate_type text not null,
 duplicate_key text not null,
 record_ids text[] not null,
 record_count int not null check(record_count>1),
 first_seen_at timestamptz not null default now(),
 last_seen_at timestamptz not null default now(),
 review_status text not null default 'unreviewed' check(review_status in ('unreviewed','intentional_cross_listing','duplicate_confirmed','resolved')),
 primary key(duplicate_type,duplicate_key)
);
revoke all on private.research_duplicate_review from anon,authenticated;
insert into private.research_duplicate_review(duplicate_type,duplicate_key,record_ids,record_count)
select 'doi',lower(regexp_replace(doi,'^https?://(dx\\.)?doi\\.org/','','i')),array_agg(id order by id),count(*)::int
from public.research_records where nullif(btrim(doi),'') is not null
group by 2 having count(*)>1
on conflict(duplicate_type,duplicate_key) do update set record_ids=excluded.record_ids,record_count=excluded.record_count,last_seen_at=now();
insert into private.research_duplicate_review(duplicate_type,duplicate_key,record_ids,record_count)
select 'title_url',lower(btrim(title))||' | '||lower(btrim(url)),array_agg(id order by id),count(*)::int
from public.research_records group by 2 having count(*)>1
on conflict(duplicate_type,duplicate_key) do update set record_ids=excluded.record_ids,record_count=excluded.record_count,last_seen_at=now();