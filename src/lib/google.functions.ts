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
  const { data } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .in("role", ["chair", "secretary"])
    .limit(1)
    .maybeSingle();
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
    const { data: secret } = await supabaseAdmin
      .from("organization_secrets")
      .select("google_oauth_tokens")
      .eq("organization_id", profile.organization_id)
      .maybeSingle();
    const tok = secret?.google_oauth_tokens as { access_token?: string; email?: string } | null;
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
      .from("organization_secrets")
      .update({ google_oauth_tokens: null })
      .eq("organization_id", profile.organization_id);
    return { ok: true };
  });

// ---------- Organization agenda settings ----------

export const getOrgAgendaSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase
      .from("users")
      .select("organization_id")
      .eq("id", userId)
      .maybeSingle();
    if (!profile?.organization_id) return { agendaLeadDays: 5 };
    const { data: org } = await supabase
      .from("organizations")
      .select("agenda_lead_days")
      .eq("id", profile.organization_id)
      .maybeSingle();
    return { agendaLeadDays: (org?.agenda_lead_days as number | null) ?? 5 };
  });

export const setOrgAgendaLeadDays = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { days: number }) => data)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase
      .from("users")
      .select("organization_id")
      .eq("id", userId)
      .maybeSingle();
    if (!profile?.organization_id) throw new Error("No organization.");
    await ensureAdmin(supabase, userId, profile.organization_id);
    const days = Math.max(0, Math.min(60, Math.round(Number(data.days) || 0)));
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("organizations")
      .update({ agenda_lead_days: days })
      .eq("id", profile.organization_id);
    if (error) throw error;
    return { agendaLeadDays: days };
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
  previousMinutes: { title: string; date: string; approved: boolean } | null;
  emailReports: { from: string; subject: string; body: string }[];
  correspondence: { from: string; subject: string; snippet: string }[];
  calendarEvents: { summary: string; start: string; location: string }[];
  scanNote: string | null;
}): Promise<string> {
  const { openaiChat, AGENDA_SYSTEM_PROMPT } = await import("./openai.server");
  const adoptionRequired = !!args.previousMinutes && !args.previousMinutes.approved;
  const prevMinutesLine = args.previousMinutes
    ? `${args.previousMinutes.title} (${args.previousMinutes.date.slice(0, 10)}) — ${
        args.previousMinutes.approved
          ? "minutes APPROVED (use 'Approval of the Previous Minutes')"
          : "minutes NOT yet approved (you MUST add 'Adoption of the Previous Minutes')"
      }`
    : "(no prior meeting on record)";
  const trim = (s: string, n: number) => (s.length > n ? s.slice(0, n) + "…" : s);
  const userMessage = `Organization: ${args.org.name}
Meeting title: ${args.meeting.title}
Meeting type: ${args.meeting.meeting_type}
Meeting date: ${args.meeting.meeting_date.slice(0, 10)}

Previous minutes status:
${prevMinutesLine}
${adoptionRequired ? "REMINDER: previous minutes are unapproved — include 'Adoption of the Previous Minutes'." : ""}

Officer reports submitted in-app:
${args.reports.map((r) => `- ${r.name} (${r.role})${r.bank_balance != null ? ` [Balance: $${r.bank_balance}]` : ""}: ${r.report_text}`).join("\n") || "(none submitted in-app)"}

Officer reports received by email (treat as report content):
${args.emailReports.map((e) => `- From ${e.from} — ${e.subject}: ${trim(e.body, 800)}`).join("\n") || "(none found by email)"}

Other correspondence in the scan window (decide what is agenda-worthy vs noise):
${args.correspondence.map((c) => `- From ${c.from} — ${c.subject}: ${trim(c.snippet, 200)}`).join("\n") || "(none found)"}

Upcoming calendar dates to consider flagging to the board:
${args.calendarEvents.map((e) => `- ${e.start.slice(0, 16).replace("T", " ")} — ${e.summary}${e.location ? ` @ ${e.location}` : ""}`).join("\n") || "(none)"}

Business arising from prior meetings (tabled or unresolved motions — reproduce verbatim):
${args.previousMotions.join("\n") || "(none)"}
${args.scanNote ? `\nNote: ${args.scanNote}` : ""}

Produce only the agenda body as plain text, using the required section headings on their own lines. Do not use markdown.`;
  return openaiChat({ system: AGENDA_SYSTEM_PROMPT, user: userMessage });
}

