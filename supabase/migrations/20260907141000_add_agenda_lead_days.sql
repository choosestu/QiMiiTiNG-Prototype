-- Configurable lead time (in days) before a meeting for the agenda pipeline to
-- scan the connected Google Workspace account (Gmail, Calendar) and assemble the
-- agenda. Also the basis for future scheduled generation.
alter table public.organizations
  add column if not exists agenda_lead_days integer not null default 5;
