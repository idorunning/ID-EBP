-- Additive search index. Original catalogue metadata and editorial tags are retained.
create schema if not exists extensions;
create extension if not exists vector with schema extensions;
create extension if not exists pg_trgm with schema extensions;
create extension if not exists unaccent with schema extensions;
grant usage on schema extensions to anon,authenticated,service_role;

create table public.research_search_topics(id text primary key,label text not null,pattern text not null,version text not null);
alter table public.research_search_topics enable row level security;
revoke all on public.research_search_topics from anon,authenticated;
grant select on public.research_search_topics to anon,authenticated;
grant all on public.research_search_topics to service_role;
create policy "Read public search topics" on public.research_search_topics for select to anon,authenticated using(true);
-- BEGIN GENERATED TOPICS
insert into public.research_search_topics(id,label,pattern,version) values
('burglary','Burglary','(^| )(burglary|burglaries|burgled|burglar|burglars|housebreaking|house breaking|break in|break ins|breaking and entering)( |$)','2026-10-24.1'),
('residential-burglary','Residential burglary','(^| )(residential burglary|dwelling burglary|house burglary|household burglary|residential burglaries|domestic burglary|home break ins)( |$)','2026-10-24.1'),
('domestic-abuse','Domestic abuse','(^| )(domestic abuse|domestic violence|domestic family violence|domestic and family violence|domestic assault|domestic homicide|spousal abuse|spousal violence|wife assault|wife abuse|wife beating)( |$)','2026-10-24.1'),
('intimate-partner-violence','Intimate partner violence','(^| )(intimate partner violence|intimate partner abuse|partner violence|partner abuse|partner assault|partner assaults|dating violence|dating abuse|relationship abuse|relationship violence|violence against partners|abusive partners|abusive relationships)( |$)','2026-10-24.1'),
('family-violence','Family violence','(^| )(family violence|familial abuse|family abuse|intrafamilial violence|intra familial violence|adolescent to parent violence|child to parent violence)( |$)','2026-10-24.1'),
('coercive-control','Coercive control','(^| )(coercive control|coercive controlling behaviour|coercive controlling behavior|controlling or coercive behaviour|controlling and coercive behaviour|coercive and controlling behaviour|coercive and controlling behavior)( |$)','2026-10-24.1'),
('economic-abuse','Economic abuse','(^| )(economic abuse|financial abuse in relationships|financial abuse by partners)( |$)','2026-10-24.1'),
('perpetrator-programmes','Perpetrator programmes','(^| )(perpetrator programmes|perpetrator programs|batterer intervention|batterer interventions|batterer programmes|batterer programs|batterer treatment|domestic violence programmes|domestic violence programs|duluth model)( |$)','2026-10-24.1'),
('repeat-victimisation','Repeat victimisation','(^| )(repeat victimisation|repeat victimization|repeated victimisation|repeated victimization|near repeat|repeat victims|repeat offending against victims)( |$)','2026-10-24.1'),
('target-hardening','Target hardening','(^| )(target hardening|household security|home security|security improvements|door locks|window locks)( |$)','2026-10-24.1'),
('neighbourhood-watch','Neighbourhood Watch','(^| )(neighbourhood watch|neighborhood watch|neighbourhood watches|neighborhood watches)( |$)','2026-10-24.1'),
('robbery','Robbery','(^| )(robbery|robberies|mugging|muggings|armed robbery|street robbery)( |$)','2026-10-24.1'),
('shoplifting','Shoplifting','(^| )(shoplifting|shop lifting|shop theft|retail theft|retail crime|theft from shops)( |$)','2026-10-24.1'),
('vehicle-crime','Vehicle crime','(^| )(vehicle crime|vehicle theft|car theft|theft from vehicles|motor vehicle theft|car crime|vehicle related theft)( |$)','2026-10-24.1'),
('hot-spots','Hot spots policing','(^| )(hot spots policing|hotspots policing|hot spot policing|hotspot policing|hot spots|hotspots|hotspot|hot spot)( |$)','2026-10-24.1'),
('problem-oriented-policing','Problem-oriented policing','(^| )(problem oriented policing|problem solving policing|problem solving|problem solving partnerships|sara model|sara process)( |$)','2026-10-24.1'),
('neighbourhood-policing','Neighbourhood policing','(^| )(neighbourhood policing|neighborhood policing|community policing|community oriented policing|community based policing)( |$)','2026-10-24.1'),
('procedural-justice','Procedural justice','(^| )(procedural justice|procedurally just|procedural fairness|police legitimacy|policing legitimacy)( |$)','2026-10-24.1'),
('public-trust','Public trust','(^| )(public trust|trust in police|police trust|police confidence|public confidence|confidence in police)( |$)','2026-10-24.1'),
('body-worn-cameras','Body-worn cameras','(^| )(body worn cameras|body worn camera|bodyworn cameras|body cameras|bodycam|bodycams)( |$)','2026-10-24.1'),
('use-of-force','Use of force','(^| )(use of force|police force use|police violence|police shootings|taser|tasers|conducted energy devices)( |$)','2026-10-24.1'),
('de-escalation','De-escalation','(^| )(de escalation|deescalation|conflict resolution|crisis negotiation)( |$)','2026-10-24.1'),
('focused-deterrence','Focused deterrence','(^| )(focused deterrence|pulling levers|pulling levers policing|group violence intervention)( |$)','2026-10-24.1'),
('situational-prevention','Situational crime prevention','(^| )(situational crime prevention|situational prevention|crime prevention through environmental design|cpted|designing out crime)( |$)','2026-10-24.1'),
('antisocial-behaviour','Antisocial behaviour','(^| )(antisocial behaviour|anti social behaviour|antisocial behavior|anti social behavior|nuisance behaviour)( |$)','2026-10-24.1'),
('stalking','Stalking and harassment','(^| )(stalking and harassment|stalking|harassment|cyberstalking|cyber stalking)( |$)','2026-10-24.1'),
('sexual-violence','Sexual violence','(^| )(sexual violence|sexual assault|sexual offences|sexual offenses|rape|rapes|sexual abuse)( |$)','2026-10-24.1'),
('child-exploitation','Child exploitation','(^| )(child exploitation|child sexual exploitation|child criminal exploitation|child trafficking)( |$)','2026-10-24.1'),
('county-lines','County lines','(^| )(county lines|county line drug|county lines drug|cuckooing)( |$)','2026-10-24.1'),
('safeguarding','Safeguarding','(^| )(safeguarding|child protection|adult protection|vulnerable victims|vulnerable adults|child safeguarding)( |$)','2026-10-24.1'),
('serious-violence','Serious violence','(^| )(serious violence|violent crime|knife crime|gun crime|homicide|homicides|murder|youth violence)( |$)','2026-10-24.1'),
('early-intervention','Early intervention','(^| )(early intervention|early prevention|early help|youth diversion|diversion programmes|diversion programs)( |$)','2026-10-24.1'),
('mental-health','Mental health','(^| )(mental health|mental illness|mental disorder|mental health crisis|crisis intervention)( |$)','2026-10-24.1'),
('police-wellbeing','Police wellbeing','(^| )(police wellbeing|police well being|officer wellbeing|officer well being|officer wellness|police wellness|police stress|officer stress|police burnout|officer burnout)( |$)','2026-10-24.1'),
('police-accountability','Police accountability','(^| )(police accountability|police misconduct|police corruption|police complaints|police discipline|police ethics)( |$)','2026-10-24.1'),
('investigative-interviewing','Investigative interviewing','(^| )(investigative interviewing|investigative interviews|suspect interviews|witness interviews|cognitive interview|peace model|interviewing suspects|interviewing witnesses)( |$)','2026-10-24.1'),
('investigations','Investigations','(^| )(investigations|criminal investigation|criminal investigations|crime investigation|detective work|crime detection)( |$)','2026-10-24.1'),
('forensics','Forensic science','(^| )(forensic science|forensic|forensics|dna evidence|fingerprint evidence|crime scene investigation)( |$)','2026-10-24.1'),
('fraud','Fraud','(^| )(fraud|frauds|scams|scam|financial crime|investment fraud|romance fraud)( |$)','2026-10-24.1'),
('cybercrime','Cybercrime','(^| )(cybercrime|cyber crime|cybercriminal|online crime|internet crime|computer crime|cyber offending)( |$)','2026-10-24.1'),
('organised-crime','Organised crime','(^| )(organised crime|organized crime|organised criminal groups|organized criminal groups)( |$)','2026-10-24.1'),
('repeat-offending','Repeat offending','(^| )(repeat offending|reoffending|re offending|recidivism|prolific offenders|repeat offenders|serial offenders)( |$)','2026-10-24.1'),
('stop-and-search','Stop and search','(^| )(stop and search|stop search|stop searches|stop and frisk|police stops|pedestrian stops)( |$)','2026-10-24.1'),
('roads-policing','Roads policing','(^| )(roads policing|road policing|traffic policing|traffic enforcement|road safety|drink driving|drug driving|drink drive|drunk driving)( |$)','2026-10-24.1'),
('leadership','Police leadership','(^| )(police leadership|police management|policing leadership|police supervision|supervisory leadership|organisational change|organizational change)( |$)','2026-10-24.1'),
('evidence-based-policing','Evidence-based policing','(^| )(evidence based policing|evidence informed policing)( |$)','2026-10-24.1'),
('randomised-trials','Randomised trials','(^| )(randomised trials|randomised controlled trial|randomized controlled trial|randomised trial|randomized trial|randomised controlled trials|randomized controlled trials)( |$)','2026-10-24.1'),
('systematic-reviews','Systematic reviews','(^| )(systematic reviews|systematic review|meta analysis|meta analyses|evidence synthesis)( |$)','2026-10-24.1')
on conflict(id) do update set label=excluded.label,pattern=excluded.pattern,version=excluded.version;
-- END GENERATED TOPICS

