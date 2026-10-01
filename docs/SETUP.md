# Запуск і перевірки Event Radar

## Поточний запуск S2

Docker Desktop працює; перевірено Docker 29.8.1, Supabase CLI **2.34.3**, local PostgreSQL **17.4**, PostGIS **3.3.7**. Pinned Node/pnpm лишаються **22.23.3 / 10.34.6**. У root:

На цьому комп'ютері pinned tools вже доступні тимчасово; у новому терміналі спочатку `export PATH="/private/tmp/event-radar-s1-tools/node_modules/.bin:$PATH"`. Для переносного checkout встановіть ці версії своїм version manager; системний Node 20/23 не є project runtime.

```sh
pnpm install --frozen-lockfile
supabase start
pnpm local:env
pnpm check
pnpm test:s2
pnpm dev:web
```

`pnpm local:env` записує лише URL/anon key у ignored `apps/mobile/.env.local` (0600). Чужий existing env не перезаписує; keys не друкує. `supabase status` / startup можуть показувати local service credentials: не копіюйте raw output у evidence/чат чи mobile. У `.env.example` credentials лишаються порожніми. Worker service role не потрібен для S2 UI.

Mobile URL показаний у терміналі; QA виконано на localhost:8087. API: http://127.0.0.1:54321, Studio: http://127.0.0.1:54323, **Mailpit: http://127.0.0.1:54324**. Local email templates містять OTP для signup/recovery: створіть disposable email `name@example.test`, прочитайте код у Mailpit й введіть його у застосунку. Password ≥10 символів. Лист не відправляється реальному зовнішньому адресату. Зовнішній SMTP/delivery, staging accounts і native deep links не перевірені; OTP flow не потребує deep links.

Native: iOS simulator може використовувати loopback після toolchain setup; Android emulator URL зазвичай потребує host address (`10.0.2.2`), фізичний пристрій — reachable development host. Ці мережеві/device маршрути **unverified**. Не копіюйте server key у EXPO_PUBLIC; native SDK build gate із S1 лишається.

### Реальні DB/Auth перевірки

`pnpm test:s2` дозволяє лише `http://127.0.0.1:54321`; створює disposable `@example.test` акаунти, synthetic event/private fixtures і прибирає власні записи. Використовує справжні Auth, PostgREST/Postgres і captured Mailpit emails. Тест не підходить для hosted/staging DB. Фактично **108 checks pass**: email signup/confirmation, password policy/reset, profile settings, cross-owner read/update/delete/ownership transfer, parent-owner FK, server-only writes/entitlements, date-only/timezone, persisted session/logout, self-delete/private cascades/public preservation, demo seeds.

Базу відтворено з нуля командами нижче **тільки у новому disposable local stack**. Reset видаляє його дані; для звичайного запуску він не потрібний. Якщо local DB вже містить потрібні дані, спочатку backup/окрема test DB — не виконуйте reset навмання.

```sh
supabase db reset
supabase gen types typescript --local --schema public > apps/mobile/src/lib/database.types.ts
pnpm test:s2
pnpm build:admin
CI=1 pnpm export:mobile
pnpm check:client-bundles
```

RLS увімкнено на **19/19** public tables. PostGIS/seed constraints реальні; boundaries не імпортовані. Root check: TypeScript/lint, **12 Jest + 3 Node tests**, env/token-pattern checks pass. Chunked SecureStore unit tests не є device/keychain proof. Expo dependency check/Doctor **18/18**, frozen install, admin build та iOS/Android/web JS exports pass. Client bundle scan: local service-role value відсутній; pattern scan не є повним security audit. Audit лишається **1 moderate / 0 high / 0 critical**.

Browser QA: uk/en/es mobile й admin, real login, locale/translation/timezone save, reload with session, delete confirmation + cancel, logout + reload with no session, demo markers. RPC deletion/recovery перевірені actual API integration; native auth/storage, external SMTP і remote CI — unverified. Світла Uniwind theme усуває невидимі outline labels на dark system settings.

Додано CI `database-auth` job із local Supabase/real integration/type generation boundary/exports. GitHub Actions agent не запускав і не перевіряв. Наприкінці з’явився origin поза діями agent; remote збережено без змін, push agent не виконував. Supabase можна залишити працювати для ручної перевірки; зупинка `supabase stop` зберігає local backup. Не застосовуйте `--no-backup` до потрібних local даних. QA Metro/admin servers зупиняються Ctrl-C; final state — у PROGRESS.

