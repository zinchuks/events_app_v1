create function public.list_s3_events(category_codes text[] default array[]::text[], page_offset integer default 0)
returns table(id uuid,event_id uuid,time_kind text,start_at timestamptz,local_date date,timezone text,title text,venue text,category_code text,checked_at timestamptz)
language sql stable security invoker set search_path='' as $$
 select o.id,o.event_id,o.time_kind,o.start_at,o.local_date,o.timezone,e.title,e.venue,e.category_code,e.checked_at
 from public.occurrences o join public.events e on e.id=o.event_id join public.sources s on s.id=e.primary_source_id
 join public.territories t on t.id=e.territory_id
 where t.external_id='madrid:municipio:Madrid' and not t.is_demo and not e.is_demo and not s.is_demo
  and e.status='scheduled' and o.status='scheduled' and s.terms_status='allowed'
  and (cardinality(category_codes)=0 or e.category_code=any(category_codes))
  and ((o.time_kind='known' and o.start_at>=now()) or (o.time_kind='date_only' and o.local_date>=(now() at time zone 'Europe/Madrid')::date))
 order by coalesce(o.local_date,(o.start_at at time zone 'Europe/Madrid')::date),o.start_at nulls last,o.id
 limit 30 offset greatest(0,least(page_offset,10000))
$$;
revoke all on function public.list_s3_events(text[],integer) from public;
grant execute on function public.list_s3_events(text[],integer) to anon,authenticated;
