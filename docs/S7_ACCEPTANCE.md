# S7 — регулярні добірки

Стан 2026-10-02: **implemented; local/browser verified; real device push blocked**.
S6 лишається AI blocked. Нове «продовжуй» дозволило незалежний S7 за P4 у CODEX_PROMPTS.md. S8 не розпочато.

## Реалізація й поведінка

- `set_s7_delivery_preferences` і `save_s7_rule` — owner-only atomic RPC; daily, ISO weekdays 1–7, every N calendar days із anchor, IANA timezone, явний active toggle, quiet hours, repeat_unchanged. Legacy S5 RPC зберігає inactive контракт. Existing preferences не активуються міграцією.
- Сервер перераховує `next_run_at` при timezone/schedule/filter/horizon/name/area edit і resume; pause очищає next run. Horizon: 1–366 днів, 1–12 календарних місяців, найближчі Saturday/Sunday, inclusive custom dates. Sunday належить поточним вихідним; минулі occurrences не повертаються.
- DST: nonexistent minute → earliest available local minute, repeated minute → first UTC instant, one scheduled run. Quiet range end у fold використовує later boundary; gap → next available minute. Every N — календарні дні, не N × 24 UTC hours. Future anchor не вимикає правило.
- Scheduler locking: owner profile `FOR UPDATE SKIP LOCKED` → owner rules advisory lock → due rules row locks. Один atomic transaction зберігає due snapshot (rule ID/revision/time), logical run, digest, **усі items до 5000**, names of matching rules, selected title/version/time snapshot, new/changed fingerprints і notification job; просуває next run. Немає client-auth impersonation: service-only matching core має explicit owner; public wrapper завжди використовує auth.uid().
- Об'єднуються правила **цього due batch**, не правила з іншою частотою. Occurrence одна у списку з усіма назвами правил. History зберігає кожну non-empty актуальну добірку; незмінені події не створюють повторний push, якщо repeat_unchanged не ввімкнено. Нові або змінені occurrences порівнюються з останньою scheduled selection користувача.
- Пропущені під час downtime слоти coalesced в одну актуальну добірку; журнал має original scheduled time. Empty selection — journal/advance, без порожнього push. >5000 — `too_many` journal/advance, без тихого обрізання. Stale source **або record** — journal + 5-minute persisted backoff, original due identity збережено; history/catalog лишаються readable. Source polling залишається окремим S6-worker.
- Мобільний UI uk/en/es: activation/quiet/repeat toggles, timezone, next selection на правилі, months/weekend у advanced editor; history доступна без push. Digest групує за збереженою датою й показує збережений title та matching rule names; event details відкривають поточні відомості. Source rights RLS все ще закриває недозволені current event rows.

## Transport і receipts

`workflow=s7` відокремлений від legacy S3 claims. Server-only S7 jobs мають random fencing token, 5-minute lease, max 5 claims, bounded exponential backoff (60 s → 3600 s), 24-hour expiry. Перед кожним dispatch перевіряються opt-out, pause, rule revision, quiet hours, current source/cache permission/freshness і bound device ownership. Quiet hours відкладають push, **не** creation/history.

