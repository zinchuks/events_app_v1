# Прогрес Event Radar

Оновлено 2026-10-03, Europe/Madrid. Поточна задача: **S10** за новим «продовжуй» (P4). Admin Auth/roles, registry CRUD, monitoring/coverage/AI usage/jobs, audited persistent corrections/categorization і logical duplicate merge **implemented та local verified**. Реальний custom backup→restore перевірено у власній ізольованій локальній DB з synthetic даними, Auth helpers/RLS/grants та lookup-before-data; **S10 blocked** до фактичного staging restore. Hosted staging/backup/operator access не надані. S9 actual RevenueCat/store purchase/restore, S6 actual AI й S3/S7/S8 real device push лишаються blocked; користувач поки перевіряє браузер. Наявний локальний owner має audited admin-role, Free1/paused paid rules/saved2 збережені. Audit2026-10-03: **2 high +1 moderate,0 critical; gate failed**, findings не приховані. **S11–S12 не розпочато.** Докази — [S10_ACCEPTANCE.md](S10_ACCEPTANCE.md), [verification](evidence/s10/verification.json), runbook — [S10_OPERATIONS.md](S10_OPERATIONS.md); команди — [SETUP.md](SETUP.md). Нижче — історичні результати попередніх дат.

| Етап | Статус | Доказ / наступна дія |
| --- | --- | --- |
| S0 | **verified** | Перевірено код/licenses/SHA/manifests/recent Git семи кандидатів; виконано basic checks Obytes і community-calendar, додатково Simonstorms/event-discovery; обрано одну mobile основу й ingestion спосіб; документи та blockers зафіксовані |
| S1 | **implemented** | Mobile/admin/worker основа, env/runtime/locks/CI; browser startup/toggle, code checks, exports pass. Native builds і remote CI unverified |
| S2 | **implemented** | Local PostGIS/migrations/19 RLS tables, email Auth/privacy/uk-en-es; 108 real integration checks + browser QA pass. Native/storage/external SMTP/remote CI unverified |
| S3 | **implemented; real push blocked** | Madrid → atomic DB → city/category rule → detail/save → private digest → local transport fixture verified. Device delivery/native build unverified |
| S4 | **implemented** | Owner CRUD/пауза, multiple territories/radius/polygon/filters, union without duplicates. 73 actual API + 49 rollback SQL checks, browser QA pass; native unverified |
| S5 | **implemented; native unverified** | 4-step onboarding, unified search/paged feed, actual OpenFreeMap/MapLibre web map + editor/offline fallback, saved/inbox/settings. 69 API + 24 SQL checks; native acceptance і clean security gate blocked |
| S6 | **in_progress; AI blocked** | Madrid/ES + Toronto/CA + Helsinki/FI live imports; source registry/leases/backoff/source+record TTL/local automatic polling, safe review, real price/points, native-source English cache/browser verified. Disabled AI budget/cache foundation tested; actual adapter/access/pricing/budget config still blocked; [acceptance](S6_ACCEPTANCE.md) |
| S7 | **implemented; real device push blocked** | Durable schedules/DST/quiet/pause/full history, fenced jobs/retries/receipts; 54 SQL + 13 concurrency + 56 API checks, real timed 137-event browser digest; [acceptance](S7_ACCEPTANCE.md) |
| S8 | **implemented; native push unverified** | Saved before/after updates/cancellation, rescheduled known-time reminders, stale/unknown and audited manual overlays; 69 SQL +16 concurrency/timed +58 API, browser uk/en/es; [acceptance](S8_ACCEPTANCE.md) |
| S9 | **blocked; local foundation implemented/verified** | RevenueCat SDK10.11.0, server Free/Plus/effective pause/expiry/grace, authenticated local webhook/reconcile, paywall/restore code;42 SQL +11 concurrency/clock +50 actual API/HTTP checks. Real provider/store/native purchase/restore відсутні; [acceptance](S9_ACCEPTANCE.md) |
| S10 | **blocked; local foundation implemented/verified** | Admin roles/CRUD/monitoring/audited corrections/category/merge;45 SQL +12 concurrency/restore +25 actual Auth/API, browser uk/en/es. Local restore verified; staging restore unverified; [acceptance](S10_ACCEPTANCE.md) |
| S11 | pending | Device beta/E2E/performance/release builds |
| S12 | pending | Release/store metadata/policies/operator data |

`verified` для S0 означає готовий **аудит і рішення**, а не verified native platforms або інтеграції. Native builds не є критерієм pass S0: план вимагає явно оцінити їх доступність. Всі недоступні перевірки нижче лишаються unverified. `pending` означає етап не розпочато; `implemented` — код є без повного proof; `blocked` — записувати виконану частину, blocker і next action, коли відповідний етап розпочнеться. Не називати продукт MVP-ready.

## Що зроблено у S0

