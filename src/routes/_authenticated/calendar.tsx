import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Calendar } from "@/components/ui/calendar";

import { RouteErrorComponent, RouteNotFoundComponent } from "@/components/route-boundaries";

export const Route = createFileRoute("/_authenticated/calendar")({
  head: () => ({ meta: [{ title: "Calendar — QiMiiTiNG" }] }),
  component: CalendarPage,
  errorComponent: RouteErrorComponent,
  notFoundComponent: RouteNotFoundComponent,
});

type Meeting = {
  id: string;
  title: string;
  meeting_date: string;
  meeting_type: string;
  status: string;
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

// Parse a 'YYYY-MM-DD' string to a local Date (avoids timezone shifting the day).
function parseDay(d: string): Date {
  const [y, m, day] = d.split("-").map(Number);
  return new Date(y, m - 1, day);
}
function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function CalendarPage() {
  const { profile, loading } = useAuth();
  const router = useRouter();
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [selected, setSelected] = useState<Date | undefined>(new Date());

  useEffect(() => {
    if (!profile) return;
    supabase
      .from("meetings")
      .select("id, title, meeting_date, meeting_type, status")
      .order("meeting_date", { ascending: true })
      .then(({ data, error }) => {
        if (error) toast.error(error.message);
        else setMeetings((data ?? []) as Meeting[]);
      });
  }, [profile]);

  const meetingDays = useMemo(() => meetings.map((m) => parseDay(m.meeting_date)), [meetings]);

  const onSelectedDay = useMemo(
    () => (selected ? meetings.filter((m) => sameDay(parseDay(m.meeting_date), selected)) : []),
    [meetings, selected],
  );

  const upcoming = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return meetings.filter((m) => parseDay(m.meeting_date) >= today).slice(0, 8);
  }, [meetings]);

  if (loading || !profile) return <p className="p-8 text-sm text-muted-foreground">Loading…</p>;

  const MeetingRow = ({ m }: { m: Meeting }) => (
    <Link key={m.id} to="/meetings/$meetingId" params={{ meetingId: m.id }} className="block">
      <Card className="transition-colors hover:border-primary/40">
        <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0 py-3">
          <div className="min-w-0">
            <CardTitle className="text-sm">{m.title}</CardTitle>
            <p className="text-xs text-muted-foreground">
              {format(parseDay(m.meeting_date), "PPP")} · {m.meeting_type.replace("_", " ")}
            </p>
          </div>
          <Badge variant={m.status === "cancelled" ? "destructive" : "secondary"}>
            {STATUS_LABEL[m.status] ?? m.status}
          </Badge>
        </CardHeader>
      </Card>
    </Link>
  );

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-6 sm:py-8">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => router.navigate({ to: "/dashboard" })}>
          <ArrowLeft className="mr-1 size-4" /> Dashboard
        </Button>
        <h1 className="font-serif text-2xl sm:text-3xl">Calendar</h1>
      </div>

      <div className="grid gap-6 md:grid-cols-[auto_minmax(0,1fr)]">
        <Card className="w-fit">
          <CardContent className="p-3">
            <Calendar
              mode="single"
              selected={selected}
              onSelect={setSelected}
              modifiers={{ hasMeeting: meetingDays }}
              modifiersClassNames={{ hasMeeting: "bg-primary/15 font-semibold rounded-md" }}
            />
          </CardContent>
        </Card>

        <div className="space-y-4">
          <div className="space-y-2">
            <h2 className="text-sm font-medium">
              {selected ? format(selected, "PPPP") : "Select a day"}
            </h2>
            {onSelectedDay.length === 0 ? (
              <p className="rounded-md border border-dashed border-border px-3 py-4 text-sm text-muted-foreground">
                No meetings on this day.
              </p>
            ) : (
              <div className="space-y-2">{onSelectedDay.map((m) => <MeetingRow key={m.id} m={m} />)}</div>
            )}
          </div>

          {upcoming.length > 0 && (
            <div className="space-y-2">
              <h2 className="text-sm font-medium text-muted-foreground">Upcoming</h2>
              <div className="space-y-2">{upcoming.map((m) => <MeetingRow key={m.id} m={m} />)}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
