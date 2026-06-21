import { createServerFn } from "@tanstack/react-start";
import { getRequestHost, getRequestHeader } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const REDIRECT_PATH = "/api/public/google/callback";

function getOrigin(): string {
  const host = getRequestHost();
  const proto = getRequestHeader("x-forwarded-proto") ?? "https";
  return `${proto}://${host}`;
}

async function ensureAdmin(supabase: any, userId: string, orgId: string) {
  const { data } = await supabase.rpc("is_admin", { _user_id: userId });
  if (!data) throw new Error("Admin role required.");
  return orgId;
}

export const getGoogleStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase
      .from("users")
      .select("organization_id")
      .eq("id", userId)
      .maybeSingle();
    if (!profile?.organization_id) return { connected: false, email: null };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: org } = await supabaseAdmin
      .from("organizations")
      .select("google_oauth_tokens")
      .eq("id", profile.organization_id)
      .maybeSingle();
    const tok = org?.google_oauth_tokens as { access_token?: string; email?: string } | null;
    return { connected: Boolean(tok?.access_token), email: tok?.email ?? null };
  });

export const startGoogleConnect = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase
      .from("users")
      .select("organization_id")
      .eq("id", userId)
      .maybeSingle();
    if (!profile?.organization_id) throw new Error("No organization for user.");
    await ensureAdmin(supabase, userId, profile.organization_id);

    const { signState, buildAuthUrl } = await import("./google.server");
    const state = signState({
      orgId: profile.organization_id,
      userId,
      exp: Date.now() + 10 * 60 * 1000,
    });
    const redirectUri = `${getOrigin()}${REDIRECT_PATH}`;
    return { url: buildAuthUrl(redirectUri, state) };
  });

export const disconnectGoogle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase
      .from("users")
      .select("organization_id")
      .eq("id", userId)
      .maybeSingle();
    if (!profile?.organization_id) throw new Error("No organization for user.");
    await ensureAdmin(supabase, userId, profile.organization_id);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin
      .from("organizations")
      .update({ google_oauth_tokens: null })
      .eq("id", profile.organization_id);
    return { ok: true };
  });

// ---------- Meeting actions ----------

async function loadMeetingForAdmin(supabase: any, userId: string, meetingId: string) {
  const { data: profile } = await supabase
    .from("users")
    .select("organization_id")
    .eq("id", userId)
    .maybeSingle();
  if (!profile?.organization_id) throw new Error("No organization.");
  await ensureAdmin(supabase, userId, profile.organization_id);
  const { data: meeting, error } = await supabase
    .from("meetings")
    .select("*")
    .eq("id", meetingId)
    .eq("organization_id", profile.organization_id)
    .maybeSingle();
  if (error) throw error;
  if (!meeting) throw new Error("Meeting not found.");
  return { orgId: profile.organization_id as string, meeting };
}

async function generateAgendaText(args: {
  org: { name: string };
  meeting: { title: string; meeting_type: string; meeting_date: string };
  reports: { name: string; role: string; bank_balance: number | null; report_text: string }[];
  previousMotions: string[];
}): Promise<string> {
  const { openaiChat, AGENDA_SYSTEM_PROMPT } = await import("./openai.server");
  const userMessage = `Organization: ${args.org.name}
Meeting title: ${args.meeting.title}
Meeting type: ${args.meeting.meeting_type}
Meeting date: ${args.meeting.meeting_date.slice(0, 10)}

Officer reports submitted (use only these — do not invent items):
${args.reports.map((r) => `- ${r.name} (${r.role})${r.bank_balance != null ? ` [Balance: $${r.bank_balance}]` : ""}: ${r.report_text}`).join("\n") || "(none submitted)"}

Business arising from prior meetings:
${args.previousMotions.join("\n") || "(none)"}

Produce only the agenda body as plain text, using the required section headings on their own lines. Do not use markdown.`;
  return openaiChat({ system: AGENDA_SYSTEM_PROMPT, user: userMessage });
}

