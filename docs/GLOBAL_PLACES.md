# Світовий довідник місць — 2026-10-05

Окреме замовлене розширення після S11, **не S12**. GeoNames дозволяє знаходити населені пункти світу, але не є джерелом подій. Підключена афіша залишається частковою Madrid/Toronto/Helsinki. Показуємо provenance та чесний статус непідтвердженого покриття.

## Дані та межі

Офіційні `allCountries.zip`, `alternateNamesV2.zip`, `countryInfo.txt`, source snapshots/sha256 — [manifest](evidence/places/manifest.json). [GeoNames README](https://download.geonames.org/export/dump/readme.txt) описує поля й [CC BY4.0](https://creativecommons.org/licenses/by/4.0/). Довідник не гарантує повноти/точності; його населення/центри не є міськими межами чи офіційною класифікацією села.

Немає population threshold. Поточні P features включено: PPL/PPLL/PPLA*/PPLC/PPLX/PPLF/PPLR/PPLS/STLMT тощо, разом із source feature_code; generic PPL не розрізняє місто/село, не вигадуємо subtype за чисельністю. PPLH/PPLCH/PPLQ/PPLW історичні/покинуті виключено. ADM1–5 включено для адміністративної ієрархії; країни/території — за countryInfo ID. Historical PCLH country rows не публікуються. Country codes — provider geography, не кількість суверенних держав.

Source admin codes визначають parent. Неоднозначні ключі пропускаємо на користь найближчого однозначного предка/країни, ніколи не вгадуємо найближче місто. Виявлено 2586 ambiguous admin keys; цей count у manifest. Відсутність parent зберігається чесно. Назви `und` — оригінал; en/es/uk лише наявні source alternate names, preferred current має пріоритет. Інші aliases лишаються searchable. Це не AI translation.

## Архітектура

Migration064: private `place_catalog` і `place_imports`, server-only writes, anon/Auth bounded `search_places` RPC. Окремий gazetteer не додає мільйони рядків у робочі `territories`; вони materialize через authenticated `resolve_place` лише при виборі території. Existing reviewed city/country crosswalk перевіряється проти source ID+country+name; original UUID/names/boundaries/provenance/parent/rules збережені. Demo rows не стають real.

Пошук25 items+has_more, offset≤10000, input≤100, one character просить2; two characters search indexed prefixes of source aliases,3+ search all aliases; aliases/accent/case/Unicode normalized, literal `%/_` escaped, locale/country/kind validated. pg_trgm GIN +two-character alias prefix GIN +popularity index; empty search бере bounded top candidates, не сортує весь світ. Query250ms debounce, stale response/owner guards. Деталі — [verification](evidence/places/verification.json); local latency не є hosted/native SLA.

Legacy SQL kind `city` підтримує всі населені пункти; UI «Міста й села», feature_code зберігає точний тип джерела. Point-only city без підтверджених events/boundary пропонує **явно обраний радіус**0.001–500km (початкове поле10km), не вигадану міську геометрію. Відомі territories доступні як раніше. Country/admin зберігає source hierarchy; без джерел очікувана афіша порожня. `has_catalog_events` означає наявні permitted source records, не повне/свіже/майбутнє покриття.

## Фактичний local setup

Docker/Supabase local потрібні; Node22.23.3/pnpm10.34.6, Python3.13 stdlib (нових dependencies немає). Raw archives/SQLite/prepared files **поза product/Git**, на цій машині `/private/tmp/event-radar-geonames`. Завантажити [allCountries.zip](https://download.geonames.org/export/dump/allCountries.zip), [alternateNamesV2.zip](https://download.geonames.org/export/dump/alternateNamesV2.zip) і [countryInfo.txt](https://download.geonames.org/export/dump/countryInfo.txt) у цю папку, перевірити archive integrity; не використовувати cities500 як повний список.

```sh
services/ingestion/.venv/bin/python scripts/places/prepare.py /private/tmp/event-radar-geonames
PATH=/private/tmp/event-radar-s1-tools/node_modules/.bin:$PATH services/ingestion/.venv/bin/python scripts/places/import.py /private/tmp/event-radar-geonames
```

Еквіваленти `pnpm places:prepare DIR`, `pnpm places:import:local DIR` потребують доступного Python3.13. Preparation stream ZIP, SQLite current localized names, LF CSV/parent files/sha manifest. Validate full dump≥1m/200country metadata, ranges/codes, parent refs та explicit crosswalk. Import перевіряє local API, використовує fixed local container, temp tables+one transaction/advisory lock, rebuild search index, atomic commit; search може чекати lock під час імпорту. Немає reset/видалення users/events/rules. Same source fingerprint повторно пропускається. Missing source IDs mark inactive, не видаляють раніше вибрані territories.

Перший import виявив CSV CRLF/LF mismatch і повністю rollback (published catalog0). Canonical LF виправлено; окремо query normalization узгоджено з NFKD source keys для українських ї/й. Помилку не приховано як успішний імпорт. Один валідний запис P із порожнім feature_code (Ottawa Lake,6620472) відновлено з підготовленого джерела; parser/importer тепер зберігають порожній код без вигаданого subtype. Actual final results — evidence.

Для hosted environment цей local importer непридатний; потрібен окремий authorized staging import/диск/backup/операторський доступ. Automatic daily sync/deletion feed/supervisor не налаштовані, лише repeatable full refresh. Перевірити free disk перед повтором: повні data та search indexes займають кількаGB; тимчасові archives/prepared files також кількаGB.

Implementation checkpoint: `31fc73697ed2c80993cfcee243ac34bae34849ef`; documentation/evidence зберігаються окремим наступним commit.

## Фактичний результат

Опубліковано **5 632 100 активних записів**: **5 170 256 населених пунктів**, 461 594 адміністративних одиниць, 250 кодів країн/територій GeoNames. Переглянуто 13 472 245 рядків джерела, підготовлено 5 632 102; дві історичні PCLH країни виключено. Таблиця разом з індексами: 2 976 538 624 bytes на цій машині. SHA архівів збережені в manifest. Повтор того самого fingerprint пропущено.

`pnpm check` пройшов: typecheck/lint,27 Jest+53 Node,env/secrets. Python9,SQL16,actual Auth/API51; S2 regression109,S4 rollback49,S5 rollback24. Експорти JavaScript web/iOS/Android і перевірка серверних ключів у69 client files пройшли. Native builds та remote CI цим не підтверджені. API знаходить Київ/Kiev, São Paulo, 東京, Londres, Верховину й Zermatt. EXPLAIN на фактичному повному довіднику використовує обидва GIN індекси; окремі локальні заміри не є гарантією швидкості на хостингу.

У Chrome перевірено реальний пошук Верховини, радіус5km у чернетці, Київ, відкриття чинного Madrid правила та 東京 у першому кроці onboarding. Browser console errors не спостерігались. Вузький viewport390×844 перевірено й reset; [знімок](evidence/places/village-radius.png). Жодне власне правило через QA не збережено. До/після:1profile,4rules,2saved,3sources; AI/billing disabled, environment development. У пошуковій відповіді стара територія без центру може використовувати GeoNames point; її збережені center/boundary/parent не змінюються.

## Перевірки та ручний сценарій

```sh
pnpm check
services/ingestion/.venv/bin/python -m unittest discover -s scripts/places -p 'test_*.py'
services/ingestion/.venv/bin/ruff check scripts/places
services/ingestion/.venv/bin/ruff format --check scripts/places
pnpm test:places
# SQL transaction fixtures +ROLLBACK, не reset:
docker exec -i supabase_db_event-radar-local psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/tests/places_invariants.sql
pnpm export:mobile
pnpm check:client-bundles
```

1. «Правила → Нове правило → Міста й села»: знайти «Верховина», «Zermatt», «東京»; побачити країну/регіон і source credit.
2. Ввести5km, вибрати радіус point-only place; перевірити назву та центрові coordinates, не вигадані boundaries. Зберігати лише бажане власне правило.
3. Пошук «Київ»/«Kiev», «São Paulo»/«Sao Paulo» та page2; existing city має один canonical result.
4. Reload існуючого правила: його IDs/території/настройки збережені. Невідоме місце дає empty, RPC error має retry.

Native/staging acceptance, event sources outside3cities, full worldwide municipal boundaries, daily hosted refresh лишаються unverified/не реалізовані цим розширенням. Попередні S6/S9/S10/S11 gates та audit findings не називаються закритими; S12 pending.