Per-device attempt зберігається **до** HTTP request; begin унікальний та fenced. Restart до dispatch дозволяє безпечний reclaim; crash після dispatch → `uncertain`, automatic resend заборонений. Terminal device attempts не повторюються; пагінація не відкидає решту device IDs. Known HTTP 429 / MessageRateExceeded rejection → retry. Network/timeout/malformed response/5xx → conservative `uncertain`; це свідомо обережніше за загальну рекомендацію retry у [Expo documentation](https://docs.expo.dev/push-notifications/sending-notifications/).

HTTP requests sequential, one device per request, 15-second timeout. Короткий localized title + `Event Radar`, `data.digest_id`, existing validated owner-only `/digest/[id]` route. Ticket accepted означає receipt ID від Expo, **не** delivery to device. Receipt query після 15 хвилин, missing/outage → bounded query backoff, після 24h → `receipt_unknown`, без resend. DeviceNotRegistered видаляє bound token лише коли він не re-registered після dispatch; late response не видаляє нового owner/token registration. Receipt terminal completion idempotent.

**Default local worker лише створює inbox selections, без Expo requests.** Transport fixture існує у tests, не споживає справжні user jobs у default watcher. `--expo` — окремий operator запуск після налаштування власного native development device і credentials. Результат `sent` у jobs означає завершення обробки, не доказ фактичної доставки; дивитися delivery status/receipts.

## Фактичні перевірки

| Перевірка | Результат / evidence |
| --- | --- |
| SQL invariants | **54 pass** у random schema-only disposable PostgreSQL DB: Madrid/Toronto gap/fold, Apia skipped date, quiet DST, future anchor, calendar months/weekend, full union, stable retry, empty/unchanged, TTL/backoff/resume, pause/timezone/area edit, permission before dispatch, opt-out/history, invalid/re-registered token, receipt expiry, RLS |
| Two real PostgreSQL connections | **13 checks**, 4 observed overlapping transactions: one scheduler digest/item/job, one notification claim, one per-device dispatch, one completion. DB removed in finally; user data не копіювали |
| Real local API | **56 checks** Auth/PostgREST/RLS/live Madrid matching; schedule activation, owner/foreign protection, direct writes denied, invalid document atomic rollback, resume/pause/manual, new horizons |
| Browser real timed run | Rule saved in UI at 21:30 Europe/Madrid; watcher created **137 live Madrid occurrences** at 2026-10-02T19:30Z; inbox/detail opened without push permission. Final daily **18:00 Europe/Madrid**, quiet **22:00–08:00**, repeat off; other rules and 2 saved events preserved |
| Regression | `pnpm check`: **17 Jest + 33 Node pass**, TypeScript/lint/env/secret scan. S2 **108**, S5 **69**, S6 **68** actual API checks; S4 **49** rollback SQL checks. Existing S4 fixtures isolated from expanding live catalog inside ROLLBACK, since previous global count assumed no real events on a fixture date |
| JS exports/bundles | iOS/Android/web exports and client server-key scan; exports are not native builds |
| Actual local CLI worker restart | Graceful stop/new process, idle, same1digest/137items; scheduler-restart.log + local-state.json |
| Real Expo send/receipt/device deep link | **unverified / blocked**, user checks browser only; no configured physical development device evidence, no Expo HTTP requests from this work |
| Hosted worker / remote CI | **unverified**; local process is running on this computer, DB survives process restart, production deployment/OS auto-start не налаштовано |

Proof: [verification.json](evidence/s7/verification.json), [logs](evidence/s7/), screenshots. No DB reset, remote mutation чи push.

## Запуск і ручна перевірка

```sh
export PATH="/private/tmp/event-radar-s1-tools/node_modules/.bin:$PATH"
supabase start
supabase migration up --local
pnpm local:env
pnpm ingest:s6:watch       # окремий термінал; source cadence
pnpm schedule:s7:watch    # окремий термінал; inbox only, Ctrl+C
pnpm dev:web             # окремий термінал; URL із Metro
pnpm test:s7             # schema-only disposable DB; SQL + concurrency
pnpm test:s7:api         # disposable users; requires live Madrid catalog
pnpm check
```

Не запускати `supabase/tests/s7_invariants.sql` напряму у user DB: scheduler tests передбачають порожню disposable DB. `pnpm test:s7` створює лише own random `event_radar_s7_test_<hex>` DB, переносить public/auth schema, explicit grants + IANA name inventory, без private/catalog rows; default privileges чужих DB owners не переносить; видаляє тільки створену ним DB. Docker PostgreSQL connection має право createdb/drop own test DB.

1. Відкрити Правила → Розклад добірок; вибрати time/timezone і ввімкнути automatic. Перевірити next date після збереження/reload.
2. Вибрати weekdays або interval/anchor, quiet hours; зберегти. Horizon редагується незалежно в advanced editor (days/months/weekend/range).
3. Дочекатися одного due slot з running local watcher; відкрити Добірки, оновити, перевірити весь список/date groups і matching names. Push permission не потрібен.
4. Перезапустити watcher: digest того самого due slot не дублюється; pause прибирає next run, resume планує майбутній.
5. Реальний push: configured physical development build + credentials, own registered token, server `pnpm notify:s7:expo`, через ≥15 хв `pnpm notify:s7:receipts`; перевірити actual phone delivery/tap/cold start/background. Browser і synthetic ticket не замінюють цей proof.

Наступна зовнішня дія: physical iPhone/Android development build і actual Expo/FCM/APNs setup. iOS Xcode license / Android SDK blockers зберігаються. S6 actual AI все ще потребує provider/model/daily amount + currency/server key; ключ не надсилати в чат. S8 — лише нове завдання після цієї контрольної точки.
