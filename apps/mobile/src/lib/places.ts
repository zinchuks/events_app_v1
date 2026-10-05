import type { Json } from './database.types';
export type Place = { key: string; territory_id: string|null; kind: 'city'|'admin'|'country'; names: Json; country_code: string; region: string; latitude: number|null; longitude: number|null; has_boundary: boolean; has_catalog_events: boolean; geoname_id: number|null; feature_code: string|null; provenance: string };
