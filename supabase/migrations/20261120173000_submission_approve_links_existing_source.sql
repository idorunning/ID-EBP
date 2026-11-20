-- Approving a member's "new source" suggestion failed with
-- duplicate key "sources_unique_website" whenever the same website was
-- already listed (for example, added earlier by the nightly crawler).
-- Approval now links the suggestion to the existing listing instead of
-- trying to create a second copy. Ownership is still never granted by a
-- suggestion; the member claims the listing separately.
do $migration$
declare
 definition text;
 old_fragment text;
 new_fragment text;
begin
 select pg_get_functiondef('private.directory_core(text,jsonb,uuid,uuid,text)'::regprocedure) into definition;

 old_fragment:=$old$        insert into public.sources(slug,name,website_url,canonical_domain,$old$;
 new_fragment:=$new$        -- Same normalisation as the sources_unique_website index.
        select src.id into target_source_id from public.sources src
          where lower(regexp_replace(src.website_url,'/+$',''))=lower(regexp_replace(profile->>'url','/+$',''))
          limit 1 for update;
        if target_source_id is not null then
          update private.source_submissions set reason=left(review_reason||' (already listed; linked to the existing entry)',1000) where id=item.id;
        else
        insert into public.sources(slug,name,website_url,canonical_domain,$new$;
 if strpos(definition,old_fragment)=0 then raise exception 'Migration: expected submission insert fragment missing';end if;
 definition:=replace(definition,old_fragment,new_fragment);

 old_fragment:=$old$        insert into public.source_signals(source_id) values(target_source_id);
        -- Submitting a listing is not proof of ownership. Claim it separately.$old$;
 new_fragment:=$new$        insert into public.source_signals(source_id) values(target_source_id);
        end if;
        -- Submitting a listing is not proof of ownership. Claim it separately.$new$;
 if strpos(definition,old_fragment)=0 then raise exception 'Migration: expected submission signals fragment missing';end if;
 definition:=replace(definition,old_fragment,new_fragment);

 execute definition;
end
$migration$;
