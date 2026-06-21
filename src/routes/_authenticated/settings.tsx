import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, CheckCircle2, ExternalLink } from "lucide-react";

import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  getGoogleStatus,
  startGoogleConnect,
  disconnectGoogle,
} from "@/lib/google.functions";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({ meta: [{ title: "Settings — QiMiiTiNG" }] }),
  component: SettingsPage,
});

function SettingsPage() {
  const { profile, isAdmin, loading } = useAuth();
  const router = useRouter();
  const fetchStatus = useServerFn(getGoogleStatus);
  const connect = useServerFn(startGoogleConnect);
  const disconnect = useServerFn(disconnectGoogle);

  const [status, setStatus] = useState<{ connected: boolean; email: string | null } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!profile) return;
    fetchStatus().then(setStatus).catch((e) => toast.error(e.message));
    const params = new URLSearchParams(window.location.search);
    const g = params.get("google");
    if (g === "connected") toast.success("Google account connected.");
    else if (g?.startsWith("error:")) toast.error(`Google auth error: ${g.slice(6)}`);
  }, [profile, fetchStatus]);

  if (loading || !profile) return <p className="p-8 text-sm text-muted-foreground">Loading…</p>;

  const onConnect = async () => {
    setBusy(true);
    try {
      const { url } = await connect();
      window.location.href = url;
    } catch (e: any) {
      toast.error(e.message);
      setBusy(false);
    }
  };

  const onDisconnect = async () => {
    setBusy(true);
    try {
      await disconnect();
      setStatus({ connected: false, email: null });
      toast.success("Disconnected.");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => router.navigate({ to: "/dashboard" })}>
          <ArrowLeft className="mr-1 size-4" /> Dashboard
        </Button>
        <h1 className="text-2xl font-semibold">Organization Settings</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Google Workspace
            {status?.connected ? (
              <Badge variant="default" className="gap-1">
                <CheckCircle2 className="size-3" /> Connected
              </Badge>
            ) : (
              <Badge variant="secondary">Not connected</Badge>
            )}
          </CardTitle>
          <CardDescription>
            Connect your organization's Google account so QiMiiTiNG can email meeting notices via
            Gmail and store agendas and minutes in Drive under <code>01 - Meetings / [Year] / [YYYY-MM-DD Meeting Type]</code>.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {status?.connected && status.email && (
            <p className="text-sm text-muted-foreground">
              Connected as <span className="font-medium text-foreground">{status.email}</span>
            </p>
          )}
          {!isAdmin && (
            <p className="text-sm text-muted-foreground">
              Only the Chair or Secretary can manage this connection.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            {!status?.connected ? (
              <Button onClick={onConnect} disabled={!isAdmin || busy}>
                <ExternalLink className="mr-1 size-4" />
                Connect Google Account
              </Button>
            ) : (
              <>
                <Button variant="outline" onClick={onConnect} disabled={!isAdmin || busy}>
                  Reconnect
                </Button>
                <Button variant="destructive" onClick={onDisconnect} disabled={!isAdmin || busy}>
                  Disconnect
                </Button>
              </>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Scopes requested: <code>gmail.send</code>, <code>drive.file</code>, <code>openid</code>,{" "}
            <code>email</code>. Drive access is restricted to files this app creates.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
