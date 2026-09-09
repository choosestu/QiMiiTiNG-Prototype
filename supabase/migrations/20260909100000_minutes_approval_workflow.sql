-- Minutes approval workflow (Robert's Rules by-consent model).
-- After the Secretary drafts minutes, they are sent to the meeting's present
-- voting members for review. Each member either approves as circulated or
-- requests a correction. A single correction request pauses the round; the
-- Secretary amends and re-issues a fresh round. When all eligible members have
-- approved with no open correction request, the minutes are approved by consent
-- and may be stored to Drive.

-- Review state lives on the minutes row. meeting.status is unchanged.
alter table public.minutes
  add column if not exists review_status text not null default 'draft',
  add column if not exists review_round integer not null default 0,
  add column if not exists review_started_at timestamptz;
-- 'draft' | 'in_review' | 'changes_requested' | 'approved'

-- One vote per member per round. Votes are written by server functions
-- (service role), so no client write policy is needed; members only read.
create table if not exists public.minutes_approvals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  meeting_id uuid not null references public.meetings(id) on delete cascade,
  round integer not null,
  user_id uuid not null references public.users(id) on delete cascade,
  decision text not null check (decision in ('approved', 'changes_requested')),
  comment text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (meeting_id, round, user_id)
);

create index if not exists minutes_approvals_meeting_round_idx
  on public.minutes_approvals (meeting_id, round);

alter table public.minutes_approvals enable row level security;

-- Everyone in the organization can see the review votes (transparency in the
-- portal). Writes happen only through server functions using the service role.
drop policy if exists minutes_approvals_read on public.minutes_approvals;
create policy minutes_approvals_read on public.minutes_approvals
  for select to authenticated
  using (organization_id = current_org(auth.uid()));
