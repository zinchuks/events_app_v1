# Джерела даних та зовнішній доступ

Історичний стан S0 на 2026-10-01: **0 інтегрованих та наскрізно перевірених product sources**. Це shortlist, а не реальна афіша. На момент S0 вимога S6 ще була pending; актуальний стан S6 наведено нижче. Upstream city feeds/tests не є дозволом на комерційне використання контенту.

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

## S4 territorial data — separate from event-source coverage

Loaded geoBoundaries **gbOpen ESP ADM0/ADM1**, original source **Instituto Geográfico Nacional**, metadata confirms **CC BY4.0** for both Spain layers: [ADM0 metadata](https://www.geoboundaries.org/api/current/gbOpen/ESP/ADM0/), [ADM1 metadata](https://www.geoboundaries.org/api/current/gbOpen/ESP/ADM1/). Individual-country simplified GeoJSON represented2017, build2023, pinned repository revision9469f09. This is a historical simplified boundary dataset, not a cadastral/latest official worldwide map. Per-layer licence checked: UKR metadata has ODbL, so Ukraine geometry was NOT imported with a false CC BY attribution.

Exact bytes/URLs/hash/transformations: [boundary evidence](evidence/s4/boundaries.json). ESP ADM1: SHA256`b61a1bf661b90883763f633f5e9dbc27e7356309e42cbe56b60d2ceab5112f63`,974041bytes,19features. ADM0: SHA256`601fe37bde93a59012a493a0cdcfa24d1be52f309dd4205005a2fab6e18890cf`,672461bytes. Geometry validity checked by actual PostGIS; invalid geometry would fail migration, no silent repair. SQL converts Polygon→MultiPolygon; app asset strips unused properties, original coordinates retained. No imagery copied.

Country/city labels are original curated identification, not licensed coordinate estimates:24 country codes, Madrid+Barcelona+Kyiv+Paris+Toronto. Only Spain ADM0/ADM1 has boundaries; city geometries unknown. Madrid provider city's stable ID preserved; geographic hierarchy represents Madrid→Comunidad de Madrid→ES, Barcelona→Cataluña/Catalunya→ES, other cities→country. Other territories remain selectable with explicit no-event-coverage notice. Full-world catalog, tiles, geocoder and city boundaries not provided.

CC BY attribution appears in coordinate editor, with licence link and simplification/year notice; [licence text](../licenses/geoboundaries/CC-BY-4.0.txt), [notices](../licenses/geoboundaries/NOTICE.md). Admin/country boundary predicates tested with real dataset coordinates; known prices/languages/ages and radius/polygon event positions tested ONLY with transaction fixtures. Live Madrid adapter still provides none of those facts. Boundary datasets do not count toward S6's three live event sources. No new event source added in S4.

## S5 basemap (не джерело подій)

OpenFreeMap public instance, Positron style `https://tiles.openfreemap.org/styles/positron`, перевірено 2026-10-02: JSON version8/sources2/layers55 і actual browser tile rendering. [Quick start](https://openfreemap.org/quick_start/), [commercial use / attribution / no SLA](https://openfreemap.org/), [Terms](https://openfreemap.org/tos/) updated2026-09-09, [Privacy](https://openfreemap.org/privacy/). Public instance accepts commercial apps without API keys, but has no availability guarantees. Display OpenFreeMap / ©OpenMapTiles / OpenStreetMap links; underlying OSM data license/attribution is separate from MIT service code. Tile provider may receive viewport/network data; no auth or rules sent. No bulk offline tile download/cache/geocoding configured. Style snapshot in evidence/s5 records inspected response, not a pinned self-hosted tile service.

Madrid events still have no verified coordinates; basemap positions/labels do not infer event locations. geoBoundaries Spain ADM0/ADM1 remain the authoritative imported territory geometries for matching, independently of visual OSM basemap boundaries. Other countries' boundaries / external geocoder are unverified. The development-only map-preview uses eight explicitly synthetic points with no DB writes and no source claims.

## S6 — actual sources, 2026-10-02

**3 sources / 3 countries verified locally**, all partial coverage; original worker code and no copied upstream scraper. Latest counts/results: [S6_ACCEPTANCE.md](S6_ACCEPTANCE.md), [evidence/s6](evidence/s6). Earlier sections describe historical stage snapshots.

| Source | Rights/attribution reviewed | Acquisition / bounds / freshness | Verified / excluded |
| --- | --- | --- | --- |
| Madrid/ES | Ayuntamiento de Madrid, CC BY4.0; official dataset/conditions linked above | Allowlisted JSON≤8MiB, ≤2000 normalized rows, single-day non-recurring; cadence24h /TTL48h |1648 received/1182 normalized in last fetch. Provider location and free/price fields actually exist; previous adapters did not map them. Explicit numeric free1→0EUR; exact scalar amount accepted; empty/ranges→unknown. Actual validatedWGS84 points; no geocoding/inferred event language. End sentinel not treated as actual closing time |
| Toronto/CA | Dataset page links [Open Government Licence Toronto](https://open.toronto.ca/open-data-licence/); mandatory exact credit in NOTICE/UI. CKAN license_id=notspecified is explicitly insufficient evidence; dataset-specific official link was reviewed | CKAN package9201059e-43ed-4369-885e-0b867652feac / JSON resource8900fdb2-7f6c-4f50-8581-b463311ff05d. File223030906bytes; incremental prefix≤32MiB /5000 inspected /400 imported, one venue, next60 days; cadence24h /TTL48h |28 sessions/3301 inspected in last fetch; parent calendar_id stored as provenance, each source row ID/start separate. Explicit GPS/Yes free flag→0CAD. Toronto city requires provider postalM-prefix; other Canadian location→country if explicit, otherwise territory unknown. Unexpected truncation fails; reaching declared cap marks bounded_subset. No full-feed claim |
| Helsinki/FI | City of Helsinki Linked Events, CC BY4.0 unless specifically stated; [official source licence statement](https://github.com/City-of-Helsinki/linkedevents/blob/master/helevents/templates/rest_framework/root.html); no images (event_only/photographer rights excluded) | [API](https://api.hel.fi/linkedevents/v1/), event endpoint, include=location,keywords; latest-modified≤3 pages×100 /≤4MiB per page, next60days; source timeout25s, child total120s; cadence6h /TTL12h |59 normalized in last poll /79 accumulated future cache. Explicit Helsinki municipality ocd division required. Skip parent series/ambiguous sessions and old/invalid dates. Exact UTC offsets/EuropeHelsinki and provider points; paid ranges unknown. Native provider en translation/summary licensed/cached. EventCancelled support verified with fixtures; no observed live cancellation transition |

Poller endpoints/redirects are HTTPS-host allowlisted, URLs never read as commands. Organizer links only from explicit public HTTPS source fields; no worker fetch of organizer URLs. When a precise public event deep link is not verified/provided, preserve the original dataset/API URL rather than manufacture a query-ID link. Old/past records and missing records are not silently removed/cancelled. Raw upstream contacts/images/full payload are not persisted in DB or product checkout; minimal licensed fixtures keep attribution.

Source success/claim/failure state is server-only except public checked-time/coverage/licence/counts RPC. Empty or invalid batches never mark healthy. Source-specific TTL applies to manual digest freshness; feed preserves originals if translations unavailable. CLI currently local/manual due polling; no production daemon/cron deployed. Barcelona remains403/unreviewed and is not counted; Paris/other shortlisted sources not connected.

AI user confirms access but provider/model/budget still absent; no live AI service configured. Source-native English does not claim Ukrainian AI translation. [Data notices](../licenses/event-sources/NOTICE.md).
