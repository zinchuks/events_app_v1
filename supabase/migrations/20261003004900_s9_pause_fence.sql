-- Billing pause invalidates queued rule snapshots and clears due dates.
create or replace function public.validate_s5_delivery() returns trigger language plpgsql set search_path='' as $$
declare d jsonb:=new.delivery_schedule; v jsonb; q jsonb:=d->'quiet'; changed boolean;
begin
 if new.filters->>'scope' is distinct from 's4' then return new; end if;
 if d<>'{}'::jsonb then
  if jsonb_typeof(d) is distinct from 'object' or coalesce(d->>'mode','') not in ('manual','daily','weekdays','interval')
   or jsonb_typeof(d->'active') is distinct from 'boolean'
   or exists(select 1 from jsonb_object_keys(d) k where k not in ('mode','active','time','weekdays','days','anchor','quiet','repeat_unchanged')) then raise exception 'Invalid schedule'; end if;
  if d?'repeat_unchanged' and jsonb_typeof(d->'repeat_unchanged') is distinct from 'boolean' then raise exception 'Invalid repeat policy'; end if;
  if d->>'mode'<>'manual' and (jsonb_typeof(d->'time') is distinct from 'string' or d->>'time' !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$') then raise exception 'Invalid local time'; end if;
  if d->>'mode'='manual' and (d->>'active')::boolean then raise exception 'Manual schedule cannot be active'; end if;
  if d->>'mode'='weekdays' then
   if jsonb_typeof(d->'weekdays') is distinct from 'array' or jsonb_array_length(d->'weekdays') not between 1 and 7 then raise exception 'Select weekdays'; end if;
   for v in select value from jsonb_array_elements(d->'weekdays') loop
    if jsonb_typeof(v)<>'number' or (v#>>'{}')::numeric not between 1 and 7 or (v#>>'{}')::numeric<>trunc((v#>>'{}')::numeric) then raise exception 'Invalid weekday'; end if;
   end loop;
   if (select count(distinct value) from jsonb_array_elements(d->'weekdays'))<>jsonb_array_length(d->'weekdays') then raise exception 'Duplicate weekday'; end if;
  end if;
  if d->>'mode'='interval' then
   if jsonb_typeof(d->'days') is distinct from 'number' or (d->>'days')::numeric not between 1 and 366 or (d->>'days')::numeric<>trunc((d->>'days')::numeric)
    or jsonb_typeof(d->'anchor') is distinct from 'string' or d->>'anchor' !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Invalid interval'; end if;
   perform (d->>'anchor')::date;
  end if;
  if q is not null then
   if jsonb_typeof(q) is distinct from 'object' or (select count(*) from jsonb_object_keys(q))<>2
    or jsonb_typeof(q->'start') is distinct from 'string' or jsonb_typeof(q->'end') is distinct from 'string'
    or q->>'start' !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' or q->>'end' !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
    or q->>'start'=q->>'end' then raise exception 'Invalid quiet hours'; end if;
  end if;
 end if;
 changed:=tg_op='INSERT';
 if tg_op='UPDATE' then
  changed:=row(new.enabled,new.billing_paused,new.timezone,new.delivery_schedule,new.filters,new.event_horizon,new.name)
   is distinct from row(old.enabled,old.billing_paused,old.timezone,old.delivery_schedule,old.filters,old.event_horizon,old.name);
 end if;
 if changed then new.schedule_revision:=new.schedule_revision+1;new.schedule_retry_at:=null; end if;
 if not new.enabled or new.billing_paused then new.next_run_at:=null;
 elsif changed or new.next_run_at is null then new.next_run_at:=public.s7_next_run(d,new.timezone,now()); end if;
 return new;
end $$;

select public.s9_refresh_rules(id) from public.profiles;
update public.rules set next_run_at=null where billing_paused;
