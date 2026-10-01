import { StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { ui } from './screen';
export function Field({ label, value, onChange, numeric = false, disabled = false }: { label: string; value: string; onChange(v: string): void; numeric?: boolean; disabled?: boolean }) {
 return <View style={{ gap: 6 }}><Text style={ui.text}>{label}</Text><TextInput accessibilityLabel={label} style={form.input} value={value} onChangeText={onChange} keyboardType={numeric ? 'numbers-and-punctuation' : 'default'} autoCapitalize="none" editable={!disabled} /></View>;
}
export function Toggle({ label, value, onChange, disabled = false }: { label: string; value: boolean; onChange(v: boolean): void; disabled?: boolean }) {
 return <View style={form.toggle}><Text style={[ui.text, { flex: 1 }]}>{label}</Text><Switch accessibilityLabel={label} value={value} onValueChange={onChange} disabled={disabled} trackColor={{ true: '#416b2b', false: '#cad5c2' }} /></View>;
}
export const form = StyleSheet.create({ input: { borderWidth: 1, borderColor: '#94a889', backgroundColor: '#fff', borderRadius: 9, padding: 12, fontSize: 16, color: '#172817' }, toggle: { flexDirection: 'row', alignItems: 'center', gap: 12 } });
