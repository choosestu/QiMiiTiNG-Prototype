<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->


<!-- SCHEMA_CONTRACT:BEGIN -->
## Database schema — source of truth

`src/integrations/supabase/types.ts` is the single source of truth for the database schema. It is generated directly from the live production Supabase project (not Lovable Cloud's preview database), and is kept up to date by hand whenever a migration changes the schema.

Rules for any code that touches the database:
- Never invent a table, column, enum, or RPC function that isn't in `src/integrations/supabase/types.ts`. If it's not there, it doesn't exist in production — regardless of what a feature request implies.
- All Supabase queries (`supabase.from(...)`, `supabase.rpc(...)`) must type-check against `Database` from this file. Don't add `as any` or `@ts-ignore` to work around a mismatch — the mismatch means the code is wrong, not the types.
- If a feature needs a new table/column/enum, write it as a real SQL migration first, or flag clearly that a migration is needed. Don't assume it and write UI code against it.
- Don't use Lovable Cloud's own auto-provisioned database as a design reference. Production is an external Supabase project, connected via `SUPABASE_URL`/`SUPABASE_PUBLISHABLE_KEY` env vars — not Lovable Cloud.
      <!-- SCHEMA_CONTRACT:END -->