## Основа S1 — історичні перевірки та інструменти

Версії: Node **22.23.3**, pnpm **10.34.6**, Python **3.13.3**, uv **0.12.21**. Node/pnpm закріплено `.nvmrc`, engines та packageManager; Python minor — `.python-version` / pyproject, exact CI runtime 3.13.3. Використовуйте свій version manager; системні Node 20/23 цього комп'ютера не є runtime проєкту.

З кореня, після встановлення цих версій:

```sh
pnpm install --frozen-lockfile
pnpm check
pnpm dev:web
```

Web Expo відкривається за URL із термінала (типово localhost:8081). Екран має heading «Події поруч. Враження попереду.»; «Про застосунок» перемикає опис. `pnpm dev:admin` в окремому терміналі: http://127.0.0.1:5173, shell «Джерела подій», без доступу до DB. Зупинка серверів — Ctrl-C. Фактично web перевірено на localhost:8087 у Chrome, viewport 390×844, toggle обох станів; [screenshot](evidence/s1/mobile-web.png). Admin також відкрито у Chrome.

```sh
pnpm build:admin
pnpm --filter @event-radar/mobile deps:check
pnpm --filter @event-radar/mobile run doctor
CI=1 pnpm export:mobile
APP_VARIANT=staging pnpm --filter @event-radar/mobile run config
pnpm audit:deps
```

`run doctor` і `run config` пишіть з `run`: pnpm має однойменні власні команди. TypeScript/lint, 8 UI tests + 3 Node tests, env/secrets checks, admin build, Expo dependency check, 18/18 Expo Doctor checks та iOS/Android/web JS exports пройшли. Експорт JS/Hermes bundle **не є native compile або device run**. Registry audit: 0 critical/high, **1 moderate decode-uri-component**; high-only gate pass не означає відсутність усіх findings. [Audit JSON](evidence/s1/dependencies-audit.json).

Worker, cwd `services/ingestion`:

```sh
uv sync --frozen
uv run --frozen ruff check .
uv run --frozen ruff format --check .
uv run --frozen python -m ingestion --check
APP_ENV=staging uv run --frozen python -m ingestion --check
```

Виконано: lint/format pass, CLI обох середовищ повернув `status=ready`, `adapters=0`, `backend_connected=false`. Немає live ingestion.

### Конфігурація без секретів

Копіювання `.env.example` у локальний `.env` потрібне, коли додаються реальні налаштування; для S1 запуску credentials не потрібні. `.env.staging.example` описує staging. Реальні `.env*` ігноруються Git, examples мають порожні credentials.

