-- Replace placeholder example.com addresses with real emails for known members.
-- The chair account (Stuart Smith) must use the real address so the signup
-- trigger (handle_new_user) can match it and create the public.users row.
-- (This UPDATE is harmless and idempotent; retained.)

UPDATE public.allowed_users
SET email = 'stuart@thefoundation.ca'
WHERE email = 'stuart.smith@example.com';

-- NEUTRALIZED 2026-08-31 — root-cause fix for recurring "Invalid login credentials".
-- The block below used to delete a live account, which destroyed its password hash
-- on every re-application of this migration. Removed. Original statements were:
--   DELETE FROM public.user_roles WHERE user_id IN (SELECT id FROM auth.users WHERE email = 'stuart@thefoundation.ca');
--   DELETE FROM public.users      WHERE id      IN (SELECT id FROM auth.users WHERE email = 'stuart@thefoundation.ca');
--   DELETE FROM auth.users        WHERE email = 'stuart@thefoundation.ca';
