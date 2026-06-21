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
  "You are a parliamentary procedure assistant for a volunteer political organization. " +
  "Generate a formal meeting agenda in accordance with Robert's Rules of Order. " +
  "The organization follows LPC (Liberal Party of Canada) By-law 2 for meeting procedures. " +
  "Required notice period: 72 hours. Quorum: 3 of 5 named officers must be present. " +
  "Do not add items not present in the officer reports. Do not editorialize. " +
  "Format: [Call to Order] [Approval of Previous Minutes] [Officer Reports — one per officer] " +
  "[Business Arising] [New Business] [Adjournment]";

export const MINUTES_SYSTEM_PROMPT =
  "You are a parliamentary secretary drafting formal meeting minutes. " +
  "Follow Robert's Rules of Order for minutes format. " +
  "CRITICAL: Do not rephrase, paraphrase, or alter any motion text. " +
  "Reproduce all motions verbatim as provided. " +
  "Use the transcript only for discussion summaries — keep these brief and factual.";
