-- Prioritise topic and intervention matches in titles over incidental mentions.
create or replace function public.search_research_v2(q text default '',selected_tags text[] default '{}',page_number integer default 1,source_filter text default '',search_plan jsonb default '{}',query_embedding extensions.vector(384) default null,exact_match boolean default false)
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
 (case when numnode(intent_query)>0 and lexical @@ intent_query then 2+least(8,ts_rank_cd(lexical,intent_query)*5) else 0 end)+
 (case when numnode(intent_query)>0 and to_tsvector('english',title) @@ intent_query then 4 else 0 end)+
 (case when has_topics and exists(select 1 from public.research_search_topics t where t.id=any(array(select jsonb_array_elements_text(g) from jsonb_array_elements(groups) g)) and title_text ~ t.pattern) then 3 when not has_topics and public.research_normalise(q)<>'' and position(' '||public.research_normalise(q)||' ' in ' '||title_text||' ')>0 then 1 else 0 end)+similarity as score
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
