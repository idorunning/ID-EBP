-- A repeated public URL is one listing, including trailing-slash variants.
create unique index sources_unique_website on public.sources(lower(regexp_replace(website_url,'/+$','')));
-- Suspended contributors must not retain public votes.
create function private.suspend_contributor() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.state='suspended' and old.state<>'suspended' then delete from private.source_ratings where user_id=new.user_id;end if;
 return new;
end;$$;
revoke all on function private.suspend_contributor() from public,anon,authenticated,service_role;
create trigger suspend_contributor after update on private.member_profiles for each row execute function private.suspend_contributor();
