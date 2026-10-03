// Server only; never import in a mobile/admin app. No remote action until explicit DB binding passes.
import { createClient } from '@supabase/supabase-js';
import { createServer } from 'node:http';
import { setTimeout as sleep } from 'node:timers/promises';
import { stagingConfig,verifyStaging,stagingTick } from './lib/s11-staging.mjs';
import { revenueCatWebhook } from './lib/s9-webhook.mjs';
const mode=process.argv[2]??'check';
if(process.argv.length>3||!['check','run','watch'].includes(mode))throw Error('Use check/run/watch');
const config=stagingConfig(process.env);
const admin=createClient(config.url,config.key,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:(input,init={})=>fetch(input,{...init,signal:init.signal?AbortSignal.any([init.signal,AbortSignal.timeout(130000)]):AbortSignal.timeout(130000)})}});
const abort=new AbortController();process.on('SIGINT',()=>abort.abort());process.on('SIGTERM',()=>abort.abort());
let server;
const report=value=>console.log(JSON.stringify(value));
try{
 await verifyStaging(admin,config);
 if(mode==='check')report({staging_binding_verified:true,worker_started:false,push_enabled:config.push,billing_enabled:config.billing,webhook_enabled:config.webhook});
 else{
  if(config.webhook){
   // Only local reverse-proxy upstream. Actual HTTPS ingress/RevenueCat delivery needs a hosted test.
   server=createServer(revenueCatWebhook(admin,{secret:process.env.REVENUECAT_WEBHOOK_AUTH,verify:()=>verifyStaging(admin,config)}));
   server.requestTimeout=20000;server.headersTimeout=10000;
   await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(8099,'127.0.0.1',resolve);});
  }
  do{
   try{const result=await stagingTick(admin,config,{signal:abort.signal,report});if(result.failures&&mode==='run')process.exitCode=1;}
   catch{report({status:'staging_binding_or_configuration_failed',operations_started:false});if(mode==='run'){process.exitCode=1;break;}}
   if(mode==='run'||abort.signal.aborted)break;
   try{await sleep(60000,undefined,{signal:abort.signal});}catch{break;}
  }while(!abort.signal.aborted);
 }
}finally{if(server)await new Promise(resolve=>server.close(resolve));}
