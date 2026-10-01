# Середовище та фактичні команди S0

У корені ще немає runnable product. `apps/mobile`, admin/worker shell, env examples, product lockfiles та CI — наступний S1. Ці команди виконувалися тільки у тимчасових checkouts.

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
