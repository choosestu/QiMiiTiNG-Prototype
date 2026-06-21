DELETE FROM public.user_roles WHERE user_id = (SELECT id FROM auth.users WHERE email = 'stuart@thefoundation.ca');
DELETE FROM public.users WHERE id = (SELECT id FROM auth.users WHERE email = 'stuart@thefoundation.ca');
DELETE FROM auth.users WHERE email = 'stuart@thefoundation.ca';