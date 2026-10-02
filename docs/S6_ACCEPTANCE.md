# S6 — джерела перевірені, AI blocked

Дата: 2026-10-02. S6 частково виконано; S7–S12 не починалися. Акаунт, правила, збереження та історичні добірки не скинуто. Локальний браузер: http://localhost:8087. Не називати це готовим MVP.

| Критерій | Реальний результат |
| --- | --- |
| ≥3 живі джерела / ≥2 країни | **verified**: Madrid/ES, Helsinki/FI, Toronto/CA; HTTPS fetch → original Python adapters → atomic local Postgres → public feed |
| Права / attribution | **reviewed**: Madrid й Helsinki CC BY4.0, Toronto Open Government Licence; official evidence/URLs у SOURCES та licenses/event-sources/NOTICE.md. CKAN `license_id=notspecified` не використано як дозвіл: official Toronto dataset page прямо посилається на licence |
| Registry / bounded polling | **implemented + tested**: server-only claims, 4-minute leases, cadence 24h/6h/24h, TTL48h/12h/48h, bounded payload/page/row/time caps, source-specific exponential failure backoff5min→24h. One-shot і local automatic watcher checks due state; two60s cycles/shutdown verified; hosted cron/service не встановлено |
| Extraction / factual quality | **verified sample**: 3 actual minimal source snapshots + 24 Python tests; ручна звірка Madrid paid3EUR/explicit point, Toronto distinct calendar rows/free flag/GPS, Helsinki known UTC/point/price range→unknown/provider English. Це sample QA, не повний аудит усіх описів |
| Updates / versioning / identity | **verified**: normalized fact hash ignores fetch clock and contacts; repeated identical batch keeps IDs/version, derived changes invalidate current cache even if supplied hash unchanged. Existing Madrid occurrence IDs retained. Explicit Helsinki EventCancelled updates statuses/version; cancellation proof is SQL/Python fixture, live cancellation transition unverified |
| Safe dedup/review | **verified fixture**: exact cross-source title+venue+country+known UTC+points≤100m produces private candidate; different sessions never merge. Review queue only; no automatic merge, no S10 admin review UI. Real cross-source duplicate not encountered in these three-country subsets |
| Категорії / unknown values | **verified**: explicit provider taxonomy/keyword dictionary; unmapped→other. Free only explicit flags; exact Madrid scalar prices accepted, ranges/empty stayunknown. Event language/age remain unknown when not provided; no geocoding/title guesses |
| Переклад / короткий опис | **verified source-native**: Helsinki source English translations and short descriptions in version/locale cache; ready/current/permitted-source RLS. Detail language choice does not mutate profile; original remains visible and cached translation absence does not block feed |
| AI adapter / real model access / budget caps | **blocked, not implemented**: user confirmed access exists but has not yet supplied provider, exact model ID, daily amount/currency or configured server key. No model guessed, no API key copied into client, no AI requests/spend. Source-native cache is not proof of AI dedup/billing/outage handling |
| Browser | **verified**: source cards/licence links/counts, real Helsinki Karaoke, original fallback→English source translation, real MapLibre/OpenFreeMap marker/clusters at390×844; no browser console errors. Screenshots in evidence/s6 |
| iOS / Android / SMTP / push | **unverified/blocked unchanged**: browser-only user, Xcode licence gate, absent Android SDK/adb, no device push or external SMTP; JS export is not a native build |

## Фактична локальна афіша

Початковий QA snapshot після імпорту, 12:13UTC: **1276 майбутніх сеансів**, з них1202 із координатами. Madrid1169 (1095 mapped /1001 known price), Helsinki79 (79/70), Toronto28 (28/28). Це накопичена вибірка дозволених записів; записи, що випали з bounded window/prefix, не скасовано автоматично. Кількості змінюються із часом та live data.

Початковий batch: Madrid1182 із1648 upstream records; Toronto28 із3301 inspected rows/32MiB; Helsinki59 із300 inspected records. Helsinki totals79 більше за batch59, бо latest-modified pages змінюються і пропажу запису не трактуємо як cancellation. Toronto prefix обмежений32MiB від upstream файла223030906bytes; не вся афіша. Madrid excludes recurring/multiday; Helsinki excludes parent series/multiple-session ambiguity/non-Helsinki municipality.

## Перевірки

