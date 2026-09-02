import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Send, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "@/hooks/use-auth";
import { askAssistant } from "@/lib/assistant.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

import { RouteErrorComponent, RouteNotFoundComponent } from "@/components/route-boundaries";

export const Route = createFileRoute("/_authenticated/assistant")({
  head: () => ({ meta: [{ title: "Assistant — QiMiiTiNG" }] }),
  component: AssistantPage,
  errorComponent: RouteErrorComponent,
  notFoundComponent: RouteNotFoundComponent,
});

type Turn = { role: "user" | "assistant"; content: string; sources?: string[] };

const SUGGESTIONS = [
  "What is quorum for one of our meetings?",
  "How do I amend a motion under Robert's Rules?",
  "What were our most recent motions and how did the votes go?",
  "What open action items do we have?",
];

function AssistantPage() {
  const { profile, loading } = useAuth();
  const router = useRouter();
  const ask = useServerFn(askAssistant);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [turns, busy]);

  if (loading || !profile) return <p className="p-8 text-sm text-muted-foreground">Loading…</p>;

  const submit = async (q: string) => {
    const question = q.trim();
    if (!question || busy) return;
    setDraft("");
    setTurns((t) => [...t, { role: "user", content: question }]);
    setBusy(true);
    try {
      const res = await ask({ data: { question } });
      setTurns((t) => [...t, { role: "assistant", content: res.answer, sources: res.sources }]);
    } catch (e: any) {
      toast.error(e?.message ?? "Assistant failed");
      setTurns((t) => [...t, { role: "assistant", content: "Sorry — I couldn't answer that just now." }]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto flex h-[calc(100vh-3rem)] max-w-3xl flex-col px-4 py-4">
      <div className="flex items-center gap-2 pb-3">
        <Button variant="ghost" size="sm" onClick={() => router.navigate({ to: "/dashboard" })}>
          <ArrowLeft className="mr-1 size-4" /> Dashboard
        </Button>
        <h1 className="flex items-center gap-2 font-serif text-2xl">
          <Sparkles className="size-5 text-primary" /> Assistant
        </h1>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto rounded-md border border-border bg-muted/20 p-4">
        {turns.length === 0 ? (
          <div className="space-y-3 py-6">
            <p className="text-center text-sm text-muted-foreground">
              Ask about parliamentary procedure (Robert's Rules), your governance rules (LPC By-law 2),
              or your own meetings, votes, and tasks.
            </p>
            <div className="mx-auto flex max-w-md flex-col gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => submit(s)}
                  className="rounded-md border border-border bg-card px-3 py-2 text-left text-sm hover:border-primary/40"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          turns.map((t, i) => (
            <div key={i} className={cn("flex flex-col", t.role === "user" ? "items-end" : "items-start")}>
              <div
                className={cn(
                  "max-w-[85%] whitespace-pre-wrap break-words rounded-2xl px-3 py-2 text-sm",
                  t.role === "user" ? "bg-primary text-primary-foreground" : "border border-border bg-card",
                )}
              >
                {t.content}
              </div>
              {t.role === "assistant" && t.sources && t.sources.length > 0 && (
                <span className="mt-1 text-[11px] text-muted-foreground">
                  Sources: {Array.from(new Set(t.sources)).join(", ")}
                </span>
              )}
            </div>
          ))
        )}
        {busy && <p className="text-sm text-muted-foreground">Thinking…</p>}
        <div ref={bottomRef} />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit(draft);
        }}
        className="flex items-center gap-2 pt-3"
      >
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Ask the governance assistant…"
          maxLength={2000}
          autoComplete="off"
          disabled={busy}
        />
        <Button type="submit" disabled={busy || !draft.trim()}>
          <Send className="size-4" />
        </Button>
      </form>
      <p className="pt-2 text-center text-[11px] text-muted-foreground">
        AI can make mistakes. Verify governance decisions against By-law 2 and your officers.
      </p>
    </div>
  );
}
