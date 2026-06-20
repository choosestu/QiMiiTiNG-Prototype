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
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      setUser(s?.user ?? null);
    });

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setUser(data.session?.user ?? null);
      setLoading(false);
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) {
      setProfile(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const [{ data: u }, { data: r }] = await Promise.all([
        supabase.from("users").select("id, organization_id, name, email, tier").eq("id", user.id).maybeSingle(),
        supabase.from("user_roles").select("role").eq("user_id", user.id),
      ]);
      if (cancelled || !u) return;
      setProfile({
        id: u.id,
        organization_id: u.organization_id,
        name: u.name,
        email: u.email,
        tier: u.tier as 1 | 2,
        roles: (r ?? []).map((row) => row.role as AppRole),
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const isAdmin = !!profile && (profile.roles.includes("chair") || profile.roles.includes("secretary"));

  return { session, user, profile, loading, isAdmin };
}

export async function signOut() {
  await supabase.auth.signOut();
}
