import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { ArrowLeft, CheckCircle2, Circle, ExternalLink, FileText, Mail, Plus, Upload } from "lucide-react";
import { toast } from "sonner";
import { generateAgenda, sendMeetingNotice, uploadApprovedMinutes, importFieldyTranscript, draftMinutes, approveMinutes } from "@/lib/google.functions";

import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { RouteErrorComponent, RouteNotFoundComponent } from "@/components/route-boundaries";

export const Route = createFileRoute("/_authenticated/meetings/$meetingId")({
  head: () => ({
    meta: [{ title: "Meeting — QiMiiTiNG" }],
  }),
  component: MeetingPage,
  errorComponent: RouteErrorComponent,
  notFoundComponent: RouteNotFoundComponent,
});


type Meeting = {
  id: string;
  organization_id: string;
  title: string;
  meeting_date: string;
  meeting_type: string;
  status: string;
  quorum_required: number;
  quorum_met: boolean | null;
  fieldy_enabled: boolean;
  agenda_url: string | null;
  agenda_text: string | null;
  minutes_approved_url: string | null;
  drive_folder_id: string | null;
  conversation_start_time: string | null;
  conversation_end_time: string | null;
};

type OrgUser = { id: string; name: string; email: string };
type AttendanceStatus = "present" | "late" | "regrets" | "absent";
type Attendee = {
  id: string;
  user_id: string;
  present: boolean;
  attendance_status: AttendanceStatus;
  arrived_at: string | null;
};
type Motion = {
  id: string;
  motion_text: string;
  moved_by: string | null;
  seconded_by: string | null;
  result: string | null;
  vote_for: number;
  vote_against: number;
  vote_abstain: number;
};
type Report = {
  id: string;
  user_id: string;
  report_text: string;
  bank_balance: number | null;
  submitted_at: string;
};


const STATUS_LABEL: Record<string, string> = {
  scheduled: "Scheduled",
  reports_open: "Reports open",
  agenda_generated: "Agenda ready",
  in_progress: "In progress",
  adjourned: "Adjourned",
  minutes_draft: "Minutes draft",
  minutes_approved: "Minutes approved",
  cancelled: "Cancelled",
};

