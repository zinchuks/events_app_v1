import { createContext, useCallback, useContext, useRef, type PropsWithChildren } from 'react';
import { router, usePathname } from 'expo-router';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from './ui/button';
import { useLanguage } from '@/lib/i18n';
const ScrollContext=createContext(()=>{});
export const useScreenScroll=()=>useContext(ScrollContext);
export function Screen({ children, title, home = false }: PropsWithChildren<{ title: string; home?: boolean }>) {
 const { t } = useLanguage();const path=usePathname();
 const scroll=useRef<ScrollView>(null);const scrollToTop=useCallback(()=>scroll.current?.scrollTo({y:0,animated:false}),[]);
 const tabs=[{path:'/' as const,label:t('browse'),symbol:'◉'},{path:'/map' as const,label:t('map'),symbol:'⌖'},{path:'/saved' as const,label:t('savedEvents'),symbol:'♡'},{path:'/inbox' as const,label:t('inbox'),symbol:'▤'},{path:'/settings' as const,label:t('settings'),symbol:'⚙'}];
 return <SafeAreaView style={ui.page}><ScrollView ref={scroll} keyboardShouldPersistTaps="handled" contentContainerStyle={ui.content}>
  <View style={ui.brand}><Text style={ui.wordmark}>● event radar</Text><Button size="sm" variant="outline" label={t('rules')} onPress={() => router.push('/rules')} /></View>
  {!home && <Button variant="link" label={t('back')} onPress={() => router.canGoBack() ? router.back() : router.replace('/')} />}
  <Text accessibilityRole="header" style={ui.heading}>{title}</Text>
  <ScrollContext.Provider value={scrollToTop}>{children}</ScrollContext.Provider>
 </ScrollView><View style={ui.tabs}>{tabs.map(tab=><Pressable key={tab.path} accessibilityRole="tab" accessibilityLabel={tab.label} accessibilityState={{selected:path===tab.path}} {...(Platform.OS==='web'?{'aria-selected':path===tab.path}:{})} onPress={()=>router.navigate(tab.path)} style={[ui.tab,path===tab.path&&ui.selectedTab]}><Text accessible={false} style={ui.tabIcon}>{tab.symbol}</Text><Text numberOfLines={2} style={ui.tabLabel}>{tab.label}</Text></Pressable>)}</View></SafeAreaView>;
}
export const ui = StyleSheet.create({ page: { flex: 1, backgroundColor: '#f1f5ed' }, content: { width: '100%', maxWidth: 560, alignSelf: 'center', padding: 20, paddingBottom: 32, gap: 18 }, brand: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }, wordmark: { fontSize: 23, fontWeight: '700', color: '#203320', letterSpacing: -0.7 }, heading: { fontSize: 32, fontWeight: '700', color: '#172817', letterSpacing: -0.8 }, row: { flexDirection: 'row', flexWrap: 'wrap', alignItems:'center', gap: 8 }, card: { backgroundColor: 'white', padding: 18, borderRadius: 16, gap: 12, borderWidth: 1, borderColor: '#dce6d5' }, title: { fontSize: 20, fontWeight: '600', color: '#172817' }, text: { fontSize: 15, lineHeight: 23, color: '#40533a' }, muted: { fontSize: 13, lineHeight: 19, color: '#53644b' }, badge: { fontSize: 13, fontWeight: '700', color: '#42652d' },tabs:{flexDirection:'row',backgroundColor:'#fff',borderTopWidth:1,borderColor:'#dce6d5',paddingHorizontal:4,paddingVertical:6,width:'100%',maxWidth:560,alignSelf:'center'},tab:{flex:1,minHeight:60,alignItems:'center',justifyContent:'center',gap:3,borderRadius:12,padding:3},selectedTab:{backgroundColor:'#e6eedf'},tabIcon:{fontSize:22,color:'#26421d'},tabLabel:{fontSize:11,textAlign:'center',color:'#26421d',fontWeight:'600'} });
