-- Keep the existing published form working until its replacement is approved.
-- Only the trusted account service can call the RPC. The new HTTP claim flow
-- always requires a source-bound email code, even while this transition exists.
do $$
declare definition text;
begin
 select pg_get_functiondef('private.directory_core(text,jsonb,uuid,uuid,text)'::regprocedure) into definition;
 definition:=replace(definition,$old$if p_payload->>'mailboxVerified' is distinct from 'true'
      or coalesce(p_payload->>'contactEmail','') !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'$old$,$new$if (p_payload->>'mailboxVerified' is distinct from 'true' and (char_length(trim(coalesce(p_payload->>'evidence',''))) not between 30 and 2000 or coalesce(p_payload->>'evidenceUrl','') !~ '^https://[^[:space:]@]+$'))
      or (p_payload->>'mailboxVerified'='true' and coalesce(p_payload->>'contactEmail','') !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')$new$);
 execute definition;
end;$$;
