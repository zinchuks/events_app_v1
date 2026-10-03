# S10: керування й відновлення

Адмінка: `http://127.0.0.1:5173`, `pnpm local:env`, `pnpm dev:admin`. Це локальне середовище; ноутбук і локальний watcher не гарантують цілодобову роботу. Browser використовує лише public anon key й власну Auth-сесію. Доступ перевіряється в PostgreSQL на кожному RPC, а не через signup metadata або приховані кнопки. Окремий storage key не замінює mobile-сесію.

| Роль | Читання операційних даних | Виправлення / категоризація / review | CRUD джерел |
| --- | --- | --- | --- |
| Звичайний користувач / anon | Ні | Ні | Ні |
| viewer | Так | Ні | Ні |
| editor | Так | Так | Ні |
| admin | Так | Так | Так |

Ролі задає лише довірений оператор. Browser не може надавати ролі або entitlements. Локальний project owner отримав audited admin-role; пароль не зберігався в коді/документах. Команди нижче обмежені loopback stack. Наявний акаунт обов’язковий; акаунти вони не створюють:

```sh
pnpm admin:s10:local grant OWNER_EMAIL admin 'Причина призначення ролі'
pnpm admin:s10:local grant OWNER_EMAIL viewer 'Причина зміни ролі'
pnpm admin:s10:local revoke OWNER_EMAIL none 'Причина відкликання ролі'
```

Відкликання діє для наступного RPC без перевипуску JWT. Оновлення/вихід прибирає вже показані дані. `s10_roles`, provider baselines, merge links, audit не доступні напряму authenticated/anon. Операційні RPC не віддають email, токени пристроїв, receipts, service key або raw HTTP payload. Адмін бачить агреговані job/error/delivery counts, а не добірки інших користувачів. При видаленні акаунта role-row видаляється, audit actor стає NULL, role target/user_id очищаються; історія виправлень публічних подій зберігається. Причини аудиту не призначені для секретів/персональних контактів.

## Джерела, вимкнення й retries

- Новий registry entry завжди `unreviewed`, polling/cache/translate/images false. Додавання URL не встановлює scraper. У worker підтримуються лише перевірені madrid/toronto/helsinki; нове джерело потребує окремого audited adapter і прав на дані. Code/URL/acquisition існуючого запису незмінні, щоб stable identities та source advisory fences не розійшлися.
- Редагування потребує `admin_revision` показаного запису та причини. Conflict → оновити екран, порівняти зміни й повторити свідомо. Немає автоматичного перезапису конкурентного редагування.
- `poll_enabled=false` припиняє нові claims і анулює outstanding lease/token. In-flight committed import може завершитись перед паузою; після commit паузи старий fetch не імпортується. Poll lock → source advisory lock — єдиний порядок. `--force` не обходить pause/rights/lease.
- Pause залишає ліцензовані історичні записи; TTL продовжує діяти. Для відкликання прав виставити `terms_status=blocked`: public detail/feed/translation RLS прибирає доступ. Відсутність запису або pause не означає cancellation. Права на код не є правами на дані.
- Видалення допускається лише для порожнього, непідключеного registry entry без events/source_records/ingestion_runs. Для підключеного джерела використовувати pause/blocked; provenance й saved/history залишаються.
- Підтверджена помилка extraction/SQL rollback: fail RPC із fenced token, sanitized enum, bounded exponential backoff 5 хв → максимум 24 год; `failures` і остання помилка видно в dashboard, нові failures також у ingestion history. Старі failures до S10 не відновлюються заднім числом.
- Неоднозначний network/abort після import: lease зберігається до expiry. Наступний stable-ID import ідемпотентний; не позначати джерело healthy вручну. Resume не обнуляє backoff; due watcher продовжить за `next_poll_at`. Окремий `pnpm ingest:s6:local madrid --force` — тільки свідомий ручний refresh після виправлення причини; watch не force.
- Push unknown dispatch та AI uncertain charge не retry автоматично: S7/S8 зберігають fenced delivery/receipt state, S6 budget утримує ceiling. `sent` означає оброблено, а не delivered. S9 expiry/grace продовжують обмежувати доступ навіть під час provider outage. Адмінка не має кнопки fake Plus, paid retry чи відправлення Expo.
- Після рестарту запустити `pnpm ingest:s6:watch`, `pnpm schedule:s7:watch`, `pnpm schedule:s8:watch`. За замовчуванням тільки inbox, без Expo/AI. Due slots/leases/attempts у DB; workers не повинні очищати їх. Real hosted restart/24h uptime ще unverified.

Dashboard відрізняє source freshness і stale normalized records. Counts включають збережені минулі записи; future_sessions — окремо. Показує coverage note; subset/partial не є повним покриттям країни. AI показує enabled/provider/model/budget, committed ceilings і відомі charge; NULL charge не є нульовою реальною витратою. Actual AI залишається disabled/blocked.

## Виправлення й дублікати

Редактор дозволяє title, venue, category_code, price/currency, explicit status і time_kind/start/end/local_date/IANA zone. Порожнє значення = NULL; ціна й валюта мають узгоджуватись. `review` = unknown, `cancelled` потребує фактичного підтвердження; причина мінімум 5 символів. ISO час містить UTC offset; date_only не перетворювати на вигаданий час.

