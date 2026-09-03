-- Richer attendance: Present / Late / Regrets / Absent, with an arrival time for Late.
-- The existing boolean `present` is kept (Present and Late set it true) so quorum and
-- other consumers keep working unchanged.
alter table public.attendees
  add column if not exists attendance_status text not null default 'absent'
  check (attendance_status in ('present', 'regrets', 'absent', 'late'));
alter table public.attendees add column if not exists arrived_at timestamptz;

update public.attendees set attendance_status = 'present'
  where present = true and attendance_status <> 'present';
