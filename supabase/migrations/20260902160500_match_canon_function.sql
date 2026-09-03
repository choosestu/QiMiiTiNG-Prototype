-- Full-text search over canon_documents for the governance assistant.
-- OR-matches the question's words and ranks documents. Returns the FULL text for
-- short docs (<=6000 chars, e.g. Robert's Rules summary, QiMiiTiNG guidance,
-- Elections Canada reference) so exact rules/numbers always reach the assistant;
-- longer docs return highlighted snippets. Returns up to 6 so a relevant compliance
-- doc is not crowded out by governance docs sharing common words.
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
      case when length(c.body) <= 6000
           then c.body
           else ts_headline('english', c.body, tsq, 'MaxFragments=4, MinWords=15, MaxWords=60') end as snippet,
      ts_rank(to_tsvector('english', c.body), tsq) as rank
    from public.canon_documents c
    where to_tsvector('english', c.body) @@ tsq
    order by rank desc limit 6;
end;
$BODY$;
grant execute on function public.match_canon(text) to authenticated, anon, service_role;
