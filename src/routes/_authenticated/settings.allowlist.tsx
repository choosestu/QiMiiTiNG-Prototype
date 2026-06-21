import { createFileRoute, useRouter, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Trash2, UserPlus } from "lucide-react";

import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { RouteErrorComponent, RouteNotFoundComponent } from "@/components/route-boundaries";

type AppRole = "chair" | "secretary" | "officer";

interface AllowedUser {
  email: string;
  name: string;
  role: AppRole;
  tier: 1 | 2;
  organization_id: string;
}

export const Route = createFileRoute("/_authenticated/settings/allowlist")({
  head: () => ({ meta: [{ title: "Allowed Users — QiMiiTiNG" }] }),
  component: AllowlistPage,
  errorComponent: RouteErrorComponent,
  notFoundComponent: RouteNotFoundComponent,
});

function AllowlistPage() {
  const { profile, isAdmin, loading } = useAuth();
  const router = useRouter();
  const [rows, setRows] = useState<AllowedUser[] | null>(null);
  const [busy, setBusy] = useState(false);

  // form
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<AppRole>("officer");
  const [tier, setTier] = useState<"1" | "2">("2");

  const refresh = async () => {
    const { data, error } = await supabase
      .from("allowed_users")
      .select("email, name, role, tier, organization_id")
      .order("name");
    if (error) toast.error(error.message);
    else setRows(data as AllowedUser[]);
  };

  useEffect(() => {
    if (!profile) return;
    refresh();
  }, [profile]);

  if (loading || !profile) return <p className="p-8 text-sm text-muted-foreground">Loading…</p>;

  if (!isAdmin) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 p-6">
        <h1 className="text-2xl font-semibold">Allowed Users</h1>
        <p className="text-sm text-muted-foreground">
          Only the Chair or Secretary can manage the allowlist.
        </p>
        <Button variant="outline" asChild>
          <Link to="/settings"><ArrowLeft className="mr-1 size-4" /> Back to Settings</Link>
        </Button>
      </div>
    );
  }

  const onAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanEmail = email.trim().toLowerCase();
    const cleanName = name.trim();
    if (!cleanName || !cleanEmail) {
      toast.error("Name and email are required.");
      return;
    }
    setBusy(true);
    const { error } = await supabase.from("allowed_users").insert({
      name: cleanName,
      email: cleanEmail,
      role,
      tier: Number(tier),
      organization_id: profile.organization_id,
    });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`${cleanName} added to the allowlist.`);
    setName("");
    setEmail("");
    setRole("officer");
    setTier("2");
    refresh();
  };

  const onDelete = async (target: AllowedUser) => {
    if (!confirm(`Remove ${target.name} (${target.email}) from the allowlist?`)) return;
    setBusy(true);
    const { error } = await supabase
      .from("allowed_users")
      .delete()
      .eq("email", target.email);
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Removed from allowlist.");
    refresh();
  };

  const onUpdateField = async (
    target: AllowedUser,
    patch: Partial<Pick<AllowedUser, "role" | "tier" | "name">>,
  ) => {
    setBusy(true);
    const { error } = await supabase
      .from("allowed_users")
      .update(patch)
      .eq("email", target.email);
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    refresh();
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => router.navigate({ to: "/settings" })}>
          <ArrowLeft className="mr-1 size-4" /> Settings
        </Button>
        <h1 className="text-2xl font-semibold">Allowed Users</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserPlus className="size-4" /> Add a person
          </CardTitle>
          <CardDescription>
            Only people on this list can sign in. Emails are matched case-insensitively. New users
            are auto-provisioned on first sign-in with the role and tier you set here.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onAdd} className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="al-name">Name</Label>
              <Input id="al-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Jane Doe" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="al-email">Email</Label>
              <Input id="al-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="jane@example.com" />
            </div>
            <div className="space-y-1">
              <Label>Role</Label>
              <Select value={role} onValueChange={(v) => setRole(v as AppRole)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="chair">Chair</SelectItem>
                  <SelectItem value="secretary">Secretary</SelectItem>
                  <SelectItem value="officer">Officer</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Tier</Label>
              <Select value={tier} onValueChange={(v) => setTier(v as "1" | "2")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">Tier 1 (executive)</SelectItem>
                  <SelectItem value="2">Tier 2 (officer)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="sm:col-span-2">
              <Button type="submit" disabled={busy}>Add to allowlist</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Current allowlist</CardTitle>
          <CardDescription>
            {rows ? `${rows.length} ${rows.length === 1 ? "person" : "people"}` : "Loading…"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {rows && rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No one on the allowlist yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Tier</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(rows ?? []).map((r) => (
                    <TableRow key={r.email}>
                      <TableCell className="font-medium">{r.name}</TableCell>
                      <TableCell className="text-muted-foreground">{r.email}</TableCell>
                      <TableCell>
                        <Select
                          value={r.role}
                          onValueChange={(v) => onUpdateField(r, { role: v as AppRole })}
                          disabled={busy}
                        >
                          <SelectTrigger className="h-8 w-[130px]"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="chair">Chair</SelectItem>
                            <SelectItem value="secretary">Secretary</SelectItem>
                            <SelectItem value="officer">Officer</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Select
                          value={String(r.tier)}
                          onValueChange={(v) => onUpdateField(r, { tier: Number(v) as 1 | 2 })}
                          disabled={busy}
                        >
                          <SelectTrigger className="h-8 w-[80px]"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="1">1</SelectItem>
                            <SelectItem value="2">2</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="text-right">
                        {r.email.toLowerCase() === profile.email.toLowerCase() ? (
                          <Badge variant="secondary">You</Badge>
                        ) : (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => onDelete(r)}
                            disabled={busy}
                          >
                            <Trash2 className="size-4 text-destructive" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          <p className="mt-4 text-xs text-muted-foreground">
            Removing someone from the allowlist does not delete their existing account — it only
            prevents new sign-ups with that email.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
