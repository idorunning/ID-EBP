do $$ declare f record; begin
 for f in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='staging' and p.proname in ('label_review','import_crossref','label_claim','label_save','label_promote','candidate_promote') loop
   execute format('alter function %s set search_path = staging, public, private, extensions, pg_catalog', f.sig);
 end loop; end $$;
