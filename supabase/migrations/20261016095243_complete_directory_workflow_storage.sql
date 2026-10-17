-- Extended reviewed profiles, reversible moderation, member requests and private
-- job/outbox queues. Browser roles gain no privileged table/function access.
alter table public.sources add column public_details jsonb not null default '{}'::jsonb check(jsonb_typeof(public_details)='object');
create table private.source_duplicates(source_id uuid primary key references public.sources,target_id uuid not null references public.sources,previous_status text not null,decided_by uuid references auth.users,reason text not null,created_at timestamptz not null default now(),check(source_id<>target_id));
create table private.account_requests(id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users on delete cascade,kind text not null check(kind='deletion'),state text not null default 'pending' check(state in ('pending','completed','cancelled')),created_at timestamptz not null default now(),decided_by uuid references auth.users,decided_at timestamptz);
create unique index one_pending_deletion on private.account_requests(user_id) where state='pending';
create table private.member_challenges(user_id uuid not null references auth.users on delete cascade,kind text not null check(kind in ('email_current','email_new','deletion')),target_email text not null,token_hash text not null,attempts integer not null default 0,expires_at timestamptz not null,verified_at timestamptz,primary key(user_id,kind));
create table private.workflow_outbox(id uuid primary key default gen_random_uuid(),event_key text not null unique,recipient text not null,subject text not null,body text not null,state text not null default 'pending' check(state in ('pending','sending','sent','failed','uncertain','cancelled')),lease uuid,attempts integer not null default 0,available_at timestamptz not null default now(),leased_at timestamptz,sent_at timestamptz,provider_id text,created_at timestamptz not null default now());
create index workflow_outbox_due on private.workflow_outbox(available_at) where state='pending';
create table private.source_maintenance(source_id uuid primary key references public.sources on delete cascade,next_check_at timestamptz not null default now(),lease uuid,leased_at timestamptz,checked_at timestamptz,result jsonb not null default '{}'::jsonb);
create index source_maintenance_due on private.source_maintenance(next_check_at);
alter table private.source_duplicates enable row level security;
alter table private.account_requests enable row level security;
alter table private.member_challenges enable row level security;
alter table private.workflow_outbox enable row level security;
alter table private.source_maintenance enable row level security;
revoke all on private.source_duplicates,private.account_requests,private.member_challenges,private.workflow_outbox,private.source_maintenance from public,anon,authenticated,service_role;
grant select,insert,update,delete on private.source_duplicates,private.account_requests,private.member_challenges,private.workflow_outbox,private.source_maintenance to service_role;

