-- A future interval anchor must not silently disable an active rule.
create or replace function public.s7_next_run(d jsonb,zone text,after_time timestamptz) returns timestamptz
language plpgsql stable set search_path='' as $$
declare day date; candidate timestamptz; n integer; base_day date;
begin
 if d->>'mode'='manual' or d->'active' is distinct from 'true'::jsonb then return null; end if;
 base_day:=(after_time at time zone zone)::date;
 if d->>'mode'='interval' then base_day:=greatest(base_day,(d->>'anchor')::date); end if;
 for n in 0..367 loop
  day:=base_day+n;
  if (d->>'mode'='weekdays' and not (d->'weekdays' @> to_jsonb(array[extract(isodow from day)::integer])))
   or (d->>'mode'='interval' and (day<(d->>'anchor')::date or (day-(d->>'anchor')::date)%(d->>'days')::integer<>0)) then continue; end if;
  candidate:=public.s7_local_instant(day+(d->>'time')::time,zone);
  if candidate>after_time then return candidate; end if;
 end loop;
 return null;
end $$;
create or replace function public.s7_area_revision() returns trigger language plpgsql security definer set search_path='' as $$
begin
 update public.rules set schedule_revision=schedule_revision+1,next_run_at=null,schedule_retry_at=null
 where id=case when tg_op='DELETE' then old.rule_id else new.rule_id end and filters->>'scope'='s4';
 return null;
end $$;
