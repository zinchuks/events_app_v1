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

## Локальна афіша й вхід

Запущено web http://localhost:8087 і admin http://127.0.0.1:5173. Email capture: http://localhost:54324, листи не доставляються в Gmail. Авторизований акаунт підтверджено, використовуйте email та власний наданий пароль у «Акаунт → Увійти», повторна реєстрація не потрібна. Якщо 1Password показує попередження щодо localhost, закрийте/підтвердьте його особисто й завершіть вхід.

Команди з кореня (Supabase має працювати; Python venv із S1):

```sh
export PATH=/private/tmp/event-radar-s1-tools/node_modules/.bin:$PATH
pnpm ingest:madrid:local
pnpm --filter @event-radar/mobile exec expo start --web --offline --port 8087
pnpm dev:admin
services/ingestion/.venv/bin/ruff check services/ingestion/ingestion
services/ingestion/.venv/bin/python -m unittest discover -s services/ingestion -t services/ingestion
pnpm check
```

Для точного web запуску на 8087: `pnpm --filter @event-radar/mobile exec expo start --web --offline --port 8087`. Runner імпорту обмежений local loopback й отримує server key від CLI в пам’яті. Не запускати його паралельно; цей попередній runner у S3 замінений atomic server RPC; production scheduling/retries лишаються S7. Поточний каталог має сторінки по 30 майбутніх подій, ручне оновлення читання DB. Імпорт не створює розкладу автоматично. Не запускати `supabase db reset`: тепер є користувацькі акаунти та live дані.

## S3 — правило, добірка й transport fixture

Відкрийте http://localhost:8087. Ваш акаунт лишено signed in; якщо браузер не зберіг сесію, увійдіть через Акаунт із власним наданим паролем. Пароль у документах не зберігається.

1. На головній виберіть категорії для Madrid й натисніть «Зберегти правило й створити добірку». Період — найближчі 30 днів. Збережено музичний приклад на 89 подій на момент QA.
2. Відкрийте «Детальніше» → «Зберегти подію». Перевірте «Збережені» та reload; початкова sample подія вже збережена.
3. Відкрийте «Добірки» → добірку. Повторіть створення без змін: відкривається той самий запис. Зміна набору/версії/часу або дня може створити новий.
4. У браузері «Увімкнути push» пояснює вимогу dev-збірки; не обіцяє delivery. Локальний fixture має окремий журнал і не надсилає push.

```sh
export PATH=/private/tmp/event-radar-s1-tools/node_modules/.bin:$PATH
supabase migration up --local
pnpm ingest:madrid:local
pnpm test:s3
pnpm notify:s3:fixture
pnpm test:s2
pnpm check
services/ingestion/.venv/bin/python -m unittest discover -s services/ingestion -t services/ingestion
docker exec -i supabase_db_event-radar-local psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/tests/s3_invariants.sql
```

`test:s3` потребує попереднього live import. Створює/очищує лише власні random `s3-*@example.test` accounts; synthetic push tokens ніколи не відправляє Expo. SQL test завжди робить ROLLBACK, synthetic probes невидимі іншим sessions. `ingest:madrid:local` — allowlisted fetch + one atomic server RPC; ключ у пам’яті. Не застосовуйте db reset до цього stack.

### Development push — blocked до фізичного пристрою

Користувач обрав browser-only QA. Код підготовлено, delivery не перевірено. Наступні передумови: власний Expo project UUID (`EAS_PROJECT_ID`), APNs/FCM signing credentials, physical iOS/Android device, встановлена dev build. Expo Go/web не є proof цього сценарію. Для телефону local API URL `127.0.0.1` потрібно замінити reachable dev/staging endpoint (або свій LAN host); поточний web env не є готовим device setup. Не підставляти чужий Expo projectId і не приймати Xcode угоду за власника.

У dev build: увійти → Добірки → Увімкнути push (permission prompt) → створити нову добірку. Потім manual server transport:

```sh
pnpm notify:s3:expo
pnpm notify:s3:receipts
```

Expo access token, якщо ввімкнено enhanced push security, передавати лише server environment `EXPO_ACCESS_TOKEN`, без values у tracked env/командах/логах. Receipt зазвичай перевіряється пізніше; ticket/receipt не доводить показ на екрані телефону. Потрібен screenshot/log фактичного receive та відкриття потрібної приватної добірки. Opt-out перед dispatch враховується, DeviceNotRegistered видаляє binding. Timeout/failed/stuck Expo jobs не ресендяться автоматично — review до S7. Поточний runner loopback-only, managed deployment не виконано.

## S4 — territories, independent rules and manual union

Local app: http://localhost:8087/rules. Existing account remains signed in. Two saved music rules (Madrid and ES/UA) and a deduplicated89-item manual selection were left for review. That count is a QA snapshot, not permanent future coverage. Older S3 quick Madrid selection remains separate for compatibility.

