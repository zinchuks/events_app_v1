# S11 — запуск і beta gates

**Runbook, не доказ hosted/native запуску.** Фактичні результати й blockers — [QA_REPORT](QA_REPORT.md). Не виконувати S12 чи публікацію автоматично. Не reset managed DB і не relabel local/production як staging.

## Локальна перевірка

Node22.23.3 / pnpm10.34.6, запущений Docker/Supabase. На цій машині runtime доступний через:

```sh
export PATH=/private/tmp/event-radar-s1-tools/node_modules/.bin:$PATH
pnpm check
pnpm test:s11:api
pnpm test:s11
pnpm test:s9:api
pnpm build:admin
pnpm export:mobile
pnpm check:client-bundles
pnpm --filter @event-radar/mobile run doctor
pnpm audit:deps
pnpm metrics:s11:prune
pnpm metrics:s11:watch
```

`test:s11:api` створює/видаляє тільки власні random Auth users; `test:s11` — schema-only disposable DB з labelled synthetic100k, без копіювання user data. Не виконувати s11_invariants.sql самостійно на managed DB. S9 HTTP test лише own loopback8099, real provider requests0. Audit gate наразі failed, решта перелічених перевірок pass. Watcher — local process, не 24h service.

```sh
pnpm local:env
pnpm --filter @event-radar/mobile exec expo start --web --offline --port 8087
node scripts/preview-s11-local.mjs create
node scripts/preview-s11-local.mjs status
node scripts/preview-s11-local.mjs cleanup
```

QA helper створює тільки labelled disposable Free акаунт, public TEST-only password міститься в скрипті. Ніколи не використовувати його для справжнього акаунта. Cleanup перевіряє own marker/identity та прибирає own rows. localhost browser owner і127.0.0.1 QA мають окремі browser storage origins. Не публікувати raw Supabase status/key logs.

## Hosted staging worker — prerequisites та future commands

Потрібен **власний окремий staging Supabase** і trusted operator access. Перед запуском: schema migrations001–063, actual IANA inventory (див. S10_OPERATIONS), source rights/registry, isolated test users. Hosted execution/backup/restore досі не перевірені. Не переносити production users/secrets у fixtures.

Operator у власній staging DB явно встановлює protected singleton binding (тільки після перевірки project identity):

```sql
UPDATE public.s11_runtime
SET environment='staging', api_host='<OWN_PROJECT_REF>.supabase.co'
WHERE id=true;
```

Поточна local DB залишається `development`. Public/Auth roles marker/RPC не доступні. Worker перевіряє marker+host перед кожним tick і перед webhook; wrong/missing binding зупиняє операції. Billing config має бути SANDBOX, disabled поки немає реальної RC configuration.

На server встановити Node22.23.3/pnpm10.34.6 (`pnpm install --frozen-lockfile`), Python/uv та ingestion lock (`uv sync --frozen` у services/ingestion). `.env.worker.staging.example` скопіювати в ignored `.env.worker.staging`, mode0600, заповнити server-only URL/service key/host; **не mobile/admin env**. Script env file автоматично не читає: передати environment через supervisor або Node `--env-file`:

```sh
node --env-file=.env.worker.staging scripts/staging-s11-worker.mjs check
node --env-file=.env.worker.staging scripts/staging-s11-worker.mjs run
node --env-file=.env.worker.staging scripts/staging-s11-worker.mjs watch
```

Еквівалент `pnpm worker:s11:check|run|watch` — коли environment уже передано supervisor. Фактичний local `pnpm worker:s11:check` відмовив через missing explicit staging env **до network**; success remote не заявлено.

Tick: prune counters → existing due-only S6 adapters Madrid/Toronto/Helsinki (never force) → bounded S7/S8 inbox schedulers; незалежна помилка source не пропускає решту. Optional RC reconciliation/Expo/receipts лише за explicit flags. Flags `S11_PUSH_ENABLED`, `S11_BILLING_ENABLED`, `S11_WEBHOOK_ENABLED` залишити false до own credentials/device/sandbox test. AI не активується цим worker. Повторно використано existing leases/retries/fences; нові parallel workers не обходять DB claims.

Webhooks: за flagtrue handler слухає тільки127.0.0.1:8099 `/revenuecat`; потрібен окремий hosted HTTPS reverse proxy із secret Authorization, bounded body/timeouts. Він ACK200 лише після durable enqueue,503 для temporary failures. Actual RevenueCat delivery/HTTPS ingress не перевірено. Не відкривати service role/public port без відповідного staging завдання.

Потрібні supervisor/restart policy, health monitoring, restricted logs без payload/keys, graceful SIGTERM та actual interruption/restart drill. Prune/report window30UTCdays не є uptime guarantee; треба виміряти physical deletion при відсутності ingestion traffic. Завершити actual staging backup→restore за S10_OPERATIONS.

## Beta mobile — prerequisites та future commands

`apps/mobile/eas.json` profile **beta**: extends staging, `developmentClient=false`, internal, environment preview, Android APK, physical iOS (simulatorfalse). IDs **app.eventradar.staging**, scheme **eventradar-staging**; development IDs/scheme окремі. Guard в app.config вимагає APP_VARIANTstaging, own UUIDEAS_PROJECT_ID, hostedHTTPS public Supabase URL і anon/publishable key; localhost/service key відхиляються. Guard не доводить володіння project/backend.

У власному EAS preview environment налаштувати **публічні** EXPO_PUBLIC_SUPABASE_URL/EXPO_PUBLIC_SUPABASE_ANON_KEY і дозволені app variables, own EAS_PROJECT_ID; Expo/RC service secrets — тільки server. Власні per-platform public RevenueCat SDK keys потрібні для sandbox; не активувати Preview API mocks на web. Exact names — env examples та S9_ACCEPTANCE.

Наведене нижче **ще не виконано**; EAS CLI/auth/project/signing/registered devices відсутні. Після окремого setup і закриття audit gate:

```sh
eas build --profile beta --platform ios
eas build --profile beta --platform android
```

Команди виконують у apps/mobile. IPA/internal distribution потребує відповідного Apple signing/device provisioning. APK/IPA тут немає; JS exports не substitute. [EAS JSON](https://docs.expo.dev/eas/json/), [build profiles](https://docs.expo.dev/build/eas-json/), [preview environment usage](https://docs.expo.dev/eas/environment-variables/usage/) — official config references перевірені для S11.

## Physical checklist (обидві платформи, unverified)

Записати device/OS/build SHA/artifact ID/staging host/timezone; окремий disposable Free/Plus sandbox tester. Повторити login/recovery/delete/RLS; onboarding/territory/radius/polygon/filter/map/no invented coordinates; detail/date-only/unknown/source/translation/save/organizer; manual immutable history і scheduled inbox. У denial/grant states перевірити GPS/notification permissions; foreground/background/terminated/quiet/DST/restart/receipts/dedup/expired jobs; real scheme deep links після cold/warm push tap. Перевірити offline/error recovery, cross-owner logout/session races. Actual RC purchase/restore/expiry/grace і server effective limits; failed/cancelled purchase без entitlement. No fixture grant замість store. Consent default-off/on/off/deletion без event facts payloads.

Зберегти actual artifacts/proof у QA_REPORT; при дефекті залишити gate blocked. Лише після цього можлива оцінка готовності S11. S12/store publishing — окремий етап і окреме завдання.