- Прочитано обидва вихідні документи та надане глобальне правило Git; вихідні файли не редаговано.
- 7 pinned SHA + ліцензії, manifest/lock hashes, 20-commit shallow histories та evidence snapshots. Кандидати окремо в `/private/tmp/event-radar-s0/`.
- Obytes: install/TypeScript/CI ESLint/config/JS export обох платформ/Metro status pass; Jest 40/40 із warnings. Community-calendar: AST 209 files, 73 tests у subset без lxml; full install **failed**. Simonstorms: install/typecheck/Node23 lint/config/JS export pass; event-discovery: 60/60 tests.
- Обидва mobile dependency checks **failed drift**, обидва registry audits мають findings. Obytes critical `shell-quote` і `tar` — обов'язковий remediation gate S1, а не прихований pass.
- Обрано **adapt Obytes**; **selective Python adaptation community-calendar**. Whole-repo merges, arbitrary scraper shell commands і personal integrations відхилені. Деталі в ARCHITECTURE/DECISIONS.
- Створено required docs, короткий AGENTS.md, THIRD_PARTY/DECISIONS, evidence й license snapshots та .gitignore. Product source/CI/env/locks не створювалися.
- Локальний Git init на `main`; remote не створено, push не виконувався. Checkpoint S0: `0ba9120c055edbe67da340cbac99f5a24dfe1f96`. Подальший документаційний commit записує цей SHA та результати фінальної перевірки; власний SHA фінального HEAD доступний через `git log -1`.

## Блокери / неперевірене, з next action

| Перевірка | Стан / blocker | Наступна дія |
| --- | --- | --- |
| iOS native build/run | unverified; Xcode license gate (`simctl`, CocoaPods) | Власник переглядає/приймає угоду, перевірити simulator і build після S1 import |
| Android native build/run | unverified; adb/standard SDK absent | SDK/JDK/emulator або EAS + physical device, потім S1 native smoke |
| community full install | S0 failed на Python 3.13 і 3.11; legacy lxml gate | S1 worker має stdlib-only runtime і працює; selective import адаптерів із новими pins — S3 |
| Product dependencies | S5 audit: 0 critical, **1 high node-forge** через Expo CLI (no patch), 1 moderate decode-uri-component | Await audited upstream fix/retest; CI audit gate залишається увімкненим і failed. Повний snapshot evidence/s5/dependencies-audit.json |
| Supabase DB / RLS | local verified: Docker 29.8.1, Postgres 17.4/PostGIS 3.3.7, 19/19 RLS tables, 108 real Auth/API checks | Managed staging/production deployment не виконано; S3 може використовувати local DB |
| Push/billing/AI/maps/external auth | unverified; accounts/keys/device evidence не надано | Налаштовувати за етапами S2/S3/S5/S6/S9, не блокувати незалежний S1 |
| Real data | S6: 3 real sources/3 countries; partial live cache1276 future sessions1202 mapped at12:13UTC. Barcelona403 still not approved | Coverage/safe TTL/source-specific caps documented; full city calendar never claimed |

Команди й exit/results див. SETUP та evidence/s0; mocks не використовували як real-integration proof. License review — code/direct package metadata, не повний distribution/legal clearance усіх transitive/native assets.

## Що зроблено у S1

- Selective Obytes import із MIT license, exact upstream paths/SHA й adaptation notices; власні mobile IDs/schemes, системні fonts, без demo providers. Стартовий екран і працездатний toggle опису.
- Мінімальний Vite admin shell і executable Python worker check (0 adapters, DB disconnected). Не додавали функції S2: DB/Auth/RLS/i18n, CRUD чи ingestion.
- Node 22.23.3 / pnpm 10.34.6, pnpm/uv locks, 6 порожніх credential env examples, dev/staging configs/EAS profiles, CI workflow. GitHub Actions execution unverified: remote не створено.
- Security updates усунули critical/high; Metro image-size Buffer patch з реальним PNG regression test; вузький resolver guard усунув Uniwind/RN Web dev import cycle, знайдений під час browser QA. Один moderate backlog записано вище.
- Frozen install, TypeScript, ESLint, 8 UI + 3 Node tests, env і token-pattern checks, admin build, Expo dependency check, Doctor 18/18, iOS/Android/web JS exports: pass. Worker Ruff check/format і CLI development/staging: pass.
- Реальний local web startup у Chrome, mobile viewport 390×844, відкриття/згортання опису та admin startup: pass. [Доказ](evidence/s1/mobile-web.png), [результати](evidence/s1/results.json), [SETUP](SETUP.md). Native compile/run/device acceptance лишаються unverified; exports їх не замінюють. Через ці межі S1 позначено implemented, не загальне verified всіх платформ.

## Що зроблено у S2

