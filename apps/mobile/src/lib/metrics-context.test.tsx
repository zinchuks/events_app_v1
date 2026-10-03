import type { Session } from '@supabase/supabase-js';
import { Pressable, Text } from 'react-native';
import { act, fireEvent, render } from '@testing-library/react-native';
import { MetricsProvider, useMetrics } from './metrics-context';
import { supabase } from './supabase';
import { sendMetric, setMetricPreference } from './metrics';
let mockSession: Session | null;
jest.mock('./auth-context', () => ({ useAuth: () => ({ session: mockSession }) }));
jest.mock('./supabase', () => ({ supabase: { rpc: jest.fn() } }));
jest.mock('./metrics', () => ({ sendMetric: jest.fn(), setMetricPreference: jest.fn() }));
const rpc = supabase!.rpc as jest.Mock;
const makeSession = (id: string) => ({ user: { id }, access_token: 'synthetic-' + id } as Session);
function Probe() {
 const { enabled, ready, failed, record, setEnabled } = useMetrics();
 return <><Text testID="consent">{enabled?'yes':'no'}:{ready?'ready':failed?'failed':'loading'}</Text>
 <Pressable accessibilityLabel="record" onPress={() => record('event_saved')} />
 <Pressable accessibilityLabel="opt-in" onPress={() => void setEnabled(true)} /></>;
}
const tree = () => <MetricsProvider><Probe /></MetricsProvider>;
beforeEach(() => { jest.clearAllMocks(); mockSession=makeSession('A'); jest.mocked(setMetricPreference).mockResolvedValue(true); });
it('a delayed old-owner opt-in cannot enable metrics for the next account', async () => {
 let resolveA!: (r: {data:boolean;error:null}) => void;
 rpc.mockReturnValueOnce(new Promise(r => { resolveA=r; })).mockResolvedValueOnce({ data: false, error: null });
 const view=render(tree());mockSession=makeSession('B');view.rerender(tree());
 await act(async()=>{resolveA({data:true,error:null});});
 expect(view.getByTestId('consent')).toHaveTextContent('no:ready');
 fireEvent.press(view.getByLabelText('record'));expect(sendMetric).not.toHaveBeenCalled();
 mockSession=null;view.rerender(tree());expect(view.getByTestId('consent')).toHaveTextContent('no:loading');
});
it('a stale consent read cannot overwrite a later successful choice', async () => {
 let resolve!: (r:{data:boolean;error:null})=>void;rpc.mockReturnValueOnce(new Promise(r=>{resolve=r;}));
 const view=render(tree());await act(async()=>{fireEvent.press(view.getByLabelText('opt-in'));});
 await act(async()=>{resolve({data:false,error:null});});
 expect(view.getByTestId('consent')).toHaveTextContent('yes:ready');
 fireEvent.press(view.getByLabelText('record'));expect(sendMetric).toHaveBeenCalledWith('event_saved',mockSession);
});
it('an unavailable consent stays fail closed and shows a retry state', async () => {
 rpc.mockResolvedValueOnce({data:null,error:{message:'synthetic offline'}});
 const view=render(tree());await act(async()=>{});
 expect(view.getByTestId('consent')).toHaveTextContent('no:failed');
 fireEvent.press(view.getByLabelText('record'));expect(sendMetric).not.toHaveBeenCalled();
});
