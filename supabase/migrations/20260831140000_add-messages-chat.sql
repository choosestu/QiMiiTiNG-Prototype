-- Per-organization group chat. Members of an org can read and post messages
-- scoped to their org (governance/association comms only). No update/delete
-- policies: messages are append-only for members (service_role may manage).

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 4000),
  created_at timestamptz not null default now()
);
alter table public.messages enable row level security;
grant select, insert on public.messages to authenticated;
grant all on public.messages to service_role;
create index if not exists messages_org_created_idx on public.messages (organization_id, created_at);

drop policy if exists messages_read on public.messages;
create policy messages_read on public.messages for select to authenticated
  using (organization_id = public.current_org(auth.uid()));

drop policy if exists messages_insert on public.messages;
create policy messages_insert on public.messages for insert to authenticated
  with check (organization_id = public.current_org(auth.uid()) and user_id = auth.uid());
