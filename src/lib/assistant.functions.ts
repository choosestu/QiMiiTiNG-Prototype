import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Governance assistant: retrieval-augmented answer over the shared party canon
// (Constitution, By-law 2, EDA Handbook, Robert's Rules, QiMiiTiNG guidance) plus
// the caller's own organization records (meetings, motions/votes, action items).
export const askAssistant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { question: string }) => data)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const question = String(data.question ?? "").slice(0, 2000).trim();
    if (!question) return { answer: "Please ask a question.", sources: [] as string[] };

    await supabase.from("users").select("organization_id").eq("id", userId).maybeSingle();

    const [canonRes, meetingsRes, motionsRes, actionsRes] = await Promise.all([
      supabase.rpc("match_canon", { q: question }),
      supabase
        .from("meetings")
        .select("title, meeting_date, status")
        .order("meeting_date", { ascending: false })
        .limit(8),
      supabase
        .from("motions")
        .select("motion_text, result, vote_for, vote_against, vote_abstain, meetings(title, meeting_date)")
        .order("created_at", { ascending: false })
        .limit(15),
      supabase
        .from("action_items")
        .select("description, status, due_date")
        .order("created_at", { ascending: false })
        .limit(15),
    ]);

    const canon = (canonRes.data ?? []) as { title: string; slug: string; snippet: string }[];
    const meetings = (meetingsRes.data ?? []) as { title: string; meeting_date: string; status: string }[];
    const motions = (motionsRes.data ?? []) as unknown as {
      motion_text: string;
      result: string | null;
      vote_for: number;
      vote_against: number;
      vote_abstain: number;
      meetings: { title: string; meeting_date: string } | null;
    }[];
    const actions = (actionsRes.data ?? []) as { description: string; status: string; due_date: string | null }[];

    const canonText = canon.length
      ? canon.map((c) => `[${c.title}]\n${c.snippet}`).join("\n\n")
      : "(no matching reference passages)";
    const meetingsText = meetings.length
      ? meetings.map((m) => `- ${m.meeting_date}: ${m.title} (${m.status})`).join("\n")
      : "(none)";
    const motionsText = motions.length
      ? motions
          .map(
            (m) =>
              `- "${m.motion_text}" -> ${m.result ?? "no result"} (for ${m.vote_for} / against ${m.vote_against} / abstain ${m.vote_abstain})${m.meetings ? ` [${m.meetings.meeting_date}]` : ""}`,
          )
          .join("\n")
      : "(none)";
    const actionsText = actions.length
      ? actions.map((a) => `- [${a.status}] ${a.description}${a.due_date ? ` (due ${a.due_date})` : ""}`).join("\n")
      : "(none)";

    const system =
      "You are QiMiiTiNG's governance assistant for a Liberal Party of Canada Electoral District Association (EDA). " +
      "Answer using ONLY the reference excerpts and the organization's own records provided below. " +
      "Ground procedural answers in Robert's Rules and LPC By-law 2, and name the source you used " +
      "(e.g., 'By-law 2', 'Robert's Rules', or 'your records'). " +
      "For questions about previous votes or tasks, use the organization's records. " +
      "If the material provided doesn't cover the question, say so plainly and suggest asking the Chair/Secretary " +
      "or consulting the LPC — do not invent rules or give legal advice beyond the documents.";

    const user =
      `QUESTION:\n${question}\n\n` +
      `REFERENCE EXCERPTS (party canon / Robert's Rules / QiMiiTiNG guidance):\n${canonText}\n\n` +
      `YOUR ORGANIZATION'S RECENT MEETINGS:\n${meetingsText}\n\n` +
      `RECENT MOTIONS & VOTES:\n${motionsText}\n\n` +
      `ACTION ITEMS (TASKS):\n${actionsText}`;

    const { openaiChat } = await import("@/lib/openai.server");
    const answer = await openaiChat({ system, user, temperature: 0.2 });
    return { answer, sources: canon.map((c) => c.title) };
  });
