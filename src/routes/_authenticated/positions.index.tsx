import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Plus, UserPlus } from "lucide-react";

import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RouteErrorComponent, RouteNotFoundComponent } from "@/components/route-boundaries";
import {
  PortalStatusBadge,
  type PortalStatus,
  type PositionCategory,
  ROLE_EMAIL_DOMAIN,
  slugify,
} from "@/lib/positions";

export const Route = createFileRoute("/_authenticated/positions/")({
  head: () => ({
    meta: [
      { title: "Positions — QiMiiTiNG" },
      { name: "description", content: "Directory of executive positions and their portals." },
      { property: "og:title", content: "Positions — QiMiiTiNG" },
      { property: "og:description", content: "Directory of executive positions and their portals." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PositionsPage,
  errorComponent: RouteErrorComponent,
  notFoundComponent: RouteNotFoundComponent,
});

type PositionRow = {
  id: string;
  title: string;
  slug: string;
  role_email: string | null;
  category: string;
  display_order: number;
};

type HolderRow = {
  position_id: string;
  holder_name: string;
  portal_status: PortalStatus;
};

const CATEGORY_LABEL: Record<string, string> = {
  elected_officer: "Elected officer",
  appointed_officer: "Appointed officer",
  director_at_large: "Director at large",
  ex_officio: "Ex officio",
  custom: "Custom",
};

function PositionsPage() {
  const { profile, isAdmin, loading } = useAuth();
  const [positions, setPositions] = useState<PositionRow[] | null>(null);
  const [holders, setHolders] = useState<Record<string, HolderRow>>({});
  const [directorOpen, setDirectorOpen] = useState(false);
  const [customOpen, setCustomOpen] = useState(false);

  const refresh = useCallback(async () => {
    const [{ data: pos, error: pErr }, { data: hold, error: hErr }] = await Promise.all([
      supabase
        .from("positions")
        .select("id, title, slug, role_email, category, display_order")
        .order("display_order", { ascending: true }),
      supabase
        .from("position_holders")
        .select("position_id, holder_name, portal_status")
        .is("term_end", null),
    ]);
    if (pErr) {
      toast.error(pErr.message);
      return;
    }
    if (hErr) toast.error(hErr.message);
    setPositions((pos ?? []) as PositionRow[]);
    const map: Record<string, HolderRow> = {};
    for (const h of (hold ?? []) as HolderRow[]) map[h.position_id] = h;
    setHolders(map);
  }, []);

  useEffect(() => {
    if (profile) void refresh();
  }, [profile, refresh]);

  if (loading || !profile) {
    return <p className="p-8 text-sm text-muted-foreground">Loading…</p>;
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-6 sm:py-8">
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2">
          <Link to="/dashboard">
            <ArrowLeft className="mr-1 h-4 w-4" />
            Dashboard
          </Link>
        </Button>
      </div>

      <header className="grid gap-3 sm:flex sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="font-serif text-2xl sm:text-3xl">Positions</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Each position has its own portal with duties, contacts, handover notes and history.
          </p>
        </div>
        {isAdmin && (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => setDirectorOpen(true)}>
              <UserPlus className="mr-1 h-4 w-4" />
              Add Director
            </Button>
            <Button size="sm" onClick={() => setCustomOpen(true)}>
              <Plus className="mr-1 h-4 w-4" />
              New position
            </Button>
          </div>
        )}
      </header>

      {positions === null ? (
        <p className="text-sm text-muted-foreground">Loading positions…</p>
      ) : positions.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No positions yet.{" "}
            {isAdmin ? "Create the first one above." : "An administrator has not set these up yet."}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {positions.map((p) => {
            const h = holders[p.id];
            return (
              <Link key={p.id} to="/positions/$positionId" params={{ positionId: p.id }} className="block">
                <Card className="h-full transition-colors hover:border-primary/40">
                  <CardHeader className="space-y-2 pb-4">
                    <div className="flex items-start justify-between gap-3">
                      <CardTitle className="text-base">{p.title}</CardTitle>
                      <PortalStatusBadge status={h?.portal_status} />
                    </div>
                    <CardDescription className="space-y-1">
                      <span className="block break-all">{p.role_email ?? "No role email"}</span>
                      <span className="block">
                        {h ? h.holder_name : <span className="italic">No officeholder assigned</span>}
                      </span>
                      <Badge variant="outline" className="mt-1 font-normal">
                        {CATEGORY_LABEL[p.category] ?? p.category}
                      </Badge>
                    </CardDescription>
                  </CardHeader>
                </Card>
              </Link>
            );
          })}
        </div>
      )}

      {isAdmin && (
        <>
          <AddDirectorDialog
            open={directorOpen}
            onOpenChange={setDirectorOpen}
            organizationId={profile.organization_id}
            positions={positions ?? []}
            onCreated={refresh}
          />
          <NewPositionDialog
            open={customOpen}
            onOpenChange={setCustomOpen}
            organizationId={profile.organization_id}
            positions={positions ?? []}
            onCreated={refresh}
          />
        </>
      )}
    </div>
  );
}

function AddDirectorDialog({
  open,
  onOpenChange,
  organizationId,
  positions,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  organizationId: string;
  positions: PositionRow[];
  onCreated: () => Promise<void> | void;
}) {
  const [busy, setBusy] = useState(false);

  const directors = positions.filter((p) => p.category === "director_at_large");
  const highest = directors.reduce((max, p) => {
    const m = /director\s+(\d+)/i.exec(p.title);
    return m ? Math.max(max, Number(m[1])) : max;
  }, 0);
  const next = highest + 1;
  const title = `Director ${next}`;
  const slug = `director-${next}`;
  const roleEmail = `director${next}@${ROLE_EMAIL_DOMAIN}`;
  const displayOrder = positions.reduce((max, p) => Math.max(max, p.display_order), 0) + 1;
  const overCap = directors.length + 1 > 6;

  const create = async () => {
    setBusy(true);
    const { error } = await supabase.from("positions").insert({
      organization_id: organizationId,
      title,
      slug,
      role_email: roleEmail,
      category: "director_at_large",
      default_app_role: "officer",
      display_order: displayOrder,
    });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`${title} created`);
    onOpenChange(false);
    await onCreated();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add {title}</DialogTitle>
          <DialogDescription>Confirm the details before creating this position.</DialogDescription>
        </DialogHeader>
        <dl className="space-y-2 rounded-md border border-border bg-muted/30 p-3 text-sm">
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">Title</dt>
            <dd>{title}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">Role email</dt>
            <dd className="break-all">{roleEmail}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">Access level</dt>
            <dd>Standard access</dd>
          </div>
        </dl>
        {overCap && (
          <p className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
            By-law 2 §4.1(b) allows up to six directors at large — this would be a seventh, confirm
            this is intended.
          </p>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={create} disabled={busy}>
            {busy ? "Creating…" : `Create ${title}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NewPositionDialog({
  open,
  onOpenChange,
  organizationId,
  positions,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  organizationId: string;
  positions: PositionRow[];
  onCreated: () => Promise<void> | void;
}) {
  const [title, setTitle] = useState("");
  const [emailEdited, setEmailEdited] = useState(false);
  const [roleEmail, setRoleEmail] = useState("");
  const [category, setCategory] = useState("custom");
  const [access, setAccess] = useState<"full" | "standard">("standard");
  const [brief, setBrief] = useState("");
  const [busy, setBusy] = useState(false);

  const suggested = title.trim() ? `${slugify(title)}@${ROLE_EMAIL_DOMAIN}` : "";
  const effectiveEmail = emailEdited ? roleEmail : suggested;

  const create = async () => {
    if (!title.trim()) {
      toast.error("Give the position a title.");
      return;
    }
    setBusy(true);
    const displayOrder = positions.reduce((max, p) => Math.max(max, p.display_order), 0) + 1;
    const { error } = await supabase.from("positions").insert({
      organization_id: organizationId,
      title: title.trim(),
      slug: slugify(title),
      role_email: effectiveEmail.trim() || null,
      brief: brief.trim() || null,
      category: category as PositionCategory,
      default_app_role: access === "full" ? "secretary" : "officer",
      display_order: displayOrder,
    });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Position created");
    setTitle("");
    setRoleEmail("");
    setEmailEdited(false);
    setBrief("");
    setCategory("custom");
    setAccess("standard");
    onOpenChange(false);
    await onCreated();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New position</DialogTitle>
          <DialogDescription>Create a position that the by-law does not already name.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="pos-title">Title</Label>
            <Input
              id="pos-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Membership Secretary"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="pos-email">Role email</Label>
            <Input
              id="pos-email"
              value={effectiveEmail}
              onChange={(e) => {
                setEmailEdited(true);
                setRoleEmail(e.target.value);
              }}
              placeholder={`someone@${ROLE_EMAIL_DOMAIN}`}
            />
            <p className="text-xs text-muted-foreground">
              This is a label for now — it does not need to be a working inbox.
            </p>
          </div>
          <div className="space-y-2">
            <Label>Category</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="custom">Custom</SelectItem>
                <SelectItem value="elected_officer">Elected officer</SelectItem>
                <SelectItem value="appointed_officer">Appointed officer</SelectItem>
                <SelectItem value="director_at_large">Director at large</SelectItem>
                <SelectItem value="ex_officio">Ex officio</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Permission level</Label>
            <Select value={access} onValueChange={(v) => setAccess(v as "full" | "standard")}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="full">Full access (Chair/Secretary level)</SelectItem>
                <SelectItem value="standard">Standard access (like other executive positions)</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Per By-law 2 §4.2, additional non-voting positions should be established by Board
              resolution — record the motion in your meeting minutes.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="pos-brief">Brief (optional)</Label>
            <Textarea
              id="pos-brief"
              value={brief}
              onChange={(e) => setBrief(e.target.value)}
              rows={4}
              placeholder="Duties and recurring obligations…"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={create} disabled={busy}>
            {busy ? "Creating…" : "Create position"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
