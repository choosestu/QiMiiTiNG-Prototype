import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { ArrowLeft, ExternalLink, FileText, Mail, Search } from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "@/hooks/use-auth";
import { searchWorkspace } from "@/lib/google.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

import { RouteErrorComponent, RouteNotFoundComponent } from "@/components/route-boundaries";

export const Route = createFileRoute("/_authenticated/workspace")({
  head: () => ({ meta: [{ title: "Workspace search — QiMiiTiNG" }] }),
  validateSearch: (search: Record<string, unknown>): { q?: string } => ({
    q: typeof search.q === "string" ? search.q : undefined,
  }),
  component: WorkspacePage,
  errorComponent: RouteErrorComponent,
  notFoundComponent: RouteNotFoundComponent,
});

type DriveResult = {
  id: string;
  name: string;
  link: string;
  mimeType: string;
  modifiedTime: string;
};
type GmailResult = {
  id: string;
  subject: string;
  from: string;
  date: string;
  snippet: string;
  link: string;
};

function WorkspacePage() {
  const { profile, isAdmin, loading } = useAuth();
  const router = useRouter();
  const { q } = Route.useSearch();
  const run = useServerFn(searchWorkspace);

  const [query, setQuery] = useState(q ?? "");
  const [busy, setBusy] = useState(false);
  const [ran, setRan] = useState(false);
  const [drive, setDrive] = useState<DriveResult[]>([]);
  const [gmail, setGmail] = useState<GmailResult[]>([]);

  const doSearch = async (term: string) => {
    const t = term.trim();
    if (!t) return;
    setBusy(true);
    setRan(true);
    try {
      const r = await run({ data: { query: t } });
      setDrive(r.drive as DriveResult[]);
      setGmail(r.gmail as GmailResult[]);
    } catch (e: any) {
      const msg = String(e?.message ?? e);
      if (msg.includes("not connected") || msg.toLowerCase().includes("scope"))
        toast.error("Reconnect Google in Settings to grant read access to Drive and Gmail.");
      else toast.error(msg);
      setDrive([]);
      setGmail([]);
    } finally {
      setBusy(false);
    }
  };

  // Run automatically when arriving with a prefilled ?q= (e.g. Agenda / Minutes buttons).
  useEffect(() => {
    if (profile && q && q.trim()) void doSearch(q);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile, q]);

  if (loading || !profile) return <p className="p-8 text-sm text-muted-foreground">Loading…</p>;
  if (!isAdmin)
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <h2 className="font-serif text-xl">Not available</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Workspace search is available to the Chair and Secretary.
        </p>
      </div>
    );

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    router.navigate({ to: "/workspace", search: { q: query.trim() || undefined } });
    void doSearch(query);
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-6 sm:py-8">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => router.history.back()}>
          <ArrowLeft className="mr-1 size-4" /> Back
        </Button>
        <h1 className="font-serif text-2xl sm:text-3xl">Workspace search</h1>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Search Drive and Gmail</CardTitle>
          <CardDescription>
            Searches everything in the connected communications@oshawaliberals.ca account — prior
            agendas, minutes, and related correspondence.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="flex gap-2">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="e.g. agenda, minutes, budget, a person's name"
              autoFocus
            />
            <Button type="submit" disabled={busy || !query.trim()}>
              <Search className="mr-1 size-4" /> {busy ? "Searching…" : "Search"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {ran && (
        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <FileText className="size-4" /> Drive files
                <span className="text-xs font-normal text-muted-foreground">({drive.length})</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {drive.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {busy ? "Searching…" : "No matching Drive files."}
                </p>
              ) : (
                drive.map((f) => (
                  <a
                    key={f.id}
                    href={f.link}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-start gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm hover:border-primary/40"
                  >
                    <ExternalLink className="mt-0.5 size-3 shrink-0 text-primary" />
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{f.name}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {f.modifiedTime ? new Date(f.modifiedTime).toLocaleDateString() : ""}
                      </span>
                    </span>
                  </a>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Mail className="size-4" /> Gmail
                <span className="text-xs font-normal text-muted-foreground">({gmail.length})</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {gmail.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {busy ? "Searching…" : "No matching messages."}
                </p>
              ) : (
                gmail.map((m) => (
                  <a
                    key={m.id}
                    href={m.link}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-start gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm hover:border-primary/40"
                  >
                    <ExternalLink className="mt-0.5 size-3 shrink-0 text-primary" />
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{m.subject || "(no subject)"}</span>
                      <span className="block truncate text-xs text-muted-foreground">{m.from}</span>
                      <span className="block truncate text-xs text-muted-foreground">{m.snippet}</span>
                    </span>
                  </a>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
