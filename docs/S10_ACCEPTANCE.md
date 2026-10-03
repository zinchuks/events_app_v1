# S10 acceptance

2026-10-03. **Local foundation implemented/verified; S10 blocked на staging restore. S11 не починався.** Попередні real AI/store/device blockers збережені.

| Вимога | Реалізація / доказ | Статус |
| --- | --- | --- |
| Admin Auth/roles; звичайний користувач не має доступу | Supabase Auth, live DB viewer/editor/admin, private RLS/explicit EXECUTE; actual Auth/PostgREST tests, signup role spoof denied, immediate revoke | local verified |
| CRUD джерел | Disabled unreviewed create, revision-fenced update, delete only empty entry; no arbitrary adapter execution; audited reason, reference-preserving disable | SQL/API verified |
| Видно падіння й stale records | Poll failures/backoff/leases, durable new failed import runs, source + individual TTL, last50 imports/partial coverage; synthetic failure/stale tests, actual3-source browser dashboard | local verified |
| Події, категоризація, ручні виправлення | Expected version/source fence; persistent title/venue/category/price/status/time overlay; actor/before/after audit; reset requires fresh provider baseline | SQL verified; title/reset browser fixture verified |
| Merge/review | Conservative same-session logical group; versions from displayed facts, eligible representative, no saved/history deletion; automatic divergence split | SQL + browser fixture verified |
| Coverage, AI usage, job errors | Truthful partial notes, disabled AI/zero requests, committed/known charge separated, job vs receipt counts; no fake delivered/Plus/AI | local verified |
| Backups/restore/retries/disable runbook | S10_OPERATIONS.md; actual custom pg_dump→pg_restore in own separateDB; IANA lookup-before-data fix; row fingerprint/Auth/RLS/grants checks | local verified |
| Відновлення **у staging** | Hosted project/backup/destination/operator access відсутні; локальні synthetic DB цього не доводять | **blocked / unverified** |

Перевірки й sanitized results — [verification.json](evidence/s10/verification.json). Native/store/SMTP/AI/hosted integrations не перевірялися адмінкою. SQL/public/auth snapshot не є повним provider backup Storage/конфігурації/секретів. Деталі й staging drill — [S10_OPERATIONS.md](S10_OPERATIONS.md).

Локальний admin доступ для наявного project-owner акаунта надано audited operator command; remote permissions не змінені. Пароль не зберігався. Тимчасові TEST-події/джерела/overlays/merge/audit прибрані; початкові saved2/rules/profile залишені. Реальні source/import records не замінювали fixtures.

Ручна перевірка:

1. Відкрити `http://127.0.0.1:5173`, увійти наявним локальним акаунтом; перевірити роль admin й три реальні джерела.
2. Переглянути last_success/next_poll/failures/stale counts, імпорти, job/receipt counts і disabled AI. Counts не доводять повне coverage.
3. Знайти подію й відкрити редактор; перевірити IANA/known/date_only та категорію. Змінювати реальні факти лише з підтвердженим джерелом і причиною; version conflict потребує оновлення.
4. Для тесту змін без реальних мутацій: `node scripts/preview-s10-local.mjs create`, знайти «ТЕСТ S10», змінити title/reset, review/merge; завершити `node scripts/preview-s10-local.mjs cleanup`. Ці записи synthetic, не доказ live integration; створюються без зміни saved/правил.
5. Запустити `pnpm test:s10` для isolated local restore; для закриття S10 виконати описаний staging drill після надання середовища. Наступний independent stage лише за новим завданням.

Dependency security gate: **failed** —0 critical,2 high (`node-forge`, `braces`, advisory ще без published fixed version) і1 moderate (`decode-uri-component`). Versions не оновлювалися навмання й findings не приховані; snapshot — [audit](evidence/s10/dependencies-audit.json). CI workflow існує, фактичний remote CI запуск unverified.
