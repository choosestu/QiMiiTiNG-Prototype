
CREATE TYPE public.app_role AS ENUM ('chair', 'secretary', 'officer');
CREATE TYPE public.meeting_status AS ENUM (
  'scheduled','reports_open','agenda_generated','in_progress',
  'adjourned','minutes_draft','minutes_approved'
);
CREATE TYPE public.motion_result AS ENUM ('carried','defeated','tabled','withdrawn');

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

CREATE TABLE public.organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  gmail_address text,
  fieldy_api_key_encrypted text,
  google_oauth_tokens jsonb,
  quorum_required int NOT NULL DEFAULT 3,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.organizations TO authenticated;
GRANT ALL ON public.organizations TO service_role;
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_org_updated BEFORE UPDATE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.users (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  name text NOT NULL,
  email text NOT NULL UNIQUE,
  tier int NOT NULL CHECK (tier IN (1,2)),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.users TO authenticated;
GRANT ALL ON public.users TO service_role;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_users_org ON public.users(organization_id);

CREATE TABLE public.allowed_users (
  email text PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  role public.app_role NOT NULL,
  tier int NOT NULL CHECK (tier IN (1,2))
);
GRANT SELECT ON public.allowed_users TO authenticated;
GRANT ALL ON public.allowed_users TO service_role;
ALTER TABLE public.allowed_users ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  UNIQUE(user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE OR REPLACE FUNCTION public.is_admin(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role IN ('chair','secretary')
  )
$$;

CREATE OR REPLACE FUNCTION public.current_org(_user_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT organization_id FROM public.users WHERE id = _user_id
$$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  allowed RECORD;
BEGIN
  SELECT * INTO allowed FROM public.allowed_users WHERE lower(email) = lower(NEW.email) LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Email % is not on the QiMiiTiNG allowlist.', NEW.email;
  END IF;

  INSERT INTO public.users (id, organization_id, name, email, tier)
  VALUES (NEW.id, allowed.organization_id, allowed.name, NEW.email, allowed.tier);

  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, allowed.role);

  RETURN NEW;
END $$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE TABLE public.meetings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  title text NOT NULL,
  meeting_date date NOT NULL,
  meeting_type text NOT NULL,
  status public.meeting_status NOT NULL DEFAULT 'scheduled',
  quorum_required int NOT NULL DEFAULT 3,
  quorum_met boolean,
  fieldy_enabled boolean NOT NULL DEFAULT false,
  conversation_id text,
  conversation_start_time timestamptz,
  conversation_end_time timestamptz,
  agenda_url text,
  minutes_draft_url text,
  minutes_approved_url text,
  drive_folder_id text,
  created_by uuid REFERENCES public.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.meetings TO authenticated;
GRANT ALL ON public.meetings TO service_role;
ALTER TABLE public.meetings ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_meetings_org_date ON public.meetings(organization_id, meeting_date DESC);
CREATE TRIGGER trg_meetings_updated BEFORE UPDATE ON public.meetings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.officer_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id uuid NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  report_text text NOT NULL,
  bank_balance numeric(14,2),
  submitted_at timestamptz NOT NULL DEFAULT now(),
  reminder_sent_at timestamptz,
  UNIQUE(meeting_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.officer_reports TO authenticated;
GRANT ALL ON public.officer_reports TO service_role;
ALTER TABLE public.officer_reports ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_reports_meeting ON public.officer_reports(meeting_id);

CREATE TABLE public.attendees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id uuid NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  present boolean NOT NULL DEFAULT false,
  UNIQUE(meeting_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.attendees TO authenticated;
GRANT ALL ON public.attendees TO service_role;
ALTER TABLE public.attendees ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.motions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id uuid NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
  motion_text text NOT NULL,
  moved_by uuid REFERENCES public.users(id),
  seconded_by uuid REFERENCES public.users(id),
  result public.motion_result,
  vote_for int NOT NULL DEFAULT 0,
  vote_against int NOT NULL DEFAULT 0,
  vote_abstain int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.motions TO authenticated;
GRANT ALL ON public.motions TO service_role;
ALTER TABLE public.motions ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_motions_meeting ON public.motions(meeting_id);

CREATE TABLE public.minutes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id uuid NOT NULL UNIQUE REFERENCES public.meetings(id) ON DELETE CASCADE,
  ai_draft_text text,
  ai_draft_created_at timestamptz,
  approved_text text,
  approved_by uuid REFERENCES public.users(id),
  approved_at timestamptz,
  drive_url text
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.minutes TO authenticated;
GRANT ALL ON public.minutes TO service_role;
ALTER TABLE public.minutes ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.minutes_edits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  minutes_id uuid NOT NULL REFERENCES public.minutes(id) ON DELETE CASCADE,
  edited_by uuid NOT NULL REFERENCES public.users(id),
  original_text text NOT NULL,
  corrected_text text NOT NULL,
  edited_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.minutes_edits TO authenticated;
GRANT SELECT, INSERT ON public.minutes_edits TO service_role;
ALTER TABLE public.minutes_edits ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.block_audit_mutation()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'minutes_edits is append-only'; END $$;
CREATE TRIGGER trg_minutes_edits_no_update BEFORE UPDATE OR DELETE ON public.minutes_edits
  FOR EACH ROW EXECUTE FUNCTION public.block_audit_mutation();

CREATE TABLE public.email_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id uuid REFERENCES public.meetings(id) ON DELETE SET NULL,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  recipient_user_id uuid REFERENCES public.users(id),
  email_type text NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now(),
  gmail_message_id text
);
GRANT SELECT, INSERT ON public.email_log TO authenticated;
GRANT ALL ON public.email_log TO service_role;
ALTER TABLE public.email_log ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.transcript_segments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id uuid NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
  segment_index int NOT NULL,
  fieldy_segment_id text,
  speaker text,
  speaker_profile_id text,
  text text NOT NULL,
  start_offset numeric,
  end_offset numeric,
  segment_timestamp timestamptz,
  UNIQUE(meeting_id, segment_index)
);
GRANT SELECT, INSERT, DELETE ON public.transcript_segments TO authenticated;
GRANT ALL ON public.transcript_segments TO service_role;
ALTER TABLE public.transcript_segments ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_transcript_meeting ON public.transcript_segments(meeting_id, segment_index);

CREATE POLICY org_read ON public.organizations FOR SELECT TO authenticated
  USING (id = public.current_org(auth.uid()));
CREATE POLICY org_admin_update ON public.organizations FOR UPDATE TO authenticated
  USING (id = public.current_org(auth.uid()) AND public.is_admin(auth.uid()))
  WITH CHECK (id = public.current_org(auth.uid()) AND public.is_admin(auth.uid()));

CREATE POLICY users_read_org ON public.users FOR SELECT TO authenticated
  USING (organization_id = public.current_org(auth.uid()));
CREATE POLICY users_self_update ON public.users FOR UPDATE TO authenticated
  USING (id = auth.uid()) WITH CHECK (id = auth.uid());

CREATE POLICY user_roles_read_self ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin(auth.uid()));

CREATE POLICY allowed_users_admin_read ON public.allowed_users FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()));

