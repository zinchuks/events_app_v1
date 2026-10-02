import { Screen } from '@/components/screen';
import { DiscoveryFeed } from '@/components/discovery-feed';
import { useLanguage } from '@/lib/i18n';
export default function HomeScreen() {
 const { t } = useLanguage();
 return <Screen title={t('browse')} home><DiscoveryFeed /></Screen>;
}
