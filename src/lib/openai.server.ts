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
  "LPC (Liberal Party of Canada) By-law 2 and Robert's Rules of Order. " +
  "Build a formal meeting agenda ONLY from the material provided: in-app officer reports, officer " +
  "reports submitted by email, agenda-worthy correspondence, upcoming calendar dates, and unresolved " +
  "prior motions. Do not invent items and do not editorialize. " +
  "From the correspondence provided, include items an executive would expect to see and omit obvious " +
  "noise (newsletters, automated notifications, spam); when unsure, include it under New Business " +
  "rather than dropping it silently. " +
  "If told the previous minutes are not yet approved, you MUST include an 'Adoption of the Previous " +
  "Minutes' item; if they are approved, use 'Approval of the Previous Minutes' as a formality. " +
  "Use these section headings, each on its own line, in this order: Call to Order; Approval/Adoption " +
  "of the Previous Minutes; Officer Reports (one per reporting officer); Financial Report (if a " +
  "treasurer/financial report is present); Correspondence; Business Arising; New Business; Upcoming " +
  "Dates (from the calendar); Adjournment. Output plain text only, no markdown.";

export const MINUTES_SYSTEM_PROMPT =
  "You are a parliamentary secretary drafting formal meeting minutes. " +
  "Follow Robert's Rules of Order for minutes format. " +
  "CRITICAL: Do not rephrase, paraphrase, or alter any motion text. " +
  "Reproduce all motions verbatim as provided. " +
  "Use the transcript only for discussion summaries — keep these brief and factual.";