- `pnpm check`: types/lint,16 Jest +8 Node tests, env/secret scans pass.
- Python stdlib runner:24 tests, ruff lint/format pass; live fixture equality for all3 sources.
- `pnpm test:s2`108, `test:s3`84, `test:s4`191, `test:s5`69, `test:s6`68 actual local API/Auth/RLS assertions pass. S4/S5 checks now compare actual known price/coordinates instead of assuming every live value isNULL. No push sent.
- `supabase/tests/s6_invariants.sql`: ROLLBACK PASS; atomic invalid-batch/health, nonempty imports, single lease/due/backoff, versions/identity, cache RLS, blocked-source direct detail, source-specific digest TTL, review candidates and explicit cancellation. S6 added to CI workflow; remote CI execution remains unverified.
- `pnpm export:mobile`: web/iOS/Android JS exports; `pnpm check:client-bundles`: no server keys in generated client outputs; `pnpm build:admin` pass. These are not native binaries.
- `pnpm audit:deps` still **exit1**: node-forge high GHSA-86w9-cpqp-85rv without published fix, plus1 moderate. Gate stays enabled.
- Performance regression found/fixed: same1182-row Madrid rollback batch89.280s original /74.810s with JIT off /**0.442s** with indexed timezone-name inventory. Nested SQL statistics isolated repeated `pg_timezone_names` constraint checks. Offset/DST calculations still use PostgreSQL timezone data; name inventory must be refreshed on DB tzdata upgrade. Final Madrid live fetch+normalize+API import1.734s.

Proof: [evidence/s6](evidence/s6), [source cards](evidence/s6/sources-mobile-web.jpg), [source English translation](evidence/s6/translation-mobile-web.jpg), [real Helsinki map](evidence/s6/map-real-helsinki.jpg).

## Далі в межах S6

Потрібні **назва провайдера, exact model ID, денний ліміт із валютою**. Ключ — лише server env, не в чат/коміт/mobile. Після цього: verify official provider contract/pricing/access; implement server-only structured adapter, conservative reservations/daily cap, idempotent version/locale/model/prompt cache, retry/outage/malformed-output tests, authorized bounded live smoke. До цього S6 не complete; S7 не починати.

Ручна перевірка користувача:

1. У «Події» оберіть «Усі події» й відкрийте «Джерела подій»: три країни, partial coverage, licence/checked time.
2. У пошуку введіть `Karaoke`, відкрийте подію Helsinki й натисніть English: має бути позначка «Переклад надано джерелом» та original нижче. Український переклад може бути відсутній.
3. Натисніть «Карта»: реальні координати/маркери, жодної GPS-вимоги. Невідомі місця залишаються тільки у списку.
4. У «Збережені» перевірте раніше збережену подію Madrid; user account/rules були збережені. Відомі ціни перевіряйте в оригіналі, безкоштовність не гарантує відсутність реєстрації.

Implementation checkpoint: `0b1e3f03130ae83945b7f7c2bd0c5771da0bb121`; local only, no push.

## Продовження S6 — автоматичне локальне опитування

- `pnpm ingest:s6:watch`: wake60s, sequential due-only cycles, cadence/leases/backoff у БД; force-mode заборонено. Коректна зупинка Ctrl+C/SIGTERM, bounded child/API calls. Source claim/fetch failure не перериває інші джерела. Не встановлено системний/hosted service; uptime після sleep/reboot неперевірений.
- Actual two-cycle run:3 джерела перевірено двічі з паузою60s, усі not_due_or_leased, failures0; зайвих зовнішніх fetch не було. Actual Ctrl+C during wait:cycles1/failures0/stoppedtrue. In-flight shutdown/SQL rollback/ambiguous HTTP handling verified with explicit unit fakes, не live fault injection.
- Новий асинхронний runner: actual Helsinki fetch→normalize→local API import52 sessions,300 inspected/2329778bytes/7.778s; last_success12:55:39UTC. Accumulated future cache в integration snapshot:1299 sessions /1225 mapped (Madrid1169/Helsinki102/Toronto28). Missing records retained, never auto-cancelled.
- Міграція026 застосована без reset. Нові S4 добірки перевіряють TTL джерела **і кожної події**. SQL transaction proof: fresh source + old Helsinki record rejected; catalog/old digest still readable; actual record refresh keeps unchanged digest identity. Legacy S3 excludes stale records. Усі synthetic writes ROLLBACK.
- `pnpm check` pass:16 Jest +20 Node tests (12new orchestration failure/shutdown/cadence tests); live S3=84/S4=191/S6=68; SQL invariants PASS. Client source/dependencies/schema signatures не змінено; попередній mobile export/native/security status лишається історичним proof, не повторним native run.
- Локальний збирач залишено запущеним разом із Supabase/web; log `/private/tmp/event-radar-s6/polling-worker.log`. Процес залежить від поточної IDE/термінальної сесії, не production availability.

[Proof цього продовження](evidence/s6/polling-results.json). AI provider/model/daily budget/server key досі не надані; жодних AI calls/spend, S6 залишається in_progress; S7–S12 не починалися.