1. Open «Правила» → «Редагувати правило» or «Нове правило». Add several countries/regions/cities and categories. Pick disconnected Kyiv/Paris/Toronto to see explicit no coverage; no invented events.
2. Choose «Радіус» or «Полігон». Tap the minimal Spain boundary canvas or enter coordinates; polygon3–100 distinct vertices, radius0.001–500km. Zoom/recenter/undo/edit work without GPS. Elsewhere grid only. Save validates geometry; self-intersection/antimeridian is rejected with explanation.
3. Set future days or inclusive dates/timezone; optional budget+explicit currency/language/age, with unknown policies. Madrid prices/languages/ages/coordinates currently unknown: exclude unknown values with an active filter to get an honest empty result. Empty filter fields mean no filter.
4. Open «Події за правилами» → see one card per occurrence and matching rule names → «Зберегти спільну добірку». Current two music rules give89items, repeat opens same digest. No S4 push job/schedule is created.
5. Pause/resume a rule, refresh results, reload; edit settings restored. Deletion requires product confirmation; saved digest/event records remain. Do not delete an actual user's rule as a disposable test.

Actual commands (root, pinned PATH as above):

```sh
supabase migration up --local
supabase gen types typescript --local --schema public > apps/mobile/src/lib/database.types.ts
pnpm test:s4
pnpm test:s3
pnpm test:s2
docker exec -i supabase_db_event-radar-local psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/tests/s4_invariants.sql
pnpm check
pnpm export:mobile
pnpm check:client-bundles
pnpm build:admin
pnpm --filter @event-radar/mobile deps:check
pnpm --filter @event-radar/mobile run doctor
pnpm audit:deps
```

`test:s4` requires live Madrid import and creates/cleans only its own random `s4-*@example.test` users. Geometry/filter SQL checks use entirely transaction-only synthetic events/users and ROLLBACK; invisible to other sessions. S4 migrations11–17 apply forward without resetting user data. Existing local stack must NOT be reset. Types regenerated and compared byte-for-byte. Frozen install uses the pinned pnpm store documented above.

Proof: [S4_ACCEPTANCE](S4_ACCEPTANCE.md), [results](evidence/s4/results.json). 73 actual API /49 SQL assertions, S2 108/S3 84 regressions,14Jest+7Node checks, Doctor18/18, exports/keys/types pass. `pnpm audit --json` records1existing moderate decode-uri-component (exit1),0high/critical; do not report that nonzero full audit as clean. CI contains SQL fixtures; remote Actions not executed.

Native S4 touch/render/build unverified; Xcode licence owner action and Android SDK/JDK or own EAS builds/device still required. Browser viewport is not a native build. S3 physical push remains blocked/browser-only. S5 tile/geocoder/native MapLibre choice, S6 more sources, S7 automatic delivery and S9 tier limits have not been implemented here.

## S5 local mobile experience

Existing local DB із акаунтами не скидати. Застосування incremental migrations018/019:

```sh
export PATH=/private/tmp/event-radar-s1-tools/node_modules/.bin:$PATH
pnpm install --frozen-lockfile --store-dir /private/tmp/event-radar-s0/pnpm-store
supabase migration up --local
supabase gen types typescript --local --schema public > apps/mobile/src/lib/database.types.ts
pnpm check
pnpm test:s5
# Full SQL fixture transaction rolls back; valid also without a live feed:
docker exec -i supabase_db_event-radar-local psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/tests/s5_invariants.sql
pnpm export:mobile
pnpm check:client-bundles
```

`test:s5` needs existing live Madrid import; creates and deletes only own `s5-*@example.test` users. SQL fixture sources/events never persist or become visible to other transactions. CI adds SQL test, remote workflow execution unverified. No server key in docs/export; raw supabase status/start logs not tracked.

Web `http://localhost:8087`, launch `CI=1 pnpm --filter @event-radar/mobile web --offline --port 8087` (web script prepares pinned MapLibre6.11.2 worker/shared public assets first); CI disables watch, restart after code changes. Basemap network is independent of Expo's --offline (which disables Expo tooling network). Supabase/Mailpit local only, no Gmail SMTP. For account entry/settings use bottom settings → account. Guided setup: rules → new rule; advanced radius/polygon via advanced editor. Delivery preferences can be edited per rule but active=false / no jobs until S7.

`http://localhost:8087/map-preview` only in __DEV__: eight synthetic points for actual MapLibre renderer cluster/selection checks. Never real-feed evidence. Production export redirects this route home. Map unknown location notice / first1000 cap are intentional; source fields are not inferred. Map errors keep feed/coordinate fallback available.

