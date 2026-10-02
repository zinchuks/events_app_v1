import { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import type { Map as LibreMap, GeoJSONSource } from 'maplibre-gl';
import { eventFeatures, coordinates, mapStyle, draftFeatures, type EventMapProps } from '@/lib/discovery';
import { useLanguage } from '@/lib/i18n';
import { ui } from './screen';
import { Button } from './ui/button';
import 'maplibre-gl/dist/maplibre-gl.css';
export function EventMap({items,onSelect,focus,draft,meters,onPoint}:EventMapProps){
 const{t,locale}=useLanguage();const container=useRef<HTMLDivElement>(null);const map=useRef<LibreMap|null>(null);const latest=useRef(onSelect);latest.current=onSelect;const editor=useRef(onPoint);editor.current=onPoint;const shape=useRef(draftFeatures(draft??[],meters));shape.current=draftFeatures(draft??[],meters);const[failed,setFailed]=useState(false);const[revision,setRevision]=useState(0);
 useEffect(()=>{let active=true;setFailed(false);let local:LibreMap|undefined;let timer:ReturnType<typeof setTimeout>;
  void import('maplibre-gl').then((library)=>{if(!active||!container.current)return;const {Map,NavigationControl,setWorkerUrl}=library;
   // Metro wraps ESM; serve the pinned module worker and its sibling from our own public assets.
   // An explicit same-origin URL avoids MapLibre's import.meta.url discovery path.
   setWorkerUrl(new URL(`${process.env.EXPO_BASE_URL ?? ''}/vendor/maplibre/6.11.2/maplibre-gl-worker.mjs`,window.location.origin).href);const point=focus??items.map(coordinates).find(Boolean)??[-3.7,40.42];
   local=new Map({container:container.current,style:mapStyle,center:point,zoom:8,locale:{'NavigationControl.ZoomIn':t('zoomIn'),'NavigationControl.ZoomOut':t('zoomOut'),'Map.Title':t('map'),'AttributionControl.ToggleAttribution':t('mapAttributionToggle')},attributionControl:{compact:true}});map.current=local;local.addControl(new NavigationControl({showCompass:false}),'top-right');
   timer=setTimeout(()=>{if(active&&!local?.isStyleLoaded())setFailed(true);},15000);
   local.on('error',()=>{if(active)setFailed(true);});
   local.on('load',()=>{if(!active||!local)return;clearTimeout(timer);setFailed(false);local.addSource('events',{type:'geojson',data:eventFeatures(items),cluster:true,clusterRadius:45,clusterMaxZoom:16});
    local.addLayer({id:'clusters',type:'circle',source:'events',filter:['has','point_count'],paint:{'circle-color':'#264c2c','circle-radius':20}});
    local.addLayer({id:'cluster-label',type:'symbol',source:'events',filter:['has','point_count'],layout:{'text-field':['get','point_count_abbreviated'],'text-size':13,'text-font':['Noto Sans Regular']},paint:{'text-color':'#fff'}});
    local.addLayer({id:'points',type:'circle',source:'events',filter:['!', ['has','point_count']],paint:{'circle-color':'#e1623d','circle-radius':8,'circle-stroke-width':2,'circle-stroke-color':'#fff'}});
    local.addSource('draft',{type:'geojson',data:shape.current});local.addLayer({id:'draft-fill',type:'fill',source:'draft',filter:['==',['geometry-type'],'Polygon'],paint:{'fill-color':'#739654','fill-opacity':0.25}});local.addLayer({id:'draft-line',type:'line',source:'draft',filter:['!=',['geometry-type'],'Point'],paint:{'line-color':'#416b2b','line-width':2}});local.addLayer({id:'draft-points',type:'circle',source:'draft',filter:['==',['geometry-type'],'Point'],paint:{'circle-color':'#203b16','circle-radius':5,'circle-stroke-color':'#fff','circle-stroke-width':2}});local.on('click',(e)=>{if(editor.current)editor.current([Number(e.lngLat.lng.toFixed(6)),Number(e.lngLat.lat.toFixed(6))]);});
    local.on('click','clusters',async(e)=>{const feature=e.features?.[0];if(!feature||feature.geometry.type!=='Point'||!local)return;try{const source=local.getSource('events') as GeoJSONSource;const zoom=await source.getClusterExpansionZoom(Number(feature.properties.cluster_id));if(active)local.easeTo({center:feature.geometry.coordinates as [number,number],zoom});}catch{if(active)setFailed(true);}});
    local.on('click','points',(e)=>{const id=e.features?.[0]?.properties.id;if(typeof id==='string')latest.current(id);});
   });
  }).catch((error:unknown)=>{console.warn('Map initialization failed',String(error));if(active)setFailed(true);});
  return()=>{active=false;clearTimeout(timer);local?.remove();map.current=null;};
 // Recreate for bounded result/focus changes, release workers on navigation/unmount.
 },[items,focus?.[0],focus?.[1],revision,locale]);
 useEffect(()=>{const source=map.current?.isStyleLoaded()?map.current.getSource('draft') as GeoJSONSource|undefined:undefined;source?.setData(shape.current);},[draft,meters]);
 return <View style={{gap:8}}><div ref={container} aria-label={t('map')} style={{height:340,width:'100%',borderRadius:16,overflow:'hidden',background:'#e3ecdf'}}/>{failed&&<><Text accessibilityRole="alert" style={ui.text}>{t('mapUnavailable')}</Text><Button label={t('retry')} variant="outline" onPress={()=>setRevision(v=>v+1)}/></>}</View>;
}
