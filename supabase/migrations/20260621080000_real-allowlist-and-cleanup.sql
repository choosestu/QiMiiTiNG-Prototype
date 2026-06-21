-- Full allowlist reset with real member emails.
-- Wipes all placeholder @example.com entries and any partial real-email
-- entries from earlier migrations, then inserts the authoritative list.
-- Also cleans up any orphaned auth records so affected emails can register fresh.

-- 1. Remove orphaned auth rows for real emails that may exist from failed
--    signup attempts (must happen before allowed_users changes).
DO $$
DECLARE
  emails text[] := ARRAY[
    'stuart@thefoundation.ca',
    'oshawafederalliberal@gmail.com',
    'jacquelinesevers@gmail.com',
    'a78nicholson@gmail.com',
    'jeremykolodziej@gmail.com',
    'hrmcmillan@rogers.com',
    'hugh.montgomerie@gmail.com',
    'deborah.nurse@gmail.com',
    'avril.burns@ddsb.ca',
    'lockieda@gmail.com'
  ];
  e text;
BEGIN
  FOREACH e IN ARRAY emails LOOP
    DELETE FROM public.user_roles WHERE user_id = (SELECT id FROM auth.users WHERE email = e);
    DELETE FROM public.users      WHERE id      = (SELECT id FROM auth.users WHERE email = e);
    DELETE FROM auth.users        WHERE email   = e;
  END LOOP;
END $$;

-- 2. Replace the entire allowed_users table with the real member list.
DELETE FROM public.allowed_users;

INSERT INTO public.allowed_users (email, organization_id, name, role, tier)
SELECT v.email, o.id, v.name, v.role::public.app_role, v.tier
FROM public.organizations o,
(VALUES
  -- Tier 1 — chair/secretary (admin access)
  ('stuart@thefoundation.ca',         'Stuart Smith (QiMiiTiNG)',  'chair',     1),
  ('oshawafederalliberal@gmail.com',   'Stuart Smith (OFLA Chair)', 'chair',     1),
  ('jacquelinesevers@gmail.com',       'Jacquie Severs',            'secretary', 1),
  ('a78nicholson@gmail.com',           'Anthony Nicholson',         'secretary', 1),
  -- Tier 2 — officers
  ('jeremykolodziej@gmail.com',        'Jeremy Kolodziej',          'officer',   2),
  ('hrmcmillan@rogers.com',            'Heather McMillan',          'officer',   2),
  ('hugh.montgomerie@gmail.com',       'Hugh Montgomery',           'officer',   2),
  ('deborah.nurse@gmail.com',          'Deborah Nurse',             'officer',   2),
  ('avril.burns@ddsb.ca',              'Avril Burns',               'officer',   2),
  ('lockieda@gmail.com',               'Dave Lockie',               'officer',   2)
) AS v(email, name, role, tier)
WHERE o.name = 'Oshawa Federal Liberal Association';

-- 3. Verify
SELECT email, name, role, tier FROM public.allowed_users ORDER BY tier, role, name;
