import assert from 'node:assert/strict';
import { test } from 'node:test';
import { revenueCatWebhook } from './lib/s9-webhook.mjs';
const secret='Bearer synthetic-auth-for-webhook-tests-32-chars';
function response(){return{status:null,setHeader(){},writeHead(n){this.status=n;return this;},end(){return this;}};}
const request=chunks=>({method:'POST',url:'/revenuecat',headers:{authorization:secret},async *[Symbol.asyncIterator](){yield* chunks;}});
function admin(enqueue=async()=>({error:null})){return{from:()=>({select:()=>({single:()=>({abortSignal:async()=>({error:null,data:{enabled:true,environment:'SANDBOX',app_ids:['synthetic-app']}})})})}),rpc:()=>({abortSignal:enqueue})};}
const payload=()=>JSON.stringify({event:{id:'synthetic-💙',type:'INITIAL_PURCHASE',app_id:'synthetic-app',environment:'SANDBOX',app_user_id:'11111111-1111-4111-8111-111111111111'}});
test('UTF-8 split across network chunks retains the durable event identity',async()=>{
 const bytes=Buffer.from(payload());const offset=bytes.indexOf(Buffer.from('💙'))+2;let eventKey;
 const db=admin();db.rpc=(_name,args)=>{eventKey=args.event_key;return{abortSignal:async()=>({error:null})};};
 const res=response();await revenueCatWebhook(db,{secret})(request([bytes.subarray(0,offset),bytes.subarray(offset)]),res);
 assert.equal(res.status,200);assert.ok(eventKey.includes('💙'));
});
test('a nondurable queue or revoked staging binding is retryable, never acknowledged',async()=>{
 for(const options of [{verify:async()=>{throw Error('binding revoked');}},{}]){
  const res=response();await revenueCatWebhook(admin(async()=>({error:{code:'synthetic_failure'}})),{secret,...options})(request([Buffer.from(payload())]),res);assert.equal(res.status,503);
 }
});
test('body limit counts bytes and unauthenticated/malformed payloads never enqueue',async()=>{
 const body=Buffer.from('💙'.repeat(20000));const res=response();await revenueCatWebhook(admin(),{secret})(request([body]),res);assert.equal(res.status,413);
 const bad=response();await revenueCatWebhook(admin(),{secret})(request([Buffer.from('{')]),bad);assert.equal(bad.status,400);
 const denied=response();const req=request([]);req.headers.authorization='wrong';await revenueCatWebhook(admin(),{secret})(req,denied);assert.equal(denied.status,401);
});
