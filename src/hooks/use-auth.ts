import { useEffect, useState } from "react";
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

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<AppUserProfile | null>(null);
  // loading stays true until BOTH auth state AND profile fetch are settled
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      // Ignore TOKEN_REFRESHED / INITIAL_SESSION churn — getSession() handles
      // the initial state; only act on meaningful auth transitions.
      if (event !== "SIGNED_IN" && event !== "SIGNED_OUT" && event !== "USER_UPDATED") return;
      setSession(s);
      setUser(s?.user ?? null);
      // On sign-out there is no user, so no profile fetch will run — clear now.
      if (!s?.user) {
        setProfile(null);
        setLoading(false);
      }
    });

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setUser(data.session?.user ?? null);
      // If there is no session, loading is done immediately.
      // If there IS a session, loading will be cleared after the profile fetch below.
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
      // Always mark loading done once the profile fetch settles, even if no
      // public.users row exists — callers check profile === null to detect that.
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const isAdmin = !!profile && (profile.roles.includes("chair") || profile.roles.includes("secretary"));

  return { session, user, profile, loading, isAdmin };
}

export async function signOut() {
  await supabase.auth.signOut();
}
