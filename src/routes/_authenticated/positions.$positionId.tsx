import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useState } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import { ArrowLeft, Mail, Plus, Trash2, UserCog } from "lucide-react";

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
import { PortalStatusBadge, type PortalStatus } from "@/lib/positions";
import { sendPositionInvite } from "@/lib/positions.functions";

export const Route = createFileRoute("/_authenticated/positions/$positionId")({
  head: () => ({
    meta: [
      { title: "Position portal — QiMiiTiNG" },
      { name: "description", content: "Duties, contacts, handover notes and history for this position." },
      { property: "og:title", content: "Position portal — QiMiiTiNG" },
      {
        property: "og:description",
        content: "Duties, contacts, handover notes and history for this position.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PositionPortalPage,
  errorComponent: RouteErrorComponent,
  notFoundComponent: RouteNotFoundComponent,
});

type Position = {
  id: string;
  title: string;
  role_email: string | null;
  brief: string | null;
  category: string;
};

type Holder = {
  id: string;
  holder_name: string;
  forwarding_email: string | null;
  phone: string | null;
  current_login_user_id: string | null;
  term_start: string;
  term_end: string | null;
  portal_status: PortalStatus;
  assigned_via: string;
};

type Contact = {
  id: string;
  name: string;
  org_affiliation: string | null;
  email: string | null;
  phone: string | null;
  notes: string | null;
};

type Note = {
  id: string;
  note_text: string;
  author_name: string | null;
  created_at: string;
};

type ActionItem = {
  id: string;
  description: string;
  status: "open" | "carried_forward" | "done";
  due_date: string | null;
};

type Correspondence = {
  id: string;
  direction: "inbound" | "outbound";
  counterparty: string | null;
  subject: string;
  body: string | null;
  occurred_at: string;
};

const ASSIGNED_VIA_LABEL: Record<string, string> = {
  initial_setup: "Initial setup",
  agm_election: "Elected at AGM",
  board_appointment: "Board appointment",
  manual: "Manual assignment",
};

function fmt(value: string) {
  return format(new Date(value), "PP");
}

function PositionPortalPage() {
  const { positionId } = Route.useParams();
  const { profile, isAdmin, loading } = useAuth();

  const [position, setPosition] = useState<Position | null>(null);
  const [holders, setHolders] = useState<Holder[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [items, setItems] = useState<ActionItem[]>([]);
  const [letters, setLetters] = useState<Correspondence[]>([]);
  const [ready, setReady] = useState(false);

  const refresh = useCallback(async () => {
    const [pos, hold, con, not, act] = await Promise.all([
      supabase.from("positions").select("id, title, role_email, brief, category").eq("id", positionId).maybeSingle(),
      supabase
        .from("position_holders")
        .select("id, holder_name, forwarding_email, phone, current_login_user_id, term_start, term_end, portal_status, assigned_via")
        .eq("position_id", positionId)
        .order("term_start", { ascending: false }),
      supabase
        .from("position_contacts")
        .select("id, name, org_affiliation, email, phone, notes")
        .eq("position_id", positionId)
        .order("name"),
      supabase
        .from("position_handover_notes")
        .select("id, note_text, author_name, created_at")
        .eq("position_id", positionId)
        .order("created_at", { ascending: false }),
      supabase
        .from("action_items")
        .select("id, description, status, due_date")
        .eq("position_id", positionId)
        .order("created_at", { ascending: false }),
    ]);
    if (pos.error) toast.error(pos.error.message);
    setPosition((pos.data ?? null) as Position | null);
    setHolders((hold.data ?? []) as Holder[]);
    setContacts((con.data ?? []) as Contact[]);
    setNotes((not.data ?? []) as Note[]);
    setItems((act.data ?? []) as ActionItem[]);
    if (isAdmin) {
      const { data } = await supabase
        .from("correspondence")
        .select("id, direction, counterparty, subject, body, occurred_at")
        .eq("position_id", positionId)
        .order("occurred_at", { ascending: false });
      setLetters((data ?? []) as Correspondence[]);
    }
    setReady(true);
  }, [positionId, isAdmin]);

  useEffect(() => {
    if (profile) void refresh();
  }, [profile, refresh]);

  if (loading || !profile || !ready) {
    return <p className="p-8 text-sm text-muted-foreground">Loading…</p>;
  }

  if (!position) {
    return (
      <div className="mx-auto max-w-3xl space-y-3 p-8">
        <h1 className="font-serif text-2xl">Position not found</h1>
        <p className="text-sm text-muted-foreground">
          This position does not exist, or it belongs to another organisation.
        </p>
        <Button variant="outline" size="sm" asChild>
          <Link to="/positions">Back to positions</Link>
        </Button>
      </div>
    );
  }

  const current = holders.find((h) => h.term_end === null) ?? null;
  const past = holders.filter((h) => h.term_end !== null);
  const isHolder = !!current && current.current_login_user_id === profile.id;
  const canEditPortal = isAdmin || isHolder;

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-6 sm:py-8">
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2">
          <Link to="/positions">
            <ArrowLeft className="mr-1 h-4 w-4" />
            Positions
          </Link>
        </Button>
      </div>

      <header className="grid gap-3 sm:flex sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1">
          <h1 className="font-serif text-2xl sm:text-3xl">{position.title}</h1>
          {position.role_email && (
            <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Mail className="h-3.5 w-3.5" />
              <span className="break-all">{position.role_email}</span>
            </p>
          )}
          <p className="text-sm">
            {current ? (
              <>
                Held by <span className="font-medium">{current.holder_name}</span> since{" "}
                {fmt(current.term_start)}
              </>
            ) : (
              <span className="italic text-muted-foreground">Currently vacant</span>
            )}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <PortalStatusBadge status={current?.portal_status} />
          {isAdmin && current && current.forwarding_email && !current.current_login_user_id && (
            <InviteButton holderId={current.id} />
          )}
          {isAdmin && <ReassignDialog positionId={position.id} current={current} onDone={refresh} />}
        </div>
      </header>

      <BriefCard position={position} canEdit={isAdmin} onSaved={refresh} />

      <ContactsCard
        positionId={position.id}
        organizationId={profile.organization_id}
        contacts={contacts}
        canEdit={canEditPortal}
        onChanged={refresh}
      />

      <HandoverCard
        positionId={position.id}
        organizationId={profile.organization_id}
        authorId={profile.id}
        authorName={profile.name}
        notes={notes}
        canAdd={canEditPortal}
        onChanged={refresh}
      />

      <ActionItemsCard
        positionId={position.id}
        organizationId={profile.organization_id}
        items={items}
        isAdmin={isAdmin}
        canUpdate={canEditPortal}
        onChanged={refresh}
      />

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="font-serif text-lg">History</CardTitle>
          <CardDescription>Previous officeholders and how they were assigned.</CardDescription>
        </CardHeader>
        <CardContent>
          {past.length === 0 ? (
            <p className="text-sm text-muted-foreground">No previous officeholders recorded.</p>
          ) : (
            <ul className="space-y-3">
              {past.map((h) => (
                <li key={h.id} className="border-l-2 border-border pl-3 text-sm">
                  <p className="font-medium">{h.holder_name}</p>
                  <p className="text-muted-foreground">
                    {fmt(h.term_start)} – {h.term_end ? fmt(h.term_end) : "present"} ·{" "}
                    {ASSIGNED_VIA_LABEL[h.assigned_via] ?? h.assigned_via}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {isAdmin && (
        <CorrespondenceCard
          positionId={position.id}
          organizationId={profile.organization_id}
          letters={letters}
          onChanged={refresh}
        />
      )}
    </div>
  );
}

function BriefCard({
  position,
  canEdit,
  onSaved,
}: {
  position: Position;
  canEdit: boolean;
  onSaved: () => Promise<void> | void;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(position.brief ?? "");
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    const { error } = await supabase
      .from("positions")
      .update({ brief: text.trim() || null })
      .eq("id", position.id);
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Brief updated");
    setEditing(false);
    await onSaved();
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0 pb-3">
        <div>
          <CardTitle className="font-serif text-lg">Brief</CardTitle>
          <CardDescription>Duties and recurring obligations for this position.</CardDescription>
        </div>
        {canEdit && !editing && (
          <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
            Edit
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {editing ? (
          <div className="space-y-3">
            <Textarea rows={8} value={text} onChange={(e) => setText(e.target.value)} />
            <div className="flex gap-2">
              <Button size="sm" onClick={save} disabled={busy}>
                {busy ? "Saving…" : "Save brief"}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setText(position.brief ?? "");
                  setEditing(false);
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : position.brief ? (
          <p className="whitespace-pre-wrap text-sm leading-relaxed">{position.brief}</p>
        ) : (
          <p className="text-sm text-muted-foreground">
            No brief recorded yet{canEdit ? " — add one so the next officeholder knows the duties." : "."}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function ContactsCard({
  positionId,
  organizationId,
  contacts,
  canEdit,
  onChanged,
}: {
  positionId: string;
  organizationId: string;
  contacts: Contact[];
  canEdit: boolean;
  onChanged: () => Promise<void> | void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [org, setOrg] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  const add = async () => {
    if (!name.trim()) {
      toast.error("Contact name is required.");
      return;
    }
    setBusy(true);
    const { error } = await supabase.from("position_contacts").insert({
      position_id: positionId,
      organization_id: organizationId,
      name: name.trim(),
      org_affiliation: org.trim() || null,
      email: email.trim() || null,
      phone: phone.trim() || null,
      notes: notes.trim() || null,
    });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Contact added");
    setName("");
    setOrg("");
    setEmail("");
    setPhone("");
    setNotes("");
    setOpen(false);
    await onChanged();
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from("position_contacts").delete().eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    await onChanged();
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0 pb-3">
        <div>
          <CardTitle className="font-serif text-lg">Contacts</CardTitle>
          <CardDescription>External people this position deals with.</CardDescription>
        </div>
        {canEdit && (
          <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
            <Plus className="mr-1 h-4 w-4" />
            Add
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {contacts.length === 0 ? (
          <p className="text-sm text-muted-foreground">No contacts recorded.</p>
        ) : (
          <ul className="divide-y divide-border">
            {contacts.map((c) => (
              <li key={c.id} className="flex items-start justify-between gap-3 py-3 text-sm">
                <div className="min-w-0">
                  <p className="font-medium">
                    {c.name}
                    {c.org_affiliation && (
                      <span className="font-normal text-muted-foreground"> · {c.org_affiliation}</span>
                    )}
                  </p>
                  <p className="break-all text-muted-foreground">
                    {[c.email, c.phone].filter(Boolean).join(" · ") || "No contact details"}
                  </p>
                  {c.notes && <p className="mt-1 whitespace-pre-wrap text-muted-foreground">{c.notes}</p>}
                </div>
                {canEdit && (
                  <Button variant="ghost" size="icon" onClick={() => remove(c.id)} aria-label="Remove contact">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add contact</DialogTitle>
            <DialogDescription>Kept with the position, not with the person holding it.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="c-name">Name</Label>
              <Input id="c-name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="c-org">Organisation</Label>
              <Input id="c-org" value={org} onChange={(e) => setOrg(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="c-email">Email</Label>
              <Input id="c-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="c-phone">Phone</Label>
              <Input id="c-phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="c-notes">Notes</Label>
              <Textarea id="c-notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={add} disabled={busy}>
              {busy ? "Saving…" : "Add contact"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function HandoverCard({
  positionId,
  organizationId,
  authorId,
  authorName,
  notes,
  canAdd,
  onChanged,
}: {
  positionId: string;
  organizationId: string;
  authorId: string;
  authorName: string;
  notes: Note[];
  canAdd: boolean;
  onChanged: () => Promise<void> | void;
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  const add = async () => {
    if (!text.trim()) return;
    setBusy(true);
    const { error } = await supabase.from("position_handover_notes").insert({
      position_id: positionId,
      organization_id: organizationId,
      author_user_id: authorId,
      author_name: authorName,
      note_text: text.trim(),
    });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setText("");
    toast.success("Note added to the record");
    await onChanged();
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="font-serif text-lg">Handover notes</CardTitle>
        <CardDescription>
          Permanent record — notes cannot be edited or deleted once added.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {canAdd && (
          <div className="space-y-2">
            <Textarea
              rows={3}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Something the next officeholder should know…"
            />
            <Button size="sm" onClick={add} disabled={busy || !text.trim()}>
              {busy ? "Adding…" : "Add note"}
            </Button>
          </div>
        )}
        {notes.length === 0 ? (
          <p className="text-sm text-muted-foreground">No handover notes yet.</p>
        ) : (
          <ol className="space-y-3">
            {notes.map((n) => (
              <li key={n.id} className="border-l-2 border-primary/30 pl-3 text-sm">
                <p className="whitespace-pre-wrap leading-relaxed">{n.note_text}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {n.author_name ?? "Unknown"} · {format(new Date(n.created_at), "PPp")}
                </p>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}

function ActionItemsCard({
  positionId,
  organizationId,
  items,
  isAdmin,
  canUpdate,
  onChanged,
}: {
  positionId: string;
  organizationId: string;
  items: ActionItem[];
  isAdmin: boolean;
  canUpdate: boolean;
  onChanged: () => Promise<void> | void;
}) {
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);

  const add = async () => {
    if (!description.trim()) return;
    setBusy(true);
    const { error } = await supabase.from("action_items").insert({
      organization_id: organizationId,
      position_id: positionId,
      description: description.trim(),
    });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setDescription("");
    await onChanged();
  };

  const setStatus = async (id: string, status: ActionItem["status"]) => {
    const { error } = await supabase.from("action_items").update({ status }).eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    await onChanged();
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="font-serif text-lg">Action items</CardTitle>
        <CardDescription>Tasks assigned to this position.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isAdmin && (
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="New action item…"
            />
            <Button size="sm" onClick={add} disabled={busy || !description.trim()}>
              Add
            </Button>
          </div>
        )}
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">No action items.</p>
        ) : (
          <ul className="divide-y divide-border">
            {items.map((it) => (
              <li key={it.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                <div className="min-w-0">
                  <p className={it.status === "done" ? "text-muted-foreground line-through" : ""}>
                    {it.description}
                  </p>
                  {it.due_date && (
                    <p className="text-xs text-muted-foreground">Due {fmt(it.due_date)}</p>
                  )}
                </div>
                {canUpdate ? (
                  <Select value={it.status} onValueChange={(v) => setStatus(it.id, v as ActionItem["status"])}>
                    <SelectTrigger className="w-[170px] shrink-0">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="open">Open</SelectItem>
                      <SelectItem value="carried_forward">Carried forward</SelectItem>
                      <SelectItem value="done">Done</SelectItem>
                    </SelectContent>
                  </Select>
                ) : (
                  <Badge variant="secondary" className="shrink-0 font-normal">
                    {it.status.replace("_", " ")}
                  </Badge>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function CorrespondenceCard({
  positionId,
  organizationId,
  letters,
  onChanged,
}: {
  positionId: string;
  organizationId: string;
  letters: Correspondence[];
  onChanged: () => Promise<void> | void;
}) {
  const [open, setOpen] = useState(false);
  const [direction, setDirection] = useState<"inbound" | "outbound">("inbound");
  const [counterparty, setCounterparty] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);

  const add = async () => {
    if (!subject.trim()) {
      toast.error("A subject is required.");
      return;
    }
    setBusy(true);
    const { error } = await supabase.from("correspondence").insert({
      organization_id: organizationId,
      position_id: positionId,
      direction,
      counterparty: counterparty.trim() || null,
      subject: subject.trim(),
      body: body.trim() || null,
    });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setCounterparty("");
    setSubject("");
    setBody("");
    setOpen(false);
    await onChanged();
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0 pb-3">
        <div>
          <CardTitle className="font-serif text-lg">Correspondence</CardTitle>
          <CardDescription>Visible to Chairs and Secretaries only.</CardDescription>
        </div>
        <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
          <Plus className="mr-1 h-4 w-4" />
          Record
        </Button>
      </CardHeader>
      <CardContent>
        {letters.length === 0 ? (
          <p className="text-sm text-muted-foreground">No correspondence recorded.</p>
        ) : (
          <ul className="divide-y divide-border">
            {letters.map((l) => (
              <li key={l.id} className="space-y-1 py-3 text-sm">
                <div className="flex items-start justify-between gap-3">
                  <p className="font-medium">{l.subject}</p>
                  <Badge variant="outline" className="shrink-0 font-normal">
                    {l.direction === "inbound" ? "Received" : "Sent"}
                  </Badge>
                </div>
                <p className="text-muted-foreground">
                  {[l.counterparty, format(new Date(l.occurred_at), "PP")].filter(Boolean).join(" · ")}
                </p>
                {l.body && <p className="whitespace-pre-wrap text-muted-foreground">{l.body}</p>}
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Record correspondence</DialogTitle>
            <DialogDescription>Keep a note of letters and emails for this position.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label>Direction</Label>
              <Select value={direction} onValueChange={(v) => setDirection(v as "inbound" | "outbound")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="inbound">Received</SelectItem>
                  <SelectItem value="outbound">Sent</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="l-party">Counterparty</Label>
              <Input id="l-party" value={counterparty} onChange={(e) => setCounterparty(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="l-subject">Subject</Label>
              <Input id="l-subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="l-body">Summary</Label>
              <Textarea id="l-body" rows={4} value={body} onChange={(e) => setBody(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={add} disabled={busy}>
              {busy ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function InviteButton({ holderId }: { holderId: string }) {
  const invite = useServerFn(sendPositionInvite);
  const [busy, setBusy] = useState(false);
  return (
    <Button
      variant="secondary"
      size="sm"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          const r = await invite({ data: { positionHolderId: holderId } });
          toast.success(`Invitation sent to ${r.sentTo}`);
        } catch (e: any) {
          const m = String(e?.message ?? e);
          toast.error(m.includes("not connected") ? "Connect Google in Settings first." : m);
        } finally {
          setBusy(false);
        }
      }}
    >
      <Mail className="mr-1 h-4 w-4" /> {busy ? "Sending…" : "Send invitation"}
    </Button>
  );
}

function ReassignDialog({
  positionId,
  current,
  onDone,
}: {
  positionId: string;
  current: Holder | null;
  onDone: () => Promise<void> | void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const invite = useServerFn(sendPositionInvite);

  const submit = async () => {
    if (!name.trim()) {
      toast.error("Enter the new officeholder's name.");
      return;
    }
    setBusy(true);
    const { data: newHolderId, error } = await supabase.rpc("reassign_position", {
      _position_id: positionId,
      _holder_name: name.trim(),
      _forwarding_email: email.trim(),
      _phone: phone.trim(),
    });
    if (error) {
      setBusy(false);
      toast.error(error.message);
      return;
    }
    toast.success("Position reassigned");
    // Automatically email the new officeholder access + setup instructions.
    if (email.trim() && newHolderId) {
      try {
        const r = await invite({ data: { positionHolderId: newHolderId as string } });
        toast.success(`Invitation emailed to ${r.sentTo}`);
      } catch (e: any) {
        toast.error("Assigned, but the invitation email failed: " + String(e?.message ?? e));
      }
    }
    setBusy(false);
    setName("");
    setEmail("");
    setPhone("");
    setOpen(false);
    await onDone();
  };

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <UserCog className="mr-1 h-4 w-4" />
        {current ? "Reassign" : "Assign holder"}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{current ? "Reassign position" : "Assign officeholder"}</DialogTitle>
            <DialogDescription>
              {current
                ? `This ends ${current.holder_name}'s term now and starts a new term. Their portal access is closed; the new officeholder starts as invitation pending.`
                : "Start a new term for this position. The new officeholder starts as invitation pending."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="r-name">Officeholder name</Label>
              <Input id="r-name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="r-email">Forwarding email</Label>
              <Input id="r-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="r-phone">Phone</Label>
              <Input id="r-phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={busy}>
              {busy ? "Saving…" : "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
