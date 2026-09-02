import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { format } from "date-fns";
import { ArrowLeft, Send, Users } from "lucide-react";
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
  recipient_id: string | null;
};
type Member = { id: string; name: string };
// "group" = org-wide channel; otherwise a member id for a 1:1 DM.
type Conversation = "group" | string;

function ChatPage() {
  const { profile, loading } = useAuth();
  const router = useRouter();
  const [members, setMembers] = useState<Member[]>([]);
  const [positionOf, setPositionOf] = useState<Map<string, string>>(new Map());
  const [messages, setMessages] = useState<Message[]>([]);
  const [active, setActive] = useState<Conversation>("group");
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const nameOf = useMemo(() => {
    const map = new Map(members.map((m) => [m.id, m.name]));
    if (profile) map.set(profile.id, profile.name);
    return (id: string) => map.get(id) ?? "Member";
  }, [members, profile]);

  const load = useMemo(
    () => async () => {
      const { data, error } = await supabase
        .from("messages")
        .select("id, body, created_at, user_id, recipient_id")
        .order("created_at", { ascending: true })
        .limit(500);
      if (error) {
        toast.error(error.message);
        return;
      }
      setMessages((data ?? []) as unknown as Message[]);
    },
    [],
  );

  useEffect(() => {
    if (!profile) return;
    supabase
      .from("users")
      .select("id, name")
      .order("name")
      .then(({ data }) => setMembers(((data ?? []) as Member[]).filter((m) => m.id !== profile.id)));
    // Map each current position-holder to their position title (positions persist
    // across AGMs even as the person filling them changes).
    supabase
      .from("position_holders")
      .select("current_login_user_id, positions(title)")
      .is("term_end", null)
      .then(({ data }) => {
        const map = new Map<string, string>();
        for (const row of (data ?? []) as unknown as { current_login_user_id: string | null; positions: { title: string } | null }[]) {
          const uid = row.current_login_user_id;
          const title = row.positions?.title;
          if (uid && title) map.set(uid, map.has(uid) ? `${map.get(uid)}, ${title}` : title);
        }
        setPositionOf(map);
      });
    void load();
    const t = setInterval(() => void load(), 5000);
    return () => clearInterval(t);
  }, [profile, load]);

  const shown = useMemo(() => {
    if (!profile) return [];
    if (active === "group") return messages.filter((m) => m.recipient_id === null);
    return messages.filter(
      (m) =>
        (m.user_id === profile.id && m.recipient_id === active) ||
        (m.user_id === active && m.recipient_id === profile.id),
    );
  }, [messages, active, profile]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [shown]);

  if (loading || !profile) return <p className="p-8 text-sm text-muted-foreground">Loading…</p>;

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    const body = draft.trim();
    if (!body) return;
    setSending(true);
    const { error } = await supabase.from("messages").insert({
      organization_id: profile.organization_id,
      user_id: profile.id,
      recipient_id: active === "group" ? null : active,
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

  const title =
    active === "group"
      ? "Group — your organization"
      : positionOf.get(active)
        ? `${nameOf(active)} · ${positionOf.get(active)}`
        : nameOf(active);

  return (
    <div className="mx-auto flex h-[calc(100vh-3rem)] max-w-4xl flex-col px-4 py-4">
      <div className="flex items-center gap-2 pb-3">
        <Button variant="ghost" size="sm" onClick={() => router.navigate({ to: "/dashboard" })}>
          <ArrowLeft className="mr-1 size-4" /> Dashboard
        </Button>
        <h1 className="font-serif text-2xl">Chat</h1>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-[9rem_minmax(0,1fr)] gap-3 sm:grid-cols-[13rem_minmax(0,1fr)]">
        {/* Conversation list */}
        <div className="min-h-0 space-y-1 overflow-y-auto rounded-md border border-border p-2">
          <button
            onClick={() => setActive("group")}
            className={cn(
              "flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm",
              active === "group" ? "bg-primary text-primary-foreground" : "hover:bg-muted",
            )}
          >
            <Users className="size-4 shrink-0" /> <span className="truncate">Group</span>
          </button>
          <p className="px-2 pt-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Direct messages
          </p>
          {members.map((m) => (
            <button
              key={m.id}
              onClick={() => setActive(m.id)}
              className={cn(
                "block w-full rounded-md px-2 py-2 text-left text-sm",
                active === m.id ? "bg-primary text-primary-foreground" : "hover:bg-muted",
              )}
            >
              <span className="block truncate">{m.name}</span>
              {positionOf.get(m.id) && (
                <span
                  className={cn(
                    "block truncate text-[11px]",
                    active === m.id ? "text-primary-foreground/80" : "text-muted-foreground",
                  )}
                >
                  {positionOf.get(m.id)}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Active conversation */}
        <div className="flex min-h-0 flex-col">
          <div className="pb-2 text-sm font-medium">{title}</div>
          <div className="flex-1 space-y-3 overflow-y-auto rounded-md border border-border bg-muted/20 p-4">
            {shown.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">
                {active === "group" ? "No messages yet. Say hello 👋" : "No messages yet — start the conversation."}
              </p>
            ) : (
              shown.map((m) => {
                const mine = m.user_id === profile.id;
                return (
                  <div key={m.id} className={cn("flex flex-col", mine ? "items-end" : "items-start")}>
                    <div
                      className={cn(
                        "max-w-[80%] rounded-2xl px-3 py-2 text-sm",
                        mine ? "bg-primary text-primary-foreground" : "border border-border bg-card",
                      )}
                    >
                      {!mine && active === "group" && (
                        <p className="mb-0.5 text-xs font-medium text-muted-foreground">{nameOf(m.user_id)}</p>
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
              placeholder={active === "group" ? "Message your organization…" : `Message ${nameOf(active)}…`}
              maxLength={4000}
              autoComplete="off"
            />
            <Button type="submit" disabled={sending || !draft.trim()}>
              <Send className="size-4" />
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
