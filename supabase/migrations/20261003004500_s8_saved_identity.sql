-- Keep legacy same-key upsert; identity changes require delete+save (new epoch).
create function public.s8_saved_identity() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if old.user_id is distinct from new.user_id or old.occurrence_id is distinct from new.occurrence_id then
  raise exception 'Saved identity immutable' using errcode='22023';
 end if;
 return new;
end $$;
revoke all on function public.s8_saved_identity() from public,anon,authenticated;
create trigger s8_saved_identity before update of user_id,occurrence_id on public.saved_events for each row execute function public.s8_saved_identity();
