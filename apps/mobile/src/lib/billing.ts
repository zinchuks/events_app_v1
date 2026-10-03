// Browser: store purchases are unavailable; never initialize Preview API mocks.
import type { PurchasesPackage } from 'react-native-purchases';
export function billingAvailable() { return false; }
export async function offerings(_owner: string): Promise<PurchasesPackage[]> { return []; }
export async function purchase(_owner: string, _item: PurchasesPackage): Promise<void> { throw Error('native_store_required'); }
export async function restore(_owner: string): Promise<void> { throw Error('native_store_required'); }