| Компонент | Назви |
| --- | --- |
| Mobile | `APP_VARIANT=development` або `staging`, optional own `EAS_PROJECT_ID`, `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY` (у S1 не використовуються) |
| Admin | `VITE_APP_ENV=development` або `staging`; `pnpm --filter @event-radar/admin dev:staging` |
| Worker | `APP_ENV`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL` (DB credentials у S1 не використовуються) |

Mobile варіанти мають різні provisional bundle/package IDs і schemes. `pnpm --filter @event-radar/mobile start:staging` запускає staging dev client. EAS development/staging profiles є, але own project/account/signing не налаштовані й builds не виконані. Серверні ключі ніколи не `EXPO_PUBLIC`, `VITE_*` чи mobile `extra`. Pattern-based secret scan пройшов; це обмежена перевірка, не повний security audit.

### Native / CI / S2 prerequisites

`pnpm --filter @event-radar/mobile ios` / `android` вимагають працездатного native toolchain. iOS unverified: Xcode 26.6 є, але license не прийнято, `simctl` і CocoaPods заблоковані. Власник має сам переглянути/прийняти угоду, потім simulator/CocoaPods/build. Android unverified: adb/SDK не знайдено; потрібні SDK/JDK/emulator або own EAS + device. Не приймати ліцензії чи створювати акаунти автоматично.

`.github/workflows/checks.yml` відтворює code checks/build/exports/audit та worker checks. Локальні команди виконані; GitHub Actions у remote не запускався, remote відсутній. Для S2 потрібен working Docker daemon для Supabase CLI або окремий development project; зараз daemon unavailable. Auth/RLS/privacy/i18n не реалізовано в S1.

Тимчасові audit tools цієї сесії: `/private/tmp/event-radar-s1-tools/node_modules/.bin` (Node/pnpm), `/private/tmp/event-radar-s1-python-tools/bin/uv`, pnpm store `/private/tmp/event-radar-s0/pnpm-store`, uv cache `/private/tmp/event-radar-s1-uv-cache`. Це не переносні prerequisites: у звичайному checkout встановіть pinned tools і використовуйте власні caches. Якщо повторюєте саме цю сесію: prepend tools path до PATH; `pnpm install --frozen-lockfile --store-dir /private/tmp/event-radar-s0/pnpm-store`; вкладений `expo install` потребує того ж `npm_config_store_dir`.

## Архів перевірок S0

Нижче — історичні команди кандидатів, до імпорту S1; їх versions/findings не є станом поточного product lock. Checkouts лишаються поза продуктом.

## Перевірене середовище

- macOS arm64; Git 2.49.0.
- Node 20.19.3 у non-login check commands; login shell під час installs використовував Node 23.11.0. Не вважати цю різницю pinned project runtime.
- Obytes Corepack вибрав packageManager **pnpm 10.12.3** (поза repo доступна 10.14.0).
- Simonstorms Bun **1.3.5** тимчасово через npm exec; локального bun не було. `.nvmrc` Node 22, його тут немає. oxlint на Node 20 failed; Node 23.11.0 pass. У S1 pin один підтриманий Node після dependency updates.
- Python 3.13.3; також перевірено install attempt у Homebrew Python 3.11. Xcode 26.6 build 17F113; license gate. Supabase CLI 2.34.3; Docker binary без працюючого daemon; CocoaPods package 1.16.2, command blocked Xcode license. Deno/adb/uv не знайдено.
- `rg` відсутній; використовували `find`, Python та `grep`.

## Відтворення checkout

Checkouts поза продуктом: `/private/tmp/event-radar-s0/<name>`. Клонування `git clone --depth 20 <upstream-url> <temp-path>`; HEAD кожного див. [REPO_AUDIT.md](REPO_AUDIT.md) та [repositories.json](evidence/s0/repositories.json). Для відтворення pin SHA з таблиці; якщо shallow clone не містить SHA, fetch потрібної версії окремо. Supabase клоновано `--depth 20 --filter=blob:none --sparse`, далі `git sparse-checkout set examples/user-management/expo-push-notifications`. Remote **кандидатів** є upstream origin для read-only аудиту; remote **продукту** не створено.

## Obytes — фактично виконано

У cwd `/private/tmp/event-radar-s0/obytes`:

```sh
pnpm install --frozen-lockfile --ignore-scripts --store-dir /private/tmp/event-radar-s0/pnpm-store
./node_modules/.bin/tsc --noEmit
CI=1 ./node_modules/.bin/eslint .
./node_modules/.bin/jest --runInBand --watch=false --watchman=false
./node_modules/.bin/expo config --type public
CI=1 ./node_modules/.bin/expo export --platform ios --platform android --output-dir /private/tmp/event-radar-s0/obytes-export
pnpm audit --json
./node_modules/.bin/expo install --check
CI=1 ./node_modules/.bin/expo start --offline --port 8097
```

Окремо `curl --max-time 10 --fail http://127.0.0.1:8097/status` повернув `packager-status:running`; сервер зупинено Ctrl-C. Install, tsc, CI lint, Jest (40 tests), config, exports pass. Initial editor-mode lint вимикав частину rules, тому виконано CI lint. Initial Jest/export sandbox Watchman failed, повтор поза sandbox pass; Jest використовував `--watchman=false`. Audit/dependency check exit 1, findings і drift у REPO_AUDIT. Native `expo run:ios/android` не виконано через tooling blockers. Auth UI на device не перевірено.

Lifecycle scripts при встановленні вимкнено після огляду manifest: це не перевірка всіх upstream postinstall hooks. Не запускати upstream `check-all` всліпу: `lint:translations` використовує `--fix` і змінює checkout. Не запускати release/publish/install-maestro scripts.

## community-calendar — фактично виконано

```sh
python3 -m venv /private/tmp/event-radar-s0/community-venv
/private/tmp/event-radar-s0/community-venv/bin/pip install -r /private/tmp/event-radar-s0/community-calendar/requirements.txt pytest --cache-dir /private/tmp/event-radar-s0/pip-cache
/opt/homebrew/opt/python@3.11/bin/python3.11 -m venv /private/tmp/event-radar-s0/community-py311
/private/tmp/event-radar-s0/community-py311/bin/pip install -r /private/tmp/event-radar-s0/community-calendar/requirements.txt pytest --cache-dir /private/tmp/event-radar-s0/pip-cache
```

