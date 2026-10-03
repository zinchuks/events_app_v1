-- Identical source facts must remain identical across operator/session timezone changes.
alter function public.s8_snapshot(uuid) set timezone='UTC';
