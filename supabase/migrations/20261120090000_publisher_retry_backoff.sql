-- Publisher checks that failed only because the publisher was unreachable (timeouts, connection errors,
-- HTTP 5xx) were marked terminal after two attempts. The worker now retries those on a widening schedule
-- (up to six attempts). Return the transient failures to the queue, spread over the next 24 hours so one
-- slow host (aic.gov.au accounts for most) cannot monopolise an hourly batch. Attempts are kept.
update private.non_doi_enrichment_queue q
set publisher_status = 'pending',
    publisher_next_attempt_at = now() + make_interval(mins => mod(abs(hashtext(q.record_id)::bigint),1440)::int),
    publisher_note = 'Requeued after transient publisher failure (retry policy 2026-11-20)'
where q.publisher_status = 'error'
  and q.publisher_note = 'Publisher fetch failed'
  and q.publisher_attempts < 6
  and q.status not in ('verified', 'processing');
