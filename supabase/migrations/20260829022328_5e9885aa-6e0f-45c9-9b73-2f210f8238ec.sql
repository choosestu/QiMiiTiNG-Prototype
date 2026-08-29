-- ============ enums ============
CREATE TYPE public.position_category AS ENUM ('elected_officer','appointed_officer','director_at_large','ex_officio','custom');
CREATE TYPE public.portal_status AS ENUM ('invitation_pending','active','revoked');
CREATE TYPE public.assigned_via AS ENUM ('initial_setup','agm_election','board_appointment','manual');
CREATE TYPE public.action_item_status AS ENUM ('open','carried_forward','done');
CREATE TYPE public.correspondence_direction AS ENUM ('inbound','outbound');
CREATE TYPE public.vote_choice AS ENUM ('for','against','abstain');

-- ============ positions ============
CREATE TABLE public.positions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  title text NOT NULL,
  slug text NOT NULL,
  role_email text,
  brief text,
  category public.position_category NOT NULL DEFAULT 'custom',
  default_app_role public.app_role NOT NULL DEFAULT 'officer',
  display_order integer NOT NULL DEFAULT 0,
  auto_succeeds_position_id uuid REFERENCES public.positions(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, slug)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.positions TO authenticated;
GRANT ALL ON public.positions TO service_role;
ALTER TABLE public.positions ENABLE ROW LEVEL SECURITY;
CREATE POLICY positions_read ON public.positions FOR SELECT TO authenticated
  USING (organization_id = public.current_org(auth.uid()));
CREATE POLICY positions_admin_insert ON public.positions FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.current_org(auth.uid()) AND public.is_admin(auth.uid()));
CREATE POLICY positions_admin_update ON public.positions FOR UPDATE TO authenticated
  USING (organization_id = public.current_org(auth.uid()) AND public.is_admin(auth.uid()))
  WITH CHECK (organization_id = public.current_org(auth.uid()) AND public.is_admin(auth.uid()));
CREATE POLICY positions_admin_delete ON public.positions FOR DELETE TO authenticated
  USING (organization_id = public.current_org(auth.uid()) AND public.is_admin(auth.uid()));
