-- Only an allowlisted language is accepted from untrusted signup metadata.
create or replace function public.create_profile() returns trigger
language plpgsql security definer set search_path = '' as $$
declare preferred text := new.raw_user_meta_data->>'locale';
begin
  if preferred is null or preferred not in ('uk','en','es') then preferred := 'uk'; end if;
  insert into public.profiles(id,locale,translation_locale) values(new.id,preferred,preferred);
  return new;
end $$;
revoke all on function public.create_profile() from public,anon,authenticated;
