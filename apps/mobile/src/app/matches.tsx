import { Redirect } from 'expo-router';
// Preserve S4 deep links while presenting one searchable discovery flow.
export default function MatchesScreen(){return <Redirect href={{pathname:'/',params:{mode:'matches'}}}/>;}