export const generateAgenda = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { meetingId: string }) => data)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { orgId, meeting } = await loadMeetingForAdmin(supabase, userId, data.meetingId);

    const [{ data: org }, { data: reportsRaw }] = await Promise.all([
      supabase.from("organizations").select("name").eq("id", orgId).maybeSingle(),
      supabase
        .from("officer_reports")
        .select("report_text, bank_balance, user_id")
        .eq("meeting_id", data.meetingId),
    ]);
    const userIds = (reportsRaw ?? []).map((r: any) => r.user_id);
    const { data: usersRows } = userIds.length
      ? await supabase.from("users").select("id, name").in("id", userIds)
      : { data: [] as { id: string; name: string }[] };
    const { data: rolesRows } = userIds.length
      ? await supabase.from("user_roles").select("user_id, role").in("user_id", userIds)
      : { data: [] as { user_id: string; role: string }[] };
    const reports = (reportsRaw ?? []).map((r: any) => ({
      name: usersRows?.find((u: any) => u.id === r.user_id)?.name ?? "Officer",
      role: rolesRows?.find((x: any) => x.user_id === r.user_id)?.role ?? "officer",
      bank_balance: r.bank_balance,
      report_text: r.report_text,
    }));

    const agendaBody = await generateAgendaText({
      org: { name: org?.name ?? "Organization" },
      meeting,
      reports,
      previousMotions: [],
    });

    const { renderDocumentPdf } = await import("./pdf.server");
    const { uploadPdfToMeeting } = await import("./google.server");
    const bytes = await renderDocumentPdf({
      title: `Agenda — ${meeting.title}`,
      subtitle: `${org?.name ?? ""} • ${meeting.meeting_date.slice(0, 10)} • ${meeting.meeting_type}`,
      sections: [{ heading: "Agenda", body: agendaBody }],
      footer: `Generated ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC`,
    });
    const { webViewLink } = await uploadPdfToMeeting(orgId, meeting, "Agenda.pdf", bytes);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin
      .from("meetings")
      .update({ agenda_url: webViewLink, status: "agenda_generated" })
      .eq("id", data.meetingId);
    return { agendaUrl: webViewLink };
  });

export const sendMeetingNotice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { meetingId: string }) => data)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { orgId, meeting } = await loadMeetingForAdmin(supabase, userId, data.meetingId);
    const { data: org } = await supabase.from("organizations").select("name").eq("id", orgId).maybeSingle();
    const { data: usersRows } = await supabase
      .from("users")
      .select("id, email, name")
      .eq("organization_id", orgId);
    const recipients = (usersRows ?? []).filter((u: any) => u.email);
    if (recipients.length === 0) throw new Error("No recipients with email addresses.");

    const subject = `[${org?.name ?? "Meeting"}] ${meeting.title} — ${meeting.meeting_date.slice(0, 10)}`;
    const html = `
      <p>You are invited to the upcoming ${meeting.meeting_type} meeting.</p>
      <p><strong>${meeting.title}</strong><br/>
      Date: ${meeting.meeting_date.slice(0, 10)}<br/>
      Type: ${meeting.meeting_type}</p>
      ${meeting.agenda_url ? `<p>Agenda: <a href="${meeting.agenda_url}">${meeting.agenda_url}</a></p>` : ""}
      <p>Please submit any officer reports in QiMiiTiNG before the meeting.</p>
    `;

    const { sendGmail } = await import("./google.server");
    const { messageId } = await sendGmail(orgId, {
      to: recipients.map((u: any) => u.email),
      subject,
      html,
    });

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("email_log").insert(
      recipients.map((u: any) => ({
        meeting_id: data.meetingId,
        organization_id: orgId,
        recipient_user_id: u.id,
        email_type: "meeting_notice",
        gmail_message_id: messageId,
      })),
    );
    return { sent: recipients.length };
  });

export const uploadApprovedMinutes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { meetingId: string }) => data)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { orgId, meeting } = await loadMeetingForAdmin(supabase, userId, data.meetingId);
    const { data: org } = await supabase.from("organizations").select("name").eq("id", orgId).maybeSingle();
    const { data: minutes } = await supabase
      .from("minutes")
      .select("approved_text, approved_at")
      .eq("meeting_id", data.meetingId)
      .maybeSingle();
    if (!minutes?.approved_text) throw new Error("No approved minutes to upload.");

    const { renderDocumentPdf } = await import("./pdf.server");
    const { uploadPdfToMeeting } = await import("./google.server");
    const bytes = await renderDocumentPdf({
      title: `Minutes — ${meeting.title}`,
      subtitle: `${org?.name ?? ""} • ${meeting.meeting_date.slice(0, 10)} • ${meeting.meeting_type}`,
      sections: [{ heading: "Approved Minutes", body: minutes.approved_text }],
      footer: `Approved ${(minutes.approved_at ?? new Date().toISOString()).slice(0, 16).replace("T", " ")} UTC`,
    });
    const { webViewLink } = await uploadPdfToMeeting(orgId, meeting, "Minutes-Approved.pdf", bytes);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin
      .from("meetings")
      .update({ minutes_approved_url: webViewLink, status: "minutes_approved" })
      .eq("id", data.meetingId);
    await supabaseAdmin.from("minutes").update({ drive_url: webViewLink }).eq("meeting_id", data.meetingId);
    return { minutesUrl: webViewLink };
  });
