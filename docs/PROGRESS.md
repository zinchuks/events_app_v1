# Прогрес Event Radar

Оновлено 2026-10-01, Europe/Madrid. Поточна задача: **S4** за новим запитом користувача. S3 browser workflow перевірений, real device push blocked. S4 реалізовано за новим запитом «продовжуй»; browser/PostGIS acceptance перевірені, native unverified. S5 не починався. Результати аудитів — [REPO_AUDIT.md](REPO_AUDIT.md), команди — [SETUP.md](SETUP.md).

| Етап | Статус | Доказ / наступна дія |
| --- | --- | --- |
| S0 | **verified** | Перевірено код/licenses/SHA/manifests/recent Git семи кандидатів; виконано basic checks Obytes і community-calendar, додатково Simonstorms/event-discovery; обрано одну mobile основу й ingestion спосіб; документи та blockers зафіксовані |
| S1 | **implemented** | Mobile/admin/worker основа, env/runtime/locks/CI; browser startup/toggle, code checks, exports pass. Native builds і remote CI unverified |
| S2 | **implemented** | Local PostGIS/migrations/19 RLS tables, email Auth/privacy/uk-en-es; 108 real integration checks + browser QA pass. Native/storage/external SMTP/remote CI unverified |
| S3 | **implemented; real push blocked** | Madrid → atomic DB → city/category rule → detail/save → private digest → local transport fixture verified. Device delivery/native build unverified |
| S4 | **implemented** | Owner CRUD/пауза, multiple territories/radius/polygon/filters, union without duplicates. 73 actual API + 49 rollback SQL checks, browser QA pass; native unverified |
| S5 | pending | Mobile UX/maps; native MapLibre і map infrastructure unverified |
| S6 | pending | 3 live sources / 2 countries, dedup/AI/translation; provider/rights gates попереду |
| S7 | pending | Durable schedules/jobs, timezone/DST, receipts/retries |
| S8 | pending | Changes/cancellations/reminders |
| S9 | pending | Store sandbox purchases/restore/server entitlements; external setup unverified |
| S10 | pending | Admin/monitoring/backup restore |
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
| Product dependencies | S1 critical/high = 0; moderate decode-uri-component через Expo Router/query-string = 1 | Сумісний upstream update/retest перед release; JSON finding збережено, high-only gate його не приховує |
| Supabase DB / RLS | local verified: Docker 29.8.1, Postgres 17.4/PostGIS 3.3.7, 19/19 RLS tables, 108 real Auth/API checks | Managed staging/production deployment не виконано; S3 може використовувати local DB |
| Push/billing/AI/maps/external auth | unverified; accounts/keys/device evidence не надано | Налаштовувати за етапами S2/S3/S5/S6/S9, не блокувати незалежний S1 |
| Real data | S3: 930 real Madrid records; 868 мають exact locality MADRID. Один live source, subset single-day/non-recurring. Barcelona/Toronto unverified | S6: ще два джерела й друга країна, серії/переклад; не обіцяти повну афішу |

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
