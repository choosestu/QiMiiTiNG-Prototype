-- Full-text search over canon_documents for the governance assistant.
-- OR-matches the question's words and ranks documents; returns highlighted snippets.
create or replace function public.match_canon(q text)
returns table(title text, slug text, snippet text, rank real)
language plpgsql stable security definer set search_path = public as $BODY$
declare terms text; tsq tsquery;
begin
  select string_agg(w, ' | ') into terms
  from unnest(string_to_array(regexp_replace(lower(coalesce(q,'')), '[^a-z0-9 ]', ' ', 'g'), ' ')) as w
  where length(w) > 2;
  if terms is null or terms = '' then return; end if;
  tsq := to_tsquery('english', terms);
  return query
    select c.title, c.slug,
      ts_headline('english', c.body, tsq, 'MaxFragments=3, MinWords=12, MaxWords=40') as snippet,
      ts_rank(to_tsvector('english', c.body), tsq) as rank
    from public.canon_documents c
    where to_tsvector('english', c.body) @@ tsq
    order by rank desc limit 4;
end;
$BODY$;
grant execute on function public.match_canon(text) to authenticated, anon, service_role;
