# S11 — QA, 2026-10-04

**Статус: blocked; локальна основа implemented та перевірена. До бети ще не готово.** S11 дозволено новим «продовжуй»; S12 не починали. Native acceptance обох платформ і hosted staging відсутні. Не можна підтвердити відсутність критичних дефектів у невиконаних сценаріях. [Прогрес](PROGRESS.md), [runbook](S11_BETA.md), [машинні результати](evidence/s11/verification.json).

## Середовище та межі доказів

| Поверхня | Device / OS / build | Фактичний результат |
| --- | --- | --- |
| Web | Mac arm64, macOS27.0.1; Chrome154.0.8037.93; app0.1.0, Expo54 / RN0.81.5; development Metro8087; viewport390×844 | Реальний UI/Auth/локальний API/live каталог; native поведінка не перевірена |
| PostgreSQL | Docker29.8.1; PostgreSQL17.4 arm64 / PostGIS3.3.7; SupabaseCLI2.34.3 | SQL/RLS/конкурентність; власні disposable DB та акаунти прибрані |
| iOS | Xcode26.6 установлено; simctl зупиняється через неприйняту ліцензію (exit69); пристрій/build N/A | **Blocked**; license не приймали; IPA не створено |
| Android | adb немає у PATH або стандартному SDK; пристрій/build N/A | **Blocked**; APK не створено |
| Hosted staging | Project/операторський доступ/EAS project/signing не налаштовані | **Blocked**; лише guards/config/worker код, жодного remote deploy |

Implementation checkpoint `4106b862e5272fb237d49b7c1fb946ac18fbcf13` (local only). Node22.23.3 / pnpm10.34.6. JS exports web/iOS/Android успішні; це не native builds. Admin Vite build успішний. Секрети не включені в репозиторій чи докази. Remote CI не запускали.

## Пройдено

- `pnpm check`: typecheck/lint/env/secrets, **24 Jest +53 Node**. Consent stale-owner/read races, offline/timeout fail-closed, staging binding/flags і webhook boundaries мають focused tests. Injected worker/provider operations — fakes, не hosted/provider integration.
- `pnpm test:s11:api`: **89 actual Auth/PostgREST checks**: password session, rule/catalog/manual history, owner isolation, save/preferences, consent/aggregate access/disable/account-delete cascade, локальний staging marker відмовляє. Реальний каталог лише читався, disposable users видалено.
- `pnpm test:s11`: **20 SQL +17 JS checks**, справжній lock-wait opt-out/record race між двома PG connections, cap1000 на owner/day/kind, aggregate поля без user ID, retention, snapshot/UTC idempotency та synthetic benchmark. Власну DB видалено.
- Регресії: S2 **109** actual Auth/Mailpit/RLS/recovery/deletion; S4 **49** і S5 **24** SQL rollback; S6 rollback suite; S7 **54 SQL +13**, S8 **69 +16**, S9 **42 +11**, S10 **45 +12** concurrency/restore. Після manual snapshot migration063 повторено S4/S5/S6/S11. S9 actual Auth/local HTTP **50** після extraction webhook reader; real provider requests0.
- Expo Doctor **18/18** після мережевого повтору; offline deps check використовує локальну pinned version map. Final client server-key boundary scan **69 files pass**, після фінальних exports.
- Справжній browser QA на окремому disposable Free акаунті: login/reload; 4-step onboarding і блокування порожньої території; Madrid/music/manual rule; feed/search/empty recovery/page2; живі detail/provenance/0EUR/Spanish original; save+120min reminder з Europe/Madrid та reload; official organizer URL; actual OpenFreeMap/MapLibre tiles/attribution; Free1/1 paywall без фальшивих покупок; uk/en/es; missing private digest відмовляє.
- Browser consent: default off → explicit on → чотири counters по1 (rule/digest/save/organizer), purchase0 → off видаляє всі counters; reload залишає off. Локальний owner для цього не змінювався.
- Ручна добірка до зміни дати:117 fresh,1 stale omitted. Фінальна після півночі Madrid: **116 fresh,1 omitted**, назви правил і факти snapshot присутні. Кількість залежить від часу та source TTL, не є постійним acceptance target. [Фінальний знімок](evidence/s11/manual-history.png); [рання добірка](evidence/s11/digest-responsive.png).

## Знайдено → виправлено → перевірено

| Дефект | Зміна / доказ |
| --- | --- |
| Один stale record блокував усю свіжу добірку | Migration059: fresh subset в одному MVCC SELECT; `stale_excluded` показано, all-stale відмова збережена. Actual browser/API +SQL |
| Stale canonical дубліката міг приховати fresh representative | Migration061: freshness перед canonical preference, без вигаданих facts. SQL regression |
| Ручна історія не містила snapshot/names і могла змінюватися разом з каталогом | Migration063: atomic `selection_snapshot`, matched names, UTC, `s4:v2:` idempotency. Старі записи не переписані; UI чесно позначає legacy fallback. SQL freeze-after-edit +actual API/UI |
| Надмірні s10_group calls для не merged catalog rows | Migration060: direct ID fast path; merges зберігають перевірки. Synthetic benchmark +S10 regression |
| Небезпечний ACK/UTF8 handling локального webhook | Shared bounded64KiB byte reader; split UTF8 збережено; durable enqueue failure503 (retry), auth401, malformed400/oversize413. Node +actual local HTTP50; RevenueCat delivery не виконана |
| Нова metrics RPC мала неоднозначний `kind` у conflict clause | Migration058 named constraint; actual API regression pass |
| Async consent/read/mutation могла завершитися після зміни owner | Captured Session bearer +owner/generation fences; race tests. Offline не створює queue/retry і не дає opt-in |

