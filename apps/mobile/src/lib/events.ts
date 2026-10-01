import type { Database } from './database.types';
export type CatalogItem = Database['public']['Functions']['list_s3_events']['Returns'][number];
export const eventSelect = 'id,event_id,time_kind,start_at,local_date,timezone,status,events!inner(title,description,venue,canonical_url,checked_at,category_code,price,currency,status,sources(name,rights_reference,last_success_at))' as const;
export function occurrenceTime(item: { start_at: string | null; local_date: string | null; timezone: string | null }, locale: string, unknown: string) {
 if (item.start_at) return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short', timeZone: item.timezone ?? 'Europe/Madrid' }).format(new Date(item.start_at)) + ' · ' + (item.timezone ?? 'Europe/Madrid');
 if (item.local_date) return item.local_date + ' · ' + unknown;
 return unknown;
}
