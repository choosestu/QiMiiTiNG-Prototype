import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { ArrowLeft, CheckCircle2, Circle, ExternalLink, FileText, Mail, Plus, Upload } from "lucide-react";
import { toast } from "sonner";
import { generateAgenda, sendMeetingNotice, uploadApprovedMinutes } from "@/lib/google.functions";

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

export const Route = createFileRoute("/_authenticated/meetings/$meetingId")({
  head: () => ({
    meta: [{ title: "Meeting — QiMiiTiNG" }],
  }),
  component: MeetingPage,
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
  minutes_approved_url: string | null;
  drive_folder_id: string | null;
};

type OrgUser = { id: string; name: string; email: string };
type Attendee = { id: string; user_id: string; present: boolean };
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
};

function MeetingPage() {
  const { meetingId } = Route.useParams();
  const { profile, isAdmin, loading } = useAuth();
  const router = useRouter();

  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [users, setUsers] = useState<OrgUser[]>([]);
  const [attendees, setAttendees] = useState<Attendee[]>([]);
  const [motions, setMotions] = useState<Motion[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const [m, a, mo, rp] = await Promise.all([
      supabase.from("meetings").select("*").eq("id", meetingId).maybeSingle(),
      supabase.from("attendees").select("id, user_id, present").eq("meeting_id", meetingId),
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
  const quorumMet = meeting ? presentCount >= meeting.quorum_required : false;

  if (loading || !profile) {
    return <p className="p-8 text-sm text-muted-foreground">Loading…</p>;
  }
  if (!meeting) {
    return <p className="p-8 text-sm text-muted-foreground">Meeting not found.</p>;
  }

  const editable = isAdmin && meeting.status !== "adjourned" && meeting.status !== "minutes_approved";

  const toggleAttendance = async (userId: string, present: boolean) => {
    setBusy(true);
    const existing = attendees.find((a) => a.user_id === userId);
    if (existing) {
      const { error } = await supabase
        .from("attendees")
        .update({ present })
        .eq("id", existing.id);
      if (error) toast.error(error.message);
      setAttendees((prev) =>
        prev.map((a) => (a.id === existing.id ? { ...a, present } : a)),
      );
    }
    setBusy(false);
  };

  const transition = async (
    next: "scheduled" | "reports_open" | "agenda_generated" | "in_progress" | "adjourned" | "minutes_draft" | "minutes_approved",
  ) => {
    setBusy(true);
    const { error } = await supabase
      .from("meetings")
      .update({ status: next, quorum_met: quorumMet })
      .eq("id", meetingId);
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
    { label: `Quorum reached (${presentCount}/${meeting.quorum_required})`, ok: quorumMet },
    { label: "At least one motion recorded", ok: motions.length > 0 },
    {
      label: "All motions have mover, seconder, and a result",
      ok:
        motions.length === 0 ||
        motions.every((m) => m.moved_by && m.seconded_by && m.result),
    },
  ];
  const allValid = validations.every((v) => v.ok);

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-8">
      <Button variant="ghost" size="sm" asChild>
        <Link to="/dashboard">
          <ArrowLeft className="mr-1 h-4 w-4" />
          All meetings
        </Link>
      </Button>

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-serif text-3xl">{meeting.title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {format(new Date(meeting.meeting_date + "T00:00:00"), "PPPP")} ·{" "}
            {meeting.meeting_type.replace("_", " ")}
            {meeting.fieldy_enabled && " · Fieldy enabled"}
          </p>
        </div>
        <Badge variant="secondary" className="text-sm">
          {STATUS_LABEL[meeting.status]}
        </Badge>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Attendance</CardTitle>
          <CardDescription>
            Quorum requires {meeting.quorum_required} officers present. Currently{" "}
            <span className={quorumMet ? "text-primary font-medium" : "font-medium"}>
              {presentCount}/{users.length} present
            </span>
            .
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {users.map((u) => {
            const a = attendees.find((x) => x.user_id === u.id);
            const present = a?.present ?? false;
            return (
              <label
                key={u.id}
                className="flex items-center justify-between rounded-md border border-border bg-card px-3 py-2"
              >
                <span className="text-sm">
                  {u.name}
                  <span className="ml-2 text-xs text-muted-foreground">{u.email}</span>
                </span>
                <Checkbox
                  checked={present}
                  disabled={!editable || busy}
                  onCheckedChange={(v) => toggleAttendance(u.id, !!v)}
                />
              </label>
            );
          })}
        </CardContent>
      </Card>

      <ReportsCard
        meeting={meeting}
        users={users}
        reports={reports}
        currentUserId={profile.id}
        isAdmin={isAdmin}
        onUpdate={refresh}
      />

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="text-base">Motions</CardTitle>
            <CardDescription>Recorded verbatim as moved.</CardDescription>
          </div>
          {editable && meeting.status === "in_progress" && (
            <AddMotionDialog users={users} meetingId={meetingId} onAdded={refresh} />
          )}
        </CardHeader>
        <CardContent className="space-y-3">
          {motions.length === 0 ? (
            <p className="text-sm text-muted-foreground">
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
                      : `Need ${meeting.quorum_required - presentCount} more officer(s) present.`}
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
                Meeting adjourned. AI minutes drafting becomes available in Milestone 5.
              </p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
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
  currentUserId,
  isAdmin,
  onUpdate,
}: {
  meeting: Meeting;
  users: OrgUser[];
  reports: Report[];
  currentUserId: string;
  isAdmin: boolean;
  onUpdate: () => void;
}) {
  const reportsOpen =
    meeting.status === "reports_open" ||
    meeting.status === "agenda_generated" ||
    meeting.status === "in_progress";

  const myReport = reports.find((r) => r.user_id === currentUserId);
  const visibleUsers = isAdmin ? users : users.filter((u) => u.id === currentUserId);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Officer reports</CardTitle>
        <CardDescription>
          {meeting.status === "scheduled"
            ? "Reports submission opens once the chair opens reports."
            : reportsOpen
              ? "Officers submit a written report for this meeting."
              : "Report submission is closed for this meeting."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {!isAdmin && reportsOpen && (
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
                  <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-xs text-muted-foreground">
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
