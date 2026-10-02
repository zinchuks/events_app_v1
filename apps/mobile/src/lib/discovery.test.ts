import { coordinates, eventFeatures, validPreferences, type FeedItem } from './discovery';
it('keeps unknown locations off the map and preserves genuine zero coordinates',()=>{
 expect(coordinates({longitude:null,latitude:null})).toBeNull();expect(coordinates({longitude:0,latitude:0})).toEqual([0,0]);expect(coordinates({longitude:181,latitude:40})).toBeNull();expect(coordinates({longitude:10,latitude:NaN})).toBeNull();
 const base={id:'fixture',title:'Fixture',longitude:null,latitude:null} as FeedItem;
 expect(eventFeatures([base]).features).toHaveLength(0);expect(eventFeatures([{...base,longitude:0,latitude:0}]).features[0].geometry.coordinates).toEqual([0,0]);
});
it('separates valid local delivery preferences from event horizons',()=>{
 expect(validPreferences({mode:'manual'})).toBe(true);expect(validPreferences({mode:'daily',time:'18:00'})).toBe(true);expect(validPreferences({mode:'daily',time:'24:00'})).toBe(false);expect(validPreferences({mode:'weekdays',time:'18:00',weekdays:[]})).toBe(false);expect(validPreferences({mode:'weekdays',time:'18:00',weekdays:[1,1]})).toBe(false);expect(validPreferences({mode:'weekdays',time:'18:00',weekdays:[1,7]})).toBe(true);expect(validPreferences({mode:'interval',time:'18:00',days:7,anchor:'2026-02-30'})).toBe(false);expect(validPreferences({mode:'interval',time:'18:00',days:7,anchor:'2026-10-02'})).toBe(true);
});

it('validates S7 activation and overnight quiet hours without enabling manual delivery',()=>{
 expect(validPreferences({mode:'manual',active:true})).toBe(false);
 expect(validPreferences({mode:'daily',active:true,time:'18:00',quiet:{start:'22:00',end:'08:00'}})).toBe(true);
 expect(validPreferences({mode:'daily',active:true,time:'18:00',quiet:{start:'22:00',end:'22:00'}})).toBe(false);
 expect(validPreferences({mode:'daily',active:true,time:'18:00',quiet:{start:'22:00',end:'24:00'}})).toBe(false);
});
