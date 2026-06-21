import { createFileRoute } from "@tanstack/react-router";

// One-time bootstrap endpoint. Wipes placeholder data and installs the real
// member allowlist using the service-role admin client (bypasses RLS).
// Protected by a secret token in the query string.
// Visit: /api/admin/bootstrap?secret=qimiiting-setup-2026

const BOOTSTRAP_SECRET = "qimiiting-setup-2026";

const MEMBERS = [
  { email: "stuart@thefoundation.ca",       name: "Stuart Smith (QiMiiTiNG)",   role: "chair",     tier: 1 },
  { email: "oshawafederalliberal@gmail.com", name: "Stuart Smith (OFLA Chair)",  role: "chair",     tier: 1 },
  { email: "jacquelinesevers@gmail.com",     name: "Jacquie Severs",             role: "secretary", tier: 1 },
  { email: "a78nicholson@gmail.com",         name: "Anthony Nicholson",          role: "secretary", tier: 1 },
  { email: "jeremykolodziej@gmail.com",      name: "Jeremy Kolodziej",           role: "officer",   tier: 2 },
  { email: "hrmcmillan@rogers.com",          name: "Heather McMillan",           role: "officer",   tier: 2 },
  { email: "hugh.montgomerie@gmail.com",     name: "Hugh Montgomery",            role: "officer",   tier: 2 },
  { email: "deborah.nurse@gmail.com",        name: "Deborah Nurse",              role: "officer",   tier: 2 },
  { email: "avril.burns@ddsb.ca",            name: "Avril Burns",                role: "officer",   tier: 2 },
  { email: "lockieda@gmail.com",             name: "Dave Lockie",                role: "officer",   tier: 2 },
];

export const Route = createFileRoute("/api/admin/bootstrap")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const secret = url.searchParams.get("secret");

        if (secret !== BOOTSTRAP_SECRET) {
          return new Response(JSON.stringify({ error: "Forbidden" }), {
            status: 403,
            headers: { "content-type": "application/json" },
          });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const log: string[] = [];

        try {
          // 1. Get the organization
          const { data: org, error: orgErr } = await supabaseAdmin
            .from("organizations")
            .select("id, name")
            .eq("name", "Oshawa Federal Liberal Association")
            .single();

          if (orgErr || !org) {
            return json({ error: "Organization not found", detail: orgErr?.message }, 500);
          }
          log.push(`✓ Found org: ${org.name} (${org.id})`);

          // 2. Delete orphaned auth records for all member emails
          for (const m of MEMBERS) {
            const { data: authUser } = await supabaseAdmin.auth.admin.listUsers();
            const existing = authUser?.users?.find(u => u.email === m.email);
            if (existing) {
              await supabaseAdmin.from("user_roles").delete().eq("user_id", existing.id);
              await supabaseAdmin.from("users").delete().eq("id", existing.id);
              await supabaseAdmin.auth.admin.deleteUser(existing.id);
              log.push(`✓ Deleted orphaned auth record: ${m.email}`);
            }
          }

          // 3. Replace allowed_users with real list
          const { error: delErr } = await supabaseAdmin.from("allowed_users").delete().neq("email", "");
          if (delErr) log.push(`⚠ Could not clear allowed_users: ${delErr.message}`);
          else log.push(`✓ Cleared allowed_users`);

          const inserts = MEMBERS.map(m => ({
            email: m.email,
            organization_id: org.id,
            name: m.name,
            role: m.role as "chair" | "secretary" | "officer",
            tier: m.tier as 1 | 2,
          }));

          const { error: insErr } = await supabaseAdmin.from("allowed_users").insert(inserts);
          if (insErr) {
            log.push(`✗ Failed to insert allowed_users: ${insErr.message}`);
            return json({ error: insErr.message, log }, 500);
          }
          log.push(`✓ Inserted ${inserts.length} members into allowed_users`);

          log.push("");
          log.push("Bootstrap complete. You can now sign up at /auth with any of the listed emails.");
          log.push("Delete or disable this endpoint after use: src/routes/api/admin/bootstrap.ts");

          return json({ ok: true, log }, 200);
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          return json({ error: msg, log }, 500);
        }
      },
    },
  },
});

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { "content-type": "application/json" },
  });
}
