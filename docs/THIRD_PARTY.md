# Attribution та перелік запозичень

На S0 **код, UI, data і assets кандидатів у продукт не імпортовані**. Збережені лише audit manifests/history/hash/results і незмінені license snapshots. Права на Event Radar product code цим документом не визначаються; root third-party license не застосовується автоматично до всього майбутнього продукту.

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

Upstream URLs і commit SHA — [REPO_AUDIT.md](REPO_AUDIT.md), exact license hashes — [repositories.json](evidence/s0/repositories.json). License snapshots збережені byte-for-byte, включно upstream whitespace; `.gitattributes` вимикає whitespace checking тільки для `licenses/**`. NOTICE файли не знайдено в перевірених checkout trees; Supabase sparse, повний NOTICE scan майбутніх imported components обов'язковий. При Apache adaptation позначати змінені файли, зберігати notices і будь-який applicable upstream NOTICE, не вигадувати NOTICE, якщо його не було.

Mobile direct-dependency metadata і Python installed metadata збережено в evidence/s0. Це не повний transitive/native attribution bundle. `oxlint-plugin-react-doctor` у відхиленому Simonstorms має Modified MIT із додатковими обмеженнями; не описувати його як звичайний MIT і не переносити у продукт. Після S1 створити distribution notices для реально використаних packages/assets, включно fonts/native SDKs. Дані подій/описи/зображення/логотипи регулюються [SOURCES.md](SOURCES.md), а не ліцензіями scraper code.