- Docker blocker знято; окремий `event-radar-local` Supabase stack, two migrations + original demo territory/category seed, generated typed DB contract. DB створено з нуля, 19/19 RLS tables і PostGIS version перевірені.
- Private owner RLS та restricted grants; raw ingestion server-only, entitlements/jobs/digests client read-only; composite parent-owner FKs. Auth trigger allowlists signup locale. UTC/date-only/unknown/timezone/price constraints не вигадують факти.
- Mobile email/password signup + OTP confirmation/recovery, session validation/persistence/foreground refresh, logout, self-delete RPC/explicit confirmation. SQL delete cascades private data/auth sessions, preserves public catalog. Native SecureStore chunked adapter має failure/concurrency/Unicode unit tests, але device evidence відсутнє; web storage tested.
- Усі current mobile/admin UI keys uk/en/es; independently persisted locale/translation preference + IANA timezone. Demo territories видно з marker; boundaries/live events не завантажено. Світла theme виправила невидимі dark variant labels під час visual QA.
- Frozen install / TypeScript / lint / 12 Jest + 3 Node tests / env/token scan / admin build / dependency check / Doctor18/18 / three JS exports: pass. Actual Auth/PostgREST/Mailpit integration **108 checks pass**, cross-owner changes and self-delete/public preservation підтверджені, не mocks.
- Browser: real login, uk/en/es, profile save, session + settings restore after reload, delete-confirmation/cancel, logout/reload, admin translation startup pass. External SMTP, managed staging, iOS/Android auth/storage і remote CI execution лишаються unverified.
- Keys тільки в ignored local env/temporary tools. Actual client exports не містять local server-role key. CI додано local DB/Auth job; agent не створював remote і не виконував push. Dependency audit 1 moderate decode-uri-component лишається.

Докази S2 — [results.json](evidence/s2/results.json), [integration.log](evidence/s2/integration.log), [auth screen](evidence/s2/mobile-auth.png). Checkpoint **`d87c16dce40139e2b9543fdfefcf18c1bde7a892`**. S2 має статус implemented через відсутність native acceptance; local DB/Auth/browser частина перевірена. QA Metro/admin servers зупинено; Docker/local Supabase залишено працювати. Own fixtures прибрано; unrelated local data не чіпали.

Фінальний S2 review: frozen lock/types vs DB/code/tests/exports/integration pass, Markdown links/evidence JSON valid, staged diff check pass. Generated types збережено byte-for-byte з CLI (лише blank-at-EOF attribute); product whitespace checks лишаються. Working tree чисте після checkpoint. Наприкінці виявлено наявний origin, доданий поза діями agent; його не змінювали. Agent не виконував push, remote CI execution не перевірено. Окремий documentation commit записує SHA checkpoint; actual HEAD — `git log -1`.

Наступний етап — **S3**, лише за новим завданням: потрібні fetch/schema/rights review першого live source та actual ingest/DB/mobile/digest workflow. Push потребує own Expo credentials і device; local DB більше не blocker. Native tooling/SMTP/staging налаштовуються незалежно. S3 adapters/matching/digest/push не реалізовано у S2.

Історична фінальна перевірка S0: links/JSON/SHA/license snapshots узгоджені; product paths тоді відсутні. Upstream license whitespace збережено окремим attribute.

S1 checkpoint: `7e577d816bd8d4999e7ef2ce68bd4fb30a23e479`. Фінальна перевірка: staged diff check pass, S1 JSON/import paths/local Markdown links pass, Obytes license збігається byte-for-byte. Working tree після checkpoint чисте; remote list порожній, push не виконувався. Цей окремий documentation commit записує SHA checkpoint; поточний HEAD див. `git log -1`. QA dev servers зупинено, запуск описано у SETUP.

## Локальний вхід і live афіша (новий запит, 2026-10-01)

- Авторизований акаунт створено/підтверджено стандартним signup OTP через локальний Mailpit; password sign-in API перевірено. Наявні чужі дані збережено, reset не виконувався. Пароль/OTP/session не записані в repo/evidence.
- Причина відсутності Gmail листа: local Mailpit capture, SMTP не підключений. Користувач обрав поки локальний вхід. У dev формі показано чесне пояснення й адресу Mailpit. SMTP delivery залишається unverified.
- Madrid official JSON отримано: 1385 записів; консервативний adapter імпортує 930 single-day non-recurring records. Multi-day/recurrence/неоднозначний DST пропускаються. Ціну, мову, координати, кінцевий час не вгадуємо. Raw payload у DB не зберігаємо; hash/provenance є.
- Два live імпорти, після другого 930 events / 930 occurrences: дублікатів не додано. Local-only runner, service key тільки в пам’яті; ручний refresh, без cron/production concurrency гарантій. Немає digest/push/rules/AI/перекладу, повний S3 не завершено.
- Головний екран читає до 30 майбутніх occurrences через public read-only API, показує оригінальні описи/час Europe/Madrid, venue/checked_at, attribution/license та кнопки оригіналу. Список реально перевірено в Chrome.
- `pnpm check`: pass (12 Jest + 3 Node), Python Ruff pass, 4 adapter tests pass (DST gap/fold, date-only, series/range skip). Native run лишається unverified.
- Browser login attempt заблокований modal попередженням 1Password про localhost; browser CDP timeout, native Computer Use permission відсутній. API login успішний; завершений UI login цим запуском не підтверджено. Потрібно закрити попередження менеджера паролів і натиснути «Увійти».
- Web `http://localhost:8087`, admin `http://127.0.0.1:5173`, Supabase/Mailpit запущені й залишені для користувача. Push не виконувався.

## S3 — браузерний наскрізний сценарій, 2026-10-01

