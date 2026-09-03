import { createFileRoute, Outlet, redirect, Link, useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, signOut, setViewAsRole, type AppRole } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      // Clear any stale local session so getSession() on /auth doesn't loop
      // back here. This happens when the auth.users row was deleted server-side
      // but the browser still holds a cached JWT in localStorage.
      await supabase.auth.signOut();
      throw redirect({ to: "/auth" });
    }
    return { user: data.user };
  },
  component: AuthenticatedLayout,
});

const ROLE_LABEL: Record<AppRole, string> = {
  chair: "Chair",
  secretary: "Secretary",
  officer: "Officer",
};

function AuthenticatedLayout() {
  const { profile, isAdmin, realIsAdmin, viewAs } = useAuth();
  const navigate = useNavigate();

  async function handleSignOut() {
    await signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <Link to="/dashboard" className="flex items-baseline gap-2">
            <span className="font-serif text-xl font-semibold">QiMiiTiNG</span>
            {profile && (
              <span className="text-xs text-muted-foreground">
                · {profile.name} · {isAdmin ? "Admin" : "Officer"}
              </span>
            )}
          </Link>
          <div className="flex items-center gap-3">
            {realIsAdmin && (
              <label className="flex items-center gap-1 text-xs text-muted-foreground">
                View as:
                <select
                  value={viewAs ?? "real"}
                  onChange={(e) =>
                    setViewAsRole(e.target.value === "real" ? null : (e.target.value as AppRole))
                  }
                  className="rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground"
                >
                  <option value="real">My role</option>
                  <option value="chair">Chair</option>
                  <option value="secretary">Secretary</option>
                  <option value="officer">Officer</option>
                </select>
              </label>
            )}
            <Button variant="ghost" size="sm" onClick={handleSignOut}>
              <LogOut className="mr-1.5 h-4 w-4" /> Sign out
            </Button>
          </div>
        </div>
      </header>

      {viewAs && (
        <div className="border-b border-amber-300 bg-amber-50 text-amber-900">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-2 text-xs">
            <span>
              Preview mode: viewing as <strong>{ROLE_LABEL[viewAs]}</strong>. Role-gated controls
              reflect this role. This is a visual preview; data access is unchanged.
            </span>
            <button className="shrink-0 underline" onClick={() => setViewAsRole(null)}>
              Exit preview
            </button>
          </div>
        </div>
      )}

      <main className="mx-auto max-w-6xl px-4 py-8">
        <Outlet />
      </main>
    </div>
  );
}
