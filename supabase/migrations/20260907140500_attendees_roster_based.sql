-- Roster-based attendance. Attendance is now keyed to a position seat
-- (position_holder), not to an app account, so seat-holders without a login can
-- be marked present and quorum is derived from the real roster. user_id becomes
-- optional and is still set when the seat has a linked login (for motions/reports).
alter table public.attendees
  add column if not exists position_holder_id uuid references public.position_holders(id) on delete cascade;

alter table public.attendees alter column user_id drop not null;

-- One attendance row per (meeting, seat). Partial index so legacy rows that only
-- carry user_id (e.g. demo meetings) are unaffected.
create unique index if not exists attendees_meeting_position_holder_key
  on public.attendees (meeting_id, position_holder_id)
  where position_holder_id is not null;
