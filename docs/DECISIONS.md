# Рішення S0 — 2026-10-01

1. **Mobile: adapt Obytes** із pinned SHA REPO_AUDIT. Є тестований TS/router/i18n/UI baseline, обидва JS exports і Metro smoke; auth demo/IDs не прийняті. S1 adoption gate: dependency drift + critical/high disposition, native smoke. Якщо updates не проходять, рішення переглянути.
2. **Ingestion: Python + selective vendoring community-calendar.** Корисні ICS/recurrence/source headers/retry abstractions перевірені; date-only, stable identity, global geo, arbitrary shell execution потребують заміни. Не переносити UI, city snapshots, personal integrations або workflows із push.
3. **Не використовувати event-discovery як backend**, бо Sheets/Apps Script + collapse occurrences/hash без часу не відповідають MVP. Не зливати його з community-calendar.
4. **Simonstorms не mobile основа:** bundles працюють, але доменний onboarding/analytics/plugins додають демонтаж; відсутній unit-test target, nonstandard tooling license. Новіший SDK сам собою не є readiness proof.
5. **MapLibre умовно S5; Crawlee відкладено.** Peer ranges не доводять native сумісність. Для first source API/ICS не потрібен ще один crawler runtime.
6. **S0 — документи, аудит, licenses, локальний Git.** Product directories, env, locks, CI та starter import належать S1. Native та external checks явно unverified; аудит S0 може бути verified без їх pass згідно плану.

# Рішення S1 — 2026-10-01

- Вибірковий Obytes import замість whole starter: Button/tests/CSS/Metro та конфігураційні patterns; прибрано demos/auth/storage/billing/owner IDs. Це зберігає перевірену основу й attribution без функцій наступних етапів.
- Залишено Expo SDK 54, вирівняно React Native 0.81.5 і SDK-compatible ranges, pinned Node 22.23.3 / pnpm 10.34.6. Expo install check й Doctor pass.
- Сумісні security overrides shell-quote/tar/postcss/image-size та xcode-only uuid; image-size потребував збереженого MIT Metro Buffer patch з real asset regression test. У web dev виявлено цикл Uniwind/RN Web; guard лишає внутрішні barrel exports RN Web оригінальними. Повторний browser startup/toggle pass.
- Audit critical/high = 0; decode-uri-component moderate лишається відкритим. CJS→ESM major override без перевіреної сумісності не застосовано. Потрібен upstream query-string/router upgrade перед release review; high-only CI gate не приховує JSON finding.
- Admin S1 — Vite/TypeScript static shell замість орієнтовного Next.js: немає SSR/API потреби до DB/Auth етапу. Worker — executable stdlib Python CLI, uv dev lock, нуль adapters; legacy dependencies не переносяться наперед.
- CI workflow створено, remote не додано. Native/EAS/device/backend інтеграції unverified; локальні web/code/export checks їх не замінюють. S2 не розпочато.

# Рішення S2 — 2026-10-01

- Docker daemon доступний; використовуємо окремий local Supabase CLI stack, без remote project/deploy. Локальну базу відтворено з migrations/seed двічі, приватність перевірено через реальні Auth/PostgREST roles.
- Створено основні schema entities й RLS для всіх 19 таблиць, але не handlers/UX наступних етапів. Public normalized catalog відділено від raw ingestion payloads та private owner data. Server entitlements/jobs не доступні для client writes.
- Self-delete — обмежений SECURITY DEFINER RPC без user ID аргументу; authenticated caller only. Cascades private data, не public events. Валідація поточного акаунта є server-owned; не пересилаємо service role у mobile.
- Email confirmation/recovery — коди з captured email через verifyOtp; зберігається email/password Auth без залежності від native deep-link verification. External SMTP/staging не підмінено local Mailpit proof.
- Native storage — bounded SecureStore chunks, queue + manifest swap; web localStorage. Unit tests перевіряють Unicode, failed writes та concurrent logout; device/keychain acceptance не заявлено.
- Profiles locale з allowlisted signup metadata, translation locale незалежна; all UI uk/en/es. Imported geo data на S2 не потрібні: explicit original synthetic country/city fixtures, без boundaries і fake live coverage.
- Browser QA виявив світлий текст dark variants на світлому фоні; Uniwind theme явно light. Застарілий async startup result не перезаписує нову auth session після logout/login.

## S3 — один manual наскрізний сценарій

