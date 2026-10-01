# Прогрес Event Radar

Оновлено 2026-10-01, Europe/Madrid. Scope цієї задачі: **лише S0**. Результати аудитів — [REPO_AUDIT.md](REPO_AUDIT.md), команди — [SETUP.md](SETUP.md).

| Етап | Статус | Доказ / наступна дія |
| --- | --- | --- |
| S0 | **verified** | Перевірено код/licenses/SHA/manifests/recent Git семи кандидатів; виконано basic checks Obytes і community-calendar, додатково Simonstorms/event-discovery; обрано одну mobile основу й ingestion спосіб; документи та blockers зафіксовані |
| S1 | pending | Import Obytes, dependency remediation, runtime/env/locks, мінімальні shells, native start, CI |
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
- Локальний Git init на `main`; remote не створено, push не виконувався. Checkpoint commit ще не створено; його можна зробити лише з пов'язаними S0 файлами, за правилами AGENTS.md.

## Блокери / неперевірене, з next action

| Перевірка | Стан / blocker | Наступна дія |
| --- | --- | --- |
| iOS native build/run | unverified; Xcode license gate (`simctl`, CocoaPods) | Власник переглядає/приймає угоду, перевірити simulator і build після S1 import |
| Android native build/run | unverified; adb/standard SDK absent | SDK/JDK/emulator або EAS + physical device, потім S1 native smoke |
| community full install | failed на Python 3.13 і 3.11; lxml compile/license gate | Мінімальний актуальний worker dependency set у S1; не переносити legacy pins автоматично |
| Obytes baseline adoption | current lock не прийнятий; 2 critical audit findings + drift | Сумісні updates/retest/disposition у S1; reevaluate starter якщо не вдасться |
| Supabase DB / RLS | unverified; Docker daemon unavailable, project access не надано | Увімкнути Docker або надати dev project setup для S1/S2 |
| Push/billing/AI/maps/external auth | unverified; accounts/keys/device evidence не надано | Налаштовувати за етапами S2/S3/S5/S6/S9, не блокувати незалежний S1 |
| Real data | 0 product imports; Madrid payload unverified, Barcelona 403, Toronto resource metadata unverified | Fetch/schema/rights review першого Madrid source у S3; 3 sources/2 countries у S6 |

Команди й exit/results див. SETUP та evidence/s0; mocks не використовували як real-integration proof. License review — code/direct package metadata, не повний distribution/legal clearance усіх transitive/native assets.

Рекомендований наступний крок: окреме завдання **S1**, почати із pinned mobile import, own IDs, dependency/runtime remediation та фактичного стартового екрана. Native acceptance лишити unverified до реального запуску. S1 не починався у цій задачі.
