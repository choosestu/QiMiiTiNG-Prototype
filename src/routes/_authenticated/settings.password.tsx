import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";

import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

import { RouteErrorComponent, RouteNotFoundComponent } from "@/components/route-boundaries";

export const Route = createFileRoute("/_authenticated/settings/password")({
  head: () => ({ meta: [{ title: "Set Password — QiMiiTiNG" }] }),
  component: PasswordPage,
  errorComponent: RouteErrorComponent,
  notFoundComponent: RouteNotFoundComponent,
});

function PasswordPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  if (loading) return <p className="p-8 text-sm text-muted-foreground">Loading…</p>;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pw.length < 8) {
      toast.error("Password must be at least 8 characters.");
      return;
    }
    if (pw !== confirm) {
      toast.error("Passwords do not match.");
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: pw });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Password set. You can now sign in with your email and this password.");
    setPw("");
    setConfirm("");
    router.navigate({ to: "/settings" });
  };

  return (
    <div className="mx-auto max-w-md space-y-6 p-6">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => router.navigate({ to: "/settings" })}>
          <ArrowLeft className="mr-1 size-4" /> Settings
        </Button>
        <h1 className="text-2xl font-semibold">Set Password</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Set or change your password</CardTitle>
          <CardDescription>
            {user?.email ? <>Signed in as <span className="font-medium text-foreground">{user.email}</span>. </> : null}
            Choose a password (min 8 characters). After saving, use your email and this password to sign in.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="pw">New password</Label>
              <Input id="pw" type="password" autoComplete="new-password" minLength={8} required value={pw} onChange={(e) => setPw(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="pw2">Confirm password</Label>
              <Input id="pw2" type="password" autoComplete="new-password" minLength={8} required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
            </div>
            <Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save password"}</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