За запитом користувача завершено доступний browser workflow без S4/S5. Для first source обрано original stdlib Madrid adapter замість імпорту legacy scraper dependencies: офіційний JSON доступний, модель simple/typed, legacy lxml gate не потрібний. Scope лише single-day/non-recurring, exact locality, explicit taxonomy, unknown facts preserved. Local Node server orchestration зберігає Python normalization та робить atomic DB RPC; один stack без додаткового service deployment.

Ручна добірка з fixed30-day horizon показує корисний end-to-end S3; production schedule/quiet hours/retries не додаємо до S7. Fixture transport явно відрізняється від real Expo delivery. Користувач обрав browser-only; S3 лишається implemented із blocked device acceptance, наступні етапи не стартували. Expo dispatcher не повторює ambiguous failed sends автоматично; це свідоме обмеження development runner.

## S4 — independent rules, 2026-10-01

- Next stage authorized by «продовжуй»; browser-only preference remains. S3 real push blocker does not block local rules/geo work. No S5 full map or S7 scheduling started.
- Boundary provider: individual-country **geoBoundaries gbOpen ESP ADM0/ADM1**, pinned revision9469f09 + exact byte SHA256. Reviewed per-layer CC BY4.0 metadata (not a blanket licence assumption for every gbOpen country). Use simplified2017 Spain data, explicit approximation/provenance/attribution; do not silently repair/simplify or invent other countries' boundaries. UKR layer reports ODbL; not imported under a CC BY assumption.
- Curated24 ISO country labels +5 city identifiers allow choosing disconnected places; only Spain country/19 regions have geometry. Madrid city's provider ID preserved and parent associated with Comunidad de Madrid; no fake city center/boundary. Barcelona associated with Cataluña/Catalunya; remaining city parent is country. No claim of a complete global territory catalog.
- Server owns validated atomic S4 rule+area writes; RLS closes direct S4 parameter bypass and retains S2/S3 compatibility. ≤20 saved S4 rules /20 areas is a development guard; Free/Plus activation limits will be enforced in S9.
- Unknown policies only apply when that filter group is active; unknown coordinates are always excluded from radius/polygon. No price0/language guessing/FX. Age filter uses interval overlap; partial provider ages are unknown. Antimeridian polygons rejected explicitly; radius uses geodesic metres.
- One manual union digest demonstrates dedup across independent rules; no push job created for S4. Source freshness gate48h reused from S3. Selection and fingerprint share a single DB snapshot; historical membership is stable, content is current. ≤5000 items, pages1000 for private reader.
- Minimal offline vector point editor is required to exercise S4 polygons now; avoids choosing tile/geocoder/native MapLibre infrastructure before S5. Radius preview approximate; server authoritative. Found/fixed RN Web click-vs-responder coordinate difference in actual browser QA. Native acceptance explicitly unverified.

## S5 — 2026-10-02

- Один feed замість окремих S3 quick-rule і S4 matches flows. Серверний literal search і stable paging не пропускають відповідні записи через client-only filtering одного page. Catalog не розкриває private rule IDs.
- Онбординг preview показує конфігурацію/coverage, фактичний matching — після explicit atomic save. Не робимо temporary persisted rule для preview. Schedule preference storage — мінімальна залежність S5, automatic delivery/S7 не реалізовано.
- OpenFreeMap Positron обрано для basemap за official commercial permission/no-key service, із attribution, failure fallback і задокументованим no SLA. Не застосовуємо public Nominatim autocomplete: curated territories/manual coordinates вже забезпечують без-GPS сценарій, геокодер/дозволи/quality gate лишаються непідключеними. Не збагачуємо Madrid locations здогадками.
- MapLibre GL JS6.11.2 початково не стартував у Metro (import.meta). Тимчасовий pin5.24.0 відхилено після critical GHSA-jrc7-96c5-q579. Остаточно6.11.2: Expo Babel web import-meta transform + same-origin pinned worker/shared module assets; actual browser basemap/cluster rendering перевірено. Security advisory не замовчується downgrade/ignore. RN11.4.1 відповідає RN≥0.80 / new architecture, actual native acceptance pending owner tooling. Map provider data and source events have separate rights.
- Аудит 2026-10-02: node-forge1.4.0 через Expo CLI має high GHSA-86w9-cpqp-85rv, reviewed2026-10-01, patched version None. Та сама dependency була у S4 HEAD; це новий advisory, не map dependency. Не вигадуємо crypto patch/не приховуємо finding/не вимикаємо audit gate; release/CI security gate blocked до audited upstream fix. Existing moderate decode-uri-component лишається.

