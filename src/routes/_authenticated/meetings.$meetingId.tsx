import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import {
  ArrowLeft,
  CheckCircle2,
  Circle,
  ExternalLink,
  FileText,
  Mail,
  Plus,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import {
  generateAgenda,
  sendMeetingNotice,
  sendOfficerReportRequest,
  sendFinancialReportRequest,
  listMeetingNoticeRecipients,
  listOfficerReportRequestRecipients,
  listFinancialReportRequestRecipients,
  uploadApprovedMinutes,
  importFieldyTranscript,
  checkMotionsAgainstTranscript,
  draftMinutes,
  approveMinutes,
} from "@/lib/google.functions";

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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
  user_id: string | null;
  position_holder_id: string | null;
  present: boolean;
  attendance_status: AttendanceStatus;
  arrived_at: string | null;
  regrets_reason: string | null;
};
type ReportKind = "officer" | "financial" | null;
// A filled position seat on the real roster (demo seats excluded). Attendance and
// quorum are computed per seat, not per app account.
type Seat = {
  holderId: string;
  positionId: string;
  title: string;
  category: string;
  reportKind: ReportKind;
  holderName: string;
  loginUserId: string | null;
  loginEmail: string | null;
  displayOrder: number;
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
  const [seats, setSeats] = useState<Seat[]>([]);
  const [motions, setMotions] = useState<Motion[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [busy, setBusy] = useState(false);
  const [membershipQuorumConfirmed, setMembershipQuorumConfirmed] = useState(false);

  // Self-service Regrets: a member sending their own regrets, with an optional reason.
  const [regretsSeat, setRegretsSeat] = useState<Seat | null>(null);
  const [regretsReason, setRegretsReason] = useState("");

  // Transcript-aware pre-adjournment motion cross-check (additive; read-only).
  const runMotionCheck = useServerFn(checkMotionsAgainstTranscript);
  const importFieldy = useServerFn(importFieldyTranscript);
  const [motionCheck, setMotionCheck] = useState<{
    transcript: boolean;
    matched: number;
    unrecorded: string[];
    unspoken: string[];
    recordedCount: number;
  } | null>(null);
  const [motionCheckBusy, setMotionCheckBusy] = useState<"import" | "check" | null>(null);

  const doMotionCheck = async () => {
    setMotionCheckBusy("check");
    try {
      setMotionCheck(await runMotionCheck({ data: { meetingId } }));
    } catch (e: any) {
      toast.error(String(e?.message ?? e));
    } finally {
      setMotionCheckBusy(null);
    }
  };

  const doImportThenCheck = async () => {
    setMotionCheckBusy("import");
    try {
      const r = await importFieldy({ data: { meetingId } });
      toast.success(`Imported ${r.imported} transcript segment(s) from Fieldy`);
      setMotionCheckBusy("check");
      setMotionCheck(await runMotionCheck({ data: { meetingId } }));
    } catch (e: any) {
      const msg = String(e?.message ?? e);
      toast.error(
        msg.includes("FIELDY_API_KEY")
          ? "Fieldy is not configured (FIELDY_API_KEY missing in the environment)."
          : msg,
      );
    } finally {
      setMotionCheckBusy(null);
    }
  };

  const refresh = useCallback(async () => {
    const [m, a, mo, rp] = await Promise.all([
      supabase.from("meetings").select("*").eq("id", meetingId).maybeSingle(),
      supabase
        .from("attendees")
        .select("id, user_id, position_holder_id, present, attendance_status, arrived_at, regrets_reason")
        .eq("meeting_id", meetingId),
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
    // The real roster: filled seats, demo seats excluded. Attendance and By-law 2
    // Section 8.5 quorum are computed from these seats, not from app accounts.
    void loadSeats();
  }, [profile, refresh]);

  const loadSeats = async () => {
    const { data } = await supabase
      .from("position_holders")
      .select(
        "id, holder_name, current_login_user_id, position_id, positions!inner(title, category, report_kind, display_order)",
      )
      .is("term_end", null)
      .eq("is_demo", false);
    const rows = (data ?? []) as unknown as {
      id: string;
      holder_name: string | null;
      current_login_user_id: string | null;
      position_id: string;
      positions: {
        title: string;
        category: string;
        report_kind: ReportKind;
        display_order: number;
      } | null;
    }[];
    const loginIds = rows
      .map((r) => r.current_login_user_id)
      .filter((id): id is string => !!id);
    const { data: loginUsers } = loginIds.length
      ? await supabase.from("users").select("id, name, email").in("id", loginIds)
      : { data: [] as OrgUser[] };
    const byId = new Map((loginUsers ?? []).map((u) => [u.id, u as OrgUser]));
    const built: Seat[] = rows
      .filter((r) => r.positions)
      .map((r) => {
        const u = r.current_login_user_id ? byId.get(r.current_login_user_id) : undefined;
        return {
          holderId: r.id,
          positionId: r.position_id,
          title: r.positions!.title,
          category: r.positions!.category,
          reportKind: r.positions!.report_kind,
          holderName: r.holder_name || u?.name || "Vacant",
          loginUserId: r.current_login_user_id,
          loginEmail: u?.email ?? null,
          displayOrder: r.positions!.display_order,
        };
      })
      .sort((a, b) => a.displayOrder - b.displayOrder);
    setSeats(built);
  };

  // Attendance status for a seat: prefer a row keyed to the seat; fall back to the
  // seat's linked login (so legacy/demo attendee rows still render).
  const statusForSeat = useCallback(
    (seat: Seat): AttendanceStatus => {
      const byHolder = attendees.find((a) => a.position_holder_id === seat.holderId);
      if (byHolder) return byHolder.attendance_status;
      if (seat.loginUserId) {
        const byUser = attendees.find((a) => a.user_id === seat.loginUserId);
        if (byUser) return byUser.attendance_status;
      }
      return "absent";
    },
    [attendees],
  );

  // Quorum per LPC By-law 2. Executive/special meetings use Section 8.5 (20% of
  // voting Directors and Officers AND 50% of the elected officers, excluding
  // vacancies). Totals come from the real roster of filled seats; a seat counts
  // present when its attendance is marked present or late, regardless of whether
  // the seat-holder has an app login. AGM/membership meetings use Section 10.7,
  // which depends on riding membership the app can't count, so the Chair confirms.
  const quorum = useMemo(() => {
    const seatPresent = (s: Seat) => {
      const st = statusForSeat(s);
      return st === "present" || st === "late";
    };
    const officers = seats.filter((s) => s.category === "elected_officer");
    const votingBoard = seats.filter(
      (s) => s.category === "elected_officer" || s.category === "director_at_large",
    );
    const presentOfficers = officers.filter(seatPresent).length;
    const presentVoting = votingBoard.filter(seatPresent).length;
    const reqVoting = Math.ceil(0.2 * votingBoard.length);
    const reqOfficers = Math.ceil(0.5 * officers.length);
    const isMembership = meeting?.meeting_type === "agm";
    const execMet =
      votingBoard.length > 0 && presentVoting >= reqVoting && presentOfficers >= reqOfficers;
    return {
      isMembership,
      votingBoardTotal: votingBoard.length,
      officersTotal: officers.length,
      presentVoting,
      presentOfficers,
      reqVoting,
      reqOfficers,
      met: isMembership ? membershipQuorumConfirmed : execMet,
    };
  }, [seats, statusForSeat, meeting, membershipQuorumConfirmed]);
  const quorumMet = quorum.met;

  // Report seats by kind: officer report (Chair, Vice-Chair, Organization Chair,
  // Policy Chair) and financial report (Treasurer). Secretary submits neither.
  const officerSeats = useMemo(() => seats.filter((s) => s.reportKind === "officer"), [seats]);
  const financialSeats = useMemo(() => seats.filter((s) => s.reportKind === "financial"), [seats]);

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

  const meetingOpen = meeting.status !== "adjourned" && meeting.status !== "minutes_approved";
  const editable = isAdmin && meetingOpen;

  // Attendance is recorded per seat (position_holder). Present and Late both count
  // as "in the room" for quorum; the present flag is kept in sync. user_id is set
  // too when the seat has a login (so motions/reports keep resolving names).
  const setAttendance = async (seat: Seat, status: AttendanceStatus, reason?: string) => {
    setBusy(true);
    const present = status === "present" || status === "late";
    const existing =
      attendees.find((a) => a.position_holder_id === seat.holderId) ??
      (seat.loginUserId ? attendees.find((a) => a.user_id === seat.loginUserId) : undefined);
    const arrived_at =
      status === "late" ? (existing?.arrived_at ?? new Date().toISOString()) : null;
    // Only Regrets carries a reason; clearing to any other status drops it.
    const regrets_reason =
      status === "regrets" ? (reason && reason.trim() ? reason.trim() : null) : null;
    if (existing) {
      const { error } = await supabase
        .from("attendees")
        .update({
          attendance_status: status,
          present,
          arrived_at,
          regrets_reason,
          position_holder_id: seat.holderId,
          user_id: seat.loginUserId,
        })
        .eq("id", existing.id);
      if (error) toast.error(error.message);
      else
        setAttendees((prev) =>
          prev.map((a) =>
            a.id === existing.id
              ? {
                  ...a,
                  attendance_status: status,
                  present,
                  arrived_at,
                  regrets_reason,
                  position_holder_id: seat.holderId,
                  user_id: seat.loginUserId,
                }
              : a,
          ),
        );
    } else {
      const { data, error } = await supabase
        .from("attendees")
        .insert({
          meeting_id: meetingId,
          position_holder_id: seat.holderId,
          user_id: seat.loginUserId,
          present,
          attendance_status: status,
          arrived_at,
          regrets_reason,
        })
        .select("id, user_id, position_holder_id, present, attendance_status, arrived_at, regrets_reason")
        .single();
      if (error) toast.error(error.message);
      else if (data) setAttendees((prev) => [...prev, data as Attendee]);
    }
    setBusy(false);
  };

  // A member confirms their own Regrets (reason optional; empty is fine).
  const submitRegrets = async () => {
    if (!regretsSeat) return;
    const seat = regretsSeat;
    const reason = regretsReason;
    setRegretsSeat(null);
    setRegretsReason("");
    await setAttendance(seat, "regrets", reason);
  };

  const transition = async (
    next:
      | "scheduled"
      | "reports_open"
      | "agenda_generated"
      | "in_progress"
      | "adjourned"
      | "minutes_draft"
      | "minutes_approved"
      | "cancelled",
  ) => {
    setBusy(true);
    const patch: Record<string, unknown> = { status: next, quorum_met: quorumMet };
    if (next === "in_progress" && !meeting.conversation_start_time) {
      patch.conversation_start_time = new Date().toISOString();
    }
    if (next === "adjourned" && !meeting.conversation_end_time) {
      patch.conversation_end_time = new Date().toISOString();
    }
    const { error } = await supabase
      .from("meetings")
      .update(patch as never)
      .eq("id", meetingId);
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`Meeting marked ${STATUS_LABEL[next]}`);
    refresh();
  };

  const canCallToOrder =
    meeting.status === "scheduled" ||
    meeting.status === "agenda_generated" ||
    meeting.status === "reports_open";
  const canAdjourn = meeting.status === "in_progress";
  // Fourth, transcript-aware check. Only a real detected mismatch blocks
  // adjournment; "not run" and "no transcript" stay non-blocking so a meeting
  // without Fieldy can still adjourn on the original three checks.
  const motionCheckItem: { label: string; ok: boolean } = !motionCheck
    ? {
        label: "Transcript motion cross-check: not run (optional). Import a transcript and run the check below.",
        ok: true,
      }
    : !motionCheck.transcript
      ? { label: "Transcript motion cross-check: no transcript imported (skipped).", ok: true }
      : motionCheck.unrecorded.length === 0 && motionCheck.unspoken.length === 0
        ? {
            label: `Transcript motion cross-check: motions match the transcript (${motionCheck.matched} matched).`,
            ok: true,
          }
        : {
            label: `Transcript motion cross-check: ${motionCheck.unrecorded.length} moved but unrecorded, ${motionCheck.unspoken.length} recorded but not spoken (see below).`,
            ok: false,
          };

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
      ok: motions.length === 0 || motions.every((m) => m.moved_by && m.seconded_by && m.result),
    },
    motionCheckItem,
  ];
  const allValid = validations.every((v) => v.ok);
  const canCancel =
    isAdmin &&
    !["adjourned", "minutes_draft", "minutes_approved", "cancelled"].includes(meeting.status);

  const onCancelMeeting = () => {
    if (
      confirm(
        `Cancel "${meeting.title}"? This marks the meeting cancelled — it is not deleted, and the record is kept.`,
      )
    ) {
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
                Membership / electoral meeting — quorum is the lesser of 10 Registered Liberals in
                the riding or 20% of them (By-law 2 Section 10.7). QiMiiTiNG can't count riding
                membership, so the Chair confirms quorum below.
              </>
            ) : (
              <>
                Executive quorum (By-law 2 Section 8.5): at least 50% of elected officers{" "}
                <span
                  className={
                    quorum.presentOfficers >= quorum.reqOfficers
                      ? "font-medium text-primary"
                      : "font-medium"
                  }
                >
                  ({quorum.presentOfficers}/{quorum.officersTotal}, need {quorum.reqOfficers})
                </span>{" "}
                and at least 20% of the voting board{" "}
                <span
                  className={
                    quorum.presentVoting >= quorum.reqVoting
                      ? "font-medium text-primary"
                      : "font-medium"
                  }
                >
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
          {seats.length === 0 ? (
            <p className="rounded-md border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
              No filled positions on the roster yet.
            </p>
          ) : (
            seats.map((seat) => {
              const a =
                attendees.find((x) => x.position_holder_id === seat.holderId) ??
                (seat.loginUserId
                  ? attendees.find((x) => x.user_id === seat.loginUserId)
                  : undefined);
              const status = a?.attendance_status ?? "absent";
              const isOwnSeat = !!seat.loginUserId && seat.loginUserId === profile.id;
              // Narrow exception: any member may send Regrets on their OWN row.
              const canSelfRegret = isOwnSeat && meetingOpen;
              return (
                <div
                  key={seat.holderId}
                  className="flex items-center justify-between gap-3 rounded-md border border-border bg-card px-3 py-2"
                >
                  <span className="min-w-0 flex-1 text-sm">
                    <span className="block truncate">
                      {seat.holderName}{" "}
                      <span className="text-muted-foreground">· {seat.title}</span>
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {seat.loginEmail ?? "no app login"}
                      {status === "late" && a?.arrived_at
                        ? ` · arrived ${format(new Date(a.arrived_at), "h:mm a")}`
                        : ""}
                      {status === "regrets" && a?.regrets_reason
                        ? ` · reason: ${a.regrets_reason}`
                        : ""}
                    </span>
                  </span>
                  <div className="flex shrink-0 flex-wrap gap-1">
                    {(["present", "late", "regrets", "absent"] as AttendanceStatus[]).map((s) => {
                      const allowed = editable || (s === "regrets" && canSelfRegret);
                      return (
                        <Button
                          key={s}
                          type="button"
                          size="sm"
                          variant={status === s ? "default" : "outline"}
                          disabled={!allowed || busy}
                          className="h-7 px-2 text-xs capitalize"
                          onClick={() => {
                            // A member (or the Chair) sending regrets on their own row
                            // gets the optional-reason prompt; everything else is direct.
                            if (s === "regrets" && isOwnSeat) {
                              setRegretsSeat(seat);
                              setRegretsReason(a?.regrets_reason ?? "");
                            } else {
                              setAttendance(seat, s);
                            }
                          }}
                        >
                          {s}
                        </Button>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      <Dialog
        open={regretsSeat !== null}
        onOpenChange={(o) => {
          if (!o) {
            setRegretsSeat(null);
            setRegretsReason("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send your regrets</DialogTitle>
            <DialogDescription>Would you like to share your reason?</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Textarea
              rows={3}
              placeholder="Optional. For example: travelling, work conflict. You can leave this blank."
              value={regretsReason}
              onChange={(e) => setRegretsReason(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setRegretsSeat(null);
                setRegretsReason("");
              }}
            >
              Cancel
            </Button>
            <Button onClick={() => void submitRegrets()} disabled={busy}>
              Record regrets
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ReportsCard
        meeting={meeting}
        officerSeats={officerSeats}
        financialSeats={financialSeats}
        reports={reports}
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
            <AddMotionDialog
              users={users}
              meetingId={meetingId}
              organizationId={meeting.organization_id}
              onAdded={refresh}
            />
          )}
        </CardHeader>
        <CardContent className="space-y-3">
          {motions.length === 0 ? (
            <p className="rounded-md border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
              No motions yet.
              {meeting.status !== "in_progress" &&
                " Motions can be recorded once the meeting is called to order."}
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
                <Button
                  variant="secondary"
                  onClick={() => transition("reports_open")}
                  disabled={busy}
                >
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

                <div className="space-y-2 rounded-md border border-border bg-muted/20 p-3">
                  <p className="text-sm font-medium">Transcript motion check</p>
                  <p className="text-xs text-muted-foreground">
                    Import the latest Fieldy transcript and cross-check spoken motions against the
                    recorded ones. You can run this at a break mid-meeting and again before
                    adjourning.
                    {meeting.fieldy_enabled ? "" : " Fieldy is not enabled for this meeting."}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={motionCheckBusy !== null || !meeting.fieldy_enabled}
                      onClick={doImportThenCheck}
                    >
                      {motionCheckBusy === "import" ? "Importing…" : "Import transcript & check"}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={motionCheckBusy !== null}
                      onClick={doMotionCheck}
                    >
                      {motionCheckBusy === "check" ? "Checking…" : "Re-check motions"}
                    </Button>
                  </div>
                  {motionCheck && !motionCheck.transcript && (
                    <p className="text-xs text-muted-foreground">
                      No transcript imported yet. Import one to run the cross-check.
                    </p>
                  )}
                  {motionCheck &&
                    motionCheck.transcript &&
                    motionCheck.unrecorded.length === 0 &&
                    motionCheck.unspoken.length === 0 && (
                      <p className="text-xs text-primary">
                        All {motionCheck.matched} recorded motion(s) match the transcript.
                      </p>
                    )}
                  {motionCheck &&
                    motionCheck.transcript &&
                    (motionCheck.unrecorded.length > 0 || motionCheck.unspoken.length > 0) && (
                      <div className="space-y-2 text-xs">
                        {motionCheck.unrecorded.length > 0 && (
                          <div>
                            <span className="font-medium text-destructive">
                              Moved in the transcript but not recorded:
                            </span>
                            <ul className="ml-4 list-disc">
                              {motionCheck.unrecorded.map((t, i) => (
                                <li key={`u${i}`}>{t}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {motionCheck.unspoken.length > 0 && (
                          <div>
                            <span className="font-medium text-destructive">
                              Recorded but not found in the transcript:
                            </span>
                            <ul className="ml-4 list-disc">
                              {motionCheck.unspoken.map((t, i) => (
                                <li key={`s${i}`}>{t}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    )}
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

      {isAdmin &&
        (meeting.status === "adjourned" ||
          meeting.status === "minutes_draft" ||
          meeting.status === "minutes_approved") && (
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
          Import the Fieldy transcript (if enabled), generate an AI draft using GPT-4o, then review
          and approve. Motions are reproduced verbatim.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          {meeting.fieldy_enabled && (
            <Button variant="secondary" disabled={busy !== null} onClick={handleImport}>
              {busy === "import"
                ? "Importing…"
                : `Import Fieldy transcript${segmentCount != null ? ` (${segmentCount})` : ""}`}
            </Button>
          )}
          <Button disabled={busy !== null} onClick={handleDraft}>
            {busy === "draft"
              ? "Drafting…"
              : draftText
                ? "Re-draft minutes (AI)"
                : "Draft minutes (AI)"}
          </Button>
        </div>

        <p className="rounded-md border border-dashed border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          AI drafts are a starting point only. The secretary must review every line for accuracy
          before approval. Motion text is reproduced verbatim and must not be edited.
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
          <Label className="text-xs uppercase text-muted-foreground">
            Approved minutes (editable)
          </Label>
          <Textarea
            rows={12}
            value={approvedText}
            onChange={(e) => setApprovedText(e.target.value)}
            placeholder="Edit the AI draft above, then approve. Edits are audit-logged."
            className="font-mono text-xs"
          />
          <div className="flex justify-end">
            <Button
              variant="default"
              disabled={busy !== null || !approvedText.trim()}
              onClick={handleApprove}
            >
              {busy === "approve"
                ? "Approving…"
                : meeting.status === "minutes_approved"
                  ? "Save edits (audit logged)"
                  : "Approve minutes"}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

type EmailRecipientPreview = { id?: string | null; name: string; email: string };
function WorkspaceCard({ meeting, onUpdate }: { meeting: Meeting; onUpdate: () => void }) {
  const genAgenda = useServerFn(generateAgenda);
  const sendNotice = useServerFn(sendMeetingNotice);
  const listNoticeRecipients = useServerFn(listMeetingNoticeRecipients);
  const uploadMins = useServerFn(uploadApprovedMinutes);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [previewRecipients, setPreviewRecipients] = useState<EmailRecipientPreview[]>([]);

  const run = async (
    key: string,
    fn: () => Promise<{ agendaUrl?: string; sent?: number; minutesUrl?: string }>,
    ok: (r: any) => string,
  ) => {
    setBusy(key);
    try {
      const r = await fn();
      toast.success(ok(r));
      onUpdate();
    } catch (e: any) {
      const msg = String(e?.message ?? e);
      if (msg.includes("not connected"))
        toast.error("Connect your Google account in Settings first.");
      else toast.error(msg);
    } finally {
      setBusy(null);
    }
  };

  const openNoticeConfirm = async () => {
    setBusy("notice-preview");
    try {
      const r = await listNoticeRecipients({ data: { meetingId: meeting.id } });
      if (!r.recipients?.length) {
        toast.error("No recipients with email addresses.");
        return;
      }
      setPreviewRecipients(r.recipients);
      setConfirmOpen(true);
    } catch (e: any) {
      const msg = String(e?.message ?? e);
      if (msg.includes("not connected"))
        toast.error("Connect your Google account in Settings first.");
      else toast.error(msg);
    } finally {
      setBusy(null);
    }
  };

  const confirmSendNotice = () => {
    setConfirmOpen(false);
    void run(
      "notice",
      () => sendNotice({ data: { meetingId: meeting.id } }),
      (r) => `Meeting notice sent to ${r.sent} recipient(s)`,
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Google Workspace</CardTitle>
        <CardDescription>
          Generate the agenda with AI, email a preliminary meeting notice (works before the agenda
          exists; resend after generating the agenda to include the link), and archive approved
          minutes to Drive.{" "}
          <Link to="/settings" className="underline">
            Manage connection
          </Link>
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            disabled={busy !== null}
            onClick={() =>
              run(
                "agenda",
                () => genAgenda({ data: { meetingId: meeting.id } }),
                (r) => `Agenda generated and saved to Drive`,
              )
            }
          >
            <FileText className="mr-1 size-4" />
            {busy === "agenda" ? "Generating…" : "Generate agenda (AI)"}
          </Button>
          <Button
            variant="secondary"
            disabled={busy !== null}
            onClick={() => void openNoticeConfirm()}
          >
            <Mail className="mr-1 size-4" />
            {busy === "notice" || busy === "notice-preview" ? "Sending…" : "Send meeting notice"}
          </Button>
          <Button
            variant="secondary"
            disabled={busy !== null || meeting.status !== "minutes_draft"}
            onClick={() =>
              run(
                "minutes",
                () => uploadMins({ data: { meetingId: meeting.id } }),
                () => "Approved minutes uploaded to Drive",
              )
            }
            title={
              meeting.status === "minutes_draft" ? undefined : "Approve minutes first (Milestone 5)"
            }
          >
            <Upload className="mr-1 size-4" />
            {busy === "minutes" ? "Uploading…" : "Upload approved minutes"}
          </Button>
        </div>
        <p className="rounded-md border border-dashed border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          AI-generated agendas follow Robert's Rules and LPC By-law 2 conventions. Always review
          before distribution — the chair is responsible for the final content.
        </p>

        <div className="space-y-2">
          <p className="text-xs font-medium uppercase text-muted-foreground">
            Find in the Workspace account
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link to="/workspace" search={{ q: "agenda" }}>
                <FileText className="mr-1 size-4" /> Agenda
              </Link>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link to="/workspace" search={{ q: "minutes" }}>
                <FileText className="mr-1 size-4" /> Previous Minutes
              </Link>
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Searches Drive and Gmail on the connected account — pull up any prior agenda, minutes, or
            related correspondence on demand.
          </p>
        </div>

        <div className="space-y-1 text-sm">
          {meeting.agenda_url && (
            <a
              href={meeting.agenda_url}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1 text-primary hover:underline"
            >
              <ExternalLink className="size-3" /> Agenda.pdf (this meeting)
            </a>
          )}
          {meeting.minutes_approved_url && (
            <a
              href={meeting.minutes_approved_url}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1 text-primary hover:underline"
            >
              <ExternalLink className="size-3" /> Minutes-Approved.pdf (this meeting)
            </a>
          )}
        </div>
      </CardContent>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Send meeting notice?</AlertDialogTitle>
            <AlertDialogDescription>
              A separate Gmail message will be sent to each of the following{" "}
              {previewRecipients.length} recipient(s). Confirm to send.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <ul className="max-h-60 space-y-1 overflow-y-auto rounded-md border border-border bg-muted/20 p-3 text-sm">
            {previewRecipients.map((r) => (
              <li key={r.email}>
                <span className="font-medium text-foreground">{r.name}</span>{" "}
                <span className="text-muted-foreground">&lt;{r.email}&gt;</span>
              </li>
            ))}
          </ul>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmSendNotice}>Confirm Send</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
            <SelectTrigger>
              <SelectValue placeholder="Select" />
            </SelectTrigger>
            <SelectContent>
              {users.map((u) => (
                <SelectItem key={u.id} value={u.id}>
                  {u.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Seconded by</Label>
          <Select value={seconded} onValueChange={setSeconded} disabled={!editable}>
            <SelectTrigger>
              <SelectValue placeholder="Select" />
            </SelectTrigger>
            <SelectContent>
              {users.map((u) => (
                <SelectItem key={u.id} value={u.id}>
                  {u.name}
                </SelectItem>
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
            <SelectTrigger>
              <SelectValue placeholder="Select" />
            </SelectTrigger>
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
  organizationId,
  onAdded,
}: {
  users: OrgUser[];
  meetingId: string;
  organizationId: string;
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
      organization_id: organizationId,
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
                <SelectTrigger>
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent>
                  {users.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Seconded by</Label>
              <Select value={seconded} onValueChange={setSeconded}>
                <SelectTrigger>
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent>
                  {users.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.name}
                    </SelectItem>
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
  officerSeats,
  financialSeats,
  reports,
  currentUserId,
  isAdmin,
  onUpdate,
}: {
  meeting: Meeting;
  officerSeats: Seat[];
  financialSeats: Seat[];
  reports: Report[];
  currentUserId: string;
  isAdmin: boolean;
  onUpdate: () => void;
}) {
  const requestOfficer = useServerFn(sendOfficerReportRequest);
  const requestFinancial = useServerFn(sendFinancialReportRequest);
  const listOfficerRecipients = useServerFn(listOfficerReportRequestRecipients);
  const listFinancialRecipients = useServerFn(listFinancialReportRequestRecipients);
  const [requestBusy, setRequestBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingKind, setPendingKind] = useState<"officer" | "financial" | null>(null);
  const [previewRecipients, setPreviewRecipients] = useState<EmailRecipientPreview[]>([]);
  const reportsOpen =
    meeting.status === "reports_open" ||
    meeting.status === "agenda_generated" ||
    meeting.status === "in_progress";

  const myReport = reports.find((r) => r.user_id === currentUserId);
  const allReportSeats = [...officerSeats, ...financialSeats];
  const mySeat = allReportSeats.find((s) => s.loginUserId === currentUserId);
  const isReporter = !!mySeat;

  const openRequestConfirm = async (kind: "officer" | "financial") => {
    setRequestBusy(true);
    try {
      const listed =
        kind === "officer"
          ? await listOfficerRecipients({ data: { meetingId: meeting.id } })
          : await listFinancialRecipients({ data: { meetingId: meeting.id } });
      if (!listed.recipients?.length) {
        toast.error(
          kind === "financial"
            ? "No Treasurer with an email address on file."
            : "No reporting officers with email addresses.",
        );
        return;
      }
      setPreviewRecipients(listed.recipients);
      setPendingKind(kind);
      setConfirmOpen(true);
    } catch (e: any) {
      const msg = String(e?.message ?? e);
      if (msg.includes("not connected"))
        toast.error("Connect your Google account in Settings first.");
      else toast.error(msg);
    } finally {
      setRequestBusy(false);
    }
  };

  const confirmRequest = async () => {
    const kind = pendingKind;
    setConfirmOpen(false);
    if (!kind) return;
    setRequestBusy(true);
    try {
      const r =
        kind === "officer"
          ? await requestOfficer({ data: { meetingId: meeting.id } })
          : await requestFinancial({ data: { meetingId: meeting.id } });
      toast.success(
        `${kind === "financial" ? "Financial" : "Officer"} report request sent to ${r.sent} recipient(s)`,
      );
      onUpdate();
    } catch (e: any) {
      const msg = String(e?.message ?? e);
      if (msg.includes("not connected"))
        toast.error("Connect your Google account in Settings first.");
      else toast.error(msg);
    } finally {
      setRequestBusy(false);
      setPendingKind(null);
    }
  };

  const SeatReportRow = ({ seat }: { seat: Seat }) => {
    const r = seat.loginUserId ? reports.find((x) => x.user_id === seat.loginUserId) : undefined;
    const isSelf = seat.loginUserId === currentUserId;
    return (
      <div className="flex items-start justify-between gap-3 rounded-md border border-border bg-card px-3 py-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">{seat.holderName}</span>
            <span className="text-xs text-muted-foreground">· {seat.title}</span>
            {r ? (
              <Badge variant="secondary" className="text-xs">
                Submitted
              </Badge>
            ) : (
              <Badge variant="outline" className="text-xs">
                Pending
              </Badge>
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
          {!seat.loginEmail && (
            <p className="mt-1 text-xs text-muted-foreground">
              No app login — this report is expected by email and picked up by the agenda scan.
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
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Officer &amp; financial reports</CardTitle>
        <CardDescription>
          {meeting.status === "scheduled"
            ? "Reports submission opens once the chair opens reports."
            : reportsOpen
              ? "Officer reports come from the Chair, Vice-Chair, Organization Chair, and Policy Chair; the Treasurer submits a separate financial report."
              : "Report submission is closed for this meeting."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {!isAdmin && reportsOpen && isReporter && (
          <div className="mb-1">
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
          <p className="mb-1 text-sm text-muted-foreground">
            Formal reports are submitted by the reporting officers and the Treasurer. You can raise
            items during New Business at the meeting.
          </p>
        )}

        {(isAdmin || isReporter) && (
          <div className="space-y-3">
            <div className="space-y-2">
              <p className="text-xs font-medium uppercase text-muted-foreground">Officer reports</p>
              {officerSeats.length === 0 ? (
                <p className="text-sm text-muted-foreground">No officer report seats configured.</p>
              ) : (
                (isAdmin ? officerSeats : officerSeats.filter((s) => s.loginUserId === currentUserId)).map(
                  (seat) => <SeatReportRow key={seat.holderId} seat={seat} />,
                )
              )}
            </div>
            <div className="space-y-2">
              <p className="text-xs font-medium uppercase text-muted-foreground">Financial report</p>
              {financialSeats.length === 0 ? (
                <p className="text-sm text-muted-foreground">No Treasurer seat configured.</p>
              ) : (
                (isAdmin
                  ? financialSeats
                  : financialSeats.filter((s) => s.loginUserId === currentUserId)
                ).map((seat) => <SeatReportRow key={seat.holderId} seat={seat} />)
              )}
            </div>
          </div>
        )}

        {isAdmin && reportsOpen && (
          <div className="flex flex-wrap gap-2 pt-1">
            <Button
              size="sm"
              variant="secondary"
              disabled={requestBusy}
              onClick={() => void openRequestConfirm("officer")}
            >
              <Mail className="mr-1 size-4" />
              {requestBusy ? "Sending…" : "Request officer reports"}
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={requestBusy}
              onClick={() => void openRequestConfirm("financial")}
            >
              <Mail className="mr-1 size-4" />
              Request financial report
            </Button>
            {reports.length > 0 && (
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
                  toast.success(
                    "Motion added. Record the seconder and the vote in the Motions section.",
                  );
                  onUpdate();
                }}
              >
                Move to accept the reports
              </Button>
            )}
          </div>
        )}
      </CardContent>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingKind === "financial" ? "Request financial report?" : "Request officer reports?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              A separate Gmail message will be sent to each of the following{" "}
              {previewRecipients.length} recipient(s). Confirm to send.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <ul className="max-h-60 space-y-1 overflow-y-auto rounded-md border border-border bg-muted/20 p-3 text-sm">
            {previewRecipients.map((r) => (
              <li key={r.email}>
                <span className="font-medium text-foreground">{r.name}</span>{" "}
                <span className="text-muted-foreground">&lt;{r.email}&gt;</span>
              </li>
            ))}
          </ul>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void confirmRequest()}>Confirm Send</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
