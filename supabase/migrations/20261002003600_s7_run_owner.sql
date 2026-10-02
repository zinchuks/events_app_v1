-- A run may only reference a digest belonging to the same owner, even on server writes.
alter table public.s7_runs drop constraint s7_runs_digest_id_fkey;
alter table public.s7_runs add constraint s7_run_digest_owner
 foreign key(digest_id,user_id) references public.digests(id,user_id) on delete cascade;
