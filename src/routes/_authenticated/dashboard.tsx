import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { format } from "date-fns";
import { CalendarIcon, Plus } from "lucide-react";
import { toast } from "sonner";

import { useAuth, signOut } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — QiMiiTiNG" },
      { name: "description", content: "QiMiiTiNG dashboard." },
    ],
  }),
  component: DashboardPage,
});

type Meeting = {
  id: string;
  title: string;
  meeting_date: string;
  meeting_type: string;
  status: string;
  fieldy_enabled: boolean;
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

function DashboardPage() {
  const { profile, isAdmin, loading } = useAuth();
  const router = useRouter();
  const [meetings, setMeetings] = useState<Meeting[] | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const loadMeetings = async () => {
    const { data, error } = await supabase
      .from("meetings")
      .select("id, title, meeting_date, meeting_type, status, fieldy_enabled")
      .order("meeting_date", { ascending: false });
    if (error) {
      toast.error(error.message);
      return;
    }
    setMeetings(data as Meeting[]);
  };

  useEffect(() => {
    if (profile) loadMeetings();
  }, [profile]);

  if (loading || !profile) {
    return <p className="p-8 text-sm text-muted-foreground">Loading…</p>;
  }

  return (
    <div className="mx-auto max-w-5xl space-y-8 px-4 py-8">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl">Welcome, {profile.name.split(" ")[0]}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {isAdmin
              ? "You have administrative access. Create and manage meetings below."
              : "Submit your officer reports and review approved meeting documents."}
          </p>
        </div>
        <div className="flex items-center gap-1">
          {isAdmin && (
            <Button variant="ghost" size="sm" asChild>
              <Link to="/settings">Settings</Link>
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={() => signOut().then(() => router.navigate({ to: "/" }))}>
            Sign out
          </Button>
        </div>
      </header>

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-serif text-xl">Meetings</h2>
          {isAdmin && (
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm">
                  <Plus className="mr-1 h-4 w-4" />
                  New meeting
                </Button>
              </DialogTrigger>
              <CreateMeetingDialog
                organizationId={profile.organization_id}
                userId={profile.id}
                onCreated={() => {
                  setDialogOpen(false);
                  loadMeetings();
                }}
              />
            </Dialog>
          )}
        </div>

        {meetings === null ? (
          <p className="text-sm text-muted-foreground">Loading meetings…</p>
        ) : meetings.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              No meetings yet. {isAdmin ? "Create the first one above." : "Check back soon."}
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3">
            {meetings.map((m) => (
              <Link
                key={m.id}
                to="/meetings/$meetingId"
                params={{ meetingId: m.id }}
                className="block"
              >
                <Card className="transition-colors hover:border-primary/40">
                  <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0 pb-3">
                    <div>
                      <CardTitle className="text-base">{m.title}</CardTitle>
                      <CardDescription>
                        {format(new Date(m.meeting_date + "T00:00:00"), "PPP")} ·{" "}
                        {m.meeting_type.replace("_", " ")}
                      </CardDescription>
                    </div>
                    <Badge variant="secondary">{STATUS_LABEL[m.status] ?? m.status}</Badge>
                  </CardHeader>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function CreateMeetingDialog({
  organizationId,
  userId,
  onCreated,
}: {
  organizationId: string;
  userId: string;
  onCreated: () => void;
}) {
  const [title, setTitle] = useState("Executive Meeting");
  const [date, setDate] = useState<Date | undefined>(new Date());
  const [meetingType, setMeetingType] = useState("executive");
  const [fieldyEnabled, setFieldyEnabled] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!date) {
      toast.error("Pick a meeting date.");
      return;
    }
    setSubmitting(true);
    const { error } = await supabase.from("meetings").insert({
      organization_id: organizationId,
      title,
      meeting_date: format(date, "yyyy-MM-dd"),
      meeting_type: meetingType,
      fieldy_enabled: fieldyEnabled,
      created_by: userId,
    });
    setSubmitting(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Meeting created");
    onCreated();
  };

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Create meeting</DialogTitle>
        <DialogDescription>Schedule a new executive meeting.</DialogDescription>
      </DialogHeader>
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="title">Title</Label>
          <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>Date</Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  "w-full justify-start text-left font-normal",
                  !date && "text-muted-foreground",
                )}
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {date ? format(date, "PPP") : "Pick a date"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={date}
                onSelect={setDate}
                initialFocus
                className={cn("p-3 pointer-events-auto")}
              />
            </PopoverContent>
          </Popover>
        </div>
        <div className="space-y-2">
          <Label>Type</Label>
          <Select value={meetingType} onValueChange={setMeetingType}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="executive">Executive</SelectItem>
              <SelectItem value="agm">AGM</SelectItem>
              <SelectItem value="special">Special</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center justify-between rounded-md border border-border bg-muted/30 p-3">
          <div className="space-y-0.5">
            <Label htmlFor="fieldy" className="text-sm">
              Enable Fieldy recording
            </Label>
            <p className="text-xs text-muted-foreground">
              Capture audio + transcript for AI minutes. (Wired in Milestone 5.)
            </p>
          </div>
          <Switch id="fieldy" checked={fieldyEnabled} onCheckedChange={setFieldyEnabled} />
        </div>
      </div>
      <DialogFooter>
        <Button onClick={submit} disabled={submitting}>
          {submitting ? "Creating…" : "Create meeting"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