CREATE POLICY meetings_read ON public.meetings FOR SELECT TO authenticated
  USING (organization_id = public.current_org(auth.uid()));
CREATE POLICY meetings_admin_insert ON public.meetings FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.current_org(auth.uid()) AND public.is_admin(auth.uid()));
CREATE POLICY meetings_admin_update ON public.meetings FOR UPDATE TO authenticated
  USING (organization_id = public.current_org(auth.uid()) AND public.is_admin(auth.uid()))
  WITH CHECK (organization_id = public.current_org(auth.uid()) AND public.is_admin(auth.uid()));
CREATE POLICY meetings_admin_delete ON public.meetings FOR DELETE TO authenticated
  USING (organization_id = public.current_org(auth.uid()) AND public.is_admin(auth.uid()));

CREATE POLICY reports_read ON public.officer_reports FOR SELECT TO authenticated
  USING (organization_id = public.current_org(auth.uid())
         AND (user_id = auth.uid() OR public.is_admin(auth.uid())));
CREATE POLICY reports_self_insert ON public.officer_reports FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.current_org(auth.uid()) AND user_id = auth.uid());
CREATE POLICY reports_self_update ON public.officer_reports FOR UPDATE TO authenticated
  USING (user_id = auth.uid() AND organization_id = public.current_org(auth.uid()))
  WITH CHECK (user_id = auth.uid() AND organization_id = public.current_org(auth.uid()));
CREATE POLICY reports_admin_all ON public.officer_reports FOR ALL TO authenticated
  USING (organization_id = public.current_org(auth.uid()) AND public.is_admin(auth.uid()))
  WITH CHECK (organization_id = public.current_org(auth.uid()) AND public.is_admin(auth.uid()));

