
-- 1) Move sensitive credential columns into a service-role-only table
CREATE TABLE public.organization_secrets (
  organization_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  google_oauth_tokens jsonb,
  fieldy_api_key_encrypted text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.organization_secrets TO service_role;
ALTER TABLE public.organization_secrets ENABLE ROW LEVEL SECURITY;
-- Intentionally no policies: only service_role (which bypasses RLS) may access.

CREATE TRIGGER organization_secrets_set_updated_at
  BEFORE UPDATE ON public.organization_secrets
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.organization_secrets (organization_id, google_oauth_tokens, fieldy_api_key_encrypted)
SELECT id, google_oauth_tokens, fieldy_api_key_encrypted
FROM public.organizations
ON CONFLICT (organization_id) DO NOTHING;

ALTER TABLE public.organizations DROP COLUMN google_oauth_tokens;
ALTER TABLE public.organizations DROP COLUMN fieldy_api_key_encrypted;

-- 2) Scope allowed_users admin read to own organization
DROP POLICY IF EXISTS allowed_users_admin_read ON public.allowed_users;
CREATE POLICY allowed_users_admin_read ON public.allowed_users
  FOR SELECT TO authenticated
  USING (is_admin(auth.uid()) AND organization_id = current_org(auth.uid()));

-- 3) Scope minutes_edits admin read to own organization
DROP POLICY IF EXISTS minutes_edits_admin_read ON public.minutes_edits;
CREATE POLICY minutes_edits_admin_read ON public.minutes_edits
  FOR SELECT TO authenticated
  USING (
    is_admin(auth.uid()) AND EXISTS (
      SELECT 1 FROM public.minutes mi
      JOIN public.meetings m ON m.id = mi.meeting_id
      WHERE mi.id = minutes_edits.minutes_id
        AND m.organization_id = current_org(auth.uid())
    )
  );

-- 4) Allow org members to read transcripts for their org's meetings
CREATE POLICY transcripts_read ON public.transcript_segments
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.meetings m
    WHERE m.id = transcript_segments.meeting_id
      AND m.organization_id = current_org(auth.uid())
  ));

-- 5) Revoke direct EXECUTE on SECURITY DEFINER helpers from clients.
-- They still run inside RLS policy expressions because policies evaluate
-- with the function owner's privileges via SECURITY DEFINER semantics.
REVOKE EXECUTE ON FUNCTION public.is_admin(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.current_org(uuid) FROM PUBLIC, anon, authenticated;
