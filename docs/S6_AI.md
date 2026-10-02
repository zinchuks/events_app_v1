# S6 — серверна основа AI, live integration blocked

2026-10-02. Реалізовано й перевірено **механізми бюджету/кешу та контракт тексту**, але не адаптер реального провайдера. Немає обраного model ID, ключа, підтверджених тарифів або реальних AI-перекладів. Міграції027–029 залишають `enabled=false`, provider/model/currency/limits=NULL. Жодних платних API-запитів. Тестові `fixture-provider`/`fixture-model-not-real` — лише синтетичні значення, що не залишаються в користувацькій БД.

## Кеш і публікація

Ключ: event ID + version + locale + provider + model ID + prompt version + SHA256 оригінального title/description. Зміна моделі або навіть unversioned зміна початкового тексту не використовує попередній результат. Версія prompt — внутрішній `event-translation-v1`, не ID зовнішньої моделі; її оновлення потребує узгодженої міграції/контракту.

`reserve_s6_ai` спочатку перевіряє дозволи source, віддає перевагу source-native перекладу й уже готовому кешу. Нове резервування потребує свіжого source AND record.checked_at. Config/requests/days private з RLS; anon/authenticated не резервують, не відправляють і не завершують requests. Кеш публікується тільки через translations для ready/current model/input, дозволеного source та поточної версії події. Native source cache має пріоритет. Вимкнення нових AI-запитів не ховає дозволений поточний готовий кеш.

AI completion записує лише translated title/description/summary + provenance metadata. Не змінює normalized time/date-only/timezone/venue/point/price/currency/event_language/category або occurrence identity. Late completion після зміни event/source/model позначається superseded, витрати враховуються, текст не публікується.

## Бюджет і стан запиту

Це **спільний серверний бюджет продукту**, не user quota/Free/Plus. UTC day, одна фактична billing currency без FX. Settings row lock та unique cache key серіалізують reservation/dispatch/settlement. До майбутнього paid request резервується configured **verified worst-case ceiling**, а не здогаданий середній cost.

| Стан | Дозволена дія / облік |
| --- | --- |
| reserved | Request ще не відправлений; token +2-minute deadline. Safe `release_s6_ai` повертає резерв, повторний release не повертає двічі |
| dispatching | `begin_s6_ai` атомарно викликано рівно один раз перед API. Повторний begin не дозволяє ще одне відправлення |
| ready | Valid/current result + cache; repeated reserve→cached, без нового budget reservation |
| failed | Failed completion; відома reported cost або консервативно весь ceiling. Автоматичного повтору цього ключа немає |
| uncertain | Невизначена відповідь/вартість: ceiling збережено, reported_cost=NULL; автоматичного refund/retry немає |
| superseded | Результат для старого input/version/model/rights не публікується; бюджет враховано |
| released | Лише доказаний pre-dispatch release; можливий новий token/reservation для того самого ключа |

Перед begin повторно перевіряються enabled/rights/freshness/model/locales, deadline, поточний нижчий cap/ceiling, день UTC та demo status. Якщо reservation пережила північ до dispatch — begin відхиляється; можна safely release й reserve у новому дні. Якщо **вже dispatched** request завершується після півночі — settlement лишається на його dispatch/reservation day. Це не переносить неоплачену стару reservation у новий денний ліміт.

`s6_ai_days.committed` містить held ceilings + settlement. `charge` — консервативне споживання бюджету, округлене вгору до0.000001; `reported_cost` — точне передане відоме значення або NULL, **не вигаданий invoice**. При невідомій вартості весь ceiling лишається спожитим. Повторний finish не списує двічі. Зміна currency того самого дня з positive commitment заблокована.

Cap гарантує reservation bound за належно перевіреного worst-case ceiling. Реальний adapter ще має довести цю верхню межу через actual pricing/input token bound/max output/retry policy. Не обіцяємо billing limit невідомого провайдера. Якщо reported cost усе ж перевищує ceiling, overrun правдиво записується; подальші reservations/dispatches при перевищеному cap блокуються. Не відкидаємо overrun з ledger.

Expired reserved request можна звільнити з його token, бо begin ще не відбувся. Expired dispatching/uncertain не звільняється автоматично: потрібен operator review/known usage. Automatic lease cleanup/reconciliation/hosted deployment не реалізовано. До появи adapter жоден production worker цей lifecycle не запускає.

## Контракт тексту і межі перевірки

`scripts/lib/s6-ai-contract.mjs` формує trusted instructions окремо від JSON недовіреного source text. Output schema містить лише title/description/summary. Validator перевіряє поля/types/Unicode lengths/plain text/control characters, порожній original description, збереження numeric/URL literals у full translation та відсутність нових literals у summary. Це guard від зміни конкретних дат/чисел/посилань, **не доказ семантичної точності чи захисту фактичної моделі від prompt injection**. Написані словами нові факти/імена/адреси не доведені цим алгоритмом.

Майбутній adapter обов'язково викликає цей validator перед finish; SQL повторно перевіряє bounded output schema. Rejected response має завершуватися failed/uncertain з правдивим usage accounting, без повторного paid request. Original залишається видимим; AI недоступний не блокує feed/maps/source-native descriptions. Живі переклади й summary ще потребують ручного source QA, зокрема дат/адрес і невідомих фактів.

## Реальні перевірки основи

```sh
pnpm check
pnpm ai:s6:status
docker exec -i supabase_db_event-radar-local psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/tests/s6_ai_invariants.sql
pnpm test:s6:ai
pnpm test:s6
pnpm test:s2
```

- 5 Node contract tests — синтетичні тексти, не actual model output. Загальний check:16 Jest +25 Node tests.
- SQL invariants використовують transaction-only source/model/cost fixtures і ROLLBACK: schema/RLS/rights/TTL/cached repeats/ceiling/lowered cap/day rollover/uncertainty/known cost/superseded/overrun.
- Concurrency:17 assertions, **два незалежні підключення PostgreSQL**,4 фактично побачених lock waits. Different keys: один reserve/один cap rejection; same key: один reserve; один dispatch; один settlement/cache row. Окрема `event_radar_s6_ai_test_<random>` БД із **schema-only** public/auth + потрібними extensions; жодних user rows, БД після тесту видалена.
- Actual local API regression: S6 sources/native English68 checks, Auth/RLS S2 108. Original source imports/saved data не скинуто.
- `ai:s6:status`: enabledfalse, provider/model/limitsNULL, localesempty, requests0, budgetsempty. Команда read-only/loopback-only, не друкує credentials і нічого не надсилає.

Докази цього продовження: [ai-foundation-results.json](evidence/s6/ai-foundation-results.json). CI steps додано, remote execution unverified. Native/SMTP/push та попередній high node-forge audit blocker залишаються без нової перевірки.

## Що потрібно для завершення S6

Провайдер, **exact доступний model ID**, денний бюджет і currency. Після отримання — official docs/pricing/access verification, один server-only adapter та server key поза chat/client/Git; довести request ceiling, actual locale/output/usage contract, bounded live smoke, malformed/outage/injection checks й ручну якість. Не вмикати цієї основи як нібито готовий AI без такого adapter/proof. S6 лишається in_progress; S7–S12 не починалися.
