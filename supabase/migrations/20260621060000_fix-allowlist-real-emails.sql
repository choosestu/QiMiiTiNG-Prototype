-- Replace placeholder example.com addresses with real emails for known members.
-- The chair account (Stuart Smith) must use the real address so the signup
-- trigger (handle_new_user) can match it and create the public.users row.

UPDATE public.allowed_users
SET email = 'stuart@thefoundation.ca'
WHERE email = 'stuart.smith@example.com';

-- Clean up any orphaned auth record that may still exist from failed attempts.
-- The trigger left a row in auth.users with no matching public.users row.
-- We delete in dependency order; the ON DELETE CASCADE on user_roles handles
-- that table, but we list it explicitly for clarity.
DELETE FROM public.user_roles
  WHERE user_id IN (SELECT id FROM auth.users WHERE email = 'stuart@thefoundation.ca');
DELETE FROM public.users
  WHERE id IN (SELECT id FROM auth.users WHERE email = 'stuart@thefoundation.ca');
DELETE FROM auth.users
  WHERE email = 'stuart@thefoundation.ca';
