# Event Radar

Міжнародна апка подій для iOS та Android. S2 містить локальну Supabase/PostGIS базу, email auth, owner RLS, uk/en/es та demo-території. Реальні джерела подій ще не підключені; native запуск неперевірений.

Node **22.23.3**, pnpm **10.34.6**:

```sh
pnpm install --frozen-lockfile
supabase start
pnpm local:env
pnpm check
pnpm dev:web
```

Потрібні Docker Desktop і Supabase CLI 2.34.3. Локальні auth листи — http://127.0.0.1:54324 (Mailpit), Studio — http://127.0.0.1:54323. `pnpm test:s2` перевіряє реальний local Auth/RLS. В іншому терміналі `pnpm dev:admin`. Для native dev client — `pnpm dev:mobile` після build; native SecureStore/device acceptance unverified.

[Запуск і перевірки](docs/SETUP.md) · [Прогрес S0–S12](docs/PROGRESS.md) · [Архітектура](docs/ARCHITECTURE.md) · [Attribution](docs/THIRD_PARTY.md) · [План](MVP_PLAN.md)
