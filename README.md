# Event Radar

Міжнародна апка подій для iOS та Android. S6 підключає часткові реальні афіші Madrid, Toronto й Helsinki, карту та переклади джерела Helsinki. Є локальні Supabase/PostGIS, auth/RLS, правила, збережені події та ручні добірки. AI очікує provider/model/budget; native запуск неперевірений.

Node **22.23.3**, pnpm **10.34.6**:

```sh
pnpm install --frozen-lockfile
supabase start
pnpm local:env
pnpm ingest:s6:local
pnpm check
pnpm dev:web
```

Потрібні Docker Desktop і Supabase CLI 2.34.3. Локальні auth листи — http://127.0.0.1:54324 (Mailpit), Studio — http://127.0.0.1:54323. `pnpm test:s2` перевіряє реальний local Auth/RLS. В іншому терміналі `pnpm dev:admin`. Для native dev client — `pnpm dev:mobile` після build; native SecureStore/device acceptance unverified.

[Запуск і перевірки](docs/SETUP.md) · [Прогрес S0–S12](docs/PROGRESS.md) · [Архітектура](docs/ARCHITECTURE.md) · [Attribution](docs/THIRD_PARTY.md) · [План](MVP_PLAN.md)

[Перевірки й обмеження S6](docs/S6_ACCEPTANCE.md). Автоматичну доставку/SMTP/device push не налаштовано; локальні листи дивіться в Mailpit. Секрети AI залишаються на сервері.
