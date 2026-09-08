-- Report routing: distinguish a general officer report from the Treasurer's
-- financial report. Previously a single `submits_report` boolean lumped them
-- together. `report_kind` NULL means the position does not submit a report.
do $$ begin
  if not exists (select 1 from pg_type where typname = 'report_kind') then
    create type public.report_kind as enum ('officer', 'financial');
  end if;
end $$;

alter table public.positions add column if not exists report_kind public.report_kind;

-- Backfill (general, not hardcoded to one org's slugs):
--   financial -> the Treasurer
--   officer    -> any other position that currently submits a report
--   null       -> everyone else (e.g. Secretary, directors, custom roles)
update public.positions
  set report_kind = 'financial'
  where slug = 'treasurer' or title ilike '%treasurer%';

update public.positions
  set report_kind = 'officer'
  where submits_report = true and report_kind is distinct from 'financial';

-- Keep submits_report consistent with report_kind (values already align; this
-- is a consistency guard so the two never drift).
update public.positions set submits_report = (report_kind is not null);
