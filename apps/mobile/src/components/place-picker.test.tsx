import { act, fireEvent, render } from '@testing-library/react-native';
import { PlacePicker } from './place-picker';
import { supabase } from '@/lib/supabase';
const mockSession={user:{id:'synthetic-owner'}};
jest.mock('@/lib/auth-context',()=>({useAuth:()=>({session:mockSession})}));
jest.mock('@/lib/i18n',()=>({useLanguage:()=>({locale:'uk',t:(key:string)=>key})}));
jest.mock('@/lib/supabase',()=>({supabase:{rpc:jest.fn()}}));
const rpc=supabase!.rpc as jest.Mock;
const pending=(value:unknown)=>{const promise=Promise.resolve(value);return Object.assign(promise,{abortSignal:()=>promise});};
const place={key:'geonames:123',territory_id:null,kind:'city',names:{und:'TEST Village'},country_code:'UA',region:'TEST Region',latitude:49,longitude:24,has_boundary:false,has_catalog_events:false,feature_code:'PPL'};
beforeEach(()=>{jest.useFakeTimers();jest.clearAllMocks();rpc.mockReturnValue(pending({data:{items:[place],has_more:false},error:null}));});
afterEach(()=>jest.useRealTimers());
const tick=async()=>{await act(async()=>{jest.advanceTimersByTime(250);});};
it('server pagination is bounded and searches debounce without loading all territories',async()=>{
 rpc.mockReturnValue(pending({data:{items:[place],has_more:true},error:null}));const view=render(<PlacePicker kind="city" onChoose={jest.fn()}/>);await tick();
 expect(rpc).toHaveBeenLastCalledWith('search_places',expect.objectContaining({page_offset:0}));
 fireEvent.press(view.getByText('next'));await tick();expect(rpc).toHaveBeenLastCalledWith('search_places',expect.objectContaining({page_offset:25}));
 fireEvent.changeText(view.getByLabelText('territorySearch'),'TEST');expect(rpc).toHaveBeenCalledTimes(2);await tick();
 expect(rpc).toHaveBeenLastCalledWith('search_places',expect.objectContaining({query_text:'TEST',page_offset:0}));
});
it('a point-only village selects an explicit radius without pretending to have a boundary',async()=>{
 const choose=jest.fn();const view=render(<PlacePicker kind="city" onChoose={choose}/>);await tick();
 expect(view.queryByText('selectPlace')).toBeNull();expect(view.getByText('placePointNotice')).toBeTruthy();
 fireEvent.changeText(view.getByLabelText('radiusKm'),'5');fireEvent.press(view.getByText('selectPlaceRadius · 5 km'));
 expect(choose).toHaveBeenCalledWith({kind:'radius',parameters:{longitude:24,latitude:49,meters:5000}},'TEST Village · TEST Region · UA');
 expect(rpc).toHaveBeenCalledTimes(1);
});
it('a delayed older query cannot replace the newer search results',async()=>{
 let resolve!: (value:unknown)=>void;rpc.mockReturnValueOnce(pending(new Promise(r=>{resolve=r;})));
 const view=render(<PlacePicker kind="city" onChoose={jest.fn()}/>);await tick();
 rpc.mockReturnValueOnce(pending({data:{items:[{...place,names:{und:'Latest'}}],has_more:false},error:null}));
 fireEvent.changeText(view.getByLabelText('territorySearch'),'Latest');await tick();
 await act(async()=>{resolve({data:{items:[place],has_more:false},error:null});});
 expect(view.getByText('Latest · TEST Region · UA')).toBeTruthy();expect(view.queryByText('TEST Village · TEST Region · UA')).toBeNull();
});