Зміни старих модулів — мінімальні виправлення дефектів, виявлених сценаріями S11; не нові етапи. Existing user DB не reset, джерела не підміняли fixtures, Plus не надавали реальному owner.

## Вимірювання геозапитів

100000 **SYNTHETIC** events/occurrences у schema-only isolated DB: Madrid/Toronto/Helsinki,80000 known points/20000 unknown, past/date-only/unknown-time та різні filters. `ANALYZE`, `EXPLAIN ANALYZE BUFFERS`,5 samples на query. Median execution (planning окремо в JSON).

| Запит | Rows selected / total | До060, ms | Фінальний median / max, ms |
| --- | --- | --- | --- |
| Radius10km primitive | 1332 | 11.125 | **14.111 /15.765** |
| Polygon primitive +bbox | 1932 | 3.627 | **3.459 /3.723** |
| Full policy/dedup matcher | 377 | 1365.646 | **1373.451 /1411.965** |
| Catalog page/count/dedup | 80000 total | 830.720 | **280.260 /297.292** |

GiST `events_location_idx` використаний обома primitive predicates. Catalog приблизно3× швидший у цих вимірах. **Full matcher ~1.4s лишається bottleneck**, performance budget ще не визначений. Cache recently populated; перший sample не disk-cold; shared laptop Docker, без load/p95/native/network latency. Primitive не еквівалент full rule query. [Before](evidence/s11/benchmark-before.json), [final](evidence/s11/benchmark.json).

Web-perf skill: DOM/source/basic accessible labels та width390/no overflow reviewed. DevTools trace tooling недоступний: CWV/Lighthouse/LCP/INP/CLS/network trace **unverified**. Formal WCAG/VoiceOver/TalkBack/keyboard suite та browser network-offline scenario також **unverified**; transport offline unit test не замінює їх.

## Метрики та staging

Opt-in defaultfalse; тільки5 kind enums, UTC daily bounded counters; немає event titles/search/coordinates/ad IDs. Приватні owner-bound записи, authorized admin бачить day/kind/count totals. Consent off/account delete видаляє всі owner counters; opt-out/record серіалізовано row lock. Reports/RLS показують останні30UTCднів. Фізичний prune залежить від worker uptime: local daily watcher запущений; hosted retention SLA не доведений. Client counters untrusted/best-effort; `purchase` — завершений SDK callback, **не server entitlement/revenue proof**.

Beta profile/guards та server-only staging worker реалізовані; hosted host+service key+DB marker required, SANDBOX billing fence, transport flagsfalse by default. Actual local marker development, AI/S9 config disabled. `worker:s11:check` fails before network через відсутню staging configuration; beta config відмовляє без own EAS project. Жодного hosted tick/deploy/provider purchase/push/AI не виконано. [Runbook](S11_BETA.md).

## Відкриті gates

- `pnpm audit`2026-10-03 UTC: **2 high,1 moderate,0 critical; gate failed**. node-forge1.4.0 GHSA-86w9-cpqp-85rv; braces3.0.3 GHSA-vfj7-8cjw-p6xm; decode-uri-component0.2.2 GHSA-vcc3-ghjq-m6fr. Lock не змінено, findings не ignored/overridden. [Audit](evidence/s11/dependencies-audit.json).
- Physical iPhone+Android, own EAS project/signing/SDK; actual native scenario, notification/location permissions, scheme/deep link cold/warm/background, offline/restart and beta install.
- Hosted staging project+operator access, applied migrations through063/IANA inventory, binding, supervisor/HTTPS webhook, actual ingestion/scheduler/retention/restore drill (S10).
- RevenueCat+App Store Connect+Play sandbox products/offerings/keys, purchase/restore/expiry on both platforms; user confirmed nothing configured yet.
- Actual Expo device credentials/tokens/receipt/tap/background evidence; browser-only choice remains.
- AI provider/exact model/budget+currency/server key still absent; Gmail SMTP absent, local login only. Не відправляли paid/model/store запити.
- CI remote execution та production release/store acceptance відсутні. **S12 pending.**

## Ручна перевірка доступного сценарію

1. Відкрити http://localhost:8087 і ввійти локальним акаунтом; перевірити feed/search/next page та timezone у detail.
2. Через «Події → Зберегти спільну добірку» створити нову історію; побачити назви правил та omitted stale count, reload.
3. Зберегти подію з відомим майбутнім часом, перевірити reminder/quiet preferences і reload; браузер не доводить push.
4. У «Налаштування» перевірити default-off metrics, switch/reload/disable; видалення counters можна перевірити own account RPC, не чужих даних.
5. На обох фізичних платформах повторити checklist з S11_BETA після усунення gates; записати actual device/OS/build/results.
