// Emits a reviewable, guarded ledger repair. Does not connect to the database.
import {readFile} from 'node:fs/promises';
const baseline=await readFile(new URL('../supabase/migrations/20261024020000_research_catalogue.sql',import.meta.url),'utf8');
const quote=s=>"'"+s.replaceAll("'","''")+"'";
const searchBody=baseline.match(/function public.search_research[\s\S]*?as \$\$([\s\S]*?)\$\$/)[1];
console.log(`-- Repair only the already-installed catalogue foundation's missing history entry.
-- Reviewed against live table, policy, indexes and function definitions on 9 November 2026.
begin;
do $repair$
begin
 if exists(select 1 from supabase_migrations.schema_migrations where version='20261024020000') then
  if not exists(select 1 from supabase_migrations.schema_migrations where version='20261024020000' and name='research_catalogue' and array_to_string(statements,E'\\n')=${quote(baseline)}) then raise exception 'Conflicting migration history';end if;
  return;
 end if;
 if not coalesce((select relrowsecurity from pg_class where oid=to_regclass('public.research_records')),false)
  or not exists(select 1 from pg_policies where schemaname='public' and tablename='research_records' and policyname='Public catalogue metadata is readable' and cmd='SELECT' and qual='true')
  or (select count(*) from pg_indexes where schemaname='public' and tablename='research_records' and indexname in ('research_search_idx','research_tags_idx','research_source_idx'))<>3
  or to_regprocedure('public.research_tags(text)') is null
  or to_regprocedure('public.research_stats()') is null
  or not exists(select 1 from pg_proc where oid=to_regprocedure('public.search_research(text,text[],integer,text)') and regexp_replace(prosrc,'\\s','','g')=regexp_replace(${quote(searchBody)},'\\s','','g'))
 then raise exception 'Catalogue baseline verification failed; do not repair blindly';end if;
 insert into supabase_migrations.schema_migrations(version,name,statements) values('20261024020000','research_catalogue',array[${quote(baseline)}]);
end;$repair$;
commit;`);
