-- Full allowlist reset with real member emails.
-- (Originally also deleted auth.users rows — see neutralized section 1 below.)

-- 1. NEUTRALIZED 2026-08-31 — root-cause fix for recurring "Invalid login credentials".
--    This block looped over every member email and ran
--        DELETE FROM auth.users WHERE email = e;
--    which destroys each account's password hash. Being unguarded, it wiped ALL
--    members' logins on every re-application of this migration (db reset / db push /
--    re-sync) — the exact mechanism behind accounts that "worked yesterday" failing
--    with "Invalid login credentials" today. Removed. Original block was:
--
--    DO $$
--    DECLARE emails text[] := ARRAY['stuart@thefoundation.ca', 'oshawafederalliberal@gmail.com', ...];
--            e text;
--    BEGIN
--      FOREACH e IN ARRAY emails LOOP
--        DELETE FROM public.user_roles WHERE user_id = (SELECT id FROM auth.users WHERE email = e);
--        DELETE FROM public.users      WHERE id      = (SELECT id FROM auth.users WHERE email = e);
--        DELETE FROM auth.users        WHERE email   = e;
--      END LOOP;
--    END $$;

-- 2. Seed the allowed_users table with the real member list (allowlist only —
--    does not touch auth.users, so it cannot destroy a login).
--    NOTE: this still clears allowlist rows on re-run; that is a separate, lesser
--    concern (loss of UI-added members) tracked in ROADMAP.md, not the login bug.
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
