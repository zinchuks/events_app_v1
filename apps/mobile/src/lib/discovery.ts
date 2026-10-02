import type { FeatureCollection, Point as GeoPoint } from 'geojson';
export type FeedItem = { id: string; event_id: string; title: string; venue: string | null; category_code: string; time_kind: string; start_at: string | null; local_date: string | null; timezone: string | null; checked_at: string; matched_rules: string[]; longitude: number | null; latitude: number | null };
export type FeedResult = { items: FeedItem[]; total: number; mapped: number };
export function coordinates(item: Pick<FeedItem,'longitude'|'latitude'>): [number,number] | null {
 const {longitude:x,latitude:y}=item;
 return typeof x==='number'&&typeof y==='number'&&Number.isFinite(x)&&Number.isFinite(y)&&Math.abs(x)<=180&&Math.abs(y)<=90 ? [x,y] : null;
}
export function eventFeatures(items: FeedItem[]): FeatureCollection<GeoPoint> {
 return {type:'FeatureCollection',features:items.flatMap(item=>{const point=coordinates(item);return point?[{type:'Feature' as const,geometry:{type:'Point' as const,coordinates:point},properties:{id:item.id,title:item.title}}]:[];})};
}
export const mapStyle='https://tiles.openfreemap.org/styles/positron';
export type DeliveryPreferences={mode:'manual'|'daily'|'weekdays'|'interval';time?:string;weekdays?:number[];days?:number;anchor?:string};
export function validPreferences(d:DeliveryPreferences){
 if(d.mode==='manual')return true;
 if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(d.time??''))return false;
 if(d.mode==='weekdays')return Boolean(d.weekdays?.length&&d.weekdays.every(n=>Number.isInteger(n)&&n>=1&&n<=7)&&new Set(d.weekdays).size===d.weekdays.length);
 if(d.mode==='interval')return Number.isInteger(d.days)&&d.days!>=1&&d.days!<=366&&/^\d{4}-\d{2}-\d{2}$/.test(d.anchor??'')&&Number.isFinite(Date.parse(d.anchor!+'T00:00:00Z'))&&new Date(d.anchor!+'T00:00:00Z').toISOString().slice(0,10)===d.anchor;
 return d.mode==='daily';
}
export function draftFeatures(points:[number,number][],meters?:number):FeatureCollection {
 let ring=points;
 if(meters&&Number.isFinite(meters)&&meters>=1&&meters<=500000&&points[0]){const [lng,lat]=points[0];const angular=meters/6371008.8;const phi=lat*Math.PI/180;const lambda=lng*Math.PI/180;ring=Array.from({length:64},(_,i)=>{const bearing=i*2*Math.PI/64;const p=Math.asin(Math.sin(phi)*Math.cos(angular)+Math.cos(phi)*Math.sin(angular)*Math.cos(bearing));const l=lambda+Math.atan2(Math.sin(bearing)*Math.sin(angular)*Math.cos(phi),Math.cos(angular)-Math.sin(phi)*Math.sin(p));return [((l*180/Math.PI+540)%360)-180,p*180/Math.PI];});}
 const features:FeatureCollection['features']=points.map(point=>({type:'Feature',properties:{},geometry:{type:'Point',coordinates:point}}));
 if(ring.length>=3)features.unshift({type:'Feature',properties:{},geometry:{type:'Polygon',coordinates:[[...ring,ring[0]]]}});
 else if(ring.length===2)features.unshift({type:'Feature',properties:{},geometry:{type:'LineString',coordinates:ring}});
 return {type:'FeatureCollection',features};
}
export type EventMapProps={items:FeedItem[];onSelect(id:string):void;focus?:[number,number];draft?:[number,number][];meters?:number;onPoint?(p:[number,number]):void};