export const generateAgenda = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { meetingId: string }) => data)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { orgId, meeting } = await loadMeetingForAdmin(supabase, userId, data.meetingId);

    const [{ data: org }, { data: reportsRaw }, { data: priorMeeting }] = await Promise.all([
      supabase.from("organizations").select("name, agenda_lead_days").eq("id", orgId).maybeSingle(),
      supabase
        .from("officer_reports")
        .select("report_text, bank_balance, user_id")
        .eq("meeting_id", data.meetingId),
      supabase
        .from("meetings")
        .select("id, title, meeting_date")
        .eq("organization_id", orgId)
        .lt("meeting_date", meeting.meeting_date)
        .order("meeting_date", { ascending: false })
        .limit(1)
        .maybeSingle(),
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

    let previousMinutes: { title: string; date: string; approved: boolean } | null = null;
    let previousMotions: string[] = [];
    if (priorMeeting) {
      const [{ data: prevMin }, { data: prevMotions }] = await Promise.all([
        supabase
          .from("minutes")
          .select("approved_text")
          .eq("meeting_id", priorMeeting.id)
          .maybeSingle(),
        supabase
          .from("motions")
          .select("motion_text, result")
          .eq("meeting_id", priorMeeting.id)
          .in("result", ["tabled"]),
      ]);
      previousMinutes = {
        title: priorMeeting.title,
        date: priorMeeting.meeting_date,
        approved: !!prevMin?.approved_text,
      };
      previousMotions = (prevMotions ?? []).map((m: any) => `- [${m.result}] ${m.motion_text}`);
    }

    // Scan the connected Workspace account within the configured lead window for
    // officer reports submitted by email and other correspondence, and reference
    // the calendar for upcoming dates. Read scopes may be absent until the org
    // reconnects Google with the wider permissions; degrade gracefully if so.
    const leadDays = (org?.agenda_lead_days as number | null) ?? 5;
    const meetingDay = meeting.meeting_date.slice(0, 10);
    const winStart = new Date(`${meetingDay}T00:00:00Z`);
    winStart.setUTCDate(winStart.getUTCDate() - leadDays);
    const dayAfter = new Date(`${meetingDay}T00:00:00Z`);
    dayAfter.setUTCDate(dayAfter.getUTCDate() + 1);
    const calMax = new Date(`${meetingDay}T00:00:00Z`);
    calMax.setUTCDate(calMax.getUTCDate() + 45);
    const gDate = (d: Date) =>
      `${d.getUTCFullYear()}/${d.getUTCMonth() + 1}/${d.getUTCDate()}`;

    let emailReports: { from: string; subject: string; body: string }[] = [];
    let correspondence: { from: string; subject: string; snippet: string }[] = [];
    let calendarEvents: { summary: string; start: string; location: string }[] = [];
    let scanNote: string | null = null;
    try {
      const { gmailSearch, calendarListEvents } = await import("./google.server");
      const [reportMsgs, corrMsgs, events] = await Promise.all([
        gmailSearch(orgId, `after:${gDate(winStart)} before:${gDate(dayAfter)} subject:report`, 15),
        gmailSearch(orgId, `after:${gDate(winStart)} before:${gDate(dayAfter)}`, 20),
        calendarListEvents(
          orgId,
          new Date(`${meetingDay}T00:00:00Z`).toISOString(),
          calMax.toISOString(),
          25,
        ),
      ]);
      const reportIds = new Set(reportMsgs.map((m) => m.id));
      emailReports = reportMsgs.map((m) => ({ from: m.from, subject: m.subject, body: m.body }));
      correspondence = corrMsgs
        .filter((m) => !reportIds.has(m.id))
        .map((m) => ({ from: m.from, subject: m.subject, snippet: m.snippet }));
      calendarEvents = events.map((e) => ({
        summary: e.summary,
        start: e.start,
        location: e.location,
      }));
    } catch (e: any) {
      scanNote =
        "Gmail/Calendar scan was skipped (Google read access not yet granted). Reconnect Google in Settings to include emailed reports, correspondence, and calendar dates.";
    }

    const agendaBody = await generateAgendaText({
      org: { name: org?.name ?? "Organization" },
      meeting,
      reports,
      previousMotions,
      previousMinutes,
      emailReports,
      correspondence,
      calendarEvents,
      scanNote,
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
      .update({ agenda_url: webViewLink, agenda_text: agendaBody, status: "agenda_generated" })
      .eq("id", data.meetingId);
    return { agendaUrl: webViewLink };
  });

type EmailRecipient = { id: string | null; name: string; email: string };

async function resolveMeetingNoticeRecipients(
  supabase: any,
  orgId: string,
): Promise<EmailRecipient[]> {
  const { data: usersRows } = await supabase
    .from("users")
    .select("id, email, name")
    .eq("organization_id", orgId);
  return (usersRows ?? [])
    .filter((u: any) => u.email)
    .map((u: any) => ({
      id: (u.id as string) ?? null,
      name: ((u.name as string) || (u.email as string)) as string,
      email: u.email as string,
    }));
}

type ReportKind = "officer" | "financial";

async function resolveReportRecipients(
  supabase: any,
  orgId: string,
  kind: ReportKind,
): Promise<EmailRecipient[]> {
  // Route report requests by role: report_kind 'officer' -> Chair, Vice-Chair,
  // Organization Chair, Policy Chair; 'financial' -> Treasurer. The Secretary
  // (report_kind null) is never a requestee. Demo seats are excluded.
  const { data: holderRows } = await supabase
    .from("position_holders")
    .select("current_login_user_id, forwarding_email, holder_name, positions!inner(report_kind)")
    .eq("organization_id", orgId)
    .is("term_end", null)
    .eq("is_demo", false)
    .eq("positions.report_kind", kind);

  const recipients: EmailRecipient[] = [];
  const seenEmails = new Set<string>();

  const addRecipient = (email: string | null | undefined, uid: string | null, name: string) => {
    const e = (email ?? "").trim().toLowerCase();
    if (!e || seenEmails.has(e)) return;
    seenEmails.add(e);
    recipients.push({ email: e, id: uid, name: name || e });
  };

  const loginUserIds = (holderRows ?? [])
    .map((h: any) => h.current_login_user_id as string | null)
    .filter((id: string | null): id is string => !!id);
  type LoginUser = { id: string; email: string | null; name: string | null };
  const { data: loginUsers } = loginUserIds.length
    ? await supabase.from("users").select("id, email, name").in("id", loginUserIds)
    : { data: [] as LoginUser[] };
  const userById = new Map<string, LoginUser>(
    ((loginUsers ?? []) as LoginUser[]).map((u) => [u.id, u]),
  );

  for (const h of holderRows ?? []) {
    const uid = (h as any).current_login_user_id as string | null;
    const user = uid ? userById.get(uid) : null;
    const userEmail = (user?.email as string | null | undefined) ?? null;
    const fwd = (h as any).forwarding_email as string | null;
    const name = ((user?.name as string | null | undefined) ||
      ((h as any).holder_name as string) ||
      "") as string;
    addRecipient(userEmail || fwd, uid, name);
  }

  return recipients;
}

export const listMeetingNoticeRecipients = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { meetingId: string }) => data)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { orgId } = await loadMeetingForAdmin(supabase, userId, data.meetingId);
    const recipients = await resolveMeetingNoticeRecipients(supabase, orgId);
    return { recipients };
  });

