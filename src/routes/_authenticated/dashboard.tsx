import { createFileRoute, Link } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Calendar, FileText, Users, Vote } from "lucide-react";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — QiMiiTiNG" },
      { name: "description", content: "QiMiiTiNG dashboard." },
    ],
  }),
  component: DashboardPage,
});

function DashboardPage() {
  const { profile, isAdmin, loading } = useAuth();

  if (loading || !profile) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-serif text-3xl">Welcome, {profile.name.split(" ")[0]}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {isAdmin
            ? "You have administrative access. Create and manage meetings below."
            : "Submit your officer reports and review approved meeting documents."}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {isAdmin && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Calendar className="h-4 w-4 text-primary" /> Meetings
              </CardTitle>
              <CardDescription>Create and manage meetings.</CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild variant="secondary" size="sm" disabled>
                <Link to="/dashboard">Open (coming soon)</Link>
              </Button>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <FileText className="h-4 w-4 text-primary" /> Officer reports
            </CardTitle>
            <CardDescription>Submit your report for upcoming meetings.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="secondary" size="sm" disabled>
              Open (coming soon)
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Vote className="h-4 w-4 text-primary" /> Motions & votes
            </CardTitle>
            <CardDescription>Record your vote on open motions.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="secondary" size="sm" disabled>
              Open (coming soon)
            </Button>
          </CardContent>
        </Card>

        {isAdmin && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Users className="h-4 w-4 text-primary" /> Organization
              </CardTitle>
              <CardDescription>Connect Google Workspace and manage members.</CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="secondary" size="sm" disabled>
                Open (coming soon)
              </Button>
            </CardContent>
          </Card>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        Phase 1 foundation is live. Meeting lifecycle, Google integration, and AI minutes are being added in subsequent milestones.
      </p>
    </div>
  );
}
