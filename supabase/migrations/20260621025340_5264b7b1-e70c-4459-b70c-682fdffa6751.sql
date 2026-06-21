DROP POLICY IF EXISTS users_self_update ON public.users;
CREATE POLICY users_self_update ON public.users
  FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (
    id = auth.uid()
    AND tier = (SELECT tier FROM public.users WHERE id = auth.uid())
    AND organization_id = (SELECT organization_id FROM public.users WHERE id = auth.uid())
    AND email = (SELECT email FROM public.users WHERE id = auth.uid())
  );