Обидва full installs **failed**, lxml compilation → неприйнята Xcode license. У тимчасовий `community-test-requirements.txt` записано requirements без рядка lxml, додано pytest; upstream requirements не редаговано. Це відхилення явно не дорівнює full install pass.

```sh
/private/tmp/event-radar-s0/community-venv/bin/pip install -r /private/tmp/event-radar-s0/community-test-requirements.txt --cache-dir /private/tmp/event-radar-s0/pip-cache
# cwd: /private/tmp/event-radar-s0/community-calendar
/private/tmp/event-radar-s0/community-venv/bin/python -m pytest tests -q
```

73 tests pass; лог і exact subset/freeze у evidence/s0. `icalendar` resolved 6.3.2, recurring-ical-events 3.8.2, pytest 9.1.1. Upstream complete lock відсутній; freeze лише snapshot тестового середовища. DB test/city build/live scraper/AI не запускалися. `make setup-python` не рекомендується: посилається на відсутній requirements-dev.txt.

## Simonstorms — фактично виконано

У cwd `/private/tmp/event-radar-s0/expo-app-template`:

```sh
npm exec --yes --package=bun@1.3.5 -- bun install --frozen-lockfile --ignore-scripts
./node_modules/.bin/tsc --noEmit
./node_modules/.bin/oxlint --type-aware
/opt/homebrew/opt/node@23/bin/node node_modules/oxlint/bin/oxlint --type-aware
CI=1 ./node_modules/.bin/expo config --type public
CI=1 ./node_modules/.bin/expo export --platform ios --platform android --output-dir /private/tmp/event-radar-s0/simon-export
npm exec --yes --package=bun@1.3.5 -- bun audit --json
./node_modules/.bin/expo install --check
```

Install/tsc/config/export pass. oxlint Node 20 failed, Node 23 pass. Audit/drift exit 1. Native/UI/auth/purchases/analytics unverified. Format/knip і Node 22 CI не перевірені; template не обраний.

## event-discovery — фактично виконано

```sh
python3 -m venv /private/tmp/event-radar-s0/discovery-venv
/private/tmp/event-radar-s0/discovery-venv/bin/pip install -r /private/tmp/event-radar-s0/event-discovery/requirements.txt pytest --cache-dir /private/tmp/event-radar-s0/pip-cache
# cwd: /private/tmp/event-radar-s0/event-discovery
/private/tmp/event-radar-s0/discovery-venv/bin/python -m pytest tests -q
```

Install pass, 60 tests pass. Sheets/Google Calendar/email/Anthropic/live scraping не перевірені. MapLibre/Crawlee/Supabase example — static inspection, без install/build/test.

## Передумови S1

Можна починати локальний S1 без billing/AI/maps акаунтів. Імпортувати тільки обрану mobile основу зі збереженням license/attribution; видалити чужі IDs і demo secrets, pin runtime, оновити сумісні dependencies та disposition critical/high audit findings. Додати мінімальні необхідні worker/admin shell, env examples і locks, dev/staging configs та actual CI. Не створювати функції S2–S12.

Для перевіреного native стартового екрана потрібні прийнята власником Xcode license + working CocoaPods/simulator та Android SDK/JDK/emulator або дозволений EAS/device workflow. Для локального backend — працюючий Docker daemon або dev Supabase project. Не приймати license agreements від імені власника автоматично.

Майбутні **назви** env (ще не створені/не перевірені): mobile `EXPO_PUBLIC_APP_ENV`, `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`; worker `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`; пізніше `EXPO_ACCESS_TOKEN`, `ANTHROPIC_API_KEY`, `AI_MODEL`, `AI_BUDGET`, `REVENUECAT_WEBHOOK_SECRET`, platform public RevenueCat SDK keys і provider-specific maps keys. Own EAS projectId у app config. Service role / DB / AI / webhook secrets ніколи не mobile `extra` або EXPO_PUBLIC. Не копіювати різні upstream KEY/SERVICE_KEY env names без узгодження.

## Перевірки цього документаційного кореня

```sh
git diff --check
git status --short
git remote -v
```

Це перевірка змін/стану Git, не product test. Product commands додати лише після фактичного виконання в S1. Source/account blockers — [SOURCES.md](SOURCES.md).
