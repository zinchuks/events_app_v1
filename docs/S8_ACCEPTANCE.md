# S8 — зміни, скасування та нагадування

2026-10-03. **Implemented; local verification passed; native push unverified.** Авторизація — нове «продовжуй», P4. S9 не розпочато. Докази: [verification.json](evidence/s8/verification.json).

| Критерій | Реалізація та доказ | Межа перевірки |
| --- | --- | --- |
| Важливі поля | Title/venue/coordinates/category/language/URL/price/currency/status/start/end/date/time-kind/timezone; deferred transaction snapshot, stable occurrence IDs, one revision/update after final event+occurrence writes | SQL fixtures; actual source cancellation/change push не отримано |
| Saved updates | Owner-only before/after journal; ordinary updates can pause; explicit cancellation transition creates one logical update without entitlement/device requirement | Actual Auth/API/RLS + synthetic browser history uk/en/es |
| Lead reminders | Up to 3 distinct offsets 5–10080 min; UI 24h/2h. Known start only; existing past lead slots skipped; changed start/preferences supersede pending jobs; date-only/unknown retain preferences without fabricated instants | Actual preferences on real saved concert; one naturally due reminder in disposable PostgreSQL DB |
| Cancellation | Stops reminders; one change per final transaction; identical import replay does not repeat it; source omission leaves scheduled facts intact | SQL fixtures, importer omission, browser cancellation fixture |
| Outdated / unknown | Dynamic source+record TTL → outdated; review/unknown-time → unknown; explicit cancellation distinct; stale reminders defer 5 min until start deadline, then expire | SQL tests; actual Helsinki stale cache encountered and actual successful refresh performed |
| Manual correction | Server-only allowlisted merged overlay + private audit; same source advisory lock as importer; source hash remains original; provider translations not published as corrected current version; public badge reveals only presence | SQL corrected reimport + actual two-connection import/correction race; synthetic browser badge |
| Quiet / privacy / transport | Independent saved timezone/quiet hours, global push opt-out, unsave/expiry/revision/source-rights veto immediately before dispatch; shared S7 nonce/lease/per-device settlement/receipts; provider TTL bounded by expiry | SQL + fake HTTP contract; no real Expo requests in this task |

Migrations037–045 applied forward-only; no database reset. Initial existing occurrences were baselined without generating historical update spam. Changes are observed after successful imports/manual corrections, **not real-time organizer monitoring**. Madrid/Toronto poll daily, Helsinki every6h; local watchers wake every60s and use durable cadence/backoff.

A server-owned saved epoch changes on delete+save; immutable saved identity preserves same-key upsert. Reminder keys include this epoch and all old jobs are vetoed after re-save. Timestamp snapshots are canonical UTC across DB session timezones.

An update's business key binds owner/occurrence/monotonic revision. A reminder also binds preference revision/offset; jobs reference owner-bound alerts and immutable one-item digests. S8 uses `workflow=s7` for shared transport and `s8_alert_id` for the saved-event policy; S3 remains separate. Historical inbox records persist after unsave; pending work is suppressed. Already accepted provider pushes cannot be recalled; OS/provider delivery delay and actual native tap remain unverified. Failed/stale slots expire rather than sending after the event start.

Ordinary updates/reminders are currently available for local development; Free/Plus enforcement and store entitlements belong to S9. Cancellation is not blocked by a tier. S10 admin UI/roles were not added; manual correction is an explicit trusted local operator command.

## Actual checks

- `pnpm test:s8`: **69 SQL invariants +16 concurrency/timed checks**, four observed overlapping connection pairs: identical correction, inbox scheduler, naturally due reminder, importer/correction. Disposable schema-only DB/grants/IANA inventory; **no copied user/catalog rows**, own DB removed.
- `pnpm test:s8:api`: **58** actual local Auth/PostgREST/RLS checks with two disposable accounts; same save upsert contract, sorted/idempotent preferences, hidden other-owner alerts, protected server fields/RPCs, cleanup.
- `pnpm check`: **17 Jest +35 Node**, TypeScript/lint/env/secrets pass. The HTTP transport tests inject synthetic responses, not device evidence.
- Regressions: S2 **108**, S5 **69**, S6 **68**, S7 **54 SQL+13 concurrency**, after actual source freshness recovery. Client JS exports iOS/Android/web, exact types and server-key bundle scan pass; **these are not native builds**.
- Browser390×844: real saved event preferences + reload/session persistence; synthetic update before/after, cancelled detail/marker/stopped reminders, uk/en/es; no console errors. Synthetic event/source/saved row/digests/jobs/audit removed. Ukrainian interface restored.
- Real account retains 2 saved events. «Aires Iberoamérica, con Jasminum Ensemble», 10Oct19:00 Europe/Madrid: offsets24h/2h, quiet22:00–08:00, updates on. First due9Oct19:00, second10Oct17:00. These future reminders have not yet fired.

Helsinki initially had6 `import_failed` outcomes and stale TTL. A bounded official API fetch/import54 normalized records succeeded; source backoff reset, S6 passed. Previous SQL failure **was not reproduced or root-caused**. Added safe five-character SQLSTATE reporting, without raw HTTP/event/error contents, and restarted the due-only watcher. Next unattended Helsinki import needs observation; a successful manual refresh is not proof of continuous uptime.

## Manual check

1. Open [local web](http://localhost:8087/saved), choose the saved concert10Oct, open details.
2. Check24h/2h, Europe/Madrid, quiet22:00–08:00; save and reload. Next reminder shows9Oct19:00.
3. Open inbox: future reminders appear only when due and data fresh. Browser inbox works without phone permission. Returning to details shows current event facts.
4. For change/cancellation QA only: `node scripts/preview-s8-local.mjs create OWNER_EMAIL`, open returned digest URLs (labelled TEST); finish with `node scripts/preview-s8-local.mjs cleanup`. It affects only its own temporary fixture; never correct a real event to simulate cancellation.

Default local workers: `pnpm ingest:s6:watch`, `pnpm schedule:s7:watch`, `pnpm schedule:s8:watch`. They create inbox records, **no Expo/AI requests**. Laptop processes are not hosted scheduling/availability proof. Stop with Ctrl+C. Operator correction/next stage prerequisites — [SETUP.md](SETUP.md).

## Blockers / next step

Physical development device, Expo/APNs/FCM credentials and native toolchains are still required for real push/receipts/background/cold-start checks. iOS Xcode license requires owner action; Android SDK/adb absent. S6 provider/exact model/daily budget+currency/server key missing; AI disabled. External SMTP unavailable by user's local-login choice. Last recorded S5 dependency audit failed; not re-audited here. Remote CI/hosted service unverified.

S9 requires a new task, store/provider setup, sandbox product identifiers/accounts and server credentials; real purchases/restore/expiry need native sandbox device evidence. S8 does not claim store purchases or release readiness.