CREATE POLICY attendees_read ON public.attendees FOR SELECT TO authenticated
  USING (EXISTS(SELECT 1 FROM public.meetings m WHERE m.id = meeting_id
                AND m.organization_id = public.current_org(auth.uid())));
CREATE POLICY attendees_admin_write ON public.attendees FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()) AND EXISTS(SELECT 1 FROM public.meetings m WHERE m.id = meeting_id
                AND m.organization_id = public.current_org(auth.uid())))
  WITH CHECK (public.is_admin(auth.uid()) AND EXISTS(SELECT 1 FROM public.meetings m WHERE m.id = meeting_id
                AND m.organization_id = public.current_org(auth.uid())));

CREATE POLICY motions_read ON public.motions FOR SELECT TO authenticated
  USING (EXISTS(SELECT 1 FROM public.meetings m WHERE m.id = meeting_id
                AND m.organization_id = public.current_org(auth.uid())));
CREATE POLICY motions_admin_write ON public.motions FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()) AND EXISTS(SELECT 1 FROM public.meetings m WHERE m.id = meeting_id
                AND m.organization_id = public.current_org(auth.uid())))
  WITH CHECK (public.is_admin(auth.uid()) AND EXISTS(SELECT 1 FROM public.meetings m WHERE m.id = meeting_id
                AND m.organization_id = public.current_org(auth.uid())));

CREATE POLICY minutes_read ON public.minutes FOR SELECT TO authenticated
  USING (EXISTS(SELECT 1 FROM public.meetings m WHERE m.id = meeting_id
                AND m.organization_id = public.current_org(auth.uid())));
CREATE POLICY minutes_admin_write ON public.minutes FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()) AND EXISTS(SELECT 1 FROM public.meetings m WHERE m.id = meeting_id
                AND m.organization_id = public.current_org(auth.uid())))
  WITH CHECK (public.is_admin(auth.uid()) AND EXISTS(SELECT 1 FROM public.meetings m WHERE m.id = meeting_id
                AND m.organization_id = public.current_org(auth.uid())));

CREATE POLICY minutes_edits_admin_read ON public.minutes_edits FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()));
CREATE POLICY minutes_edits_admin_insert ON public.minutes_edits FOR INSERT TO authenticated
  WITH CHECK (public.is_admin(auth.uid()) AND edited_by = auth.uid());

CREATE POLICY email_log_admin_read ON public.email_log FOR SELECT TO authenticated
  USING (organization_id = public.current_org(auth.uid()) AND public.is_admin(auth.uid()));
CREATE POLICY email_log_admin_insert ON public.email_log FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.current_org(auth.uid()) AND public.is_admin(auth.uid()));

CREATE POLICY transcripts_admin ON public.transcript_segments FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()) AND EXISTS(SELECT 1 FROM public.meetings m WHERE m.id = meeting_id
                AND m.organization_id = public.current_org(auth.uid())))
  WITH CHECK (public.is_admin(auth.uid()) AND EXISTS(SELECT 1 FROM public.meetings m WHERE m.id = meeting_id
                AND m.organization_id = public.current_org(auth.uid())));

WITH new_org AS (
  INSERT INTO public.organizations (name, quorum_required)
  VALUES ('Oshawa Federal Liberal Association', 3)
  RETURNING id
)
INSERT INTO public.allowed_users (email, organization_id, name, role, tier)
SELECT v.email, new_org.id, v.name, v.role::public.app_role, v.tier
FROM new_org, (VALUES
  ('stuart.smith@example.com',        'Stuart Smith',         'chair',     1),
  ('anthony.nicholson@example.com',   'Anthony Nicholson',    'secretary', 1),
  ('jeremy.kolodziej@example.com',    'Jeremy Kolodziej',     'officer',   2),
  ('hugh.montgomery@example.com',     'Hugh Montgomery',      'officer',   2),
  ('heather.mcmillan@example.com',    'Heather McMillan',     'officer',   2),
  ('sara.gulshan@example.com',        'Sara (Mamoon) Gulshan','officer',   2),
  ('jacquie.severs@example.com',      'Jacquie Severs',       'officer',   2),
  ('dave.lockie@example.com',         'Dave Lockie',          'officer',   2),
  ('deborah.nurse@example.com',       'Deborah Nurse',        'officer',   2),
  ('avril.burns@example.com',         'Avril Burns',          'officer',   2)
) AS v(email, name, role, tier);