MapLibre requires a rebuilt development client, **not Expo Go** ([official Expo setup](https://maplibre.org/maplibre-react-native/docs/setup/expo/)). Isolated `/private/tmp/event-radar-s5-prebuild` receives app.config/package/config and a node_modules link; `expo prebuild --no-install --platform all` checks native config generation without touching product native dirs. Actual iOS compile/run still blocked by owner's Xcode license; Android adb/SDK unavailable. Generated native configs, JS exports, Chrome screenshots are not iOS/Android acceptance. Physical push/own EAS signing/APNs/FCM remains unverified.

MapLibre6.11.2 uses same-origin `/vendor/maplibre/6.11.2/maplibre-gl-worker.mjs` + shared module. `pnpm export:mobile` prepares/copies these assets into web dist; serve web at configured EXPO_BASE_URL. If starting Expo directly with `exec`, run `node scripts/prepare-map-assets.mjs` first. Generated third-party code is ignored by Git/ESLint; package bytes remain covered by frozen lockfile, licence and export key scan. Never restore vulnerable5.24.0 to bypass Metro; Babel web import-meta transformation and explicit worker URL fix6.x compatibility.

Security check 2026-10-02: `pnpm audit --json` / `pnpm audit:deps` fail because **1 high node-forge** (Expo CLI, no fixed published version) and existing1moderate decode-uri-component. Do not disable the CI audit gate. [Advisory](https://github.com/advisories/GHSA-86w9-cpqp-85rv), full snapshot evidence/s5/dependencies-audit.json. This prevents a clean security/release claim; routine local checks remain usable.

## S6 local source workflow — 2026-10-02

Current runnable UI: http://localhost:8087 (Metro), Supabase API54321/DB54322, Studio54323/Mailpit54324. User credentials are not recorded here. Before reuse, read [S6_ACCEPTANCE.md](S6_ACCEPTANCE.md); this supports local automatic polling, without a deployed production service or notification scheduler.

```sh
supabase start
supabase migration up --local
pnpm local:env
pnpm ingest:s6:local
pnpm ingest:s6:local madrid --force
pnpm test:s6
docker exec -i supabase_db_event-radar-local psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/tests/s6_invariants.sql
services/ingestion/.venv/bin/ruff check services/ingestion
services/ingestion/.venv/bin/ruff format --check services/ingestion
services/ingestion/.venv/bin/python -m unittest discover -s services/ingestion -t services/ingestion
pnpm check
pnpm export:mobile
pnpm check:client-bundles
pnpm build:admin
pnpm audit:deps
```

Actual local commands use Node22.23.3/pnpm10.34.6 from `/private/tmp/event-radar-s1-tools/node_modules/.bin` prepended to PATH, Python3.13.3 in the existing ingestion `.venv`; `uv`/`rg` are unavailable here. Canonical frozen `uv sync` remains the setup path for a fresh tool-equipped environment. No `supabase db reset`: this local stack contains user account/rules/saved data. Supabase/localhost/network commands need sandbox escalation in this IDE.

Automatic local polling (separate terminal, root):

```sh
pnpm ingest:s6:watch
# Bounded verification: two cycles separated by at least60 seconds
pnpm ingest:s6:watch --cycles=2
# Optional only-one-source / slower wake
pnpm ingest:s6:watch helsinki --interval-seconds=300
```

Stop with Ctrl+C (SIGINT/SIGTERM). The process/Docker must remain running; sleep/reboot/closed terminal stops or delays polling. There is no OS startup service, hosted deployment, notification scheduler or24h uptime proof. `--force` is rejected in watch mode, wake interval60..3600s, optional cycle limit1..1000. Cycles do not overlap; each wake checks durable due state rather than fetching all sources. Source claim failure does not skip other sources. Source fetch120s/API calls10s (atomic import125s) are bounded. SIGINT aborts an in-flight child/request; safe failure release is also bounded. Ambiguous import HTTP/abort responses log `import_uncertain`, retain the claim until completion/expiry and never falsely mark healthy/failed. An unchanged retry is safe through stable IDs/versioning. Logs contain only public metrics/error enums, no raw response bodies or keys.

New S4 digest needs current source AND record.checked_at within the source TTL; if an old record dropped from the bounded feed, a fresh source poll does not renew it. Stale selection reports the existing localized stale notice. Catalog/details/saved/history remain available; disappearance is not cancellation. Legacy S3 filters stale records out.

Default CLI checks due state and does not refetch a leased/not-due source. Optional `--force` bypasses cadence/backoff for manual QA, never an active lease. Source codes are exactly madrid/toronto/helsinki. Cadence Madrid/Toronto24h, Helsinki6h; TTL48h/48h/12h; lease4min; explicit failure backoff starts5min and caps24h. Unexpected empty/malformed/truncated batches fail without updating source health. Source-native version/locale cache is read-only from mobile, source labels/licences preserved. Worker takes server key only in memory from local Supabase CLI; no key in CLI args, evidence or mobile env.

AI is not configured. Need provider, actual model ID, daily amount/currency, then verify pricing/access and configure the provider's server key under the chosen adapter's documented env names. Never send keys in chat or place them in EXPO_PUBLIC/VITE env. No default/invented model or budget, no paid requests made. The source-native English UI is already usable independently.

On DB tzdata upgrade refresh `public.timezone_names` in a reviewed migration and rerun accepted-name parity/DST checks. Do not cache UTC offsets: only accepted names are indexed. Audit remains failed1 high node-forge (no fix)+1 moderate; gate not disabled. iOS/Android native/push/external SMTP/remote CI are still unverified.

S6 operational compatibility: `pnpm ingest:madrid:local` now delegates to the S6 Madrid runner with `--force`, preventing the old adapter from overwriting normalized facts/cache hashes. Legacy SQL RPC remains service-only for S3 rollback regressions; it is not the current operational import path.