function MeetingPage() {
  const { meetingId } = Route.useParams();
  const { profile, isAdmin, loading } = useAuth();
  const router = useRouter();

  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [users, setUsers] = useState<OrgUser[]>([]);
  const [attendees, setAttendees] = useState<Attendee[]>([]);
  const [holders, setHolders] = useState<{ user_id: string; category: string; submits_report: boolean }[]>([]);
  const [motions, setMotions] = useState<Motion[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [busy, setBusy] = useState(false);
  const [membershipQuorumConfirmed, setMembershipQuorumConfirmed] = useState(false);

  const refresh = useCallback(async () => {
    const [m, a, mo, rp] = await Promise.all([
      supabase.from("meetings").select("*").eq("id", meetingId).maybeSingle(),
      supabase.from("attendees").select("id, user_id, present, attendance_status, arrived_at").eq("meeting_id", meetingId),
      supabase
        .from("motions")
        .select("*")
        .eq("meeting_id", meetingId)
        .order("created_at", { ascending: true }),
      supabase
        .from("officer_reports")
        .select("id, user_id, report_text, bank_balance, submitted_at")
        .eq("meeting_id", meetingId),
    ]);
    if (m.error) toast.error(m.error.message);
    if (m.data) setMeeting(m.data as Meeting);
    if (a.data) setAttendees(a.data as Attendee[]);
    if (mo.data) setMotions(mo.data as Motion[]);
    if (rp.data) setReports(rp.data as Report[]);
  }, [meetingId]);

  useEffect(() => {
    if (!profile) return;
    refresh();
    supabase
      .from("users")
      .select("id, name, email")
      .order("name")
      .then(({ data }) => setUsers((data ?? []) as OrgUser[]));
    // Current position holders, classified for By-law 2 Section 8.5 quorum.
    supabase
      .from("position_holders")
      .select("current_login_user_id, positions(category, submits_report)")
      .is("term_end", null)
      .then(({ data }) => {
        const rows = (data ?? []) as unknown as {
          current_login_user_id: string | null;
          positions: { category: string; submits_report: boolean } | null;
        }[];
        setHolders(
          rows
            .filter((r) => r.current_login_user_id && r.positions)
            .map((r) => ({
              user_id: r.current_login_user_id as string,
              category: r.positions!.category,
              submits_report: r.positions!.submits_report,
            })),
        );
      });
  }, [profile, refresh]);

  // Ensure an attendee row per org user once meeting + users loaded (admin only, before adjournment).
  useEffect(() => {
    if (!isAdmin || !meeting || users.length === 0) return;
    if (meeting.status === "adjourned" || meeting.status === "minutes_approved") return;
    const missing = users.filter((u) => !attendees.some((a) => a.user_id === u.id));
    if (missing.length === 0) return;
    supabase
      .from("attendees")
      .insert(missing.map((u) => ({ meeting_id: meetingId, user_id: u.id, present: false })))
      .then(({ error }) => {
        if (error) return;
        refresh();
      });
  }, [isAdmin, meeting, users, attendees, meetingId, refresh]);

  const presentCount = useMemo(() => attendees.filter((a) => a.present).length, [attendees]);

  // Quorum per LPC By-law 2. Executive/special meetings use Section 8.5 (20% of
  // voting Directors and Officers AND 50% of the elected officers, excluding
  // vacancies). AGM/membership meetings use Section 10.7, which depends on riding
  // membership the app can't count, so the Chair confirms it manually.
  const quorum = useMemo(() => {
    const presentIds = new Set(attendees.filter((a) => a.present).map((a) => a.user_id));
    const votingBoard = new Set(
      holders
        .filter((h) => h.category === "elected_officer" || h.category === "director_at_large")
        .map((h) => h.user_id),
    );
    const officers = new Set(holders.filter((h) => h.category === "elected_officer").map((h) => h.user_id));
    const presentVoting = [...votingBoard].filter((id) => presentIds.has(id)).length;
    const presentOfficers = [...officers].filter((id) => presentIds.has(id)).length;
    const reqVoting = Math.ceil(0.2 * votingBoard.size);
    const reqOfficers = Math.ceil(0.5 * officers.size);
    const isMembership = meeting?.meeting_type === "agm";
    const execMet = votingBoard.size > 0 && presentVoting >= reqVoting && presentOfficers >= reqOfficers;
    return {
      isMembership,
      votingBoardTotal: votingBoard.size,
      officersTotal: officers.size,
      presentVoting,
      presentOfficers,
      reqVoting,
      reqOfficers,
      met: isMembership ? membershipQuorumConfirmed : execMet,
    };
  }, [attendees, holders, meeting, membershipQuorumConfirmed]);
  const quorumMet = quorum.met;

  // Only these positions submit formal officer reports (per org configuration);
  // everyone else contributes agenda items instead.
  const reportingUserIds = useMemo(
    () => new Set(holders.filter((h) => h.submits_report).map((h) => h.user_id)),
    [holders],
  );

  if (loading || !profile) {
    return <p className="p-8 text-sm text-muted-foreground">Loading…</p>;
  }
  if (!meeting) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <h2 className="font-serif text-xl">Meeting not found.</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          It may have been deleted or you don't have access.
        </p>
        <div className="mt-4">
          <Button size="sm" variant="outline" asChild>
            <Link to="/dashboard">Back to dashboard</Link>
          </Button>
        </div>
      </div>
    );
  }


  const editable = isAdmin && meeting.status !== "adjourned" && meeting.status !== "minutes_approved";

  const setAttendance = async (userId: string, status: AttendanceStatus) => {
    setBusy(true);
    const existing = attendees.find((a) => a.user_id === userId);
    if (existing) {
      // Present and Late both count as "in the room" for quorum; keep the present
      // flag in sync so quorum and other consumers keep working unchanged.
      const present = status === "present" || status === "late";
      const arrived_at = status === "late" ? existing.arrived_at ?? new Date().toISOString() : null;
      const { error } = await supabase
        .from("attendees")
        .update({ attendance_status: status, present, arrived_at })
        .eq("id", existing.id);
      if (error) toast.error(error.message);
      setAttendees((prev) =>
        prev.map((a) => (a.id === existing.id ? { ...a, attendance_status: status, present, arrived_at } : a)),
      );
    }
    setBusy(false);
  };

  const transition = async (
    next: "scheduled" | "reports_open" | "agenda_generated" | "in_progress" | "adjourned" | "minutes_draft" | "minutes_approved" | "cancelled",
  ) => {
    setBusy(true);
    const patch: Record<string, unknown> = { status: next, quorum_met: quorumMet };
    if (next === "in_progress" && !meeting.conversation_start_time) {
      patch.conversation_start_time = new Date().toISOString();
    }
    if (next === "adjourned" && !meeting.conversation_end_time) {
      patch.conversation_end_time = new Date().toISOString();
    }
    const { error } = await supabase.from("meetings").update(patch as never).eq("id", meetingId);
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`Meeting marked ${STATUS_LABEL[next]}`);
    refresh();
  };

  const canCallToOrder = meeting.status === "scheduled" || meeting.status === "agenda_generated" || meeting.status === "reports_open";
  const canAdjourn = meeting.status === "in_progress";
  const validations: { label: string; ok: boolean }[] = [
    {
      label: quorum.isMembership
        ? "Quorum confirmed by Chair (By-law 2 Section 10.7)"
        : `Quorum met — ${quorum.presentOfficers}/${quorum.officersTotal} officers (need ${quorum.reqOfficers}), ${quorum.presentVoting}/${quorum.votingBoardTotal} voting board (need ${quorum.reqVoting})`,
      ok: quorumMet,
    },
    { label: "At least one motion recorded", ok: motions.length > 0 },
    {
      label: "All motions have mover, seconder, and a result",
      ok:
        motions.length === 0 ||
        motions.every((m) => m.moved_by && m.seconded_by && m.result),
    },
  ];
  const allValid = validations.every((v) => v.ok);
  const canCancel =
    isAdmin &&
    !["adjourned", "minutes_draft", "minutes_approved", "cancelled"].includes(meeting.status);

  const onCancelMeeting = () => {
    if (confirm(`Cancel "${meeting.title}"? This marks the meeting cancelled — it is not deleted, and the record is kept.`)) {
      transition("cancelled");
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-6 sm:py-8">
      <Button variant="ghost" size="sm" asChild>
        <Link to="/dashboard">
          <ArrowLeft className="mr-1 h-4 w-4" />
          All meetings
        </Link>
      </Button>

      <header className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 sm:flex sm:flex-wrap sm:justify-between">
        <div className="min-w-0">
          <h1 className="truncate font-serif text-2xl sm:text-3xl">{meeting.title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {format(new Date(meeting.meeting_date + "T00:00:00"), "PPPP")} ·{" "}
            {meeting.meeting_type.replace("_", " ")}
            {meeting.fieldy_enabled && " · Fieldy enabled"}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {canCancel && (
            <Button variant="outline" size="sm" disabled={busy} onClick={onCancelMeeting}>
              Cancel meeting
            </Button>
          )}
          <Badge
            variant={meeting.status === "cancelled" ? "destructive" : "secondary"}
            className="text-sm"
          >
            {STATUS_LABEL[meeting.status]}
          </Badge>
        </div>
      </header>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Agenda</CardTitle>
          <CardDescription>
            {meeting.agenda_text || meeting.agenda_url
              ? "Prepared and circulated ahead of the meeting."
              : "The agenda has not been prepared yet. It should be generated and sent before the meeting."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {meeting.agenda_text ? (
            <div className="whitespace-pre-wrap rounded-md border border-border bg-muted/20 p-3 text-sm">
              {meeting.agenda_text}
            </div>
          ) : meeting.agenda_url ? (
            <a
              href={meeting.agenda_url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
            >
              <ExternalLink className="size-3" /> Open the agenda (PDF)
            </a>
          ) : (
            <p className="text-sm text-muted-foreground">No agenda yet.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Attendance</CardTitle>
          <CardDescription>
            {quorum.isMembership ? (
              <>
                Membership / electoral meeting — quorum is the lesser of 10 Registered Liberals in the
                riding or 20% of them (By-law 2 Section 10.7). QiMiiTiNG can't count riding membership,
                so the Chair confirms quorum below.
              </>
            ) : (
              <>
                Executive quorum (By-law 2 Section 8.5): at least 50% of elected officers{" "}
                <span className={quorum.presentOfficers >= quorum.reqOfficers ? "font-medium text-primary" : "font-medium"}>
                  ({quorum.presentOfficers}/{quorum.officersTotal}, need {quorum.reqOfficers})
                </span>{" "}
                and at least 20% of the voting board{" "}
                <span className={quorum.presentVoting >= quorum.reqVoting ? "font-medium text-primary" : "font-medium"}>
                  ({quorum.presentVoting}/{quorum.votingBoardTotal}, need {quorum.reqVoting})
                </span>
                . {quorumMet ? "Quorum met." : "Quorum not yet met."}
              </>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {quorum.isMembership && editable && (
            <label className="flex items-center gap-2 rounded-md border border-border bg-muted/30 px-3 py-2 text-sm">
              <Checkbox
                checked={membershipQuorumConfirmed}
                onCheckedChange={(v) => setMembershipQuorumConfirmed(!!v)}
              />
              Chair confirms quorum is present (By-law 2 Section 10.7)
            </label>
          )}
          {users.length === 0 ? (
            <p className="rounded-md border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
              No officers found in this organization yet.
            </p>
          ) : (
            users.map((u) => {
              const a = attendees.find((x) => x.user_id === u.id);
              const status = a?.attendance_status ?? "absent";
              return (
                <div
                  key={u.id}
                  className="flex items-center justify-between gap-3 rounded-md border border-border bg-card px-3 py-2"
                >
                  <span className="min-w-0 flex-1 text-sm">
                    <span className="block truncate">{u.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {u.email}
                      {status === "late" && a?.arrived_at
                        ? ` · arrived ${format(new Date(a.arrived_at), "h:mm a")}`
                        : ""}
                    </span>
                  </span>
                  <div className="flex shrink-0 flex-wrap gap-1">
                    {(["present", "late", "regrets", "absent"] as AttendanceStatus[]).map((s) => (
                      <Button
                        key={s}
                        type="button"
                        size="sm"
                        variant={status === s ? "default" : "outline"}
                        disabled={!editable || busy}
                        className="h-7 px-2 text-xs capitalize"
                        onClick={() => setAttendance(u.id, s)}
                      >
                        {s}
                      </Button>
                    ))}
                  </div>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>


      <ReportsCard
        meeting={meeting}
        users={users}
        reports={reports}
        reportingUserIds={reportingUserIds}
        currentUserId={profile.id}
        isAdmin={isAdmin}
        onUpdate={refresh}
      />

      <Card>
        <CardHeader className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 space-y-0">
          <div className="min-w-0">
            <CardTitle className="text-base">Motions</CardTitle>
            <CardDescription>Recorded verbatim as moved.</CardDescription>
          </div>
          {editable && meeting.status === "in_progress" && (
            <AddMotionDialog users={users} meetingId={meetingId} onAdded={refresh} />
          )}
        </CardHeader>
        <CardContent className="space-y-3">
          {motions.length === 0 ? (
            <p className="rounded-md border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
              No motions yet.
              {meeting.status !== "in_progress" && " Motions can be recorded once the meeting is called to order."}
            </p>
          ) : (
            motions.map((m) => (
              <MotionRow
                key={m.id}
                motion={m}
                users={users}
                editable={editable}
                onUpdate={refresh}
              />
            ))
          )}
        </CardContent>
      </Card>


      {isAdmin && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Lifecycle</CardTitle>
            <CardDescription>Advance the meeting through its stages.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {meeting.status === "scheduled" && (
              <div className="flex items-center justify-between gap-3 rounded-md border border-border p-3">
                <div className="text-sm">
                  <p className="font-medium">Open reports</p>
                  <p className="text-muted-foreground">
                    Allow officers to submit their reports for this meeting.
                  </p>
                </div>
                <Button variant="secondary" onClick={() => transition("reports_open")} disabled={busy}>
                  Open reports
                </Button>
              </div>
            )}
            {canCallToOrder && (
              <div className="flex items-center justify-between gap-3 rounded-md border border-border p-3">
                <div className="text-sm">
                  <p className="font-medium">Call to order</p>
                  <p className="text-muted-foreground">
                    {quorumMet
                      ? "Quorum is met. You can call the meeting to order."
                      : quorum.isMembership
                        ? "Confirm quorum above to call the meeting to order."
                        : "Quorum not yet met (By-law 2 Section 8.5)."}
                  </p>
                </div>
                <Button onClick={() => transition("in_progress")} disabled={!quorumMet || busy}>
                  Call to order
                </Button>
              </div>
            )}

            {canAdjourn && (
              <div className="space-y-3 rounded-md border border-border p-3">
                <div>
                  <p className="text-sm font-medium">Pre-adjournment checklist</p>
                  <ul className="mt-2 space-y-1 text-sm">
                    {validations.map((v) => (
                      <li key={v.label} className="flex items-center gap-2">
                        {v.ok ? (
                          <CheckCircle2 className="h-4 w-4 text-primary" />
                        ) : (
                          <Circle className="h-4 w-4 text-muted-foreground" />
                        )}
                        <span className={v.ok ? "" : "text-muted-foreground"}>{v.label}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <Button
                  variant={allValid ? "default" : "secondary"}
                  onClick={() => transition("adjourned")}
                  disabled={!allValid || busy}
                >
                  Adjourn meeting
                </Button>
              </div>
            )}

            {meeting.status === "adjourned" && (
              <p className="text-sm text-muted-foreground">
                Meeting adjourned. Import the transcript (if recorded) and draft minutes below.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {isAdmin && (meeting.status === "adjourned" || meeting.status === "minutes_draft" || meeting.status === "minutes_approved") && (
        <MinutesCard meeting={meeting} onUpdate={refresh} />
      )}

      {isAdmin && <WorkspaceCard meeting={meeting} onUpdate={refresh} />}
    </div>
  );
}

function MinutesCard({ meeting, onUpdate }: { meeting: Meeting; onUpdate: () => void }) {
  const importTranscript = useServerFn(importFieldyTranscript);
  const draft = useServerFn(draftMinutes);
  const approve = useServerFn(approveMinutes);
  const [busy, setBusy] = useState<string | null>(null);
  const [draftText, setDraftText] = useState("");
  const [approvedText, setApprovedText] = useState("");
  const [segmentCount, setSegmentCount] = useState<number | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      const [{ data: m }, { count }] = await Promise.all([
        supabase
          .from("minutes")
          .select("ai_draft_text, approved_text")
          .eq("meeting_id", meeting.id)
          .maybeSingle(),
        supabase
          .from("transcript_segments")
          .select("id", { count: "exact", head: true })
          .eq("meeting_id", meeting.id),
      ]);
      if (!active) return;
      setDraftText((m?.ai_draft_text as string) ?? "");
      setApprovedText((m?.approved_text as string) ?? (m?.ai_draft_text as string) ?? "");
      setSegmentCount(count ?? 0);
    })();
    return () => {
      active = false;
    };
  }, [meeting.id]);

  const handleImport = async () => {
    setBusy("import");
    try {
      const r = await importTranscript({ data: { meetingId: meeting.id } });
      toast.success(`Imported ${r.imported} transcript segment(s) from Fieldy`);
      setSegmentCount(r.imported);
    } catch (e: any) {
      toast.error(String(e?.message ?? e));
    } finally {
      setBusy(null);
    }
  };

  const handleDraft = async () => {
    setBusy("draft");
    try {
      const r = await draft({ data: { meetingId: meeting.id } });
      setDraftText(r.draft);
      setApprovedText((prev) => prev || r.draft);
      toast.success("Minutes draft generated");
      onUpdate();
    } catch (e: any) {
      toast.error(String(e?.message ?? e));
    } finally {
      setBusy(null);
    }
  };

  const handleApprove = async () => {
    if (!approvedText.trim()) {
      toast.error("Approved minutes text is required.");
      return;
    }
    setBusy("approve");
    try {
      await approve({ data: { meetingId: meeting.id, approvedText } });
      toast.success("Minutes approved. You can now upload them to Drive below.");
      onUpdate();
    } catch (e: any) {
      toast.error(String(e?.message ?? e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Minutes</CardTitle>
        <CardDescription>
          Import the Fieldy transcript (if enabled), generate an AI draft using GPT-4o, then review and approve. Motions are reproduced verbatim.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          {meeting.fieldy_enabled && (
            <Button variant="secondary" disabled={busy !== null} onClick={handleImport}>
              {busy === "import" ? "Importing…" : `Import Fieldy transcript${segmentCount != null ? ` (${segmentCount})` : ""}`}
            </Button>
          )}
          <Button disabled={busy !== null} onClick={handleDraft}>
            {busy === "draft" ? "Drafting…" : draftText ? "Re-draft minutes (AI)" : "Draft minutes (AI)"}
          </Button>
        </div>

        <p className="rounded-md border border-dashed border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          AI drafts are a starting point only. The secretary must review every line for accuracy before approval. Motion text is reproduced verbatim and must not be edited.
        </p>

        {!draftText && segmentCount === 0 && meeting.fieldy_enabled && (
          <p className="rounded-md border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
            No transcript imported yet. Import from Fieldy to include discussion summaries.
          </p>
        )}

        {draftText && (
          <div className="space-y-2">
            <Label className="text-xs uppercase text-muted-foreground">AI draft (read-only)</Label>
            <Textarea readOnly rows={8} value={draftText} className="font-mono text-xs" />
          </div>
        )}

        <div className="space-y-2">
          <Label className="text-xs uppercase text-muted-foreground">Approved minutes (editable)</Label>
          <Textarea
            rows={12}
            value={approvedText}
            onChange={(e) => setApprovedText(e.target.value)}
            placeholder="Edit the AI draft above, then approve. Edits are audit-logged."
            className="font-mono text-xs"
          />
          <div className="flex justify-end">
            <Button variant="default" disabled={busy !== null || !approvedText.trim()} onClick={handleApprove}>
              {busy === "approve" ? "Approving…" : meeting.status === "minutes_approved" ? "Save edits (audit logged)" : "Approve minutes"}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}




function WorkspaceCard({ meeting, onUpdate }: { meeting: Meeting; onUpdate: () => void }) {
  const genAgenda = useServerFn(generateAgenda);
  const sendNotice = useServerFn(sendMeetingNotice);
  const uploadMins = useServerFn(uploadApprovedMinutes);
  const [busy, setBusy] = useState<string | null>(null);

  const run = async (key: string, fn: () => Promise<{ agendaUrl?: string; sent?: number; minutesUrl?: string }>, ok: (r: any) => string) => {
    setBusy(key);
    try {
      const r = await fn();
      toast.success(ok(r));
      onUpdate();
    } catch (e: any) {
      const msg = String(e?.message ?? e);
      if (msg.includes("not connected")) toast.error("Connect your Google account in Settings first.");
      else toast.error(msg);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Google Workspace</CardTitle>
        <CardDescription>
          Generate the agenda with AI, email the meeting notice, and archive approved minutes to Drive.{" "}
          <Link to="/settings" className="underline">Manage connection</Link>
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            disabled={busy !== null}
            onClick={() => run("agenda", () => genAgenda({ data: { meetingId: meeting.id } }), (r) => `Agenda generated and saved to Drive`)}
          >
            <FileText className="mr-1 size-4" />
            {busy === "agenda" ? "Generating…" : "Generate agenda (AI)"}
          </Button>
          <Button
            variant="secondary"
            disabled={busy !== null || !meeting.agenda_url}
            onClick={() => run("notice", () => sendNotice({ data: { meetingId: meeting.id } }), (r) => `Meeting notice sent to ${r.sent} recipient(s)`)}
            title={meeting.agenda_url ? undefined : "Generate the agenda first"}
          >
            <Mail className="mr-1 size-4" />
            {busy === "notice" ? "Sending…" : "Send meeting notice"}
          </Button>
          <Button
            variant="secondary"
            disabled={busy !== null || meeting.status !== "minutes_draft"}
            onClick={() => run("minutes", () => uploadMins({ data: { meetingId: meeting.id } }), () => "Approved minutes uploaded to Drive")}
            title={meeting.status === "minutes_draft" ? undefined : "Approve minutes first (Milestone 5)"}
          >
            <Upload className="mr-1 size-4" />
            {busy === "minutes" ? "Uploading…" : "Upload approved minutes"}
          </Button>
        </div>
        <p className="rounded-md border border-dashed border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          AI-generated agendas follow Robert's Rules and LPC By-law 2 conventions. Always review before distribution — the chair is responsible for the final content.
        </p>

        <div className="space-y-1 text-sm">
          {meeting.agenda_url && (
            <a href={meeting.agenda_url} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-primary hover:underline">
              <ExternalLink className="size-3" /> Agenda.pdf
            </a>
          )}
          {meeting.minutes_approved_url && (
            <a href={meeting.minutes_approved_url} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-primary hover:underline">
              <ExternalLink className="size-3" /> Minutes-Approved.pdf
            </a>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function MotionRow({
  motion,
  users,
  editable,
  onUpdate,
}: {
  motion: Motion;
  users: OrgUser[];
  editable: boolean;
  onUpdate: () => void;
}) {
  const [moved, setMoved] = useState(motion.moved_by ?? "");
  const [seconded, setSeconded] = useState(motion.seconded_by ?? "");
  const [voteFor, setVoteFor] = useState(motion.vote_for);
  const [voteAgainst, setVoteAgainst] = useState(motion.vote_against);
  const [voteAbstain, setVoteAbstain] = useState(motion.vote_abstain);
  const [result, setResult] = useState<string>(motion.result ?? "");
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    const { error } = await supabase
      .from("motions")
      .update({
        moved_by: moved || null,
        seconded_by: seconded || null,
        vote_for: voteFor,
        vote_against: voteAgainst,
        vote_abstain: voteAbstain,
        result: (result || null) as "carried" | "defeated" | "tabled" | "withdrawn" | null,
      })
      .eq("id", motion.id);
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Motion updated");
    onUpdate();
  };

  return (
    <div className="space-y-3 rounded-md border border-border bg-card p-3">
      <p className="text-sm font-medium">{motion.motion_text}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label className="text-xs">Moved by</Label>
          <Select value={moved} onValueChange={setMoved} disabled={!editable}>
            <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
            <SelectContent>
              {users.map((u) => (
                <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Seconded by</Label>
          <Select value={seconded} onValueChange={setSeconded} disabled={!editable}>
            <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
            <SelectContent>
              {users.map((u) => (
                <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div className="space-y-1">
          <Label className="text-xs">For</Label>
          <Input
            type="number"
            min={0}
            value={voteFor}
            onChange={(e) => setVoteFor(Number(e.target.value))}
            disabled={!editable}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Against</Label>
          <Input
            type="number"
            min={0}
            value={voteAgainst}
            onChange={(e) => setVoteAgainst(Number(e.target.value))}
            disabled={!editable}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Abstain</Label>
          <Input
            type="number"
            min={0}
            value={voteAbstain}
            onChange={(e) => setVoteAbstain(Number(e.target.value))}
            disabled={!editable}
          />
        </div>
      </div>
      <div className="flex items-end gap-2">
        <div className="flex-1 space-y-1">
          <Label className="text-xs">Result</Label>
          <Select value={result} onValueChange={setResult} disabled={!editable}>
            <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="carried">Carried</SelectItem>
              <SelectItem value="defeated">Defeated</SelectItem>
              <SelectItem value="tabled">Tabled</SelectItem>
              <SelectItem value="withdrawn">Withdrawn</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {editable && (
          <Button size="sm" onClick={save} disabled={busy}>
            Save
          </Button>
        )}
      </div>
    </div>
  );
}

function AddMotionDialog({
  users,
  meetingId,
  onAdded,
}: {
  users: OrgUser[];
  meetingId: string;
  onAdded: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [moved, setMoved] = useState("");
  const [seconded, setSeconded] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!text.trim()) {
      toast.error("Enter the motion text verbatim.");
      return;
    }
    setBusy(true);
    const { error } = await supabase.from("motions").insert({
      meeting_id: meetingId,
      motion_text: text.trim(),
      moved_by: moved || null,
      seconded_by: seconded || null,
    });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setText("");
    setMoved("");
    setSeconded("");
    setOpen(false);
    toast.success("Motion recorded");
    onAdded();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="secondary">
          <Plus className="mr-1 h-4 w-4" />
          Add motion
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Record motion</DialogTitle>
          <DialogDescription>
            Enter the motion text exactly as moved. Votes and result can be added once recorded.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Motion text (verbatim)</Label>
            <Textarea rows={4} value={text} onChange={(e) => setText(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Moved by</Label>
              <Select value={moved} onValueChange={setMoved}>
                <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>
                  {users.map((u) => (
                    <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Seconded by</Label>
              <Select value={seconded} onValueChange={setSeconded}>
                <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>
                  {users.map((u) => (
                    <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={submit} disabled={busy}>
            {busy ? "Saving…" : "Record motion"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReportsCard({
  meeting,
  users,
  reports,
  reportingUserIds,
  currentUserId,
  isAdmin,
  onUpdate,
}: {
  meeting: Meeting;
  users: OrgUser[];
  reports: Report[];
  reportingUserIds: Set<string>;
  currentUserId: string;
  isAdmin: boolean;
  onUpdate: () => void;
}) {
  const reportsOpen =
    meeting.status === "reports_open" ||
    meeting.status === "agenda_generated" ||
    meeting.status === "in_progress";

  const myReport = reports.find((r) => r.user_id === currentUserId);
  const reporters = users.filter((u) => reportingUserIds.has(u.id));
  const isReporter = reportingUserIds.has(currentUserId);
  const visibleUsers = isAdmin ? reporters : reporters.filter((u) => u.id === currentUserId);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Officer reports</CardTitle>
        <CardDescription>
          {meeting.status === "scheduled"
            ? "Reports submission opens once the chair opens reports."
            : reportsOpen
              ? "The reporting officers submit a written report for this meeting."
              : "Report submission is closed for this meeting."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {!isAdmin && reportsOpen && isReporter && (
          <div className="mb-2">
            <ReportDialog
              meetingId={meeting.id}
              organizationId={meeting.organization_id}
              userId={currentUserId}
              existing={myReport}
              onSaved={onUpdate}
              triggerLabel={myReport ? "Edit my report" : "Submit my report"}
            />
          </div>
        )}
        {!isAdmin && !isReporter && (
          <p className="mb-2 text-sm text-muted-foreground">
            Formal reports are submitted by the reporting officers. You can raise items during New
            Business at the meeting.
          </p>
        )}
        {visibleUsers.map((u) => {
          const r = reports.find((x) => x.user_id === u.id);
          const isSelf = u.id === currentUserId;
          return (
            <div
              key={u.id}
              className="flex items-start justify-between gap-3 rounded-md border border-border bg-card px-3 py-2"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">{u.name}</span>
                  {r ? (
                    <Badge variant="secondary" className="text-xs">Submitted</Badge>
                  ) : (
                    <Badge variant="outline" className="text-xs">Pending</Badge>
                  )}
                </div>
                {r && (
                  <p className="mt-1 whitespace-pre-wrap text-xs text-muted-foreground">
                    {r.report_text}
                    {r.bank_balance != null && (
                      <span className="ml-2 font-medium text-foreground">
                        · Bank balance ${Number(r.bank_balance).toFixed(2)}
                      </span>
                    )}
                  </p>
                )}
              </div>
              {isSelf && reportsOpen && isAdmin && (
                <ReportDialog
                  meetingId={meeting.id}
                  organizationId={meeting.organization_id}
                  userId={currentUserId}
                  existing={r}
                  onSaved={onUpdate}
                  triggerLabel={r ? "Edit" : "Submit"}
                />
              )}
            </div>
          );
        })}
        {isAdmin && reportsOpen && reports.length > 0 && (
          <div className="pt-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={async () => {
                const { error } = await supabase.from("motions").insert({
                  organization_id: meeting.organization_id,
                  meeting_id: meeting.id,
                  motion_text: "That the officer reports be accepted as presented.",
                  moved_by: currentUserId,
                });
                if (error) {
                  toast.error(error.message);
                  return;
                }
                toast.success("Motion added. Record the seconder and the vote in the Motions section.");
                onUpdate();
              }}
            >
              Move to accept the reports
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ReportDialog({
  meetingId,
  organizationId,
  userId,
  existing,
  onSaved,
  triggerLabel,
}: {
  meetingId: string;
  organizationId: string;
  userId: string;
  existing?: Report;
  onSaved: () => void;
  triggerLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(existing?.report_text ?? "");
  const [bank, setBank] = useState<string>(
    existing?.bank_balance != null ? String(existing.bank_balance) : "",
  );
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!text.trim()) {
      toast.error("Enter your report text.");
      return;
    }
    setBusy(true);
    const payload = {
      meeting_id: meetingId,
      user_id: userId,
      organization_id: organizationId,
      report_text: text.trim(),
      bank_balance: bank.trim() === "" ? null : Number(bank),
    };
    const { error } = existing
      ? await supabase.from("officer_reports").update(payload).eq("id", existing.id)
      : await supabase.from("officer_reports").insert(payload);
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(existing ? "Report updated" : "Report submitted");
    setOpen(false);
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant={existing ? "outline" : "default"}>
          {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{existing ? "Edit report" : "Submit report"}</DialogTitle>
          <DialogDescription>
            Your written report for this meeting. Bank balance is optional (treasurer use).
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Report text</Label>
            <Textarea rows={8} value={text} onChange={(e) => setText(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Bank balance (optional)</Label>
            <Input
              type="number"
              step="0.01"
              min={0}
              placeholder="e.g. 1234.56"
              value={bank}
              onChange={(e) => setBank(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={submit} disabled={busy}>
            {busy ? "Saving…" : existing ? "Save changes" : "Submit report"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
