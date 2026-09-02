-- Global party canon: shared reference documents identical for every EDA
-- (LPC Constitution, By-laws, EDA Handbook). Readable by all authenticated
-- users; only service_role writes. Not org-scoped.
create table if not exists public.canon_documents (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  title text not null,
  category text,
  source_url text,
  body text not null,
  updated_at timestamptz not null default now()
);
alter table public.canon_documents enable row level security;
grant select on public.canon_documents to authenticated, anon;
grant all on public.canon_documents to service_role;
drop policy if exists canon_read on public.canon_documents;
create policy canon_read on public.canon_documents for select to authenticated using (true);
