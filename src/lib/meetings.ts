// Shared meeting bucketing and ordering, used everywhere meetings are listed so
// the split and sort are identical on every screen. Display/query ordering only.

export type MeetingLike = { meeting_date: string; status: string };

// Statuses that mean the meeting has not concluded yet (pre-meeting or live).
// Anything else (adjourned, minutes_draft, minutes_approved, cancelled) is Past.
const PRE_OR_LIVE = new Set(["scheduled", "reports_open", "agenda_generated", "in_progress"]);

// Local "today" as YYYY-MM-DD, to compare against a meeting's date-only field.
export function todayISO(): string {
  const d = new Date();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mo}-${da}`;
}

// Upcoming means still pre-meeting or in progress AND not dated before today.
// This keeps a meeting that is scheduled or in progress today in Upcoming even
// once the evening has started, and drops minutes_approved or cancelled meetings
// into Past regardless of their date.
export function isUpcomingMeeting(m: MeetingLike, today = todayISO()): boolean {
  return PRE_OR_LIVE.has(m.status) && m.meeting_date >= today;
}

export function splitMeetings<T extends MeetingLike>(
  meetings: T[],
  today = todayISO(),
): { upcoming: T[]; past: T[] } {
  const upcoming: T[] = [];
  const past: T[] = [];
  for (const m of meetings) {
    if (isUpcomingMeeting(m, today)) upcoming.push(m);
    else past.push(m);
  }
  upcoming.sort((a, b) => a.meeting_date.localeCompare(b.meeting_date)); // soonest first
  past.sort((a, b) => b.meeting_date.localeCompare(a.meeting_date)); // most recent first
  return { upcoming, past };
}