## S6 — 2026-10-02

- Reuse verified Madrid; add Toronto and Helsinki after official licence/schema/live review. Barcelona403 is not bypassed. Three genuine sources in three countries satisfy source-count coverage with explicit partial limits, not full-city claims. No images/contacts or third-party scraped-code import.
- Toronto full file223MB → bounded stream32MiB/5000 rows/400 sessions rather than uncontrolled download. Helsinki start parameter includes ongoing old events, so latest-modified pages plus explicit future/session/municipality checks; bound3×100. Missing records retained, not cancellations. Exact price ranges remain unknown; provider points/free/scalar prices now mapped.
- Safe dedup means conservative review candidates with same exact known UTC/country/title/venue/nearby points, never automatic merges. Each source ID remains stable; separate sessions preserved. Review UI belongs to S10; queue/rules can be inspected server-side now.
- Source-native Helsinki translations are reused with licence/origin label, version/locale cache and original fallback. AI not substituted by a mock or invented model: user will supply provider/model/daily budget, server key stays outside client/git. AI reservation/billing/outage work remains blocked.
- Preserve DB/accounts/saved IDs. Profile preference initializes detail translation language; per-detail language choice is local and does not change account settings. No notification scheduler activated.
- Measured real HTTP timeout isolated to repeated pg_timezone_names validation. Index accepted-name inventory, keep the exact validation set and database DST arithmetic. Same1182-record rollback test75–89s→0.442s, final live total1.734s. Refresh name inventory on tzdata upgrades; do not hide gateway failures by claiming failed HTTP returned success.

## S6 продовження — polling і record TTL

- Local async watcher замість OS/hosted cron на цьому етапі: той самий due/lease/backoff DB contract, sequential cycles і bounded requests. Watch ніколи не force-polls. Laptop/IDE lifetime не видається за production availability; user notification schedules залишаються S7.
- API timeout не доводить rollback. Confirmed PostgreSQL errors release claim into backoff; ambiguous gateway/abort responses retain lease, stable normalized reimport remains idempotent after expiry. Paid AI requests цим retry path не виконуються.
- У partial feeds source-level freshness недостатня: новий subset не перевіряє older absent records. S4 digests gate source AND record TTL; legacy S3 filters stale records. Catalog/history не ховаємо й не ставимо cancelled без явного source signal.

## S6 — provider-neutral AI preparation (actual integration disabled)

- Поки actual provider/model/budget не надано, реалізовано незалежну server DB foundation та text contract, без provider SDK/paid runner/вигаданих pricing/model IDs. Config disabled, fixtures явно synthetic.
- Global UTC project budget, conservative pre-dispatch worst-case reservation; repeated/cache/dispatch/settlement serialized by settings row/unique input key. Old UTC-day reserved jobs або lowered limits rechecked before dispatch. No auto-refund/retry after uncertain paid outcome. Overrun recorded, not silently clipped.
- Budget `charge` can be conservative/rounded commitment; exact `reported_cost` nullable distinguishes known cost from unknown ceiling. Currency changes cannot reset same-day spent/held budget; no FX.
- Кеш model/prompt/input invalidation + normalized facts never written by AI. Structural/numeric/URL guards improve rejection, not proof of named-entity/semantic accuracy or actual model injection resistance. Live manual QA required before S6 acceptance.
- Budget races tested in a schema-only isolated DB with two real connections/observed row-lock waits; user database never reset/copied. This is independent database verification, not API usage proof.

## S7 — independent stage / calendar and transport policy

- New continue authorizes independent S7 under P4 while actual S6 AI remains blocked. No S8 implementation.
- Explicit activation; preserve previous inactive preferences and legacy RPC. Scheduled union includes only due rules, so daily rules do not silently deliver weekly rules daily. User seen ledger controls new/changed push; full current nonempty selection always retained.
- DB owns next dates and due identities; UTC offsets never fixed. Gap -> next valid minute, first fold once; quiet end later fold. Calendar months clamp month ends; weekend is upcoming Sat/Sun, Sunday part of current weekend.
- Atomic owner lock/business key instead of process-local timer identity; coalesce downtime into one current run, 5000 cap rejects rather than truncates. Stale records defer same slot with persisted retry5min, preserving S6 source+record TTL.
- Default local worker creates inbox only; synthetic transport only tested in disposable fixtures. Actual Expo requires separate explicit operator invocation. No new SDK/dependencies. Unknown send response (including5xx) held as uncertain rather than blind resend; receipts retry queries only. Bound token owner + registration timestamp protect logout/transfer/re-registration.
- Isolated schema/grants/timezone-inventory clone tests actual two PG transactions without copying any user/catalog rows. Existing S4 date/count test assumptions broke once live source grew; isolate outside sources inside ROLLBACK, keep matching assertions unchanged.

