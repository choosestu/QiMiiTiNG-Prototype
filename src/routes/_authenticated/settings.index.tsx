import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, CheckCircle2, ExternalLink } from "lucide-react";

import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  getGoogleStatus,
  startGoogleConnect,
  disconnectGoogle,
  getOrgAgendaSettings,
  setOrgAgendaLeadDays,
} from "@/lib/google.functions";

import { RouteErrorComponent, RouteNotFoundComponent } from "@/components/route-boundaries";

export const Route = createFileRoute("/_authenticated/settings/")({
  head: () => ({ meta: [{ title: "Settings — QiMiiTiNG" }] }),
  component: SettingsPage,
  errorComponent: RouteErrorComponent,
  notFoundComponent: RouteNotFoundComponent,
});


function SettingsPage() {
  const { profile, isAdmin, loading } = useAuth();
  const router = useRouter();
  const fetchStatus = useServerFn(getGoogleStatus);
  const connect = useServerFn(startGoogleConnect);
  const disconnect = useServerFn(disconnectGoogle);
  const fetchAgenda = useServerFn(getOrgAgendaSettings);
  const saveLeadDays = useServerFn(setOrgAgendaLeadDays);

  const [status, setStatus] = useState<{ connected: boolean; email: string | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const [leadDays, setLeadDays] = useState<string>("5");
  const [leadBusy, setLeadBusy] = useState(false);

  useEffect(() => {
    if (!profile) return;
    fetchStatus().then(setStatus).catch((e) => toast.error(e.message));
    fetchAgenda()
      .then((r) => setLeadDays(String(r.agendaLeadDays)))
      .catch(() => {});
    const params = new URLSearchParams(window.location.search);
    const g = params.get("google");
    if (g === "connected") toast.success("Google account connected.");
    else if (g?.startsWith("error:")) toast.error(`Google auth error: ${g.slice(6)}`);
  }, [profile, fetchStatus, fetchAgenda]);

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

  const onSaveLeadDays = async () => {
    setLeadBusy(true);
    try {
      const r = await saveLeadDays({ data: { days: Number(leadDays) } });
      setLeadDays(String(r.agendaLeadDays));
      toast.success(`Agenda lead time set to ${r.agendaLeadDays} day(s).`);
    } catch (e: any) {
      toast.error(String(e?.message ?? e));
    } finally {
      setLeadBusy(false);
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
            Scopes requested: <code>gmail.send</code>, <code>gmail.readonly</code>,{" "}
            <code>calendar.readonly</code>, <code>drive.file</code>, <code>drive.readonly</code>,{" "}
            <code>openid</code>, <code>email</code>. Read access powers the agenda pipeline (scanning
            emailed reports and correspondence, referencing the calendar) and Workspace search. If you
            connected before these were added, use <strong>Reconnect</strong> to grant them.
          </p>
        </CardContent>
      </Card>

      {isAdmin && (
        <Card>
          <CardHeader>
            <CardTitle>Agenda automation</CardTitle>
            <CardDescription>
              How many days before a meeting the agenda pipeline scans the connected Workspace account
              (Gmail and Calendar) for emailed officer reports, agenda-worthy correspondence, and
              upcoming dates.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-end gap-2">
              <div className="space-y-1">
                <Label htmlFor="lead-days" className="text-xs">
                  Lead time (days)
                </Label>
                <Input
                  id="lead-days"
                  type="number"
                  min={0}
                  max={60}
                  value={leadDays}
                  onChange={(e) => setLeadDays(e.target.value)}
                  className="w-28"
                />
              </div>
              <Button variant="outline" onClick={onSaveLeadDays} disabled={leadBusy}>
                {leadBusy ? "Saving…" : "Save"}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              The agenda is assembled when the Chair generates it (opening reports then generating the
              agenda). Unattended scheduling on this lead time is a planned follow-up.
            </p>
          </CardContent>
        </Card>
      )}

      {isAdmin && (
        <Card>
          <CardHeader>
            <CardTitle>Allowed Users</CardTitle>
            <CardDescription>
              Manage who is permitted to sign in to QiMiiTiNG for your organization.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" onClick={() => router.navigate({ to: "/settings/allowlist" })}>
              Manage allowlist
            </Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Password</CardTitle>
          <CardDescription>
            Set or change the password you use to sign in with your email.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" onClick={() => router.navigate({ to: "/settings/password" })}>
            Set password
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
