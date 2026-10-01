-- PostgREST hoists this limit only for the server-only bounded batch RPC.
alter function public.ingest_madrid(jsonb,timestamptz) set statement_timeout='120s';
notify pgrst,'reload schema';