CREATE TRIGGER trg_positions_updated BEFORE UPDATE ON public.positions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ position_holders ============
CREATE TABLE public.position_holders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  position_id uuid NOT NULL REFERENCES public.positions(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  holder_name text NOT NULL,
  forwarding_email text,
  phone text,
  current_login_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  term_start timestamptz NOT NULL DEFAULT now(),
  term_end timestamptz,
  portal_status public.portal_status NOT NULL DEFAULT 'invitation_pending',
  assigned_via public.assigned_via NOT NULL DEFAULT 'manual',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX position_holders_one_current ON public.position_holders (position_id) WHERE term_end IS NULL;
CREATE INDEX position_holders_position_idx ON public.position_holders (position_id, term_start DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.position_holders TO authenticated;
GRANT ALL ON public.position_holders TO service_role;
ALTER TABLE public.position_holders ENABLE ROW LEVEL SECURITY;
CREATE POLICY position_holders_read ON public.position_holders FOR SELECT TO authenticated
  USING (organization_id = public.current_org(auth.uid()));
CREATE POLICY position_holders_admin_write ON public.position_holders FOR ALL TO authenticated
  USING (organization_id = public.current_org(auth.uid()) AND public.is_admin(auth.uid()))
  WITH CHECK (organization_id = public.current_org(auth.uid()) AND public.is_admin(auth.uid()));
CREATE TRIGGER trg_position_holders_updated BEFORE UPDATE ON public.position_holders
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- helper: is the given user the current holder of the position?
CREATE OR REPLACE FUNCTION public.is_position_holder(_position_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.position_holders
    WHERE position_id = _position_id
      AND current_login_user_id = _user_id
      AND term_end IS NULL
  )
$$;
REVOKE EXECUTE ON FUNCTION public.is_position_holder(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- ============ position_contacts ============
CREATE TABLE public.position_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  position_id uuid NOT NULL REFERENCES public.positions(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  org_affiliation text,
  email text,
  phone text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.position_contacts TO authenticated;
GRANT ALL ON public.position_contacts TO service_role;
ALTER TABLE public.position_contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY position_contacts_read ON public.position_contacts FOR SELECT TO authenticated
  USING (organization_id = public.current_org(auth.uid()));
CREATE POLICY position_contacts_write ON public.position_contacts FOR ALL TO authenticated
  USING (organization_id = public.current_org(auth.uid())
    AND (public.is_admin(auth.uid()) OR public.is_position_holder(position_id, auth.uid())))
  WITH CHECK (organization_id = public.current_org(auth.uid())
    AND (public.is_admin(auth.uid()) OR public.is_position_holder(position_id, auth.uid())));
CREATE TRIGGER trg_position_contacts_updated BEFORE UPDATE ON public.position_contacts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ position_handover_notes (append-only) ============
CREATE TABLE public.position_handover_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  position_id uuid NOT NULL REFERENCES public.positions(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  author_user_id uuid NOT NULL REFERENCES public.users(id),
  author_name text,
  note_text text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.position_handover_notes TO authenticated;
GRANT ALL ON public.position_handover_notes TO service_role;
ALTER TABLE public.position_handover_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY handover_notes_read ON public.position_handover_notes FOR SELECT TO authenticated
  USING (organization_id = public.current_org(auth.uid()));
CREATE POLICY handover_notes_insert ON public.position_handover_notes FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.current_org(auth.uid())
    AND author_user_id = auth.uid()
    AND (public.is_admin(auth.uid()) OR public.is_position_holder(position_id, auth.uid())));
CREATE TRIGGER trg_handover_notes_append_only
  BEFORE UPDATE OR DELETE ON public.position_handover_notes
  FOR EACH ROW EXECUTE FUNCTION public.block_audit_mutation();

-- ============ position_portal_invitations (no app logic yet) ============
CREATE TABLE public.position_portal_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  position_holder_id uuid NOT NULL REFERENCES public.position_holders(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  token_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  accepted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.position_portal_invitations TO service_role;
ALTER TABLE public.position_portal_invitations ENABLE ROW LEVEL SECURITY;

-- ============ election_proposals (dormant) ============
CREATE TABLE public.election_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  meeting_id uuid REFERENCES public.meetings(id) ON DELETE CASCADE,
  position_id uuid REFERENCES public.positions(id) ON DELETE CASCADE,
  proposed_holder_name text,
  source_excerpt text,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.election_proposals TO service_role;
ALTER TABLE public.election_proposals ENABLE ROW LEVEL SECURITY;

-- ============ action_items ============
CREATE TABLE public.action_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  position_id uuid REFERENCES public.positions(id) ON DELETE CASCADE,
  meeting_id uuid REFERENCES public.meetings(id) ON DELETE SET NULL,
  description text NOT NULL,
  status public.action_item_status NOT NULL DEFAULT 'open',
  due_date date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.action_items TO authenticated;
GRANT ALL ON public.action_items TO service_role;
ALTER TABLE public.action_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY action_items_read ON public.action_items FOR SELECT TO authenticated
  USING (organization_id = public.current_org(auth.uid()));
CREATE POLICY action_items_admin_insert ON public.action_items FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.current_org(auth.uid()) AND public.is_admin(auth.uid()));
CREATE POLICY action_items_admin_delete ON public.action_items FOR DELETE TO authenticated
  USING (organization_id = public.current_org(auth.uid()) AND public.is_admin(auth.uid()));
CREATE POLICY action_items_update ON public.action_items FOR UPDATE TO authenticated
  USING (organization_id = public.current_org(auth.uid())
    AND (public.is_admin(auth.uid()) OR (position_id IS NOT NULL AND public.is_position_holder(position_id, auth.uid()))))
  WITH CHECK (organization_id = public.current_org(auth.uid())
    AND (public.is_admin(auth.uid()) OR (position_id IS NOT NULL AND public.is_position_holder(position_id, auth.uid()))));
CREATE TRIGGER trg_action_items_updated BEFORE UPDATE ON public.action_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ correspondence (admin-only) ============
CREATE TABLE public.correspondence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  position_id uuid REFERENCES public.positions(id) ON DELETE CASCADE,
  direction public.correspondence_direction NOT NULL DEFAULT 'inbound',
  counterparty text,
  subject text NOT NULL,
  body text,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.correspondence TO authenticated;
GRANT ALL ON public.correspondence TO service_role;
ALTER TABLE public.correspondence ENABLE ROW LEVEL SECURITY;
CREATE POLICY correspondence_admin_all ON public.correspondence FOR ALL TO authenticated
  USING (organization_id = public.current_org(auth.uid()) AND public.is_admin(auth.uid()))
  WITH CHECK (organization_id = public.current_org(auth.uid()) AND public.is_admin(auth.uid()));
CREATE TRIGGER trg_correspondence_updated BEFORE UPDATE ON public.correspondence
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ motion_votes + async voting on motions ============
ALTER TABLE public.motions
  ADD COLUMN IF NOT EXISTS voting_mode text NOT NULL DEFAULT 'in_meeting',
  ADD COLUMN IF NOT EXISTS voting_opens_at timestamptz,
  ADD COLUMN IF NOT EXISTS voting_closes_at timestamptz;

CREATE TABLE public.motion_votes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  motion_id uuid NOT NULL REFERENCES public.motions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  vote public.vote_choice NOT NULL,
  voted_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (motion_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.motion_votes TO authenticated;
GRANT ALL ON public.motion_votes TO service_role;
ALTER TABLE public.motion_votes ENABLE ROW LEVEL SECURITY;
CREATE POLICY motion_votes_read ON public.motion_votes FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.motions mo JOIN public.meetings m ON m.id = mo.meeting_id
    WHERE mo.id = motion_votes.motion_id AND m.organization_id = public.current_org(auth.uid())
  ));
CREATE POLICY motion_votes_self_write ON public.motion_votes FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid() AND EXISTS (
    SELECT 1 FROM public.motions mo JOIN public.meetings m ON m.id = mo.meeting_id
    WHERE mo.id = motion_votes.motion_id AND m.organization_id = public.current_org(auth.uid())
  ));

-- ============ reassignment transaction helper ============
CREATE OR REPLACE FUNCTION public.reassign_position(
  _position_id uuid,
  _holder_name text,
  _forwarding_email text,
  _phone text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _org uuid;
  _new_id uuid;
BEGIN
  SELECT organization_id INTO _org FROM public.positions WHERE id = _position_id;
  IF _org IS NULL THEN RAISE EXCEPTION 'Position not found'; END IF;
  IF _org <> public.current_org(auth.uid()) OR NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  UPDATE public.position_holders
     SET term_end = now(), portal_status = 'revoked'
   WHERE position_id = _position_id AND term_end IS NULL;

  INSERT INTO public.position_holders
    (position_id, organization_id, holder_name, forwarding_email, phone,
     term_start, portal_status, assigned_via)
  VALUES (_position_id, _org, _holder_name, nullif(_forwarding_email,''), nullif(_phone,''),
     now(), 'invitation_pending', 'manual')
  RETURNING id INTO _new_id;

  RETURN _new_id;
END $$;
REVOKE EXECUTE ON FUNCTION public.reassign_position(uuid, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reassign_position(uuid, text, text, text) TO authenticated;