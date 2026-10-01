import { useMemo, useRef, useState } from 'react';
import { Linking, Pressable, Text, View } from 'react-native';
import Svg, { Circle, Ellipse, Path, Polyline, Line } from 'react-native-svg';
import boundaries from '@/lib/spain-boundaries.json';
import { project, unproject, type Point, type Extent } from '@/lib/rules';
import { useLanguage } from '@/lib/i18n';
import { Button } from './ui/button';
import { Field } from './rule-fields';
import { ui } from './screen';
export function AreaMap({ points, onPoint, meters, disabled }: { points: Point[]; onPoint(p: Point): void; meters?: number; disabled: boolean }) {
 const { t } = useLanguage(); const [width, setWidth] = useState(320);
 const pressLocation = useRef<Point | null>(null);
 const [extent, setExtent] = useState<Extent>({ longitude: -3.7, latitude: 40.42, span: 12 });
 const [lon, setLon] = useState('-3.7'); const [lat, setLat] = useState('40.42');
 const paths = useMemo(() => boundaries.map(b => {
  const polygons = b.geometry.type === 'Polygon' ? [b.geometry.coordinates] : b.geometry.coordinates;
  return { name: b.name, d: (polygons as number[][][][]).map(poly => poly.map(ring => ring.map((p, i) => { const q = project([p[0], p[1]], extent); return `${i ? 'L' : 'M'}${q[0].toFixed(2)},${q[1].toFixed(2)}`; }).join(' ') + ' Z').join(' ')).join(' ') };
 }), [extent]);
 const projected = points.map(p => project(p, extent));
 return <View style={{ gap: 10 }}>
  <Text style={ui.muted}>{t('mapHint')}</Text>
  <Pressable accessibilityRole="button" accessibilityLabel={t('areaMap')} disabled={disabled} onLayout={e => setWidth(e.nativeEvent.layout.width)} onPressIn={e => {
   // RN Web onPress receives a DOM click; its normalized responder coordinates
   // are available on onPressIn. Native onPress provides final touch coordinates.
   pressLocation.current = Number.isFinite(e.nativeEvent.locationX) && Number.isFinite(e.nativeEvent.locationY) ? [e.nativeEvent.locationX, e.nativeEvent.locationY] : null;
  }} onPress={e => {
   const location: Point = Number.isFinite(e.nativeEvent.locationX) && Number.isFinite(e.nativeEvent.locationY) ? [e.nativeEvent.locationX, e.nativeEvent.locationY] : pressLocation.current ?? [width/2, width/3];
   pressLocation.current = null;
   const p = unproject([location[0] / width * 360, location[1] / width * 360], extent);
   if (p[0] >= -180 && p[0] <= 180 && p[1] >= -90 && p[1] <= 90) onPoint([Number(p[0].toFixed(6)), Number(p[1].toFixed(6))]);
  }} style={{ width: '100%', aspectRatio: 1.5, backgroundColor: '#e4edf0', borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: '#9fafba' }}>
   <Svg width="100%" height="100%" viewBox="0 0 360 240" pointerEvents="none">
    {[60,120,180,240,300].map(x => <Line key={x} x1={x} x2={x} y1={0} y2={240} stroke="#cfdbdd" />)}
    {[60,120,180].map(y => <Line key={y} x1={0} x2={360} y1={y} y2={y} stroke="#cfdbdd" />)}
    {paths.map(p => <Path key={p.name} d={p.d} fill="#eaf0de" fillRule="evenodd" stroke="#869a72" strokeWidth={0.65} />)}
    {meters && projected[0] ? <Ellipse cx={projected[0][0]} cy={projected[0][1]} rx={meters / 111320 / Math.max(.01, Math.cos(points[0][1]*Math.PI/180)) / extent.span * 360} ry={meters / 111320 / extent.span * 360} stroke="#416b2b" strokeWidth={2} fill="#739654" fillOpacity={0.2} /> : null}
    {!meters && projected.length>1 && <Polyline points={[...projected, ...(projected.length>=3 ? [projected[0]] : [])].map(p => p.join(',')).join(' ')} fill={projected.length>=3 ? '#739654' : 'none'} fillOpacity={.25} stroke="#416b2b" strokeWidth={2} />}
    {projected.map((p,i) => <Circle key={i} cx={p[0]} cy={p[1]} r={4} fill="#203b16" stroke="white" strokeWidth={1.5} />)}
   </Svg>
  </Pressable>
  <Text style={ui.muted}>{t('mapAttribution')}</Text>
  <Button size="sm" variant="link" label={t('sourceLicense')} onPress={() => void Linking.openURL('https://creativecommons.org/licenses/by/4.0/')} />
  <View style={ui.row}><Button size="sm" variant="outline" label={t('zoomIn')} disabled={disabled} onPress={() => setExtent(e => ({...e, span: Math.max(.04,e.span/2)}))} /><Button size="sm" variant="outline" label={t('zoomOut')} disabled={disabled} onPress={() => setExtent(e => ({...e, span: Math.min(360,e.span*2)}))} /></View>
  <Field label={t('mapLongitude')} value={lon} onChange={setLon} disabled={disabled} numeric /><Field label={t('mapLatitude')} value={lat} onChange={setLat} disabled={disabled} numeric />
  <Button size="sm" variant="outline" label={t('moveMap')} disabled={disabled} onPress={() => { const x=Number(lon.replace(',','.')), y=Number(lat.replace(',','.')); if(lon.trim() && lat.trim() && Number.isFinite(x) && Number.isFinite(y) && Math.abs(x)<=180 && Math.abs(y)<=90) setExtent(e=>({...e,longitude:x,latitude:y})); }} />
 </View>;
}
