import { authorizedWebhook, webhookOwners } from './s9-revenuecat.mjs';
// Shared local/staging adapter. Bounded UTF-8 bytes; only durable enqueue is acknowledged.
export function revenueCatWebhook(admin, { secret, verify=async()=>{} }) {
 if (!secret) throw Error('Webhook authentication required');
 return async (req, res) => {
  res.setHeader('Content-Type','application/json');
  if(req.method!=='POST'||req.url!=='/revenuecat'){res.writeHead(404).end('{}');return;}
  if(!authorizedWebhook(req.headers.authorization,secret)){res.writeHead(401).end('{}');return;}
  try{await verify();}catch{res.writeHead(503).end('{}');return;}
  const chunks=[];let bytes=0;let body;
  try{
   for await(const chunk of req){bytes+=chunk.length;if(bytes>65536){res.writeHead(413).end('{}');return;}chunks.push(Buffer.from(chunk));}
   body=JSON.parse(Buffer.concat(chunks).toString('utf8'));
  }catch{res.writeHead(400).end('{}');return;}
  let config;
  try{config=await admin.from('s9_config').select('*').single().abortSignal(AbortSignal.timeout(10000));}
  catch{res.writeHead(503).end('{}');return;}
  if(config.error||!config.data.enabled){res.writeHead(503).end('{}');return;}
  let event;
  try{event=webhookOwners(body,config.data);}catch{res.writeHead(400).end('{}');return;}
  try{
   for(const owner of event.owners){const r=await admin.rpc('enqueue_s9_reconcile',{owner_id:owner,event_key:event.eventKey}).abortSignal(AbortSignal.timeout(10000));if(r.error)throw Error('Queue unavailable');}
   res.writeHead(200).end('{}');
  }catch{res.writeHead(503).end('{}');}
 };
}
