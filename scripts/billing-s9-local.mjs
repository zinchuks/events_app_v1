// Local-only endpoint/watcher; deploying HTTPS and configuring RevenueCat are separate acceptance gates.
import { createServer } from 'node:http';
import { setTimeout as sleep } from 'node:timers/promises';
import { localClients } from './lib/local-clients.mjs';
import { reconcileOne } from './lib/s9-revenuecat.mjs';
import { revenueCatWebhook } from './lib/s9-webhook.mjs';
const {admin}=localClients({timeoutMs:10000});
const mode=process.argv[2]??'status';
if(mode==='status'){
 const r=await admin.from('s9_config').select('enabled,environment').single();if(r.error)throw Error('Billing config unavailable');
 console.log(JSON.stringify({...r.data,server_key_present:Boolean(process.env.REVENUECAT_SECRET_KEY),webhook_auth_present:Boolean(process.env.REVENUECAT_WEBHOOK_AUTH),store_verified:false}));
}else if(mode==='webhook'){
 if(!process.env.REVENUECAT_WEBHOOK_AUTH)throw Error('REVENUECAT_WEBHOOK_AUTH is required; no unauthenticated endpoint');
 const server=createServer(revenueCatWebhook(admin,{secret:process.env.REVENUECAT_WEBHOOK_AUTH}));
 server.requestTimeout=20000;server.headersTimeout=10000;server.listen(8099,'127.0.0.1',()=>console.log('Local authenticated webhook: http://127.0.0.1:8099/revenuecat'));
}else if(mode==='run'||mode==='watch'){
 let stopped=false;process.once('SIGINT',()=>{stopped=true;});process.once('SIGTERM',()=>{stopped=true;});
 do{try{console.log(JSON.stringify(await reconcileOne(admin,process.env.REVENUECAT_SECRET_KEY)));}catch{console.log(JSON.stringify({status:'database_unavailable'}));if(mode==='run')process.exitCode=1;}if(mode==='run'||stopped)break;await sleep(10000);}while(!stopped);
}else throw Error('Use status/run/watch/webhook');
