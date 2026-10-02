-- Distinguish conservative budget consumption from a known reported provider cost.
alter table public.s6_ai_requests add column reported_cost numeric check(reported_cost between 0 and 1000000);
create or replace function public.finish_s6_ai(selected_request uuid,claim_token uuid,outcome text,result jsonb default null,actual_cost numeric default null) returns text
language plpgsql security definer set search_path='' as $$
declare job public.s6_ai_requests; e public.events; src public.sources; cfg public.s6_ai_settings; cost numeric; final_status text;
begin
 select * into cfg from public.s6_ai_settings where singleton for update;
 select * into job from public.s6_ai_requests where id=selected_request and token=claim_token for update;
 if job.id is null then raise exception 'Invalid AI claim' using errcode='22023'; end if;
 if job.status in ('ready','failed','uncertain','superseded') then return job.status; end if;
 if job.status<>'dispatching' or outcome is null or outcome not in ('ready','failed','uncertain')
  or (actual_cost is not null and actual_cost not between 0 and 1000000)
 then raise exception 'Invalid AI completion' using errcode='22023'; end if;
 if outcome='uncertain' and actual_cost is not null then raise exception 'Ambiguous charge must retain ceiling'; end if;
 if outcome='ready' and (jsonb_typeof(result) is distinct from 'object' or not(result ?& array['title','description','summary'])
  or (select count(*) from jsonb_object_keys(result))<>3
  or jsonb_typeof(result->'title') is distinct from 'string' or length(trim(result->>'title')) not between 1 and 400
  or jsonb_typeof(result->'description') is distinct from 'string' or length(result->>'description')>20000
  or jsonb_typeof(result->'summary') is distinct from 'string' or length(trim(result->>'summary')) not between 1 and 600)
 then raise exception 'Invalid AI text schema' using errcode='22023'; end if;
 -- Unknown/failed cost conservatively consumes the full reservation, also across UTC midnight.
 cost:=case when actual_cost is null then job.ceiling else ceil(actual_cost*1000000)/1000000 end;
 update public.s6_ai_days set committed=committed-job.ceiling+cost where day=job.budget_day and currency=job.currency;
 final_status:=outcome;
 select * into e from public.events where id=job.event_id for share;
 select * into src from public.sources where id=e.primary_source_id;
 if outcome='ready' and (e.is_demo or src.is_demo or e.version<>job.version or public.s6_ai_input_hash(e.title,e.description)<>job.input_hash
  or src.terms_status<>'allowed' or not src.allow_cache or not src.allow_translate
  or (cfg.provider,cfg.model_id,cfg.prompt_version) is distinct from (job.provider,job.model_id,job.prompt_version)
  or not(job.locale=any(cfg.locales)))
 then final_status:='superseded'; end if;
 update public.s6_ai_requests set status=final_status,charge=cost,reported_cost=actual_cost,overrun=cost>job.ceiling,
  output=case when final_status='ready' then result else null end,finished_at=now() where id=job.id;
 if final_status='ready' then
  insert into public.translations(event_id,version,locale,provider,status,title,description,summary,model_id,prompt_version,input_hash)
  values(job.event_id,job.version,job.locale,'ai:'||job.provider,'ready',result->>'title',result->>'description',result->>'summary',job.model_id,job.prompt_version,job.input_hash)
  on conflict(event_id,version,locale,provider) do update set status='ready',title=excluded.title,description=excluded.description,
   summary=excluded.summary,model_id=excluded.model_id,prompt_version=excluded.prompt_version,input_hash=excluded.input_hash;
 end if;
 return final_status;
end $$;
