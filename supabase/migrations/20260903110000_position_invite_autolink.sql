-- When a new member signs up, automatically connect them to any pending position
-- whose forwarding email matches theirs, and mark that portal active. This is how
-- a position invitation (sent by email) becomes a live login without manual linking.
create or replace function public.link_position_holder_on_signup()
returns trigger language plpgsql security definer set search_path = public as $BODY$
begin
  update public.position_holders
     set current_login_user_id = new.id, portal_status = 'active'
   where organization_id = new.organization_id
     and term_end is null
     and current_login_user_id is null
     and lower(forwarding_email) = lower(new.email);
  return new;
end $BODY$;

drop trigger if exists trg_link_position_holder on public.users;
create trigger trg_link_position_holder after insert on public.users
  for each row execute function public.link_position_holder_on_signup();
