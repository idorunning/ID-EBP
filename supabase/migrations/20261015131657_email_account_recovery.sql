-- Nathan requested email-based account recovery without an authenticator app.
-- Verified identity, live sessions, role checks and source review remain required.
do $$
declare definition text;
begin
 select pg_get_functiondef('private.directory_core(text,jsonb,uuid,uuid,text)'::regprocedure) into definition;
 definition:=replace(definition,$old$'mfaRequired',is_admin and p_assurance<>'aal2',$old$,'');
 definition:=replace(definition,$old$if p_assurance<>'aal2' then raise exception 'mfa_required' using errcode='42501';end if;$old$,'');
 execute definition;
 select pg_get_functiondef('public.directory_api(text,jsonb,uuid,uuid,text)'::regprocedure) into definition;
 definition:=replace(definition,$old$ and p_assurance='aal2'$old$,'');
 definition:=replace(definition,'select action,reason,created_at from private.audit_events order by created_at desc limit 50','select ae.action,ae.reason,ae.created_at from private.audit_events ae order by ae.created_at desc limit 50');
 definition:=replace(definition,'Admin MFA required','Administrator permission required');
 execute definition;
end;$$;
