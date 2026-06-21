DROP POLICY IF EXISTS users_read_org ON public.users;

CREATE POLICY users_read_org ON public.users
FOR SELECT
TO authenticated
USING (
  id = auth.uid()
  OR organization_id = public.current_org(auth.uid())
);