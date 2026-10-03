# S9 — Free/Plus та покупки, 2026-10-03

**Статус: implemented locally; blocked для store acceptance.** Користувач підтвердив: RevenueCat та обидва магазини ще не налаштовано, перевіряє лише браузер. S10 не розпочато. Немає реальної покупки, restore або provider webhook; SDK/JS export не замінюють ці перевірки.

## Реалізація

- RevenueCat `react-native-purchases` **10.11.0**, MIT, exact lock/integrity, npm gitHead `79e4a644407fe3448ef5ec14e65b52041a8f75b2`. Нативний адаптер прив'язує SDK до підтвердженого Supabase UUID перед кожною операцією; операції послідовні, зміна акаунта перевіряється до/після. Немає anonymous restore, клієнтського grant або Expo Go Preview purchase. Browser stub не імпортує SDK у runtime.
- Native current offering → allowlisted monthly/annual packages → actual `priceString`; ціни й SKU не вигадані. `purchasePackage` / `restorePurchases` лише запитують серверний reconcile. Статус UI — `s9_state`, не SDK CustomerInfo boolean. Public per-platform keys порожні; secret REST key/header лише серверно.
- Міграції046–051: private configuration, verified subscription snapshot, owner Free choice, webhook ledger, leased/retry queue. `enabled=false`, SANDBOX, products/app IDs/entitlement ID не налаштовані. `verified_at + revenuecat + configured environment + future expiry/grace` потрібні для effective Plus; старий tier сам собою не дає доступу. NULL/lifetime grants не використовуємо для цього subscription-only MVP.
- Free: одне **ефективно активне** city/radius правило; categories і horizons з попередніх етапів збережені. Додаткові language/price/age filters, country/admin/polygon monitoring — Plus. Автоматична Free-добірка: один weekday, власний час/IANA timezone, без repeat unchanged. Inactive schedules можна зберігати як майбутні налаштування. Plus — максимум10 effective rules та власні графіки. Загальний development storage guard20 лишається окремим від paid activation cap.
- `enabled` зберігає намір користувача; `billing_paused` зберігає тарифну паузу. Додаткові/несумісні конфігурації можна зберегти, але сервер їх не виконує. Free selection — явний owner RPC; до першого вибору — детермінований UUID серед eligible enabled rules. При downgrade нічого не видаляємо і не переписуємо фільтри/розклад. Upgrade повертає до10 eligible enabled конфігурацій; explicit user pause зберігається.
- Matching, manual union, scheduler і кожен dispatch перевіряють effective policy. Expiry діє без worker/webhook. Pause прибирає due slot і змінює schedule revision, зупиняючи старі jobs. Catalog усіх країн і історія доступні. Legacy S3 development save/digest RPC закриті для клієнта; збережені старі дані не видалені. S8 cancellation, ordinary saved updates і reminders лишаються Free: план не оголошує reminders платною функцією.
- Authenticated local HTTP handler, constant-time header comparison,64KiB limit, app/environment allowlists, event-ID/owner dedup. TRANSFER reconcile обох сторін; optional missing environment не дає grant, fetched subscriber завжди перевіряє environment. Unknown/anonymous aliases не надають Plus іншим UUID. Queue записується до ACK; payload/attributes/secrets не зберігаються й не логуються.
- Worker GET `/v1/subscribers/{claimed UUID}` із secret key; actual expiration/grace/refund/store/product/environment → snapshot. Cancellation auto-renew не прирівнюється до immediate expiry. Monotonic provider request time + claim nonce/lease відхиляють старі/втрачені результати. Event під час fetch лишає повторну перевірку due. Periodic reconcile6h, provider failure retry5min; expired cache стає Free, outage не продовжує expiry. RPC10s, provider15s/1MiB, claim2min. No provider key → zero requests.

## Фактичні перевірки

