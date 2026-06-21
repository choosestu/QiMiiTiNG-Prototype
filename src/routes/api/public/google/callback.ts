import { createFileRoute, redirect } from "@tanstack/react-router";
import { getRequestHost, getRequestHeader } from "@tanstack/react-start/server";

export const Route = createFileRoute("/api/public/google/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        const error = url.searchParams.get("error");
        if (error) throw redirect({ to: "/settings", search: { google: `error:${error}` } as never });
        if (!code || !state) return new Response("Missing code or state", { status: 400 });

        const { verifyState, exchangeCode } = await import("@/lib/google.server");
        const parsed = verifyState<{ orgId: string; userId: string }>(state);
        if (!parsed) return new Response("Invalid or expired state", { status: 400 });

        const host = getRequestHost();
        const proto = getRequestHeader("x-forwarded-proto") ?? "https";
        const redirectUri = `${proto}://${host}/api/public/google/callback`;

        const tokens = await exchangeCode(code, redirectUri);
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // Preserve existing refresh_token if Google omits it (already granted previously).
        const { data: existing } = await supabaseAdmin
          .from("organization_secrets")
          .select("google_oauth_tokens")
          .eq("organization_id", parsed.orgId)
          .maybeSingle();
        const prev = (existing?.google_oauth_tokens ?? {}) as { refresh_token?: string };
        const merged = { ...tokens, refresh_token: tokens.refresh_token ?? prev.refresh_token };

        await supabaseAdmin
          .from("organization_secrets")
          .upsert({ organization_id: parsed.orgId, google_oauth_tokens: merged as never }, { onConflict: "organization_id" });

        return new Response(null, {
          status: 302,
          headers: { Location: "/settings?google=connected" },
        });
      },
    },
  },
});