## 2026-10-03 — S8 saved updates, overlays and transport

- Deferred final transaction snapshots, not independent per-table messages, preserve one logical update when import changes both event and occurrence. Monotonic revision avoids deduping distinct later transitions back to the same values.
- Use owner alerts + immutable one-item digests and the existing S7 fenced transport. Cancellation has a distinct policy permitting cancelled facts; S3 jobs remain isolated. No paid-provider call or new SDK needed for browser inbox.
- Reminder offsets use actual start instants; date-only/unknown keep preferences without jobs. Start/pref revision invalidates old work. Stale data defers until deadline, not false cancellation. Provider TTL bounded by remaining deadline; accepted pushes cannot be recalled.
- Minimum S8 manual correction is a trusted service-only merged overlay/audit command, serialized with source import. Existing source rights/hash remain original; translations cannot falsely claim the manually corrected version. Admin UI/roles deferred to S10, entitlements to S9.
- S6 regression found stale Helsinki after6 import failures; successful bounded official refresh54 records restored freshness. Historical SQL cause not reproduced. Minimal safe SQLSTATE logging added for next failure; no raw payload/error messages logged by watcher. Continuous unattended recovery remains unverified.


## 2026-10-03 — S9 independent foundation, store acceptance blocked

- Reuse RevenueCat already chosen by MVP_PLAN. Install exact10.11.0 MIT/current official contract after registry/docs review; original adapter/SQL/paywall, no starter billing demo or fake production grant. Actual setup absent per user; SDK/JS exports cannot count as sandbox purchase/restore.
- Prefer server effective membership/pause over deleting rules or rewriting a user's advanced filters/schedule to a guessed Free alternative. Free choice explicit; deterministic UUID fallback among eligible rules. Saving paid drafts is allowed; direct API matching/automatic delivery enforces1/10. Active Free schedule means one weekday; categories/horizons unaffected. S8 reminders stay Free because no explicit premium requirement exists.
- Webhook is a reconciliation signal, not an authoritative client/provider tier flag. Fetch current subscriber, verify product/store/environment/expiry/grace/refund, monotonic snapshot and leased per-owner queue. Transfer fetches both users. No inferred expiry on auto-renew cancellation, no access extension on provider outage. Periodic6h refresh supplements immediate webhook/owner request; expiry is synchronous.
- Current authenticated server is local-only to preserve existing local-stack boundary. Do not expose localhost/tunnel or invent a hosted RevenueCat integration. HTTPS deployment, platform configuration and real callback/restore proof remain blockers. Native operations bind authenticated UUID and do not support anonymous purchase.
- Strengthen rules ownership/billing-column ACL; retire S3 prototype client save/digest RPC. Keep S2 RLS regression via an allowed name column plus explicit owner-column denial. Older advanced SQL/scheduler tests receive synthetic Plus only in ROLLBACK/own disposable DB. Never flip the real config or grant the user's account test Plus.
- Fresh audit shows2 high/1 moderate; braces high advisory newly recorded alongside existing node-forge. Both existed before SDK installation; lock diff adds only SDK family. No fabricated upstream patch or audit suppression.


## S10 (2026-10-03): operations authorization, merge, restore

Live DB roles chosen over role in signup metadata/cached JWT: immediate next-RPC revocation, service-only assignment. Admin public client shares pinned SDK already in lock; no new runtime family. Revision/source fences and persistent normalized baseline provide auditable corrections and explicit reset; old records must be polled before reset. category_code joins overlay policy; no client catalog writes.

Logical merge chosen to preserve stable occurrence identities, saved/reminder configs and immutable digest history. It deduplicates eligible future catalog/match union, rechecks exact session facts, uses eligible fallback when canonical is unavailable, supports undo and forbids chains. Original S8 reminders remain separate if user saved both; no destructive FK rewrites or inferred dates.

Actual local custom restore found lookup-order bug: valid_timezone CHECK depends on timezone_names TABLE DATA. Restore pre-data then same-PG IANA inventory then remaining data/post-data fixed it and passed row/Auth/RLS/grants checks. Hosted staging restore remains blocked; no fixture substituted for staging evidence.