- Користувач явно замовив завершення S3 й обрав «поки лише браузер». Правило: один підтверджений Madrid city record (без вигаданих boundaries/центрів), кілька категорій OR, місто AND категорії, fixed horizon 30 days у Europe/Madrid. Інші міста/radius/polygons/повний CRUD S4 не реалізовували.
- Provider taxonomy → explicit category mapping, невідомі типи → other; city membership лише exact official `address.area.locality=MADRID`. 930 imported records / 930 occurrences, 868 city-scoped. Ціни/мови/coordinates/end time лишаються unknown. HTML entities decoded як форматування; текст не перекладається.
- Server-only bounded batch RPC + advisory lock: весь імпорт atomic. Repeated unchanged batch зберігає IDs/version; raw hash або derived title/category/time changes invalidate version. Невдалий batch rollback перевірено. PostgREST RPC-specific 120s timeout для server batch (звичайний API timeout не змінювали).
- Public catalog paginated 30 records, known/date-only chronological ordering; mobile detail/source/last_checked/original link, owner saved events, uk/en/es. Private simple-rule RPC та atomic digest/items/job; owner validation і policy-restricted writes. Concurrent/repeated creation returns same digest за однаковим набором/версіями/часом/категоріями у поточний день. Стара добірка зберігає membership, detail читає current event; immutable content snapshot/S8 history не заявляємо.
- Local fixture lease/claim/recovery/deterministic delivery row + journal verified, sends=0. Native Expo registration/opt-in/out, token transfer, validated digest deep link, manual Expo sender/tickets/receipts implemented. Actual native/device/EAS/APNs/FCM/network delivery blocked: user currently browser-only. Expo contract tests є explicit fakes, не real delivery proof. Expo timeout/ambiguous response не повторюється автоматично; failed/stuck claimed jobs потребують ручного review до S7.
- Реальний браузерний вхід у наданий акаунт pass; music categories → **89-event digest**, detail і save першої музичної події, reload/session/save persistence, inbox, повторний build same loaded URL pass. Account лишено logged in, початкову Ukrainian locale відновлено. Музичне правило/добірка/одна збережена подія залишені для користувача. Попередній 1Password blocker обходити не довелося: звичайне посимвольне введення дозволило завершити вхід.
- Browser 390×844 visual QA pass, uk/en/es pass. Порожній raw string child React Native Web виправлено; clean final page home→digest→detail→inbox має **0 errors**. Native screenshots не отримано.
- `pnpm check` pass: 12 Jest + 7 Node (4 transport fake contract tests); 5 Python adapter tests/Ruff pass; real S3 **84** local API checks pass; S2 **108** regression checks pass. SQL rollback test confirms unchanged version, derived/time versioning, complete failed-batch rollback. Frozen install/Expo Doctor18/18/JS exports/bundle server-key scan pass. Audit 0 critical/high, 1 moderate decode-uri-component.
- CI додано Python adapter та transaction invariant checks; live-source test має окрему manual команду, CI не залежить від доступності міської афіші. Remote CI execution unverified; push не виконувався. Наявні акаунти/дані збережено, reset не виконувався, own test accounts прибрано.

Докази — [results.json](evidence/s3/results.json), [integration.log](evidence/s3/integration.log), [digest-mobile-web.png](evidence/s3/digest-mobile-web.png). Команди та ручна перевірка — SETUP. Статус S3 **не verified повністю**, доки одна реальна подія/добірка не доставлена physical-device development push. Наступний доступний етап S4 потребує нового завдання; автоматичні графіки/quiet hours/full durable retries лишаються S7.

## S4 — території та незалежні правила, 2026-10-01

