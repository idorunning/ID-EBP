-- Trigger-only privileged functions: no callable access for application roles.
create function private.schedule_source_check() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='INSERT' or new.website_url is distinct from old.website_url or (new.status='published' and old.status<>'published') then
 insert into private.source_maintenance(source_id) values(new.id) on conflict(source_id) do update set next_check_at=now();end if;return new;
end;$$;
revoke all on function private.schedule_source_check() from public,anon,authenticated,service_role;
create trigger source_maintenance_schedule after insert or update of website_url,status on public.sources for each row execute function private.schedule_source_check();
insert into private.source_maintenance(source_id) select id from public.sources on conflict do nothing;

create function private.queue_workflow_notification() returns trigger language plpgsql security definer set search_path='' as $$
declare address text; title text; content text; event text; source_name text;
begin
 if tg_table_name='source_claims' then
  select email into address from auth.users where id=new.requested_by;
  select name into source_name from public.sources where id=new.source_id;
  if tg_op='INSERT' then event:='claim-receipt:'||new.id;title:='Your ID-EBP source claim is awaiting review';content:='We received your claim for '||source_name||'. An administrator will check your authority before granting access. You can check its progress in Your sources: https://id-ebp.org/source-workspace';
  elsif new.state is distinct from old.state and new.state in ('accepted','rejected') then event:='claim-decision:'||new.id||':'||new.state;title:='Your ID-EBP source claim: '||case when new.state='accepted' then 'approved' else 'not approved' end;content:='The claim for '||source_name||' has been '||case when new.state='accepted' then 'approved. You can propose profile changes in Your sources.' else 'reviewed and not approved. You can contact contact@id-ebp.org if you need this decision reviewed.' end||E'\n'||coalesce(new.evidence->>'moderationReason','')||E'\nhttps://id-ebp.org/source-workspace';end if;
 elsif tg_table_name='source_team_invitations' and tg_op='INSERT' then
  address:=new.email;select name into source_name from public.sources where id=new.source_id;
  event:='editor-invitation:'||new.id;title:='Invitation to help manage a source on ID-EBP';content:='An approved source owner invited you to propose updates to '||source_name||'. Sign in or register with this exact email address and accept the invitation in your member workspace. This invitation expires in seven days. https://id-ebp.org/account';
 end if;
 if event is not null and address is not null then insert into private.workflow_outbox(event_key,recipient,subject,body) values(event,address,title,content||E'\n\nID-EBP is free to join. This is a service message about a source-management action, not a newsletter. If you did not expect it, contact contact@id-ebp.org.') on conflict(event_key) do nothing;end if;return new;
end;$$;
revoke all on function private.queue_workflow_notification() from public,anon,authenticated,service_role;
create trigger claim_workflow_notice after insert or update of state on private.source_claims for each row execute function private.queue_workflow_notification();
create trigger editor_workflow_notice after insert on private.source_team_invitations for each row execute function private.queue_workflow_notification();

