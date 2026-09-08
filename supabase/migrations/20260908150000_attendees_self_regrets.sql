-- Self-service Regrets.
-- Members may set their OWN attendance to 'regrets' (with an optional reason).
-- Every other attendance edit (present/late/absent, and anyone else's row) stays
-- restricted to admins by the existing attendees_admin_write policy.

-- Optional free-text reason captured when a member sends regrets.
alter table public.attendees add column if not exists regrets_reason text;

-- Allow a member to INSERT their own regrets row (when none exists yet).
drop policy if exists attendees_self_regrets_insert on public.attendees;
create policy attendees_self_regrets_insert on public.attendees
  for insert to authenticated
  with check (
    attendance_status = 'regrets'
    and present = false
    and user_id = auth.uid()
    and exists (
      select 1 from public.meetings m
      where m.id = attendees.meeting_id
        and m.organization_id = current_org(auth.uid())
    )
  );

-- Allow a member to UPDATE their own attendance row, but only to 'regrets'.
-- USING matches the caller's own row (by login or by the seat they hold);
-- WITH CHECK forbids the result being anything other than their own regrets.
drop policy if exists attendees_self_regrets_update on public.attendees;
create policy attendees_self_regrets_update on public.attendees
  for update to authenticated
  using (
    (
      user_id = auth.uid()
      or position_holder_id in (
        select ph.id from public.position_holders ph
        where ph.current_login_user_id = auth.uid()
      )
    )
    and exists (
      select 1 from public.meetings m
      where m.id = attendees.meeting_id
        and m.organization_id = current_org(auth.uid())
    )
  )
  with check (
    attendance_status = 'regrets'
    and present = false
    and user_id = auth.uid()
    and exists (
      select 1 from public.meetings m
      where m.id = attendees.meeting_id
        and m.organization_id = current_org(auth.uid())
    )
  );
