CREATE POLICY organization_secrets_no_client_access
ON public.organization_secrets
FOR ALL
TO authenticated
USING (false)
WITH CHECK (false);