- Новий запит «продовжуй» авторизував наступний доступний S4. S3 real device push blocker збережено; S5 та наступні етапи не розпочиналися.
- 24 original curated ISO country labels, 19 real Spanish ADM1 territories, 5 cities (Madrid, Barcelona, Kyiv, Paris, Toronto). Іспанія ADM0 й усі її ADM1 мають pinned licensed simplified boundaries geoBoundaries / Instituto Geográfico Nacional, CC BY 4.0, represented 2017. Це не кадастрові/актуальні офіційні межі всього світу й не нові джерела подій. Інші country/city geometries unknown; hierarchy/identity не підмінено centers/radii.
- `save_s4_rule` атомарно перевіряє/зберігає owner rule + 1–20 areas. Нові/редаговані правила, pause/resume RPC, owner delete/cascade; S4 direct settings/area writes закриті RLS, legacy S2/S3 owner contracts збережені. Technical development guard: ≤20 saved S4 rules через RPC, не Free/Plus entitlement; тарифні обмеження належать S9.
- Radius: WGS84 geography/ST_DWithin, 1m–500km; 1 micrometre numerical tolerance на межі (PostGIS ST_Distance rounds output). Polygon: 3–100 distinct ordered vertices, server closes ring, no zero-area/self-intersection; antimeridian crossings explicitly rejected. `ST_Covers` includes boundary points. Unknown coordinates ніколи не match radius/polygon; country/admin/city можуть використовувати verified territory hierarchy, country code або actual loaded boundary.
- Categories OR, areas OR; filter groups AND. Explicit currency/budget без FX; event-language exact code matching незалежне від interface/translation; unknown language/price/age policy; age interval overlap, incomplete provider age range treated unknown. Empty groups disable that filter. Inclusive custom dates або rolling 1–366 days, IANA rule timezone; known UTC й date-only збережено, undated excluded.
- Owner-only combined result pages30 містять matched rule IDs, одна card/occurrence. Manual union digest дедуплікований/idempotent/concurrent-safe; IDs/versions/times/settings/freshness прочитані в одному MVCC snapshot. Source stale >48h blocks new digest; max5000 items, client pages1000. S4 не створює push jobs/розклад. Historic membership зберігається після rule deletion, деталі актуальні.
- Browser UI uk/en/es: rules/list/editor/matches, coordinate entry + tap-to-add polygon/radius map, simplified Spain outlines, zoom/move/undo/geometry editing; без GPS чи tile network. Elsewhere лише координатна сітка. Це мінімальна залежність S4; full MapLibre/feed map/geocoder/onboarding — S5. Native map/pointer behavior unverified.
- Actual browser account: збережено два музичних S4 rules (Madrid і ES/UA), union **89 music occurrences**, repeat opens same digest. Pause/resume final RPC, restored editor values, session/reload, uk/en/es, invalid self-intersection message, map click/coordinate entry, missing private digest state перевірені. Нові rules/digest залишені користувачу; unrelated S3 preferences не перезаписували. Clean final QA tab: **0 console errors**, viewport390×844, screenshots attached.
- `pnpm check`: 14 Jest + 7 Node tests; `pnpm test:s4`: **73** actual local Auth/PostgREST/RLS checks on imported live Madrid catalog; rollback SQL: **49** PostGIS/filter assertions with explicit transaction-only fixtures. Known price/language/age/coordinates semantics мають synthetic SQL proof, реальні Madrid values unknown. S2 **108**, S3 **84** regressions pass; three JS exports, client key scan56 files, generated types vs DB, admin build, frozen install, Expo dependency check/Doctor18/18 pass. Registry audit: 0 critical/high, 1 existing moderate. CI SQL coverage added; remote execution unverified.
- DB не скидали, existing accounts/live data preserved. SQL fixtures rolled back, only own `s4-*@example.test` API users cleaned. Existing origin unchanged; no push. Local web/Supabase left running.

Докази й межі — [S4_ACCEPTANCE.md](S4_ACCEPTANCE.md), [results.json](evidence/s4/results.json), [spatial-filters.log](evidence/s4/spatial-filters.log), [integration.log](evidence/s4/integration.log). S4 статус **implemented**, не fully verified on iOS/Android. Native prerequisites залишаються: Xcode license owner action, Android SDK/JDK або own EAS builds/device. Full-world boundaries/tiles/geocoder не підключені. Наступний етап S5 — лише за новим завданням; S6 sources/AI, S7 schedules, S9 billing ще pending.

S4 implementation checkpoint: **`9b7e55661acdc4e72f36922d9bba021cda1a88af`**. Окремий documentation commit записує цей SHA; actual HEAD — `git log -1`. Фінальний staged whitespace check pass, fixtures remaining0, real events930 preserved, existing origin unchanged, no push.

## S5 — фактично виконано (2026-10-02)

- 4-step onboarding без GPS, atomically saved owner rule; territory/category OR, event horizon окремо від inactive delivery preferences. У наявному локальному акаунті залишено «Мій радар Madrid» та saved «Aires Iberoamérica, con Jasminum Ensemble»; попередні правила/дані збережені. Приватні реквізити/пароль не записувалися в evidence.
- Unified feed/map/detail/saved/rules/inbox/settings, literal search/pages/retry/empty/loading, uk/en/es та session restore; bottom navigation selected ARIA і ≥44px button targets. Light-only. Main feed initial QA:95 music occurrences from3 overlapping rules,881 public future occurrences; counts змінюються з часом і не є гарантією coverage.
- Actual OpenFreeMap tiles, GL JS6.11.2 basemap/cluster selection, polygon clicks + offline fallback перевірено в Chrome390×844. Реальні Madrid координати NULL: жодних вигаданих marker/geocoder. Synthetic cluster screenshot є proof renderer only. GL JS5.24.0 temporary downgrade мав critical XSS — відхилений; Babel web import-meta + same-origin module worker усунули6.x incompatibility. Full attribution/license retained.
- `pnpm check`:16 Jest +8 Node tests, TS/lint/env/secrets pass; latest Node test exercises real patched MapLibre ESM→Metro classic script parse + exact worker asset copy. S5:69 Auth/API/RLS assertions та24 SQL transaction assertions (ROLLBACK), S2:108/S3:84/S4:73 regression checks. Export ios/android/web, admin build, Expo deps/Doctor18/18, frozen install, DB types comparison, client bundle key scan pass. Full logs — [evidence/s5](evidence/s5/results.json).
- Native configuration isolated prebuild passes; compile/device UX unverified (Xcode licence owner action, Android SDK/adb absent). Native screen readers/font scaling/deep links/saved storage/push acceptance still unverified. Browser push button hidden with truthful device notice; no push sent. SMTP/Gmail not configured.
- Security audit final:0critical,1high node-forge (no published patch),1moderate decode-uri-component; full audit exit1, CI high gate remains failed. New warning не приховано. Native acceptance та clean security gate prevent S5 verified/release claim.
- Schedule settings are preferences only (`active=false`, `next_run_at=NULL`), no S7 jobs/DST/quiet hours. S6–S12 залишаються pending. Next independent stage: S6 only by new task, while native prerequisites/security remediation remain tracked.
- Acceptance/manual steps — [S5_ACCEPTANCE.md](S5_ACCEPTANCE.md). Implementation checkpoint: `57c667d9ae6ad0e47e607e5b954732b3b4e7e102`. Окремий docs commit записує цей SHA; власний HEAD через `git log -1`. No push/remote changes.

