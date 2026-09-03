-- Which positions submit a formal officer report (vs. only raising agenda items).
-- Org-configurable; defaults to false. Seeds OFLA's reporting roles.
alter table public.positions add column if not exists submits_report boolean not null default false;

update public.positions set submits_report = true
where organization_id = (select id from public.organizations where name = 'Oshawa Federal Liberal Association')
  and slug in ('chair', 'vice-chair', 'policy', 'organization', 'treasurer');
