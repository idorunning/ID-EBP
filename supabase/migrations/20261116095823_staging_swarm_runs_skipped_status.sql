alter table staging.swarm_runs drop constraint if exists swarm_runs_status_check;
alter table staging.swarm_runs add constraint swarm_runs_status_check check (status in ('running','passed','failed','partial','skipped'));
