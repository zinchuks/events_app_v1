# Attribution та перелік запозичень

На S0 імпортували лише audit evidence та license snapshots. У S1 вибірково адаптовано Obytes; точні файли й upstream SHA — [imported-files.json](evidence/s1/imported-files.json). Права на власний product code цим документом не визначаються; сторонні licenses не застосовуються автоматично до всього продукту.

S1: `button.tsx` і behavioral tests, палітра `global.css`, Metro config адаптовані з Obytes `fd9b358ed11913d2a49fd9ffa6582fe03ba130e7`. Збережено `apps/mobile/LICENSE` та `licenses/obytes/LICENSE`. Прибрано font-inter й тести, що дублювали class strings; використовується системний шрифт. Babel/Jest/test-utils/Router layout/TypeScript/app-config адаптовано за структурою starter без demo providers, fonts/assets, auth/storage/billing чи чужих IDs. Новий welcome screen та admin/worker написано тут. Community-calendar code ще не імпортовано.

Metro 0.83.3, © Meta Platforms, Inc. and affiliates, MIT: [LICENSE](../licenses/metro/LICENSE). Змінено лише image-size Buffer API compatibility у `src/Assets.js` та Flow definition; повний diff — [patch](../patches/metro@0.83.3.patch), pnpm застосовує його через lockfile. Uniwind runtime package не vendored; локальний resolver guard — в mobile Metro config.

| Upstream / copyright | Збережено | Майбутнє запозичення |
| --- | --- | --- |
| Obytes, MIT, ©2021 Obytes | `licenses/obytes/LICENSE` | S1 mobile starter з pinned SHA; записати точні файли й adaptations |
| Jon Udell community-calendar, Apache-2.0 | `licenses/community-calendar/LICENSE` | Вибіркові Python modules; preserved headers + modification notices, SHA/path/patch list при import |
| epithe/event-discovery, MIT, ©2026 Em | `licenses/event-discovery/LICENSE` | Нічого; reference лише |
| Simonstorms, MIT, ©2026 Simon Gneuß | `licenses/expo-app-template/LICENSE` | Нічого; mobile не обрано |
| MapLibre contributors ©2022 / Mapbox ©2015–2020, MIT | `licenses/maplibre-react-native/LICENSE.md` | Пізніше package integration, native/tile/data notices окремо |
| Apify Crawlee, Apache-2.0 | `licenses/crawlee/LICENSE.md` | Нічого на старті |
| Supabase, Apache-2.0 | `licenses/supabase/LICENSE` | Push transport reference; precise example files лише якщо скопійовано в S3/S7 |
| Expo Google Fonts Inter / font authors | `licenses/inter/LICENSE`, `licenses/inter/LICENSE_FONT` | Obytes font dependency має MIT AND OFL-1.1; якщо font переноситься, зберегти обидва notices |

Upstream URLs і commit SHA — [REPO_AUDIT.md](REPO_AUDIT.md), exact license hashes — [repositories.json](evidence/s0/repositories.json). License snapshots збережені byte-for-byte, включно upstream whitespace. `.gitattributes` зберігає whitespace licenses та обов'язкових blank context lines unified patches; product code перевіряється звичайно. NOTICE файли не знайдено в перевірених checkout trees; Supabase sparse, повний NOTICE scan майбутніх imported components обов'язковий. При Apache adaptation позначати змінені файли, зберігати notices і будь-який applicable upstream NOTICE, не вигадувати NOTICE, якщо його не було.

Mobile direct-dependency metadata і Python installed metadata збережено в evidence/s0. Це не повний transitive/native attribution bundle. `oxlint-plugin-react-doctor` у відхиленому Simonstorms має Modified MIT із додатковими обмеженнями; не описувати його як звичайний MIT і не переносити у продукт. Після S1 створити distribution notices для реально використаних packages/assets, включно fonts/native SDKs. Дані подій/описи/зображення/логотипи регулюються [SOURCES.md](SOURCES.md), а не ліцензіями scraper code.

# Dependency notices S2

Додано registry packages: Supabase JS 2.117.2 (MIT, [license snapshot](../licenses/supabase-js/LICENSE)), react-native-url-polyfill 4.0.0 (MIT, [snapshot](../licenses/react-native-url-polyfill/LICENSE)), Expo SecureStore 15.0.8 (MIT за installed package metadata, Expo ecosystem). Код packages не vendored; versions/hashes у pnpm-lock. Generated DB types походять із власної локальної schema, не чужого app. Auth storage/refresh реалізація звірена з official Supabase guide (посилання в ARCHITECTURE); own UI/translations/SQL/fixtures написані тут. Native SecureStore package build та повний distribution notices bundle ще не перевірені; це не завершений license clearance всіх transitive/native packages.