`expected_version` прив’язана до відкритої форми. Source lock → event/occurrence lock → compare version → overlay/update/audit в одній transaction. Категоризація також є overlay. S6 і legacy Madrid import повторно застосовують overlay після нормалізації. Оригінальний provider hash/provenance збережений; translations нового виправленого version не підміняються старим provider cache. Multi-session event correction відхиляється, бо зараз audited adapters 1 event : 1 occurrence.

S10 приватно зберігає останній валідований normalized provider baseline при S6 import. Reset потребує baseline молодшого за source TTL, allowed/cache rights і поточного version. Він атомарно повертає baseline та видаляє overlay, створюючи аудит. Для старих записів baseline відсутній до першого S6 імпорту після S10: спочатку refresh. Legacy importer baseline не формує. Немає silent reset до stale/вигаданих фактів.

Manual candidate review прив’язана до versions показаних snapshots. Merge допускається лише для known sessions з однаковими title/venue/start/end/status/category/language/price/currency/country і відомими точками ≤100 м. Date-only/unknown/different sessions не merge. Існуючі star groups не можна перетворити на chains; спочатку роз’єднати попередню пару.

Merge — логічна група, без фізичного видалення/перенесення originals. Catalog і повна manual/scheduled match union обирають один eligible представник; якщо canonical source blocked або не відповідає фільтрам, eligible member залишається видимим. Rules/billing перевіряються до dedup. Saved identities, історичні digest snapshots і S8 reminders не переписуються: якщо користувач сам зберіг обидва originals, можуть лишитись два його незалежні нагадування. Розбіжність ключових фактів між originals автоматично розділяє майбутні selections; review status та аудит лишаються для повторної перевірки. «Різні події / роз’єднати» прибирає link. Автоматичного fuzzy merge немає.

## Backup / restore

Реально виконаний `pnpm test:s10` клонує лише schema public/auth і статичний IANA inventory, додає **власні synthetic** дані, робить PostgreSQL17 custom archive (`PGDMP`) у пам’яті, відновлює в другу нову ізольовану DB та перевіряє events/saved/reminders/overlays/audit/roles, Auth helpers, RLS і EXECUTE/table grants. Обидві DB видаляються в finally. Managed user data не dump-ились. Це **local restore verified; staging restore unverified**.

Важлива залежність: CHECK `valid_timezone` читає `timezone_names`. Звичайне alphabetical restore-data завантажує occurrences до timezone_names і падає. Перевірений порядок:

1. PostgreSQL/PostGIS/pgcrypto сумісних версій, extensions у schema `extensions`, global API roles/відповідні grants.
2. Restore `pre-data` schema/functions.
3. Завантажити `timezone_names` **до** залежних таблиць. Наш тест виключає лише TABLE DATA цього lookup через `pg_dump --exclude-table-data=public.timezone_names`, потім відтворює його з `pg_catalog.pg_timezone_names` на тому самому PG. Для іншої версії tzdata порівняти всі зони backup і destination; розбіжність — blocker.
4. Restore `data` + `post-data`, exit on error; це відновлює indexes/FK/RLS/grants/triggers. Не вмикати workers під час restore.
5. Перевірити дані й права, server configs лишити disabled для AI/billing/push, потім окремо перевірити локальний dry run і контрольований запуск workers.

Для **staging acceptance**, ще НЕ виконано: потрібні окремий Supabase staging project і окремий restore target, operator DB access, відповідні Auth/Storage/platform-role конфігурації, права на зберігання backup, доступ до configured backup/PITR та визначені retention/RPO/RTO. Відновлювати тільки в новий isolated target; ніколи managed DB через `db reset`/`--clean`.

Обрати й зафіксувати фактичний backup cadence, retention і encryption у provider dashboard; перевірити, що backup доступний, а не лише тариф обіцяє функцію. DB archive містить персональні дані/Auth hashes: передавати й зберігати лише в закритому encrypted operator storage, поза repo/CI public artifacts. Не вставляти DB passwords/URLs із credentials у runbook, командні логи чи shell history. Secrets/файли Storage, Auth config, SMTP, RevenueCat/Expo/AI credentials і worker deployment не покриває наш public/auth local archive; перевіряти їх відновлення окремо.

Staging drill evidence: backup timestamp/checksum/versions, destination project, початок/кінець/RTO, row counts/checksums, auth owner/nonowner/admin denial, source/occurrence/provenance IDs, saved/rule intents, entitlements server expiry, scheduler leases/business-key uniqueness, override reimport, pending reminder due times, rights guards, storage objects/config і cleanup. Не скидати pending transport/uncertain provider state й не replay push або платні запити при restore. Свідоме ввімкнення вихідних інтеграцій лише після isolation/receipt/reconcile audit. Задокументувати допустиме RPO щодо timestamp backup; staging restore не позначати pass без цього виконаного drill.

Технічні першоджерела: [Supabase RLS і SECURITY DEFINER](https://supabase.com/docs/guides/database/postgres/row-level-security), [RBAC](https://supabase.com/docs/guides/api/custom-claims-and-role-based-access-control-rbac), [PostgreSQL17 pg_dump](https://www.postgresql.org/docs/17/app-pgdump.html), [pg_restore](https://www.postgresql.org/docs/17/app-pgrestore.html). У цьому проєкті обрано live DB role check, щоб revoke не залежав від старого JWT claim.
