do $$
declare endpoint text;
begin
  if to_regclass('cron.job') is null then return; end if;
  select command into endpoint from cron.job where jobname='non-doi-openalex-every-minute';
  if endpoint is not null then
    perform cron.alter_job(jobid,active:=false) from cron.job
      where jobname in ('non-doi-openalex-every-minute','non-doi-publisher-every-minute') and active;
    perform cron.schedule('id-ebp-research-enrichment-hourly','55 * * * *',replace(endpoint,'60000','90000'));
  end if;
  if to_regclass('private.verification_programmes') is not null then
    perform cron.schedule('id-ebp-research-assurance-hourly','50 * * * *',
      'select private.screen_research_verification_batch();');
  end if;
end;
$$;