| Перевірка | Результат |
| --- | --- |
| `pnpm test:s9` | 42 SQL invariants +11 concurrency/clock checks;3 observed overlaps, schema-only disposable DB видалено |
| `pnpm test:s9:api` | 50 actual Auth/PostgREST +local HTTP assertions; own accounts removed, catalog/config не змінені |
| `pnpm check` | TypeScript/lint/env/secrets;17 Jest +42 Node tests; adapter tests synthetic, не real provider |
| S2 regression | 109 actual Auth/PostgREST/Mailpit checks; strengthened ownership ACL перевірено окремо від RLS |
| S4/S5/S6 regression | rollback SQL:49/24 checks та S6 invariant suite pass; explicit synthetic Plus лише всередині ROLLBACK |
| S7 regression | 54 SQL +13 real connection concurrency checks,4 overlaps; synthetic Plus тільки в disposable DB |
| S8 regression | 69 SQL +16 concurrency/timed checks; Free cancellation/reminders збережені |
| Expo | deps check pass; Doctor18/18; web/iOS/Android JS exports pass; це **не native builds** |
| Client bundle boundary | 66 export files без server Supabase keys |
| Browser | actual owner Free,1/1 rule, paused configurations, saved events; uk/en/es,390×844, reload; store unavailable явно |
| Billing local status | enabled=false; server key/header absent; actual RevenueCat API requests0 |

Докази з фінальними file hashes/checkpoint — [verification.json](evidence/s9/verification.json). Усі synthetic Plus/products/receipts існували тільки у fixtures. User DB не reset/copy; existing rules, saved preferences та майбутні reminders збережено. Старий daily «Мій радар Madrid» тепер тарифно paused; «Музика в Madrid» — effective Free. Самі конфігурації не змінено на weekly автоматично.

## Блокери

1. RevenueCat project/apps, actual entitlement/product/offering IDs, App Store Connect та Play Console configurations, store agreements/test accounts відсутні. Public SDK keys і secret REST key/header не надані. Не вмикати mock/test-store entitlement як доказ покупки.
2. Current handler/worker — **local loopback harness**. RevenueCat не може доставляти webhooks на localhost. Потрібен доступний HTTPS deployment, hosted Supabase/worker configuration, retry/reconcile supervision та actual webhook delivery. CLI intentionally rejects remote DB; deployment не виконано.
3. Native development builds/devices на обох платформах не перевірено: iOS license gate, Android SDK/adb відсутній, користувач browser-only. Sandbox purchase/restore, reinstall/login/transfer/refund/renewal/grace/expiry та OS cancellation screen — unverified.
4. Dependency audit2026-10-03: **2 high,1 moderate,0 critical**. node-forge1.4.0 GHSA-86w9-cpqp-85rv та braces3.0.3 GHSA-vfj7-8cjw-p6xm — registry не показує fixed version; decode-uri-component0.2.2 moderate має major patch. Обидва high існували в попередньому lockfile, SDK не додав їх. Audit gate не вимкнено. Remote CI не запускався.
5. Попередні S6 actual AI і S3/S7/S8 real phone push blockers залишаються.

## Ручна перевірка зараз

1. Відкрити `http://localhost:8087` → Налаштування → Тариф і підписка: Free,1/1 і недоступна покупка.
2. Відкрити Правила: перевірити active «Музика в Madrid» та тарифно paused правила; відредагувати їх можна, дані лишилися.
3. Для weekly Free: у city/radius правилі без Plus filters обрати один день тижня та ввімкнути розклад; у тарифі вибрати це правило, якщо потрібна заміна. Не вмикати daily/country/polygon без Plus.
4. Усі події та Збережені залишаються доступними; після reload тариф лишається серверним. На іншому акаунті чужі правила/entitlements не видно.

## Після надання зовнішнього setup

Заповнити actual identifiers і окремі SDK keys, secure server env, налаштувати restore behavior (account ownership/transfer), доступний authenticated HTTPS webhook і постійний worker. Спочатку actual sandbox на iOS та Android: purchase → server Plus → restore після reinstall → cancellation до expiry → grace/expiry/refund → Free без втрати даних; replay/out-of-order webhook і transfer обох accounts. Зафіксувати build/device/OS/product/customer IDs у приватному evidence, sanitized results у repo. Тільки тоді S9 може пройти criteria плану.

Офіційні контракти, перевірені перед інтеграцією: [Expo IAP](https://docs.expo.dev/guides/in-app-purchases/), [RevenueCat SDK](https://github.com/RevenueCat/react-native-purchases), [restore](https://www.revenuecat.com/docs/getting-started/restoring-purchases), [webhooks](https://www.revenuecat.com/docs/integrations/webhooks), [fields/TRANSFER](https://www.revenuecat.com/docs/integrations/webhooks/event-types-and-fields), [subscriber API](https://www.revenuecat.com/docs/api-v1/customers), [snapshot fields](https://www.revenuecat.com/docs/api-v1/customer-info-model), [braces advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm).

S9 implementation checkpoint: `2ca20f86339dc24998ff923baa47541a46d6ffc7`. Final documentation/evidence checkpoint available through `git log -1`; no push.
