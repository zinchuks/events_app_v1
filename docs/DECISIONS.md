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
