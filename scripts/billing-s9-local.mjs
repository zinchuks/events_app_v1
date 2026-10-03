// Local-only endpoint/watcher; deploying HTTPS and configuring RevenueCat are separate acceptance gates.
import { createServer } from 'node:http';
import { setTimeout as sleep } from 'node:timers/promises';
import { localClients } from './lib/local-clients.mjs';
import { authorizedWebhook,webhookOwners,reconcileOne } from './lib/s9-revenuecat.mjs';
const {admin}=localClients({timeoutMs:10000});
const mode=process.argv[2]??'status';
if(mode==='status'){
 const r=await admin.from('s9_config').select('enabled,environment').single();if(r.error)throw Error('Billing config unavailable');
 console.log(JSON.stringify({...r.data,server_key_present:Boolean(process.env.REVENUECAT_SECRET_KEY),webhook_auth_present:Boolean(process.env.REVENUECAT_WEBHOOK_AUTH),store_verified:false}));
}else if(mode==='webhook'){
 if(!process.env.REVENUECAT_WEBHOOK_AUTH)throw Error('REVENUECAT_WEBHOOK_AUTH is required; no unauthenticated endpoint');
 const server=createServer(async(req,res)=>{
  res.setHeader('Content-Type','application/json');
  if(req.method!=='POST'||req.url!=='/revenuecat'){res.writeHead(404).end('{}');return;}
  if(!authorizedWebhook(req.headers.authorization,process.env.REVENUECAT_WEBHOOK_AUTH)){res.writeHead(401).end('{}');return;}
  try{
   let payload='';let bytes=0;for await(const chunk of req){bytes+=chunk.length;if(bytes>65536){res.writeHead(413).end('{}');return;}payload+=chunk;}
   const config=await admin.from('s9_config').select('*').single();if(config.error||!config.data.enabled){res.writeHead(503).end('{}');return;}
   const {eventKey,owners}=webhookOwners(JSON.parse(payload),config.data);
   for(const owner of owners){const r=await admin.rpc('enqueue_s9_reconcile',{owner_id:owner,event_key:eventKey});if(r.error)throw Error('queue_failed');}
   // ACK only durable queue writes. Duplicate deliveries enqueue at most once per affected owner.
   res.writeHead(200).end('{}');
  }catch{res.writeHead(400).end('{}');}
 });
 server.requestTimeout=20000;server.headersTimeout=10000;server.listen(8099,'127.0.0.1',()=>console.log('Local authenticated webhook: http://127.0.0.1:8099/revenuecat'));
}else if(mode==='run'||mode==='watch'){
 let stopped=false;process.once('SIGINT',()=>{stopped=true;});process.once('SIGTERM',()=>{stopped=true;});
 do{try{console.log(JSON.stringify(await reconcileOne(admin,process.env.REVENUECAT_SECRET_KEY)));}catch{console.log(JSON.stringify({status:'database_unavailable'}));if(mode==='run')process.exitCode=1;}if(mode==='run'||stopped)break;await sleep(10000);}while(!stopped);
}else throw Error('Use status/run/watch/webhook');
