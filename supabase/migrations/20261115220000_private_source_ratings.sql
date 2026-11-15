-- Ratings are a private tool for source owners, not a public popularity score.
-- Clients may still read the verification signals, but no longer the rating
-- average or count. The Worker reads ratings with the service role and returns
-- them only to people who manage the source. Privilege change only: no data
-- is altered or deleted.
revoke select on public.source_signals from anon, authenticated;
grant select (source_id, organisation_confirmed, domain_confirmed, confirmed_social,
              independent_references, eligible_recommendations, calculated_at)
  on public.source_signals to anon, authenticated;
