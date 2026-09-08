// Server-only OpenAI chat helper. Uses OPENAI_API_KEY secret.
export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export async function openaiChat(args: {
  system: string;
  user: string;
  model?: string;
  temperature?: number;
}): Promise<string> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY is not configured.");
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: args.model ?? "gpt-4o",
      temperature: args.temperature ?? 0.2,
      messages: [
        { role: "system", content: args.system },
        { role: "user", content: args.user },
      ],
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`OpenAI request failed (${res.status}): ${body}`);
  }
  const j = (await res.json()) as { choices: { message: { content: string } }[] };
  return j.choices[0]?.message?.content?.trim() ?? "";
}

export const AGENDA_SYSTEM_PROMPT =
  "You are a parliamentary procedure assistant for a volunteer political organization following " +
  "LPC (Liberal Party of Canada) By-law 2 and Robert's Rules of Order. Produce a complete, usable " +
  "meeting agenda from the material provided: the officer report roster, any reports received, " +
  "correspondence, upcoming calendar dates, and unresolved prior motions. Do not fabricate facts, but " +
  "DO produce a fully fleshed-out agenda, not a list of bare headings.\n" +
  "Rules for each section:\n" +
  "- Call to Order: note the meeting title and date, and that quorum will be confirmed.\n" +
  "- Approval/Adoption of the Previous Minutes: if told the previous minutes are unapproved, the " +
  "heading MUST be 'Adoption of the Previous Minutes' and name the previous meeting's date; if " +
  "approved, use 'Approval of the Previous Minutes'.\n" +
  "- Officer Reports: list EVERY officer on the roster, one line each, as 'Title (Name)'. If a written " +
  "report was received, summarise it in 1-3 sentences; otherwise write 'report to be presented'.\n" +
  "- Financial Report: list the Treasurer the same way, including any bank balance provided.\n" +
  "- Correspondence: list the agenda-worthy items provided (sender and subject); omit obvious noise " +
  "(newsletters, product announcements, automated notifications).\n" +
  "- Business Arising: reproduce any unresolved/tabled prior motions verbatim.\n" +
  "- New Business: leave a placeholder line for items raised at the meeting.\n" +
  "- Upcoming Dates: list the calendar events provided with their dates.\n" +
  "- Adjournment.\n" +
  "Never leave a section empty: if a section genuinely has no items, write 'None at this time.' " +
  "Do not use em dashes (the '—' character); use hyphens, colons, or commas instead. " +
  "Output plain text only (no markdown, no bullets other than simple '- ' lines).";

export const MOTION_CHECK_SYSTEM_PROMPT =
  "You reconcile a meeting transcript against the list of formally recorded motions. " +
  "In the transcript, a motion is proposed with language like 'I move that', 'I move to', " +
  "'motion to', 'so moved', or acknowledged with 'seconded' / 'I second'. Identify the motions " +
  "actually moved in the transcript and match them, by MEANING (not exact wording), to the recorded " +
  "motions provided. " +
  "Return ONLY strict JSON, no prose and no markdown, in exactly this shape: " +
  '{"unrecorded": ["short description of each motion moved in the transcript that has no matching recorded motion"], ' +
  '"unspoken": ["the recorded motion text for each recorded motion not reflected anywhere in the transcript"], ' +
  '"matched": <integer count of recorded motions that were matched to the transcript>}. ' +
  "If the transcript contains no motions and there are no recorded motions, return " +
  '{"unrecorded": [], "unspoken": [], "matched": 0}. Be conservative: only list an item under ' +
  "'unrecorded' when the transcript clearly contains a motion, and under 'unspoken' when a recorded " +
  "motion is clearly absent from the discussion.";

export const MINUTES_SYSTEM_PROMPT =
  "You are a parliamentary secretary drafting formal meeting minutes. " +
  "Follow Robert's Rules of Order for minutes format. " +
  "CRITICAL: Do not rephrase, paraphrase, or alter any motion text. " +
  "Reproduce all motions verbatim as provided. " +
  "Use the transcript only for discussion summaries, keeping these brief and factual. " +
  "Do not use em dashes (the '—' character); use hyphens, colons, or commas instead.";
