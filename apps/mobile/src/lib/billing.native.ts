import Constants, { ExecutionEnvironment } from 'expo-constants';
import { Platform } from 'react-native';
import Purchases, { type PurchasesPackage } from 'react-native-purchases';
import { supabase } from './supabase';
const key=Platform.OS==='ios'?process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY:process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY;
export function billingAvailable(){return Constants.executionEnvironment!==ExecutionEnvironment.StoreClient
 && Boolean(key && (Platform.OS==='ios'?key.startsWith('appl_'):key.startsWith('goog_')));}
let configured=false;let queue=Promise.resolve();
function withOwner<T>(owner:string,action:()=>Promise<T>):Promise<T>{
 const run=queue.then(async()=>{
  if(!billingAvailable()||!supabase)throw Error('native_store_required');
  const current=await supabase.auth.getUser();
  if(current.error||current.data.user.id!==owner)throw Error('identity_changed');
  if(!configured){Purchases.configure({apiKey:key!,appUserID:owner});configured=true;}
  else if(await Purchases.getAppUserID()!==owner)await Purchases.logIn(owner);
  // Login can await the network while the app's Auth identity changes.
  const ready=await supabase.auth.getUser();if(ready.error||ready.data.user.id!==owner)throw Error('identity_changed');
  const result=await action();
  const after=await supabase.auth.getUser();if(after.error||after.data.user.id!==owner)throw Error('identity_changed');
  return result;
 });queue=run.then(()=>{},()=>{});return run;
}
export function offerings(owner:string):Promise<PurchasesPackage[]>{return withOwner(owner,async()=>{
 const all=await Purchases.getOfferings();return all.current?.availablePackages.filter(p=>['MONTHLY','ANNUAL'].includes(p.packageType))??[];
});}
async function reconcile(owner:string){const current=await supabase!.auth.getUser();if(current.error||current.data.user.id!==owner)throw Error('identity_changed');const r=await supabase!.rpc('request_s9_reconcile');if(r.error||!r.data)throw Error('server_verification_unavailable');}
export function purchase(owner:string,item:PurchasesPackage):Promise<void>{return withOwner(owner,async()=>{await Purchases.purchasePackage(item);await reconcile(owner);});}
export function restore(owner:string):Promise<void>{return withOwner(owner,async()=>{await Purchases.restorePurchases();await reconcile(owner);});}
