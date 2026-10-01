import type { Database, Json } from './database.types';
export type Rule = Database['public']['Tables']['rules']['Row'];
export type Territory = Pick<Database['public']['Tables']['territories']['Row'], 'id' | 'kind' | 'names' | 'country_code' | 'provenance'>;
export type Point = [number, number];
export type Area = { kind: 'country' | 'admin' | 'city'; territory_id: string; parameters: Record<string, never> }
 | { kind: 'radius'; parameters: { longitude: number; latitude: number; meters: number }; territory_id?: null }
 | { kind: 'polygon'; parameters: { points: Point[] }; territory_id?: null };
export type Filters = { scope: 's4'; categories: string[]; languages: string[]; include_unknown_language: boolean; include_unknown_price: boolean; include_unknown_age: boolean; price_min: number | null; price_max: number | null; currency: string | null; age_min: number | null; age_max: number | null };
export const emptyFilters: Filters = { scope: 's4', categories: [], languages: [], include_unknown_language: true, include_unknown_price: true, include_unknown_age: true, price_min: null, price_max: null, currency: null, age_min: null, age_max: null };
export function label(names: Json, locale: string) { return names && typeof names === 'object' && !Array.isArray(names) ? String(names[locale] ?? names.en ?? '') : ''; }
export function optionalNumber(value: string) { if (!value.trim()) return null; const n = Number(value.trim().replace(',', '.')); if (!Number.isFinite(n)) throw Error('Invalid number'); return n; }
export type Extent = { longitude: number; latitude: number; span: number };
export function project(point: Point, extent: Extent): Point { return [180 + (point[0] - extent.longitude) / extent.span * 360, 120 - (point[1] - extent.latitude) / extent.span * 360]; }
export function unproject(point: Point, extent: Extent): Point { return [extent.longitude + (point[0] - 180) * extent.span / 360, extent.latitude - (point[1] - 120) * extent.span / 360]; }