## S6 — independent source work completed; AI blocked, 2026-10-02

- Madrid1182 normalized records; actual provider coordinates/free/exact paid amount now imported. Older adapter ignored these fields — source absence was never proven. Preserve Madrid IDs/user saved data.
- Toronto bounded32MiB prefix:28 future sessions; Helsinki3×100 latest-modified records:59 in last batch,79 accumulated future records. Three official sources in ES/CA/FI; licensed public text only, no images/contact fields.
- Atomic importer+source lease/due/backoff/TTL and metrics, exact normalized facts/version updates, private duplicate candidate queue without merges, explicit Helsinki cancellation. Unknown facts remain unknown; source-native ready/current translations/summary visible with original fallback and attribution.
- Fixed real Madrid HTTP timeout: timezone-name checks cost75–89s per1182 records; indexed authoritative name inventory reduces SQL to0.442s, live end-to-end1.734s. Accepted names unchanged, timezone/DST arithmetic not replaced.
- Verification:24 Python tests +ruff; pnpm check16 Jest/8 Node; actual local API/RLS checks S2=108/S3=84/S4=191/S5=69/S6=68; S6 SQL ROLLBACK invariants pass; final exports/key scan/admin pass. Browser390×844 source cards, English provider translation, actual Helsinki marker/clusters and no console errors. [Acceptance/proof](S6_ACCEPTANCE.md).
- AI: user says access exists, but provider/model/daily amount+currency not received and no server key configured. No API model invented or requests/spend. Adapter/budget reservations/cache retries/outage/live smoke **not implemented or verified**. Source translation cache is not AI proof.
- Native/SMTP/device push/remote CI remain unverified. Audit still fails1 high node-forge without fix +1 moderate; do not hide gate. S7–S12 remain pending.
- Next required input to finish S6: provider, exact model ID, daily budget with currency; key only in local server env (never chat/client/git). Local source checkpoint recorded below after final diff/secret checks. No push.

S6 source implementation checkpoint: `0b1e3f03130ae83945b7f7c2bd0c5771da0bb121` (local only). Наступний документаційний commit записує цей SHA; поточний final HEAD — `git log -1`. S6 AI лишається blocked, S7–S12 pending.

## S6 — продовження: локальне автоматичне оновлення

- Local due-only watcher `pnpm ingest:s6:watch` реалізовано й залишено запущеним; source cadence/backoff/claims у БД, wake60s, no overlapping cycles, bounded child/API calls, SIGINT/SIGTERM. No force in watch mode. OS/hosted service/24h uptime не налаштовано й не перевірено.
- Actual Helsinki import52 sessions/300 inspected; accumulated1299 future/1225 mapped in latest API snapshot. Actual two60s cycles skipped all not-due sources without fetch; Ctrl+C stopped cleanly. In-flight failure/shutdown contracts use explicit fakes.
- Виправлено свіжість нових добірок: source success не освіжає відсутній у batch record; TTL перевіряється також за event.checked_at. Каталог/попередні добірки зберігаються. Migration026 forward-only, user DB не скидали.
- `pnpm check`16Jest+20Node pass; real S3=84/S4=191/S6=68 pass; expanded SQL ROLLBACK pass (stale individual record/fresh source, historical visibility, unchanged identity after refresh, legacy TTL).
- [Proof](evidence/s6/polling-results.json), [setup](SETUP.md). AI provider/model/daily budget/server key ще очікуються; adapter/spend не активовано. Native/SMTP/push/audit blockers без нових доказів; S7–S12 pending, push Git не виконано.

## S6 — продовження: AI foundation без paid integration

- Private RLS-protected config/budget-days/request ledger, cache key version/locale/provider/model/prompt/input, conservative unknown cost, exact known reported_cost, one dispatch/settlement, rights/TTL/lowered cap/day guards. Model/source change cannot publish stale results or overwrite normalized facts.
- Provider-neutral prompt/text contract та5 new Node tests; no provider SDK/real model selected. Default actual local config remains disabled/provider+model+capsNULL, request_count0, budgets empty.
- Real Postgres concurrency17 checks/four actual lock waits with two connections in a schema-only isolated disposable DB; no copied user rows, own DB cleaned. SQL synthetic transactions ROLLBACK; same key cannot charge twice, cap respected. This is database proof, not provider/model/billing/injection resistance proof.
- `pnpm check`16Jest+25Node pass; S2 Auth/RLS108 and S6 sources/native-cache68 pass; generated DB types regenerated, no server credential exposed. CI updated, remote execution unverified.
- [S6_AI.md](S6_AI.md), [evidence](evidence/s6/ai-foundation-results.json). Provider/exact model/daily amount+currency/server key still needed for actual adapter/pricing/access/manual translation QA/bounded live smoke. S6 in_progress, S7–S12 pending, no Git push.

