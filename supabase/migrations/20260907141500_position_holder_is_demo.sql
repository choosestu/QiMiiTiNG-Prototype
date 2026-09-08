-- Demo-seat exclusion. A seat may be occupied by a demo/test holder that must
-- never appear in real governance (rosters, attendance, quorum) while its login
-- stays usable for demonstrations. `is_demo` marks such a holding.
alter table public.position_holders
  add column if not exists is_demo boolean not null default false;

-- Robert Zarools is a fake test-only account occupying the real Director 4 seat.
-- Flag the holding so real rosters exclude it; the sdgsmith@gmail.com login and
-- the advisor demo (View-as-role) are unaffected.
update public.position_holders ph
  set is_demo = true
  from public.positions p
  where ph.position_id = p.id
    and p.slug = 'director-4'
    and ph.holder_name = 'Robert Zarools'
    and ph.term_end is null;