export const listOfficerReportRequestRecipients = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { meetingId: string }) => data)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { orgId } = await loadMeetingForAdmin(supabase, userId, data.meetingId);
    const recipients = await resolveReportRecipients(supabase, orgId, "officer");
    return { recipients };
  });

export const listFinancialReportRequestRecipients = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { meetingId: string }) => data)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { orgId } = await loadMeetingForAdmin(supabase, userId, data.meetingId);
    const recipients = await resolveReportRecipients(supabase, orgId, "financial");
    return { recipients };
  });

export const sendMeetingNotice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { meetingId: string }) => data)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { orgId, meeting } = await loadMeetingForAdmin(supabase, userId, data.meetingId);
    const { data: org } = await supabase
      .from("organizations")
      .select("name")
      .eq("id", orgId)
      .maybeSingle();
    const recipients = await resolveMeetingNoticeRecipients(supabase, orgId);
    if (recipients.length === 0) throw new Error("No recipients with email addresses.");

    const esc = (s: string) =>
      String(s ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
    const safeAgendaUrl =
      typeof meeting.agenda_url === "string" && /^https:\/\//i.test(meeting.agenda_url)
        ? meeting.agenda_url
        : null;
    const subject = safeAgendaUrl
      ? `[${org?.name ?? "Meeting"}] ${meeting.title} — ${meeting.meeting_date.slice(0, 10)} (Agenda attached)`
      : `[${org?.name ?? "Meeting"}] Preliminary notice — ${meeting.title} — ${meeting.meeting_date.slice(0, 10)}`;
    const html = safeAgendaUrl
      ? `
      <p>You are invited to the upcoming ${esc(meeting.meeting_type)} meeting.</p>
      <p><strong>${esc(meeting.title)}</strong><br/>
      Date: ${esc(meeting.meeting_date.slice(0, 10))}<br/>
      Type: ${esc(meeting.meeting_type)}</p>
      <p>Agenda: <a href="${esc(safeAgendaUrl)}">${esc(safeAgendaUrl)}</a></p>
      <p>Please submit officer reports in QiMiiTiNG when reports are open, or when you receive a separate report request.</p>
    `
      : `
      <p>This is a <strong>preliminary notice</strong> for the upcoming ${esc(meeting.meeting_type)} meeting.</p>
      <p><strong>${esc(meeting.title)}</strong><br/>
      Date: ${esc(meeting.meeting_date.slice(0, 10))}<br/>
      Type: ${esc(meeting.meeting_type)}</p>
      <p>The agenda will follow once it is ready. You may receive an updated notice with an agenda link later.</p>
      <p>Please submit officer reports in QiMiiTiNG when reports are open, or when you receive a separate report request.</p>
    `;

    const { sendGmail } = await import("./google.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let sent = 0;
    for (const u of recipients) {
      try {
        const { messageId } = await sendGmail(orgId, {
          to: [u.email],
          subject,
          html,
        });
        await supabaseAdmin.from("email_log").insert({
          meeting_id: data.meetingId,
          organization_id: orgId,
          recipient_user_id: u.id,
          email_type: "meeting_notice",
          gmail_message_id: messageId,
        });
        sent++;
      } catch (e: any) {
        const msg = String(e?.message ?? e);
        throw new Error(
          `Meeting notice failed after ${sent} successful send(s) of ${recipients.length} (attempted ${sent + 1}): ${msg}`,
        );
      }
    }
    return { sent };
  });