Previous local polling checkpoint: `e7cad73`; this continuation's HEAD is available with `git log -1`. Native/SMTP/physical push and prior dependency audit findings unchanged without new evidence.

S6 disabled AI foundation implementation checkpoint: `bb223e6dd9a46e9f900c82c1d69e6878f861e125` (local only, no push). Окремий documentation commit записує цей SHA; поточний HEAD — `git log -1`. Actual provider integration залишається blocked.

## S7 — незалежне продовження, 2026-10-02

Нове «продовжуй» дозволило S7 за P4; S6 AI лишається blocked. Server calendar scheduling, DST/quiet hours, pause/edit revisions, due-batch union, full membership/title/time snapshots, persisted backoff/leases/fences, bounded sequential transport/receipts і UI uk/en/es реалізовано. Existing schedules не активувалися міграцією; через UI увімкнено тільки «Мій радар Madrid». Real timed run 21:30 Europe/Madrid створив 137 живих occurrences; inbox/detail доступні без push. Final schedule daily18:00 Europe/Madrid, quiet22:00–08:00, repeat off. Інші правила та 2 saved events збережені.

Фактичні перевірки: 54 SQL invariants + 13 checks у 4 реальних overlapping PG races (schema-only disposable DB removed); 56 actual Auth/PostgREST/RLS checks; `pnpm check`17 Jest+33 Node; regressions S2 108, S5 69, S6 68, S4 SQL49 ROLLBACK. S4 synthetic assertions ізольовано від нових live events всередині rollback, без зміни user data. Migrations030–036 застосовані без reset, types regenerated; actual local CLI worker restarted, one digest/137items retained; exports/client bundle checks і browser proof — [S7_ACCEPTANCE.md](S7_ACCEPTANCE.md), [evidence](evidence/s7/verification.json).

Default running watcher створює inbox only; no Expo/paid AI requests. Device delivery/real receipts/tap/background/cold start **blocked/unverified**, бо користувач має лише browser. Local worker restart/concurrency verified, hosted scheduling/remote CI/native builds unverified; existing dependency release gate лишається останнім recorded failed S5 audit. Laptop process не є production service. S8 не розпочато. Наступне: phone development build і Expo credentials для S7 external acceptance, або actual provider/model/budget для завершення S6; незалежний S8 потребує нового завдання.

S7 implementation checkpoint: `67a22e51b5a91d3591f8b684f6d9f67659c09179`. Наступний documentation-only commit записує SHA; final HEAD див. `git log -1`. Remote збережено без змін, push не виконувався.


## S8 — незалежне продовження, 2026-10-03

Нове «продовжуй» дозволило S8, S9 не розпочато. Important-field final transaction snapshots, stable occurrence/revision, owner update/cancellation history, future lead reminders and replan, stale/unknown/explicit cancelled semantics, server-only merged/audited manual correction preserving source hash and surviving reimport implemented. Shared S7 delivery fences/receipts extended with S8 saved-event policy and expiry-bounded provider TTL; no real Expo or AI requests. Migrations037–045 applied without reset. Free/Plus enforcement remains S9, full admin UI S10.

Proof:69 SQL invariants +16 actual two-connection/timed checks in disposable schema-only DB, four observed overlaps including source import/correction and naturally due reminder;58 actual Auth/PostgREST/RLS checks with own disposable users removed. pnpm check17Jest+35Node; regressions S2=108,S5=69,S6=68,S7=54SQL+13concurrency; three JS exports/type match/client-key scan. Browser390×844 real preferences/reload and explicitly synthetic change/cancellation history uk/en/es, no console errors. Browser fixture/source/audit/digests/jobs removed, original2 saved events retained, Ukrainian restored. [Acceptance](S8_ACCEPTANCE.md), [proof](evidence/s8/verification.json).

Real saved concert10Oct19:00 Madrid now has24h/2h reminders, independent Europe/Madrid timezone, quiet22:00–08:00, updates on. First scheduled9Oct19:00, second10Oct17:00; actual future delivery not yet observed. Existing S7 schedule/rules untouched. Local S8 inbox watcher added; S6 due watcher restarted with safe SQLSTATE diagnostics. Laptop watcher is not hosted/uptime evidence.

Initial S6 regression encountered stale Helsinki after6 prior import failures. Actual bounded official fetch/import54 normalized records succeeded, backoff reset and S6 passed. Previous SQL cause was not reproduced, not declared fixed; observe next unattended import. Safe error-code reporting avoids raw event/HTTP error contents. AI stays disabled; provider/model/daily budget+currency/server key missing. Real push/native/iOS license/Android SDK/SMTP/remote CI and previous dependency audit blockers remain. Next independent stage S9 requires new task/store sandbox setup; actual billing cannot be verified only in browser.

S8 implementation checkpoint: `e70ecc8f0a8b00224239614c108c718d643cd3b4` (local only). Окремий documentation commit записує цей SHA та final state. Actual HEAD — `git log -1`. Working tree checks pass; no push/remote changes.


## S9 — 2026-10-03

