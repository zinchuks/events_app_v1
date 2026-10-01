# Event Radar

Міжнародна апка подій для iOS та Android. S0 завершено; S1 містить стартовий mobile екран, admin shell та executable worker check. Події, база й авторизація ще не підключені.

Node **22.23.3**, pnpm **10.34.6**:

```sh
pnpm install --frozen-lockfile
pnpm check
pnpm dev:web
```

В іншому терміналі `pnpm dev:admin`. Для native dev client — `pnpm dev:mobile` після build; iOS/Android setup поки неперевірений.

[Запуск і перевірки](docs/SETUP.md) · [Прогрес S0–S12](docs/PROGRESS.md) · [Архітектура](docs/ARCHITECTURE.md) · [Attribution](docs/THIRD_PARTY.md) · [План](MVP_PLAN.md)