async function runReportRequest(
  supabase: any,
  userId: string,
  meetingId: string,
  kind: ReportKind,
): Promise<{ sent: number }> {
  const { orgId, meeting } = await loadMeetingForAdmin(supabase, userId, meetingId);
  const { data: org } = await supabase
    .from("organizations")
    .select("name")
    .eq("id", orgId)
    .maybeSingle();

  const recipients = await resolveReportRecipients(supabase, orgId, kind);
  if (recipients.length === 0) {
    throw new Error(
      kind === "financial"
        ? "No Treasurer with an email address on file. Assign the Treasurer seat or add a forwarding email."
        : "No reporting officers with email addresses. Assign officer report positions or add emails.",
    );
  }

  const esc = (s: string) =>
    String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  const appUrl = getOrigin();
  const reportLabel = kind === "financial" ? "financial report" : "officer report";
  const subject = `[${org?.name ?? "Meeting"}] ${
    kind === "financial" ? "Financial report" : "Officer reports"
  } requested — ${meeting.title} — ${meeting.meeting_date.slice(0, 10)}`;
  const html = `
      <p>The ${esc(reportLabel)} is requested for the upcoming meeting.</p>
      <p><strong>${esc(meeting.title)}</strong><br/>
      Date: ${esc(meeting.meeting_date.slice(0, 10))}<br/>
      Type: ${esc(meeting.meeting_type)}</p>
      <p>Please submit your ${esc(reportLabel)} in QiMiiTiNG at
        <a href="${esc(appUrl)}">${esc(appUrl)}</a>.</p>
    `;

  const emailType = kind === "financial" ? "financial_report_request" : "officer_report_request";
  const { sendGmail } = await import("./google.server");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  let sent = 0;
  for (const r of recipients) {
    try {
      const { messageId } = await sendGmail(orgId, { to: [r.email], subject, html });
      await supabaseAdmin.from("email_log").insert({
        meeting_id: meetingId,
        organization_id: orgId,
        recipient_user_id: r.id,
        email_type: emailType,
        gmail_message_id: messageId,
      });
      sent++;
    } catch (e: any) {
      const msg = String(e?.message ?? e);
      throw new Error(
        `${
          kind === "financial" ? "Financial report request" : "Officer report request"
        } failed after ${sent} successful send(s) of ${recipients.length} (attempted ${sent + 1}): ${msg}`,
      );
    }
  }

  const userIds = recipients.map((r) => r.id).filter((id): id is string => !!id);
  if (userIds.length > 0) {
    await supabaseAdmin
      .from("officer_reports")
      .update({ reminder_sent_at: new Date().toISOString() })
      .eq("meeting_id", meetingId)
      .in("user_id", userIds);
  }

  return { sent };
}