Нове «продовжуй» дозволило наступний незалежний етап; попередні integration blockers не названі завершеними. SDK exact pin/MIT notices збережено. Local migrations046–051 applied без reset; server config disabled/SANDBOX, entitlement/product/app IDs NULL/empty, actual REST/webhook keys absent. Provider API requests0. Native offerings/purchase/restore code доступний тільки поза Expo Go з власними per-platform SDK keys; web stub не запускає Preview API mocks. Ціни тільки зі store offering, не з гіпотези €4.99/€39.99.

Free: effective city/radius rule1, weekly single weekday; Plus10/advanced monitoring/filters. Користувач може зберігати paid drafts, але matching/scheduler/dispatch їх не виконують. `enabled` intent та whole configuration не перезаписуються при expiry; `billing_paused` + revision/due fence зупиняє зайве. Вибір одного Free rule owner-bound; catalog/history/saved/Free cancellations/reminders лишаються. Старі client S3 quick-rule/digest RPC retired; current mobile використовує S4+ flows.

Durable webhook ledger→owner queue→leased GET current subscriber→verified snapshot, не webhook's guessed tier. Replays dedup; out-of-order triggers fetch current state; old provider response/lost lease rejected. Transfer refreshes both parties. Events during fetch remain due; periodic6h/retry5min. Local authenticated loopback handler cannot receive real RevenueCat delivery; HTTPS hosting and supervision remain a specific deployment blocker.

Actual verification:42 SQL +11 concurrency/real-clock expiry checks (3 observed overlaps, own random DB removed),50 real Auth/PostgREST/local HTTP checks (disposable accounts removed, config/catalog untouched); TypeScript/lint/env/secrets,17 Jest/42 Node; S2 regression109, S4/S5 SQL49/24, S6 rollback invariants, S7 SQL54+concurrency13, S8 SQL69+concurrency/timed16. Advanced older tests use explicitly synthetic Plus only in their own disposable DB/ROLLBACK; no real user grant. Expo deps pass/Doctor18, all three JS exports, bundle key scan66files. Browser uk/en/es/390×844 and reload; existing3 S4 rules+legacy, saved2, actual source facts untouched. No GitHub Actions/native build/device push/store purchase/provider restore proof.

Audit after SDK install: node-forge1.4.0 high GHSA-86w9-cpqp-85rv; newly recorded braces3.0.3 high GHSA-vfj7-8cjw-p6xm via Jest/@types/jest; decode-uri-component0.2.2 moderate. Both high packages already in previous lock, no registry fix shown. Gate remains failed; no unsafe override/ignore. Next S9 completion needs actual RC/store identifiers/keys, HTTPS server, development phones/builds and both sandbox purchase/restore evidence. S10 needs a new continuation task.

S9 implementation checkpoint: `2ca20f86339dc24998ff923baa47541a46d6ffc7`. Final documentation/evidence checkpoint available through `git log -1`; no push.


## S10 — адмінка та операції (2026-10-03)

- Migrations052–056: DB roles viewer/editor/admin, explicit ACL/RLS, role spoof/revoke, version-fenced sources/events/duplicate review, actor/reason/before/after audit, account-delete role audit identifier cleanup.
- Browser 127.0.0.1:5173 використовує public key/Auth; admin grants тільки trusted local operator. Поточному локальному project owner audited admin-role надано, remote permissions не змінені. Пароль/службові ключі не комітилися.
- Create disabled/unreviewed, arbitrary adapter execution denied, source identity immutable, delete only empty, referenced source pause/rights block preserves provenance. Poll/correction/import fences, pause invalidates old claims incl force/legacy import. Нові failures в ingestion history; старі не вигадані заднім числом.
- Title/venue/category/price/status/time overlays переживають S6 і legacy import; reset до свіжого private normalized baseline після S6 poll. Multi-session correction refused. Logical conservative merge зберігає originals/saved/history/reminders, dedup до pagination/full scheduled union, eligible fallback і automatic divergent-facts split.
- Actual PostgreSQL45 invariants +12 concurrency/custom binary backup→isolated restore checks; actual local Auth/PostgREST25; nonadmin signup metadata не дає ролі. Рестарт/restore залежить від IANA inventory: pre-data → inventory → data/post-data, інакше valid_timezone CHECK fail. Це виявлено й виправлено реальним restore drill.
- Browser actual3sources +stale records, імпорти, aggregate jobs/receipts, disabled AI; TEST title/reset/merge verified, uk/en/es, console errors0. Own TEST fixtures/audit/merge/overlays прибрані; реальні дані подій не замінювалися.
- Regression S2 109, S6 SQL suite, S7 54+13, S8 69+16, S9 42+11 pass. JS/admin checks/build pass; exports/key scan — evidence. Remote CI не запускалися; pipeline додано S10 tests і admin boundary scan.
- Blocker: відсутній staging project/restore target/operator access/actual backup evidence. Наступна дія для закриття S10 — staging drill за S10_OPERATIONS. Не називати локальний fixture restore staging proof. S11 не починався.

- Фінальна ревізія legacy Madrid виявила hardcoded Europe/Madrid після overlay; migration056 зберігає ручний IANA timezone. Додано фактичний legacy→S6 повторний імпорт fixture: title/category/timezone overlay збережені; final45 SQL +12 concurrency/restore pass.
