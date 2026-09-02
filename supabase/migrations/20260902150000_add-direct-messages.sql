-- Direct messages: extend public.messages with a nullable recipient_id.
--   recipient_id IS NULL  -> org-wide group channel (existing behaviour)
--   recipient_id = <user> -> private 1:1 DM, readable only by sender & recipient
alter table public.messages add column if not exists recipient_id uuid references public.users(id) on delete cascade;
create index if not exists messages_dm_idx on public.messages (organization_id, recipient_id, user_id, created_at);

drop policy if exists messages_read on public.messages;
create policy messages_read on public.messages for select to authenticated
  using (
    organization_id = public.current_org(auth.uid())
    and (
      recipient_id is null            -- org-wide group channel
      or user_id = auth.uid()         -- DMs I sent
      or recipient_id = auth.uid()    -- DMs sent to me
    )
  );

drop policy if exists messages_insert on public.messages;
create policy messages_insert on public.messages for insert to authenticated
  with check (
    organization_id = public.current_org(auth.uid())
    and user_id = auth.uid()
    and (recipient_id is null or recipient_id <> user_id)
    and (recipient_id is null or public.current_org(recipient_id) = public.current_org(auth.uid()))
  );