export const sendOfficerReportRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { meetingId: string }) => data)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    return runReportRequest(supabase, userId, data.meetingId, "officer");
  });

export const sendFinancialReportRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { meetingId: string }) => data)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    return runReportRequest(supabase, userId, data.meetingId, "financial");
  });

export const uploadApprovedMinutes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { meetingId: string }) => data)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { orgId, meeting } = await loadMeetingForAdmin(supabase, userId, data.meetingId);
    const { data: org } = await supabase
      .from("organizations")
      .select("name")
      .eq("id", orgId)
      .maybeSingle();
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
    await supabaseAdmin
      .from("minutes")
      .update({ drive_url: webViewLink })
      .eq("meeting_id", data.meetingId);
    return { minutesUrl: webViewLink };
  });

// ---------- Fieldy transcript import ----------

export const importFieldyTranscript = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { meetingId: string }) => data)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { orgId, meeting } = await loadMeetingForAdmin(supabase, userId, data.meetingId);
    if (!meeting.fieldy_enabled)
      throw new Error("Fieldy recording is not enabled for this meeting.");

    // Determine time window. Prefer recorded conversation times; fall back to meeting_date.
    const start = meeting.conversation_start_time
      ? new Date(meeting.conversation_start_time)
      : new Date(`${meeting.meeting_date.slice(0, 10)}T00:00:00Z`);
    const end = meeting.conversation_end_time
      ? new Date(meeting.conversation_end_time)
      : new Date(`${meeting.meeting_date.slice(0, 10)}T23:59:59Z`);

    const { fetchFieldyTranscriptions } = await import("./fieldy.server");
    const segments = await fetchFieldyTranscriptions({
      startTime: start.toISOString(),
      endTime: end.toISOString(),
      pageSize: 500,
    });

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Replace existing transcript for this meeting.
    await supabaseAdmin.from("transcript_segments").delete().eq("meeting_id", data.meetingId);
    if (segments.length > 0) {
      const rows = segments.map((s, i) => ({
        meeting_id: data.meetingId,
        segment_index: i,
        fieldy_segment_id: s.id ?? null,
        speaker: s.speaker ?? null,
        speaker_profile_id: s.speaker_profile_id ?? null,
        text: s.text,
        start_offset: s.start ?? null,
        end_offset: s.end ?? null,
        segment_timestamp: s.timestamp ?? null,
      }));
      void orgId;
      const { error } = await supabaseAdmin.from("transcript_segments").insert(rows as never);
      if (error) throw error;
    }
    return { imported: segments.length };
  });

