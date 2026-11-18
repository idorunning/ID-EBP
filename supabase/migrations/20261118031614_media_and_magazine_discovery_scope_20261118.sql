-- Applied in production 18 November 2026. Extend candidate registry to media, newspapers and magazines.
alter table staging.web_source_searches drop constraint if exists web_source_searches_stream_check;
alter table staging.web_source_searches add constraint web_source_searches_stream_check
 check(stream in ('sources','institutions','publishers','media'));
alter table staging.web_source_candidates drop constraint if exists web_source_candidates_entity_type_check;
alter table staging.web_source_candidates add constraint web_source_candidates_entity_type_check
 check(entity_type in ('journal','repository','conference','institution','publisher','society','institute','newspaper','magazine','broadcast','newsroom','blog','media','other'));
insert into staging.web_source_searches(stream,term) values
('media','"evidence-based policing" research'),
('media','"police research" study'),
('media','"crime prevention" evaluation'),
('media','"policing" research report'),
('media','"police misconduct" research'),
('media','"domestic abuse" police study'),
('media','"procedural justice" police study'),
('media','"policing" university research'),
('media','"law enforcement" evidence review'),
('media','"community policing" evaluation')
on conflict(stream,term) do nothing;