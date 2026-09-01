import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { format } from "date-fns";
import { ArrowLeft, Send } from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

import { RouteErrorComponent, RouteNotFoundComponent } from "@/components/route-boundaries";

export const Route = createFileRoute("/_authenticated/chat")({
  head: () => ({ meta: [{ title: "Chat — QiMiiTiNG" }] }),
  component: ChatPage,
  errorComponent: RouteErrorComponent,
  notFoundComponent: RouteNotFoundComponent,
});

type Message = {
  id: string;
  body: string;
  created_at: string;
  user_id: string;
  user: { name: string } | null;
};

function ChatPage() {
  const { profile, loading } = useAuth();
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const load = useMemo(
    () => async () => {
      const { data, error } = await supabase
        .from("messages")
        .select("id, body, created_at, user_id, user:users(name)")
        .order("created_at", { ascending: true })
        .limit(300);
      if (error) {
        toast.error(error.message);
        return;
      }
      setMessages((data ?? []) as unknown as Message[]);
    },
    [],
  );

  // Initial load + light polling while the page is open.
  useEffect(() => {
    if (!profile) return;
    void load();
    const t = setInterval(() => void load(), 5000);
    return () => clearInterval(t);
  }, [profile, load]);

  // Auto-scroll to newest.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  if (loading || !profile) return <p className="p-8 text-sm text-muted-foreground">Loading…</p>;

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    const body = draft.trim();
    if (!body) return;
    setSending(true);
    const { error } = await supabase.from("messages").insert({
      organization_id: profile.organization_id,
      user_id: profile.id,
      body,
    });
    setSending(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setDraft("");
    void load();
  };

  return (
    <div className="mx-auto flex h-[calc(100vh-3rem)] max-w-3xl flex-col px-4 py-4">
      <div className="flex items-center gap-2 pb-3">
        <Button variant="ghost" size="sm" onClick={() => router.navigate({ to: "/dashboard" })}>
          <ArrowLeft className="mr-1 size-4" /> Dashboard
        </Button>
        <h1 className="font-serif text-2xl">Chat</h1>
        <span className="text-xs text-muted-foreground">· your organization</span>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto rounded-md border border-border bg-muted/20 p-4">
        {messages.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            No messages yet. Say hello 👋
          </p>
        ) : (
          messages.map((m) => {
            const mine = m.user_id === profile.id;
            return (
              <div key={m.id} className={cn("flex flex-col", mine ? "items-end" : "items-start")}>
                <div
                  className={cn(
                    "max-w-[80%] rounded-2xl px-3 py-2 text-sm",
                    mine ? "bg-primary text-primary-foreground" : "bg-card border border-border",
                  )}
                >
                  {!mine && (
                    <p className="mb-0.5 text-xs font-medium text-muted-foreground">
                      {m.user?.name ?? "Member"}
                    </p>
                  )}
                  <p className="whitespace-pre-wrap break-words">{m.body}</p>
                </div>
                <span className="mt-0.5 text-[10px] text-muted-foreground">
                  {format(new Date(m.created_at), "MMM d, h:mm a")}
                </span>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      <form onSubmit={send} className="flex items-center gap-2 pt-3">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Message your organization…"
          maxLength={4000}
          autoComplete="off"
        />
        <Button type="submit" disabled={sending || !draft.trim()}>
          <Send className="size-4" />
        </Button>
      </form>
    </div>
  );
}
