# Прогрес Event Radar

Оновлено 2026-10-01, Europe/Madrid. Поточна задача: **S1**, без переходу до S2. Результати аудитів — [REPO_AUDIT.md](REPO_AUDIT.md), команди — [SETUP.md](SETUP.md).

| Етап | Статус | Доказ / наступна дія |
| --- | --- | --- |
| S0 | **verified** | Перевірено код/licenses/SHA/manifests/recent Git семи кандидатів; виконано basic checks Obytes і community-calendar, додатково Simonstorms/event-discovery; обрано одну mobile основу й ingestion спосіб; документи та blockers зафіксовані |
| S1 | **implemented** | Mobile/admin/worker основа, env/runtime/locks/CI; browser startup/toggle, code checks, exports pass. Native builds і remote CI unverified |
| S2 | pending | DB/PostGIS/Auth/RLS, uk/en/es; потрібне working local/managed DB |
| S3 | pending | Один дозволений live source → DB/mobile/digest/push; device/credentials unverified |
| S4 | pending | Territories/radius/polygon/rules; boundary provider не обраний |
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
| Supabase DB / RLS | unverified; Docker daemon unavailable, project access не надано | Увімкнути Docker або надати dev project setup для S1/S2 |
| Push/billing/AI/maps/external auth | unverified; accounts/keys/device evidence не надано | Налаштовувати за етапами S2/S3/S5/S6/S9, не блокувати незалежний S1 |
| Real data | 0 product imports; Madrid payload unverified, Barcelona 403, Toronto resource metadata unverified | Fetch/schema/rights review першого Madrid source у S3; 3 sources/2 countries у S6 |

Команди й exit/results див. SETUP та evidence/s0; mocks не використовували як real-integration proof. License review — code/direct package metadata, не повний distribution/legal clearance усіх transitive/native assets.

## Що зроблено у S1

- Selective Obytes import із MIT license, exact upstream paths/SHA й adaptation notices; власні mobile IDs/schemes, системні fonts, без demo providers. Стартовий екран і працездатний toggle опису.
- Мінімальний Vite admin shell і executable Python worker check (0 adapters, DB disconnected). Не додавали функції S2: DB/Auth/RLS/i18n, CRUD чи ingestion.
- Node 22.23.3 / pnpm 10.34.6, pnpm/uv locks, 6 порожніх credential env examples, dev/staging configs/EAS profiles, CI workflow. GitHub Actions execution unverified: remote не створено.
- Security updates усунули critical/high; Metro image-size Buffer patch з реальним PNG regression test; вузький resolver guard усунув Uniwind/RN Web dev import cycle, знайдений під час browser QA. Один moderate backlog записано вище.
- Frozen install, TypeScript, ESLint, 8 UI + 3 Node tests, env і token-pattern checks, admin build, Expo dependency check, Doctor 18/18, iOS/Android/web JS exports: pass. Worker Ruff check/format і CLI development/staging: pass.
- Реальний local web startup у Chrome, mobile viewport 390×844, відкриття/згортання опису та admin startup: pass. [Доказ](evidence/s1/mobile-web.png), [результати](evidence/s1/results.json), [SETUP](SETUP.md). Native compile/run/device acceptance лишаються unverified; exports їх не замінюють. Через ці межі S1 позначено implemented, не загальне verified всіх платформ.

Наступний етап — **S2**, лише за новим завданням. Потрібен працюючий Docker/Supabase або development project, щоб створювати й реально тестувати DB/RLS. Native tooling можна налагоджувати незалежно. Для own EAS builds пізніше потрібні project/account/signing/device. Жодні акаунти чи ключі не вигадано.

Історична фінальна перевірка S0: links/JSON/SHA/license snapshots узгоджені; product paths тоді відсутні. Upstream license whitespace збережено окремим attribute. Поточний S1 checkpoint і фінальна Git перевірка записуються після review; push не виконується.
