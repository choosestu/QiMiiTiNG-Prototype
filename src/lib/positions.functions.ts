import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const APP_URL = "https://qimiiting-prototype.up.railway.app";

// Sends an onboarding email to a position holder's forwarding email with
// instructions to access QiMiiTiNG and set up their account. Also ensures the
// email is on the allowlist so they can register. Admin (chair/secretary) only.
export const sendPositionInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { positionHolderId: string }) => data)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: me } = await supabase.from("users").select("organization_id").eq("id", userId).maybeSingle();
    const orgId = me?.organization_id;
    if (!orgId) throw new Error("No organization for user.");
    const { data: admin } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .in("role", ["chair", "secretary"])
      .limit(1)
      .maybeSingle();
    if (!admin) throw new Error("Only the Chair or Secretary can send invitations.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: holder } = await supabaseAdmin
      .from("position_holders")
      .select("id, holder_name, forwarding_email, organization_id, positions(title, default_app_role)")
      .eq("id", data.positionHolderId)
      .maybeSingle();
    const h = holder as unknown as {
      holder_name: string;
      forwarding_email: string | null;
      organization_id: string;
      positions: { title: string; default_app_role: string } | null;
    } | null;
    if (!h || h.organization_id !== orgId) throw new Error("Position holder not found.");
    const email = h.forwarding_email?.trim();
    if (!email) throw new Error("This officeholder has no forwarding email on file.");
    const positionTitle = h.positions?.title ?? "an executive position";
    const appRole = (h.positions?.default_app_role ?? "officer") as "chair" | "secretary" | "officer";

    const { data: org } = await supabaseAdmin.from("organizations").select("name").eq("id", orgId).maybeSingle();
    const orgName = org?.name ?? "your association";

    // Ensure the email can register.
    await supabaseAdmin.from("allowed_users").upsert(
      { email: email.toLowerCase(), organization_id: orgId, name: h.holder_name, role: appRole, tier: 2 },
      { onConflict: "email" },
    );

    const subject = `You've been added to QiMiiTiNG as ${positionTitle} (${orgName})`;
    const html = `
      <div style="font-family:system-ui,Arial,sans-serif;font-size:15px;color:#111;line-height:1.5">
        <p>Hello ${escapeHtml(h.holder_name)},</p>
        <p>You have been assigned the role of <strong>${escapeHtml(positionTitle)}</strong> for
        <strong>${escapeHtml(orgName)}</strong> in <strong>QiMiiTiNG</strong>, the association's governance tool.</p>
        <p><strong>To access QiMiiTiNG:</strong></p>
        <ol>
          <li>Go to <a href="${APP_URL}/auth">${APP_URL}/auth</a></li>
          <li>Choose <strong>Create account</strong> and register with this email address:
              <strong>${escapeHtml(email)}</strong></li>
          <li>Choose a password. Your email is verified automatically when the account is created —
              no separate confirmation step is needed.</li>
        </ol>
        <p>Once you sign in, you'll be connected to your position and can view meetings, motions and
        votes, action items, and the association chat.</p>
        <p style="color:#666;font-size:13px">If you did not expect this invitation, you can ignore this email.</p>
        <p style="color:#666;font-size:13px">— QiMiiTiNG, on behalf of ${escapeHtml(orgName)}</p>
      </div>`;

    const { sendGmail } = await import("./google.server");
    await sendGmail(orgId, { to: [email], subject, html });
    return { ok: true, sentTo: email };
  });

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// Self-serve invitation acceptance for the logged-in user. The signup trigger
// (link_position_holder_on_signup) only fires for brand-new registrations, so a
// user who is already registered and later linked to a seat (e.g. after a roster
// rebuild) can be left stuck at invitation_pending with no way to accept. This
// activates the caller's OWN pending seat(s): any current-term seat in their org
// that is either already linked to them or whose forwarding email matches theirs.
// Self-scoped, so it is safe to expose to any authenticated user.
export const acceptMyInvitation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: me } = await supabase
      .from("users")
      .select("email, organization_id")
      .eq("id", userId)
      .maybeSingle();
    if (!me?.organization_id || !me.email) return { activated: 0, titles: [] as string[] };
    const email = me.email.toLowerCase();

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows } = await supabaseAdmin
      .from("position_holders")
      .select("id, current_login_user_id, forwarding_email, positions(title)")
      .eq("organization_id", me.organization_id)
      .is("term_end", null)
      .eq("portal_status", "invitation_pending");
    const mine = ((rows ?? []) as any[]).filter(
      (r) =>
        r.current_login_user_id === userId ||
        (r.forwarding_email && String(r.forwarding_email).toLowerCase() === email),
    );
    if (mine.length === 0) return { activated: 0, titles: [] as string[] };

    const ids = mine.map((r) => r.id as string);
    const { error } = await supabaseAdmin
      .from("position_holders")
      .update({ current_login_user_id: userId, portal_status: "active" } as never)
      .in("id", ids);
    if (error) throw error;
    return {
      activated: ids.length,
      titles: mine.map((r) => (r.positions?.title as string) ?? "your position"),
    };
  });
