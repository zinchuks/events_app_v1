# Джерела даних та зовнішній доступ

Історичний стан S0 на 2026-10-01: **0 інтегрованих та наскрізно перевірених product sources**. Це shortlist, а не реальна афіша. Вимога S6 — щонайменше три живі джерела у двох країнах — ще pending. Upstream city feeds/tests не є дозволом на комерційне використання контенту.

## Shortlist

| Джерело | Покриття / acquisition | Доказ умов | Фактична перевірка / next action |
| --- | --- | --- | --- |
| [Madrid Agenda de actividades y eventos](https://datos.madrid.es/dataset/300107-0-agenda-actividades-eventos/information) | ES / Madrid, municipal/associated culture, education, family та інші activities; JSON/CSV/API resource candidate | Офіційна dataset metadata: CC BY 4.0; [умови порталу](https://datos.madrid.es/pages/condiciones-de-uso) дозволяють commercial/non-commercial reuse | Metadata і terms прочитані; daily за metadata, last update 2026-09-30. Resource page fetch failed у web tool, payload/import **unverified**. Рекомендований перший S3 source після fetch/schema/occurrence перевірки |
| [Barcelona agenda-diaria](https://opendata-ajuntament.barcelona.cat/data/es/dataset/agenda-diaria) | ES / Barcelona, city activities candidate | Dataset/спеціальні права **unverified**; коренева open-data назва не є ліцензією | Portal fetch **403**. Потрібно отримати доступні metadata/resource URLs і умови, перевірити live payload; не обходити access restrictions |
| [Toronto Festivals & Events](https://open.toronto.ca/dataset/festivals-events/) | CA / Toronto, festivals/events; CKAN dataset candidate | [Open Government Licence – Toronto](https://open.toronto.ca/open-data-licence/) прямо дозволяє copy/modify/translate/commercial reuse із attribution та винятками third-party rights | Dataset shell і загальна license прочитані; CKAN package_show через web tool недоступний. Dataset-specific licence/resources/live freshness **unverified**. Перевірити актуальний CKAN endpoint і resource terms; джерело другої країни |

Madrid metadata попереджає, що coverage не exhaustive і можливі дублікати; безкоштовна подія може вимагати реєстрації. Не називати це повною афішею Madrid. Третє джерело може бути замінене, якщо Barcelona access/terms не вирішаться; не маскувати blocker.

## Права та операційна картка до підключення

Для кожного source зберегти official terms URL/date/evidence, дозволи на commercial display, cache/raw retention, translation, derivative descriptions, image reuse, необхідний attribution, category/territory coverage, language/timezone, API quotas, polling cadence/TTL та контакт/permission якщо потрібно. CC BY Madrid потребує credit/source/license і позначення змін/перекладу. Toronto attribution та license link потрібні; third-party images/logos не покриваються автоматично. В MVP починати без копіювання зображень, доки права не підтверджено.

Raw payload зберігати лише в дозволених межах. Source status: proposed → terms_reviewed → adapter_tested → live_verified/active; failed/outdated не прирівнювати до zero events. Для цього shortlist last_success_at і product health **unknown**, polling ще не працює. Пропажу запису не трактувати як cancellation. Демо/synthetic fixtures маркувати окремо й не рахувати у real coverage. API/ICS availability, robots.txt і open-source license scraper не замінюють дозволи на контент.

Ticketmaster/Meetup/Eventbrite/upstream scrapers — references, не затверджені sources; ключі, quotas і redistribution terms тут не перевірені. Movie catalogue не є cinema showtimes. Для непідключених територій показувати coverage absent, а не fabricated events.

## Акаунти, ключі та інструменти

Інвентаризація обмежена workspace і tooling; приватні акаунти користувача не шукалися. У workspace не було env/credential/config файлів. «Не надано» означає відсутність доказу доступу, а не відсутність акаунта взагалі.

| Передумова | Фактичний стан | Етап / наступна дія |
| --- | --- | --- |
| Git / GitHub source network | clone доступний після sandbox approval; локальний Git ініціалізований без remote | S0 виконано |
| Supabase | CLI 2.34.3 є; Docker daemon не працює; project/keys не надано | S1 локальний Docker або dev project; S2 DB/RLS verification |
| Expo/EAS | starter містить чужий projectId; наш project/credentials не надано | S1 own IDs/config; S3 device push credentials |
| iOS tooling | Xcode 26.6, CocoaPods installed, але license gate; фізичний device access не підтверджено | Власник приймає Xcode license, simulator/dev build; real push device у S3 |
| Android tooling | adb та стандартний SDK не знайдено; device access не підтверджено | SDK/JDK/emulator або EAS + physical device |
| Apple/Google developer accounts | не надано/не перевірено | Signing, S9 sandbox billing, S11–S12 builds/store testing |
| RevenueCat | project/products/entitlement/offering/webhook не надано | S9; не блокує локальний S1 |
| AI provider | key/model access/budget не надано; початковий кандидат Anthropic, не підключений | S6 adapter + фактичний model/budget; не блокує базовий ingestion |
| Tiles/geocoder/boundaries | provider/keys/licensing не вибрані | Перед S4/S5; demo tile servers не production |
| Real source reuse | Madrid metadata terms reviewed; усі product imports unverified | Перший live payload/adapter у S3; 3 sources / 2 countries у S6 |
| Operator/support/brand | не надано; Event Radar робоча назва | S12 policies/metadata; не вигадувати реквізити |

Майбутні назви конфігурації без секретних значень — у [SETUP.md](SETUP.md). Не вимагати усі акаунти перед незалежною роботою S1.

# Demo-території S2

`supabase/seed.sql` створює 4 synthetic records: ES/UA і приблизні центри Madrid/Kyiv. IDs мають префікс `demo:`, `is_demo=true`, provenance записує ручне походження. Це власні тестові fixtures без скопійованих boundary datasets, без polygons і без заяви реального покриття. Demo marker показаний у mobile. Events/source feed у seed відсутні; тимчасова synthetic event інтеграційного тесту видаляється після тесту й не рахується live source.

## Madrid live subset — 2026-10-01

Офіційний ресурс: https://datos.madrid.es/egob/catalogo/300107-0-agenda-actividades-eventos.json.
Повторно прочитано dataset metadata й https://datos.madrid.es/pages/condiciones-de-uso: CC BY 4.0, attribution Ayuntamiento de Madrid. Commercial reuse/cache/адаптація дозволені; images не копіюємо. Дані нормалізовано (дати UTC/Europe/Madrid), тексти оригінальні, перекладу немає. Attribution і license link показані в UI.

1385 live records отримано, 930 single-day non-recurring імпортовано двічі без збільшення count. Це часткове покриття, не вся афіша Madrid. Multi-day й recurring records пропущено; відсутність запису не означає cancellation. Price/language/category/геометрія залишаються unknown, кінцевий час не виводиться з sentinel 23:59. Raw payload не зберігається в DB, є hash та checked_at. Metadata daily cadence не означає запущений scheduler: імпорт поки ручний. Непідключені країни/міста не мають live feed. Docker/local DB тепер працює (S2); історична інвентаризація S0 вище зберігає стан того аудиту.

### Оновлення S3

930 real imports, 868 мають exact `address.area.locality=MADRID`; city catalog/rule використовують лише їх. Інші 62 зберігають unknown territory й не маскуються під місто джерела. Explicit provider taxonomy mapped to product categories; unmapped → other. Entity decoding/date conversion/category mapping — нормалізація, не AI translation. Все ще один source/одна країна; вимога 3 sources/2 countries S6 pending. Нова implementation має atomic server batch/source lock, source hashes/derived versioning і повний rollback; попередні multi-call limitations вище історичні. Daily polling metadata не означає запущений cron, runner manual. Зображення не копіюємо, не вигадуємо координати/price/language/end.