create function public.research_normalise(value text) returns text language sql stable strict set search_path='' as $$
 select trim(regexp_replace(lower(extensions.unaccent(replace(replace(replace(value,'&',' and '),'''',''),'’',''))),'[^[:alnum:]]+',' ','g'));
$$;
create function public.research_clean_summary(value text) returns text language sql immutable strict set search_path='' as $$
 select case when value ~* 'Stage [0-9]+ inventory record|Item.level review has not yet been performed|Login or Register for Access|Username\(Required\).*Password|Hit enter to search or ESC to close' then ''
 else left(regexp_replace(regexp_replace(value,'<[^>]*>',' ','g'),'[[:space:]]+',' ','g'),3000) end;
$$;
create table public.research_search_documents(
 record_id text primary key references public.research_records(id) on delete cascade,
 title_text text not null,search_text text not null,embedding_text text not null,content_hash text not null,
 topic_ids text[] not null default '{}',lexical tsvector not null,literal tsvector not null,
 embedding extensions.vector(384),embedding_model text,embedded_at timestamptz,
 constraint research_embedding_model check(embedding is null or embedding_model='@cf/baai/bge-small-en-v1.5:cls:v1')
);
alter table public.research_search_documents enable row level security;
revoke all on public.research_search_documents from anon,authenticated;
grant select on public.research_search_documents to anon,authenticated;
grant all on public.research_search_documents to service_role;
create policy "Read public search documents" on public.research_search_documents for select to anon,authenticated using(true);
create index research_lexical_idx on public.research_search_documents using gin(lexical);
create index research_literal_idx on public.research_search_documents using gin(literal);
create index research_topic_ids_idx on public.research_search_documents using gin(topic_ids);
create index research_title_trgm_idx on public.research_search_documents using gin(title_text extensions.gin_trgm_ops);
create index research_embeddings_idx on public.research_search_documents using hnsw(embedding extensions.vector_cosine_ops);

create table private.research_index_jobs(
 record_id text primary key references public.research_search_documents(record_id) on delete cascade,
 lease uuid,leased_until timestamptz,attempts integer not null default 0
);
alter table private.research_index_jobs enable row level security;
revoke all on private.research_index_jobs from public,anon,authenticated;
grant all on private.research_index_jobs to service_role;

create function public.research_refresh_document(r public.research_records) returns void
 language plpgsql security invoker set search_path='' as $$
 declare clean text; body text; normalised text; embed text; fingerprint text; concepts text[];
 begin
 clean:=public.research_clean_summary(r.summary);
 body:=concat_ws(' ',r.title,array_to_string(r.tags,' '),r.related_terms,clean);
 normalised:=public.research_normalise(body);
 select coalesce(array_agg(id order by id),'{}') into concepts from public.research_search_topics where normalised ~ pattern;
 -- Keep metadata provenance out of the semantic representation. Bound model input.
 embed:=left(concat_ws('. ',r.title,nullif(array_to_string(r.tags,', '),''),nullif(r.related_terms,''),nullif(clean,'')),1600);
 fingerprint:=md5(embed);
 insert into public.research_search_documents(record_id,title_text,search_text,embedding_text,content_hash,topic_ids,lexical,literal)
 values(r.id,public.research_normalise(r.title),normalised,embed,fingerprint,concepts,
 setweight(to_tsvector('english',r.title),'A')||setweight(to_tsvector('english',array_to_string(r.tags,' ')||' '||r.related_terms),'B')||setweight(to_tsvector('english',clean),'C')||setweight(to_tsvector('english',r.authors||' '||r.source),'D'),
 to_tsvector('simple',body||' '||r.authors||' '||r.source))
 on conflict(record_id) do update set title_text=excluded.title_text,search_text=excluded.search_text,embedding_text=excluded.embedding_text,content_hash=excluded.content_hash,topic_ids=excluded.topic_ids,lexical=excluded.lexical,literal=excluded.literal,
 embedding=case when research_search_documents.content_hash=excluded.content_hash then research_search_documents.embedding end,
 embedding_model=case when research_search_documents.content_hash=excluded.content_hash then research_search_documents.embedding_model end,
 embedded_at=case when research_search_documents.content_hash=excluded.content_hash then research_search_documents.embedded_at end;
 insert into private.research_index_jobs(record_id) select r.id where exists(select 1 from public.research_search_documents where record_id=r.id and embedding is null)
 on conflict(record_id) do update set lease=null,leased_until=null,attempts=0;
 end;
$$;
revoke all on function public.research_refresh_document(public.research_records) from public,anon,authenticated;
grant execute on function public.research_refresh_document(public.research_records) to service_role;
create function public.research_document_changed() returns trigger language plpgsql security invoker set search_path='' as $$
 begin perform public.research_refresh_document(new);return new;end;
$$;
revoke all on function public.research_document_changed() from public,anon,authenticated;
grant execute on function public.research_document_changed() to service_role;
create trigger research_search_refresh after insert or update of title,summary,tags,related_terms,authors,source on public.research_records for each row execute function public.research_document_changed();

-- Backfill is separately callable in bounded batches, including after dictionary revisions.
create function public.research_reindex(after_id text default '',batch_size integer default 200) returns jsonb
 language plpgsql security invoker set search_path='' as $$
 declare r public.research_records; last_id text:=after_id; n integer:=0;
 begin
 for r in select * from public.research_records where id>after_id order by id limit greatest(1,least(batch_size,500)) loop
 perform public.research_refresh_document(r);last_id:=r.id;n:=n+1;end loop;
 return jsonb_build_object('count',n,'lastId',last_id);end;
$$;
revoke all on function public.research_reindex(text,integer) from public,anon,authenticated;
grant execute on function public.research_reindex(text,integer) to service_role;

create function public.research_index_take(batch_size integer default 64) returns jsonb
 language sql volatile security invoker set search_path='' as $$
 with chosen as (
 select j.record_id from private.research_index_jobs j join public.research_search_documents d using(record_id)
 where d.embedding is null and (j.leased_until is null or j.leased_until<now())
 order by j.attempts,j.record_id limit greatest(1,least(batch_size,64)) for update of j skip locked
 ), leased as (
 update private.research_index_jobs j set lease=gen_random_uuid(),leased_until=now()+interval '10 minutes',attempts=attempts+1
 from chosen where j.record_id=chosen.record_id returning j.record_id,j.lease
 ) select jsonb_build_object('jobs',coalesce(jsonb_agg(jsonb_build_object('id',d.record_id,'text',d.embedding_text,'hash',d.content_hash,'lease',l.lease)),'[]'))
 from leased l join public.research_search_documents d using(record_id);
$$;
create function public.research_index_complete(items jsonb) returns jsonb
 language plpgsql volatile security invoker set search_path='' as $$
 declare entry jsonb; n integer:=0; changed integer;
 begin
 if jsonb_typeof(items)<>'array' or jsonb_array_length(items)>64 then raise exception 'Invalid embedding batch';end if;
 for entry in select value from jsonb_array_elements(items) loop
 if jsonb_typeof(entry->'embedding')<>'array' or jsonb_array_length(entry->'embedding')<>384 then raise exception 'Invalid embedding dimension';end if;
 update public.research_search_documents d set embedding=(entry->>'embedding')::extensions.vector(384),embedding_model='@cf/baai/bge-small-en-v1.5:cls:v1',embedded_at=now()
 where d.record_id=entry->>'id' and d.content_hash=entry->>'hash'
 and exists(select 1 from private.research_index_jobs j where j.record_id=d.record_id and j.lease=(entry->>'lease')::uuid and j.leased_until>now());
 get diagnostics changed=row_count;n:=n+changed;
 if changed=1 then delete from private.research_index_jobs where record_id=entry->>'id' and lease=(entry->>'lease')::uuid;end if;
 end loop;
 return jsonb_build_object('completed',n);end;
$$;
revoke all on function public.research_index_take(integer),public.research_index_complete(jsonb) from public,anon,authenticated;
grant execute on function public.research_index_take(integer),public.research_index_complete(jsonb) to service_role;

create function public.search_research_v2(q text default '',selected_tags text[] default '{}',page_number integer default 1,source_filter text default '',search_plan jsonb default '{}',query_embedding extensions.vector(384) default null,exact_match boolean default false)
 returns jsonb language plpgsql stable security invoker set search_path='' set statement_timeout='10s' as $$
 declare result jsonb; groups jsonb; tag_groups jsonb; text_query tsquery; literal_query tsquery; intent_query tsquery; has_topics boolean; has_text boolean; browse boolean;
 begin
 if length(q)>300 or cardinality(selected_tags)>10 or length(search_plan::text)>20000 or length(source_filter)>120 then raise exception 'Search too long';end if;
 groups:=coalesce(search_plan->'topicGroups','[]');tag_groups:=coalesce(search_plan->'tagGroups','[]');
 if jsonb_typeof(groups)<>'array' or jsonb_array_length(groups)>12 or jsonb_typeof(tag_groups)<>'array' or jsonb_array_length(tag_groups)>10 then raise exception 'Invalid topic groups';end if;
 has_topics:=jsonb_array_length(groups)>0 and not exact_match;
 text_query:=websearch_to_tsquery('english',case when exact_match then q else coalesce(search_plan->>'text',q) end);
 literal_query:=websearch_to_tsquery('simple',q);
 intent_query:=websearch_to_tsquery('english',coalesce(search_plan->>'intentText',''));
 has_text:=numnode(text_query)>0;
 browse:=length(trim(q))=0;
 with filtered as materialized (
 select r.*,d.title_text,d.search_text,d.topic_ids,d.lexical,d.literal,d.embedding,
 case when query_embedding is not null and d.embedding is not null then 1-(d.embedding operator(extensions.<=>) query_embedding) else 0 end as similarity,
 (not has_topics or not exists(select 1 from jsonb_array_elements(groups) g where not d.topic_ids && array(select jsonb_array_elements_text(g)))) as topic_match,
 case when exact_match then d.literal @@ literal_query else has_text and d.lexical @@ text_query end as word_match
 from public.research_records r join public.research_search_documents d on d.record_id=r.id
 where (source_filter='' or r.source_slug=source_filter)
 and not exists(select 1 from unnest(selected_tags) with ordinality chosen(tag,ord) where
 not exists(select 1 from unnest(r.tags) actual where lower(actual)=lower(chosen.tag))
 and (exact_match or not d.topic_ids && coalesce(array(select jsonb_array_elements_text(tag_groups->(chosen.ord::integer-1))),'{}')))
 ), scored as materialized (
 select f.*,
 case when browse then 0 when exact_match and word_match then 0
 when (has_topics and topic_match and (not has_text or word_match)) or (not has_topics and word_match) then 0 else 1 end as tier,
 (case when word_match then 3+ts_rank_cd(lexical,text_query) else 0 end)+
 (case when has_topics and topic_match then 4 else 0 end)+
 (case when numnode(intent_query)>0 and lexical @@ intent_query then 3 else 0 end)+
 (case when public.research_normalise(q)<>'' and position(public.research_normalise(q) in title_text)>0 then 1 else 0 end)+similarity as score
 from filtered f
 where browse or (exact_match and word_match) or (not exact_match and (
 (has_topics and topic_match and (not has_text or word_match)) or (not has_topics and word_match)
 or (query_embedding is not null and similarity>=0.72
 and (not coalesce((search_plan->>'strictTopics')::boolean,false) or topic_match)
 and not (coalesce((search_plan->>'domesticTopic')::boolean,false) and topic_ids && array['burglary','residential-burglary'] and not topic_ids && array['domestic-abuse','intimate-partner-violence','family-violence','coercive-control','economic-abuse'])
 and not (coalesce((search_plan->>'burglaryTopic')::boolean,false) and topic_ids && array['robbery'] and not topic_ids && array['burglary','residential-burglary']))
 or (not has_topics and length(coalesce(search_plan->>'text',''))>=6 and cardinality(regexp_split_to_array(search_plan->>'text',' '))<=3
 and extensions.strict_word_similarity(search_plan->>'text',title_text)>=0.65)
 ))
 ), counts as (select count(*) as total,count(*) filter(where tier=0) as direct from scored), paged as (
 select id,source,source_slug,title,url,authors,publication,kind,summary,access,status,checked,tags,
 case when tier=1 then case when similarity>=0.72 then 'meaning' else 'similar-wording' end when has_topics then 'topic' else 'words' end as match_type,
 (select coalesce(jsonb_agg(t.label order by t.label),'[]') from public.research_search_topics t where t.id=any(scored.topic_ids)) as search_topics
 from scored order by tier,score desc,title,id limit 20
 offset (greatest(1,least(coalesce(page_number,1),greatest(1,ceil((select total from counts)/20.0)::integer)))-1)*20
 ) select jsonb_build_object('total',c.total,'directTotal',c.direct,'relatedTotal',c.total-c.direct,
 'catalogueTotal',(select count(*) from public.research_records),
 'page',greatest(1,least(coalesce(page_number,1),greatest(1,ceil(c.total/20.0)::integer))),
 'results',coalesce((select jsonb_agg(to_jsonb(paged)) from paged),'[]'),
 'semanticAvailable',query_embedding is not null,
 'indexedTotal',(select count(*) from public.research_search_documents where embedding is not null)) into result from counts c;
 return result;
 end;
$$;
revoke all on function public.search_research_v2(text,text[],integer,text,jsonb,extensions.vector,boolean) from public;
grant execute on function public.search_research_v2(text,text[],integer,text,jsonb,extensions.vector,boolean) to anon,authenticated;
revoke all on function public.research_normalise(text),public.research_clean_summary(text) from public;
grant execute on function public.research_normalise(text),public.research_clean_summary(text) to anon,authenticated,service_role;