// ---------- Minutes draft + approval ----------

export const draftMinutes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { meetingId: string }) => data)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { orgId, meeting } = await loadMeetingForAdmin(supabase, userId, data.meetingId);
    if (meeting.status !== "adjourned" && meeting.status !== "minutes_draft") {
      throw new Error("Minutes can only be drafted after the meeting is adjourned.");
    }

    const [
      { data: org },
      { data: attendeesRaw },
      { data: motions },
      { data: reportsRaw },
      { data: segments },
    ] = await Promise.all([
      supabase.from("organizations").select("name").eq("id", orgId).maybeSingle(),
      supabase
        .from("attendees")
        .select("user_id, present, attendance_status, position_holder_id")
        .eq("meeting_id", data.meetingId),
      supabase
        .from("motions")
        .select("motion_text, moved_by, seconded_by, result, vote_for, vote_against, vote_abstain")
        .eq("meeting_id", data.meetingId)
        .order("created_at", { ascending: true }),
      supabase
        .from("officer_reports")
        .select("report_text, bank_balance, user_id")
        .eq("meeting_id", data.meetingId),
      supabase
        .from("transcript_segments")
        .select("speaker, text, segment_index")
        .eq("meeting_id", data.meetingId)
        .order("segment_index", { ascending: true }),
    ]);

    const userIds = new Set<string>();
    (attendeesRaw ?? []).forEach((a: any) => a.user_id && userIds.add(a.user_id));
    (motions ?? []).forEach((m: any) => {
      if (m.moved_by) userIds.add(m.moved_by);
      if (m.seconded_by) userIds.add(m.seconded_by);
    });
    (reportsRaw ?? []).forEach((r: any) => r.user_id && userIds.add(r.user_id));

    const { data: usersRows } = userIds.size
      ? await supabase.from("users").select("id, name").in("id", Array.from(userIds))
      : { data: [] as { id: string; name: string }[] };
    const nameOf = (id: string | null | undefined) =>
      (id && usersRows?.find((u: any) => u.id === id)?.name) || "Unknown";

    // Resolve seat-holder names for attendance rows that have no linked login.
    const holderIds = Array.from(
      new Set(
        (attendeesRaw ?? [])
          .map((a: any) => a.position_holder_id as string | null)
          .filter((id: string | null): id is string => !!id),
      ),
    );
    const { data: holderRows } = holderIds.length
      ? await supabase
          .from("position_holders")
          .select("id, holder_name, positions(title)")
          .in("id", holderIds)
      : { data: [] as any[] };
    const seatName = (a: any): string => {
      if (a.user_id) return nameOf(a.user_id);
      const h = holderRows?.find((x: any) => x.id === a.position_holder_id);
      if (h) return `${h.holder_name ?? "Vacant"}${h.positions?.title ? ` (${h.positions.title})` : ""}`;
      return "Unknown";
    };
    const labelFor = (a: any): string => {
      const st = (a.attendance_status as string) ?? (a.present ? "present" : "absent");
      if (st === "present") return "Present";
      if (st === "late") return "Late";
      if (st === "regrets") return "Regrets";
      return "Absent";
    };

    const attendanceLines = (attendeesRaw ?? []).map(
      (a: any) => `- ${seatName(a)}: ${labelFor(a)}`,
    );
    const reportLines = (reportsRaw ?? []).map(
      (r: any) =>
        `- ${nameOf(r.user_id)}${r.bank_balance != null ? ` [Bank balance: $${r.bank_balance}]` : ""}: ${r.report_text}`,
    );
    const motionBlocks = (motions ?? []).map((m: any, i: number) => {
      return `Motion ${i + 1} (VERBATIM — do not alter):
"${m.motion_text}"
Moved by: ${nameOf(m.moved_by)}
Seconded by: ${nameOf(m.seconded_by)}
Vote: ${m.vote_for ?? 0} for, ${m.vote_against ?? 0} against, ${m.vote_abstain ?? 0} abstain
Result: ${m.result ?? "(not recorded)"}`;
    });
    const transcriptText = (segments ?? [])
      .map((s: any) => `${s.speaker ?? "Unknown"}: ${s.text}`)
      .join("\n");

    const userMessage = `Organization: ${org?.name ?? "Organization"}
Meeting: ${meeting.title}
Date: ${meeting.meeting_date.slice(0, 10)}
Type: ${meeting.meeting_type}
Quorum required: ${meeting.quorum_required}
Quorum met: ${meeting.quorum_met ? "Yes" : "No"}

Attendance:
${attendanceLines.join("\n") || "(none recorded)"}

Officer reports:
${reportLines.join("\n") || "(none submitted)"}

Motions (reproduce each motion text VERBATIM in the minutes):
${motionBlocks.join("\n\n") || "(no motions recorded)"}

Transcript (use only for brief, factual discussion summaries):
${transcriptText || "(no transcript available)"}

Produce the formal meeting minutes as plain text. Include sections: Call to Order, Attendance & Quorum, Approval of Previous Minutes, Officer Reports, Business / Motions (with each motion verbatim, mover, seconder, vote, result), Discussion (brief), Adjournment.`;

    const { openaiChat, MINUTES_SYSTEM_PROMPT } = await import("./openai.server");
    const draft = await openaiChat({ system: MINUTES_SYSTEM_PROMPT, user: userMessage });

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("minutes").upsert(
      {
        meeting_id: data.meetingId,
        ai_draft_text: draft,
        ai_draft_created_at: new Date().toISOString(),
      } as never,
      { onConflict: "meeting_id" },
    );
    await supabaseAdmin
      .from("meetings")
      .update({ status: "minutes_draft" })
      .eq("id", data.meetingId);
    return { draft };
  });

