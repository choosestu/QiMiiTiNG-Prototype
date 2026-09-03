-- Store the meeting agenda as text so it can be shown as a first-class section on
-- the meeting page (prepared and circulated before the meeting), not only as a
-- Drive PDF link. Nullable and additive; existing meetings are unaffected.
alter table public.meetings add column if not exists agenda_text text;
