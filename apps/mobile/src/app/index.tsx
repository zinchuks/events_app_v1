import { Screen } from '@/components/screen';
import { LiveEvents } from '@/components/live-events';
import { useLanguage } from '@/lib/i18n';
export default function HomeScreen() {
 const { t } = useLanguage();
 return <Screen title={t('discover')} home><LiveEvents /></Screen>;
}