export const approveMinutes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { meetingId: string; approvedText: string }) => data)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await loadMeetingForAdmin(supabase, userId, data.meetingId);
    if (!data.approvedText.trim()) throw new Error("Approved minutes text is required.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Audit-log diff vs the prior approved text (if any).
    const { data: prior } = await supabaseAdmin
      .from("minutes")
      .select("id, approved_text, ai_draft_text")
      .eq("meeting_id", data.meetingId)
      .maybeSingle();
    const original = (prior?.approved_text ?? prior?.ai_draft_text ?? "") as string;

    const { data: upserted, error: upErr } = await supabaseAdmin
      .from("minutes")
      .upsert(
        {
          meeting_id: data.meetingId,
          approved_text: data.approvedText,
          approved_by: userId,
          approved_at: new Date().toISOString(),
        } as never,
        { onConflict: "meeting_id" },
      )
      .select("id")
      .single();
    if (upErr) throw upErr;

    if (original && original !== data.approvedText && upserted?.id) {
      await supabaseAdmin.from("minutes_edits").insert({
        minutes_id: upserted.id,
        edited_by: userId,
        original_text: original,
        corrected_text: data.approvedText,
      } as never);
    }
    return { ok: true };
  });

// ---------- Workspace search (Drive + Gmail) ----------

export const searchWorkspace = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { query: string }) => data)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase
      .from("users")
      .select("organization_id")
      .eq("id", userId)
      .maybeSingle();
    if (!profile?.organization_id) throw new Error("No organization.");
    await ensureAdmin(supabase, userId, profile.organization_id);
    const orgId = profile.organization_id as string;

    const q = data.query.trim();
    if (!q) return { drive: [], gmail: [] };

    const { driveSearchAll, gmailSearch } = await import("./google.server");
    const [drive, gmail] = await Promise.all([
      driveSearchAll(orgId, q, 25),
      gmailSearch(orgId, q, 12),
    ]);
    return {
      drive: drive.map((f) => ({
        id: f.id,
        name: f.name,
        link: f.webViewLink,
        mimeType: f.mimeType,
        modifiedTime: f.modifiedTime,
      })),
      gmail: gmail.map((m) => ({
        id: m.id,
        subject: m.subject,
        from: m.from,
        date: m.date,
        snippet: m.snippet,
        link: m.webLink,
      })),
    };
  });
