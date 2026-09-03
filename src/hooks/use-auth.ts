import { useEffect, useState, useSyncExternalStore } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type AppRole = "chair" | "secretary" | "officer";

export interface AppUserProfile {
  id: string;
  organization_id: string;
  name: string;
  email: string;
  tier: 1 | 2;
  roles: AppRole[];
}

// Demo "View as role" preview. UI-only: it changes which role-gated controls are
// shown so an admin can experience each role's view. It does not change database
// permissions. Persisted per browser so the preview applies across pages.
const VIEW_AS_KEY = "qimiiting_view_as_role";
let viewAsRole: AppRole | null = readInitialViewAs();
const viewAsListeners = new Set<() => void>();
function readInitialViewAs(): AppRole | null {
  try {
    const v = typeof localStorage !== "undefined" ? localStorage.getItem(VIEW_AS_KEY) : null;
    return v === "chair" || v === "secretary" || v === "officer" ? v : null;
  } catch {
    return null;
  }
}
export function setViewAsRole(role: AppRole | null) {
  viewAsRole = role;
  try {
    if (typeof localStorage !== "undefined") {
      if (role) localStorage.setItem(VIEW_AS_KEY, role);
      else localStorage.removeItem(VIEW_AS_KEY);
    }
  } catch {
    /* ignore storage errors */
  }
  viewAsListeners.forEach((f) => f());
}
function subscribeViewAs(cb: () => void) {
  viewAsListeners.add(cb);
  return () => {
    viewAsListeners.delete(cb);
  };
}
function getViewAs() {
  return viewAsRole;
}

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<AppUserProfile | null>(null);
  // loading stays true until BOTH auth state AND profile fetch are settled
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      // Ignore TOKEN_REFRESHED / INITIAL_SESSION churn; getSession() handles the
      // initial state. Only act on meaningful auth transitions.
      if (event !== "SIGNED_IN" && event !== "SIGNED_OUT" && event !== "USER_UPDATED") return;
      setSession(s);
      setUser(s?.user ?? null);
      if (!s?.user) {
        setProfile(null);
        setLoading(false);
        setViewAsRole(null); // clear any role preview on sign-out
      }
    });

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setUser(data.session?.user ?? null);
      if (!data.session?.user) {
        setLoading(false);
      }
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  const userId = user?.id;

  useEffect(() => {
    if (!userId) {
      setProfile(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const [{ data: u }, { data: r }] = await Promise.all([
        supabase.from("users").select("id, organization_id, name, email, tier").eq("id", userId).maybeSingle(),
        supabase.from("user_roles").select("role").eq("user_id", userId),
      ]);
      if (cancelled) return;
      if (u) {
        setProfile({
          id: u.id,
          organization_id: u.organization_id,
          name: u.name,
          email: u.email,
          tier: u.tier as 1 | 2,
          roles: (r ?? []).map((row) => row.role as AppRole),
        });
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const viewAs = useSyncExternalStore(subscribeViewAs, getViewAs, getViewAs);
  const realRoles = profile?.roles ?? [];
  const realIsAdmin = !!profile && (realRoles.includes("chair") || realRoles.includes("secretary"));
  const effectiveRoles: AppRole[] = viewAs ? [viewAs] : realRoles;
  // Effective admin honours the preview; requires a real profile so a logged-out
  // state can never appear admin.
  const isAdmin = !!profile && (viewAs ? viewAs !== "officer" : realIsAdmin);

  return { session, user, profile, loading, isAdmin, realIsAdmin, viewAs, effectiveRoles };
}

export async function signOut() {
  setViewAsRole(null);
  await supabase.auth.signOut();
}
